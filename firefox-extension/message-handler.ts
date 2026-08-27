import type {
  CaptureScreenshotServerMessage,
  ClickElementServerMessage,
  FindHighlightServerMessage,
  NavigateTabServerMessage,
  ElementTarget,
  ExtensionMessage,
  ExecuteJsServerMessage,
  FetchMediaServerMessage,
  GetNetworkRequestsServerMessage,
  GetPageMediaServerMessage,
  HoverElementServerMessage,
  DragElementServerMessage,
  ReadPageServerMessage,
  PressKeyServerMessage,
  ReleaseTabsServerMessage,
  ResizeWindowServerMessage,
  ScrollPageServerMessage,
  SelectOptionServerMessage,
  ServerMessageRequest,
  TypeTextServerMessage,
  UploadFilesServerMessage,
  ViewportRegion,
  WaitForPageServerMessage,
  InteractionResultExtensionMessage,
  PageRegion,
} from "@browser-control-mcp/common";
import { WebsocketClient } from "./client";
import { t } from "./i18n";
import {
  isClipboardReadAllowed,
  isCommandAllowed,
  isDomainInDenyList,
  COMMAND_TO_TOOL_ID,
  INTERACTION_TOOL_IDS,
  getToolNameById,
  addAuditLogEntry,
  isAuroraEnabled,
  isBadgeEnabled,
  isFocusEnabled,
  getOutlineBoxDepth,
  isMarkEnabled,
  isContainerInherited,
  isHiddenElementsIncluded,
  getOverlayColors,
  getOverlayTimings,
  isBackgroundMode,
  getUrlScope,
  isUrlInScope,
  describeUrlScope,
  isConsoleCaptureEnabled,
  getConsoleCaptureLevel,
  getUploadLimitBytes,
} from "./extension-config";
import { ensureTabAccess } from "./tab-access";
import { diffText } from "./text-diff";
import { buildSnapshotCode, formatPageItems, PageReadResult } from "./page-snapshot";
import { ELEMENT_RESOLVER_SOURCE, isElementTargeted } from "./injected-common";
import {
  buildInPageNavigateCode,
  buildInPageNavigationCheckCode,
  InPageNavigationCheck,
  InPageNavigationStart,
} from "./interaction-scripts";
import {
  buildAttachOverlayCode,
  buildConcealOverlayCode,
  buildDetachOverlayCode,
  buildOutlineOverlayCode,
  buildReclaimTabMarkCode,
  buildRevealOverlayCode,
  OutlineRegionMark,
  OverlayResult,
  OverlayState,
} from "./highlight-overlay";
import {
  buildDialogGuardCode,
  registerDialogGuard,
  unregisterDialogGuard,
} from "./dialog-guard";
import type { ConsoleLevel } from "./dialog-guard";
import {
  awaitTextChange,
  drainPageEvents,
  forgetPageEvents,
  noteCommittedDocument,
  recordPageEvent,
  resolveTextWait,
  TextWaitOutcome,
  takeUnguardedDocuments,
} from "./page-events";
import { forgetNetworkLog, readNetworkLog } from "./network-log";
import {
  buildClickCode,
  buildElementBoxCode,
  buildExecuteJsCode,
  buildHoverCode,
  buildDragCode,
  buildFindCode,
  FindMatchResult,
  MAX_FIND_MATCHES,
  buildMediaFetchCode,
  buildMediaListCode,
  MAX_CAPTURE_HEIGHT_PX,
  MediaFetchResult,
  MediaListResult,
  buildPressKeyCode,
  buildRegionBoxCode,
  buildScrollCode,
  buildSelectOptionCode,
  buildTextReadCode,
  buildTextWatchCode,
  DEFAULT_TEXT_SETTLE_MS,
  buildTypeCode,
  buildUploadFilesCode,
  buildWaitProbeCode,
  ElementBoxResult,
  InteractionScriptResult,
  TextWatchResult,
  WaitProbeResult,
} from "./interaction-scripts";

// Time to let a newly foregrounded tab paint before capturing it
const TAB_PAINT_DELAY_MS = 250;

const SCRIPT_STALL_MS = 3000;
// Reads and page-supplied code can be slow without being frozen, but this still has to answer
// inside the server's own response budget for those commands, which is 15 seconds.
const LONG_SCRIPT_STALL_MS = 10_000;
const SCRIPT_STALLED = "__bcm_script_stalled__";

class StalledPageError extends Error {}

export interface PageEventError extends Error {
  dialogs?: string[];
  consoleMessages?: string[];
}
const SCROLL_SETTLE_MS = 150;
const BLANK_URL = "about:blank";

const idleStatus = () => t("overlayIdle");

const NAVIGATION_SETTLE_MS = 15_000;
const HISTORY_MOVE_GRACE_MS = 1_000;
const IN_PAGE_ROUTE_POLL_MS = 250;
const IN_PAGE_ROUTE_WAIT_MS = 1_500;
const MARK_RECLAIM_GAP_MS = 2_000;
const MARK_ICON_PREFIX = "data:image/svg+xml";

interface SettleWatch {
  done: Promise<boolean>;
  started: () => boolean;
  cancel: () => void;
}

const DEFAULT_ELEMENT_LIMIT = 500;
const MAX_PAGE_TEXT_LENGTH = 50_000;
const MAX_SCRIPT_RESULT_LENGTH = 20_000;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
const MAX_WAIT_TIMEOUT_MS = 60_000;
const MAX_CAPTURE_SLICES = 8;
const SLICE_OVERLAP_PX = 80;
// A fetch spends real network time, so it gets a longer leash than an in-page script.
const MEDIA_FETCH_STALL_MS = 60_000;
const MEDIA_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const WAIT_POLL_INTERVAL_MS = 200;
const DEFAULT_TEXT_WAIT_TIMEOUT_MS = 30_000;
const MAX_TEXT_SETTLE_MS = 5_000;
const MAX_TEXT_WAIT_TIMEOUT_MS = 180_000;
const MAX_ADDED_TEXT_LENGTH = 20_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameOrigin(a: string, b: string): boolean {
  try {
    const origin = new URL(a).origin;
    return origin !== "null" && origin === new URL(b).origin;
  } catch (error) {
    return false;
  }
}

function elementTargetOf(target: ElementTarget): ElementTarget | undefined {
  if (!target.ref && !target.selector) {
    return undefined;
  }
  return { ref: target.ref, selector: target.selector, index: target.index };
}

export class MessageHandler {
  private client: WebsocketClient;
  private claimedTabs: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private openedTabs: Set<number> = new Set();
  private textBaselines: Map<number, Map<string, string>> = new Map();
  private knownMediaUrls: Map<number, Set<string>> = new Map();
  private lastMarkReclaim: Map<number, number> = new Map();
  private shownOutlines: Map<number, PageRegion[]> = new Map();

  private readonly onTabRemoved = (tabId: number) => {
    this.forgetTab(tabId);
  };

  // A page that calls alert() while loading freezes before any command arrives, and no API can
  // answer a dialog that is already open: the guard has to be in before the document runs a line.
  private readonly onNavigationCommitted = (details: {
    frameId: number;
    tabId: number;
    url: string;
  }) => {
    if (details.frameId !== 0) {
      return;
    }
    this.knownMediaUrls.delete(details.tabId);
    this.textBaselines.delete(details.tabId);
    resolveTextWait(details.tabId, "navigated");
    if (!this.isGuarded(details.tabId)) {
      return;
    }
    if (details.url && details.url !== BLANK_URL) {
      noteCommittedDocument(details.tabId, details.url);
    }
    this.guardDialogs(details.tabId, "document_start").catch(() => undefined);
  };

  // The overlay is injected DOM, so a navigation wipes it and nothing puts it back on its own.
  private readonly onTabUpdated = (
    tabId: number,
    changeInfo: { status?: string; favIconUrl?: string }
  ) => {
    if (!this.claimedTabs.has(tabId)) {
      return;
    }
    if (changeInfo.status === "complete") {
      void this.redrawOverlay(tabId);
    } else if (
      // The browser fetches /favicon.ico on its own after the load, which changes no DOM.
      changeInfo.favIconUrl &&
      !changeInfo.favIconUrl.startsWith(MARK_ICON_PREFIX)
    ) {
      void this.reclaimTabMark(tabId);
    }
  };

  constructor(client: WebsocketClient) {
    this.client = client;
    browser.tabs.onRemoved.addListener(this.onTabRemoved);
    browser.webNavigation.onCommitted.addListener(this.onNavigationCommitted);
    browser.tabs.onUpdated.addListener(this.onTabUpdated, {
      properties: ["status", "favIconUrl"],
    });
  }

  public dispose(): void {
    browser.tabs.onRemoved.removeListener(this.onTabRemoved);
    browser.webNavigation.onCommitted.removeListener(this.onNavigationCommitted);
    browser.tabs.onUpdated.removeListener(this.onTabUpdated);
  }

  private async consoleLevel(): Promise<ConsoleLevel> {
    return (await isConsoleCaptureEnabled())
      ? await getConsoleCaptureLevel()
      : "off";
  }

  private async redrawOverlay(tabId: number): Promise<void> {
    try {
      await this.guardDialogs(tabId);
      await this.attachOverlay(tabId, "idle", idleStatus());
    } catch (error) {
      console.error("Could not redraw the overlay on tab", tabId, error);
    }
  }

  private async reclaimTabMark(tabId: number): Promise<void> {
    const now = Date.now();
    if (now - (this.lastMarkReclaim.get(tabId) ?? 0) < MARK_RECLAIM_GAP_MS) {
      return;
    }
    this.lastMarkReclaim.set(tabId, now);
    try {
      await this.runScript(tabId, { code: buildReclaimTabMarkCode() });
    } catch (error) {
      console.error("Could not reclaim the tab mark on tab", tabId, error);
    }
  }

  public async handleDecodedMessage(req: ServerMessageRequest): Promise<void> {
    try {
      await this.dispatch(req);
    } catch (error) {
      // sendResource is what drains these on the way out, and a failure never reaches it.
      if (error instanceof Error && "tabId" in req) {
        const seen = drainPageEvents(req.tabId);
        if (seen.dialogs.length > 0) {
          (error as PageEventError).dialogs = seen.dialogs;
        }
        if (seen.console.length > 0) {
          (error as PageEventError).consoleMessages = seen.console;
        }
      }
      throw error;
    }
  }

  private async dispatch(req: ServerMessageRequest): Promise<void> {
    const isAllowed = await isCommandAllowed(req.cmd);
    if (!isAllowed) {
      const toolId = COMMAND_TO_TOOL_ID[req.cmd];
      const where = (INTERACTION_TOOL_IDS as readonly string[]).includes(toolId)
        ? "the extension popup"
        : "the extension options page";
      throw new Error(
        `Command '${req.cmd}' is disabled in extension settings: '${getToolNameById(toolId)}' in ${where} is off.`
      );
    }

    this.addAuditLogForReq(req).catch((error) => {
      console.error("Failed to add audit log entry:", error);
    });

    switch (req.cmd) {
      case "open-tab":
        await this.openUrl(req.correlationId, req.url, req.cookieStoreId);
        break;
      case "navigate-tab":
        await this.navigateTab(req);
        break;
      case "close-tabs":
        await this.closeTabs(req.correlationId, req.tabIds);
        break;
      case "get-tab-list":
        await this.sendTabs(req.correlationId);
        break;
      case "get-browser-recent-history":
        await this.sendRecentHistory(req.correlationId, req.searchQuery);
        break;
      case "read-page":
        await this.sendPage(req);
        break;
      case "reorder-tabs":
        await this.reorderTabs(req.correlationId, req.tabOrder);
        break;
      case "find-highlight":
        await this.findAndHighlightText(req);
        break;
      case "group-tabs":
        await this.groupTabs(
          req.correlationId,
          req.tabIds,
          req.isCollapsed,
          req.groupColor as browser.tabGroups.Color,
          req.groupTitle
        );
        break;
      case "capture-screenshot":
        await this.captureScreenshot(req);
        break;
      case "get-media":
        await this.sendPageMedia(req);
        break;
      case "fetch-media":
        await this.fetchMedia(req);
        break;
      case "click-element":
        await this.clickElement(req);
        break;
      case "hover-element":
        await this.hoverElement(req);
        break;
      case "drag-element":
        await this.dragElement(req);
        break;
      case "upload-files":
        await this.uploadFiles(req);
        break;
      case "resize-window":
        await this.resizeWindow(req);
        break;
      case "get-network-requests":
        await this.sendNetworkRequests(req);
        break;
      case "type-text":
        await this.typeText(req);
        break;
      case "press-key":
        await this.pressKey(req);
        break;
      case "scroll-page":
        await this.scrollPage(req);
        break;
      case "select-option":
        await this.selectOption(req);
        break;
      case "execute-js":
        await this.executeJs(req);
        break;
      case "wait-for-page":
        await this.waitForPage(req);
        break;
      case "release-tabs":
        await this.releaseTabs(req);
        break;
      case "get-limits":
        await this.client.sendResourceToServer({
          resource: "limits",
          correlationId: req.correlationId,
          uploadBytes: await getUploadLimitBytes(),
        });
        break;
      default:
        const _exhaustiveCheck: never = req;
        console.error("Invalid message received:", req);
    }
  }

  private async addAuditLogForReq(req: ServerMessageRequest) {
    // Get the URL in context (either from param or from the tab)
    let contextUrl: string | undefined;
    if ("url" in req && req.url) {
      contextUrl = req.url;
    }
    if ("tabId" in req) {
      try {
        const tab = await browser.tabs.get(req.tabId);
        contextUrl = tab.url;
      } catch (error) {
        console.error("Failed to get tab URL for audit log:", error);
      }
    }

    const toolId = COMMAND_TO_TOOL_ID[req.cmd];
    const auditEntry = {
      toolId,
      command: req.cmd,
      timestamp: Date.now(),
      url: contextUrl
    };
    
    await addAuditLogEntry(auditEntry);
  }

  private async ensureUrlInScope(url: string): Promise<void> {
    const scope = await getUrlScope();
    if (!isUrlInScope(url, scope)) {
      console.error("URL out of scope:", url);
      throw new Error(
        `Refused to open ${url}: the extension is set to open ${describeUrlScope(
          scope
        )} ("Allowed addresses" in the popup).`
      );
    }
  }

  private async openUrl(
    correlationId: string,
    url: string,
    cookieStoreId?: string
  ): Promise<void> {
    await this.ensureUrlInScope(url);

    if (await isDomainInDenyList(url)) {
      throw new Error("Domain in user defined deny list");
    }

    // contentScripts.register resolves in the parent process before the content processes have
    // heard of it, so a tab created straight onto the URL can load its first document unguarded.
    // Parking on about:blank and navigating afterwards buys the registration time to spread.
    const container = await this.resolveCookieStore(cookieStoreId);
    const active = !(await isBackgroundMode());
    const tab = await browser.tabs.create(
      container
        ? { url: BLANK_URL, cookieStoreId: container, active }
        : { url: BLANK_URL, active }
    );

    if (tab.id !== undefined) {
      this.openedTabs.add(tab.id);
    }

    let registration = await registerDialogGuard(
      url,
      buildDialogGuardCode(await this.consoleLevel()),
      container
    );

    try {
      if (tab.id !== undefined) {
        const settling = this.waitForTabToSettle(tab.id);
        await browser.tabs.update(tab.id, { url });
        if (!registration) {
          this.guardDialogs(tab.id, "document_start").catch(() => undefined);
        }
        await settling.done;
        await unregisterDialogGuard(registration);
        registration = null;
        await this.verifyGuard(tab.id);
        await this.attachOverlay(tab.id, "read", t("overlayOpen"));
      }
    } finally {
      await unregisterDialogGuard(registration);
    }

    const opened: ExtensionMessage = {
      resource: "opened-tab-id",
      correlationId,
      tabId: tab.id,
    };
    if (tab.id === undefined) {
      await this.client.sendResourceToServer(opened);
      return;
    }
    await this.sendResource(opened, tab.id);
  }

  // A redirect leaves more than one document behind, and only the guard that ran in each of them
  // can say it was there: probing the tab afterwards only ever reaches the last one.
  private async verifyGuard(tabId: number): Promise<void> {
    const missed = takeUnguardedDocuments(tabId);
    if (missed.length === 0) {
      return;
    }
    for (const url of missed) {
      recordPageEvent(
        tabId,
        "console",
        `guard: no dialog guard reported itself on ${url}, so a dialog raised while ` +
          "that document loaded may have gone unanswered and unreported"
      );
    }
    try {
      await this.guardDialogs(tabId);
    } catch (error) {
      console.error("Could not re-inject the dialog guard on tab", tabId, error);
    }
  }

  private async navigateTab(
    req: NavigateTabServerMessage & { correlationId: string }
  ): Promise<void> {
    const inHistory = req.url === "back" || req.url === "forward";
    if (!inHistory) {
      await this.ensureUrlInScope(req.url);
      if (await isDomainInDenyList(req.url)) {
        throw new Error("Domain in user defined deny list");
      }
    }

    const current = await this.prepareTabAccess(req.tabId);
    await this.attachOverlay(req.tabId, "read", t("overlayNavigate"));
    await delay((await getOverlayTimings()).leadMs);

    // A history move has no URL to register a guard for until the document has committed;
    // the onCommitted listener injects it then, which is the same cover a reload gets.
    const registration = inHistory
      ? null
      : await registerDialogGuard(
          req.url,
          buildDialogGuardCode(await this.consoleLevel()),
          current.cookieStoreId
        );
    let settled: boolean;
    let inPage = false;
    try {
      const settling = this.waitForTabToSettle(req.tabId);
      let outcome: boolean | null;
      if (inHistory) {
        if (req.url === "back") {
          await browser.tabs.goBack(req.tabId);
        } else {
          await browser.tabs.goForward(req.tabId);
        }
        outcome = await Promise.race([
          settling.done,
          this.historyEnd(req.tabId, current.url),
        ]);
      } else {
        const route = await this.routeWithinPage(
          req.tabId,
          req.url,
          current.url,
          settling
        );
        if (route === "routed") {
          settling.cancel();
          inPage = true;
          outcome = true;
        } else {
          if (route === "none") {
            await browser.tabs.update(req.tabId, { url: req.url });
          }
          outcome = await settling.done;
        }
      }
      if (outcome === null) {
        throw new Error(
          `Tab ${req.tabId} has no page to go ${req.url} to; it is still on ${current.url}.`
        );
      }
      settled = outcome;
    } finally {
      await unregisterDialogGuard(registration);
    }
    if (inHistory) {
      // A document restored from the back-forward cache commits without loading, so no guard
      // announces itself in it; the one it had is still there, and re-injecting covers the rest.
      takeUnguardedDocuments(req.tabId);
      await this.guardDialogs(req.tabId);
    } else if (inPage) {
      this.knownMediaUrls.delete(req.tabId);
      this.textBaselines.delete(req.tabId);
    } else {
      await this.verifyGuard(req.tabId);
    }
    const tab = await browser.tabs.get(req.tabId);
    if (inHistory && tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(
        `The tab went ${req.url} to ${tab.url}, which is on the user's deny list; the page was not read.`
      );
    }

    await this.sendResource(
      {
        resource: "tab-navigated",
        correlationId: req.correlationId,
        tabId: req.tabId,
        url: tab.url ?? req.url,
        title: tab.title ?? "",
        settled,
        inPage,
      },
      req.tabId
    );
  }

  // A router that ignores the hand-over leaves the address changed and the page as it was, so
  // the page has to prove it reacted with a DOM change before the load is skipped.
  private async routeWithinPage(
    tabId: number,
    url: string,
    currentUrl: string | undefined,
    settling: SettleWatch
  ): Promise<"routed" | "loading" | "none"> {
    if (!currentUrl || !sameOrigin(currentUrl, url)) {
      return "none";
    }
    let start: InPageNavigationStart;
    try {
      const results = await this.runScript(tabId, {
        code: buildInPageNavigateCode(url),
      });
      start = results[0] as InPageNavigationStart;
    } catch (error) {
      console.error("Could not hand the address to the page:", error);
      return "none";
    }
    if (!start.via) {
      return "none";
    }
    const deadline = Date.now() + IN_PAGE_ROUTE_WAIT_MS;
    for (;;) {
      await delay(IN_PAGE_ROUTE_POLL_MS);
      if (settling.started()) {
        return "loading";
      }
      const final = Date.now() >= deadline;
      let check: InPageNavigationCheck;
      try {
        const results = await this.runScript(tabId, {
          code: buildInPageNavigationCheckCode(start, final),
        });
        check = results[0] as InPageNavigationCheck;
      } catch (error) {
        return settling.started() ? "loading" : "none";
      }
      if (check.moved) {
        return "routed";
      }
      if (final) {
        return "none";
      }
    }
  }

  // goBack and goForward resolve without moving when the history ends there, and the settle
  // wait would only run to its timeout. Resolves only when the tab visibly never left.
  private historyEnd(
    tabId: number,
    urlBefore: string | undefined
  ): Promise<null> {
    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          const tab = await browser.tabs.get(tabId);
          if (tab.status === "complete" && tab.url === urlBefore) {
            resolve(null);
          }
        } catch (error) {
          console.error("Could not read the tab after a history move:", error);
        }
      }, HISTORY_MOVE_GRACE_MS);
    });
  }

  // The tab the command lands on is still showing the old page for a moment, so a "complete"
  // that arrives before the first "loading" belongs to the page being left behind.
  private waitForTabToSettle(tabId: number): SettleWatch {
    let started = false;
    let resolve: (settled: boolean) => void = () => undefined;
    const done = new Promise<boolean>((r) => {
      resolve = r;
    });
    const finish = (settled: boolean) => {
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      resolve(settled);
    };
    const onUpdated = (
      updatedTabId: number,
      changeInfo: browser.tabs._OnUpdatedChangeInfo
    ) => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (changeInfo.status === "loading") {
        started = true;
      } else if (changeInfo.status === "complete" && started) {
        finish(true);
      }
    };
    const timer = setTimeout(() => finish(false), NAVIGATION_SETTLE_MS);
    browser.tabs.onUpdated.addListener(onUpdated, { properties: ["status"] });
    return { done, started: () => started, cancel: () => finish(false) };
  }

  // Container tabs each keep their own cookie jar, and Zen ties workspaces to containers. A
  // tab created without one lands in the default jar, which reads as signed out everywhere.
  private async resolveCookieStore(
    requested: string | undefined
  ): Promise<string | undefined> {
    const explicit = requested && requested !== "auto";
    if (explicit && requested !== "inherit") {
      return requested === "default" ? undefined : requested;
    }
    if (!explicit && !(await isContainerInherited())) {
      return undefined;
    }
    try {
      const inFront = await this.findTabInFront();
      return inFront?.cookieStoreId;
    } catch (error) {
      console.error("Could not read the active tab container:", error);
      return undefined;
    }
  }

  // Zen holds one active tab per workspace and hides the ones off screen, so an active query can
  // answer with a tab from a workspace the user is not looking at - and its container with it.
  private async findTabInFront(): Promise<browser.tabs.Tab | undefined> {
    const pick = (tabs: browser.tabs.Tab[]): browser.tabs.Tab | undefined =>
      tabs.find((tab) => !tab.hidden) ?? tabs[0];

    const lastFocused = await browser.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const fromLastFocused = pick(lastFocused);
    if (fromLastFocused) {
      return fromLastFocused;
    }
    return pick(await browser.tabs.query({ active: true }));
  }

  private async closeTabs(
    correlationId: string,
    tabIds: number[]
  ): Promise<void> {
    await browser.tabs.remove(tabIds);
    await this.client.sendResourceToServer({
      resource: "tabs-closed",
      correlationId,
    });
  }

  private async sendTabs(correlationId: string): Promise<void> {
    const tabs = await browser.tabs.query({});
    await this.client.sendResourceToServer({
      resource: "tabs",
      correlationId,
      tabs: tabs.map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        lastAccessed: tab.lastAccessed,
        cookieStoreId: tab.cookieStoreId,
        held: tab.id !== undefined && this.isGuarded(tab.id),
      })),
    });
  }

  private async sendRecentHistory(
    correlationId: string,
    searchQuery: string | null = null
  ): Promise<void> {
    const historyItems = await browser.history.search({
      text: searchQuery ?? "", // Search for all URLs (empty string matches everything)
      maxResults: 200, // Limit to 200 results
      startTime: 0, // Search from the beginning of time
    });
    const filteredHistoryItems = historyItems.filter((item) => {
      return !!item.url;
    });
    await this.client.sendResourceToServer({
      resource: "history",
      correlationId,
      historyItems: filteredHistoryItems,
    });
  }

  // Check that the user has granted permission to access the URL's domain.
  // This will open the options page with a URL parameter to request permission
  // and throw an error to indicate that the request cannot proceed until permission is granted.
  private async checkForUrlPermission(url: string | undefined): Promise<void> {
    if (url) {
      const origin = new URL(url).origin;
      // view-source:, data:, about: and file: all report "null", which is not a match pattern
      // Firefox accepts, and there is no domain behind them for the user to grant either.
      if (origin === "null") {
        return;
      }
      const granted = await browser.permissions.contains({
        origins: [`${origin}/*`],
      });

      if (!granted) {
        // Open the options page with a URL parameter to request permission:
        const optionsUrl = browser.runtime.getURL("options.html");
        const urlWithParams = `${optionsUrl}?requestUrl=${encodeURIComponent(
          url
        )}`;

        await browser.tabs.create({ url: urlWithParams });
        throw new Error(
          `The user has not yet granted permission to access the domain "${origin}". A dialog is now being opened to request permission. If the user grants permission, you can try the request again.`
        );
      }
    }
  }

  private async checkForGlobalPermission(permissions: string[]): Promise<void> {
    const granted = await browser.permissions.contains({
      permissions,
    });

    if (!granted) {
      // Open the options page with a URL parameter to request permission:
      const optionsUrl = browser.runtime.getURL("options.html");
      const urlWithParams = `${optionsUrl}?requestPermissions=${encodeURIComponent(
        JSON.stringify(permissions)
      )}`;

      await browser.tabs.create({ url: urlWithParams });
      throw new Error(
        `The user has not yet granted permission for the following operations: ${permissions.join(
          ", "
        )}. A dialog is now being opened to request permission. If the user grants permission, you can try the request again.`
      );
    }
  }

  private async sendPage(
    req: ReadPageServerMessage & { correlationId: string }
  ): Promise<void> {
    const { correlationId, tabId } = req;
    const scoped = isElementTargeted(req);
    const offset = Math.max(0, req.offset ?? 0);

    await this.prepareTabAccess(tabId);

    await this.attachOverlay(
      tabId,
      "read",
      scoped ? t("overlayReadingElement") : t("overlayReadingContent"),
      scoped ? req : undefined
    );

    const includeHidden = await isHiddenElementsIncluded();
    const results = await this.runScript(
      tabId,
      {
        code: buildSnapshotCode({
          maxElements: Math.max(1, req.maxElements ?? DEFAULT_ELEMENT_LIMIT),
          includeHidden,
          full: req.full === true || offset > 0,
          target: scoped ? req : undefined,
        }),
      },
      LONG_SCRIPT_STALL_MS
    );
    const page = results[0] as PageReadResult;
    if (page.outline && (await isFocusEnabled())) {
      await this.showOutlineRegions(tabId, page.outline);
      this.shownOutlines.set(tabId, page.outline);
    }
    const whole = formatPageItems(page.items, {
      includeSelectors: req.includeSelectors === true,
      includeHrefs: req.includeHrefs === true,
    });
    const text = page.outline ? "" : whole.slice(offset, offset + MAX_PAGE_TEXT_LENGTH);

    await this.sendResource(
      {
        resource: "page",
        correlationId,
        tabId,
        url: page.url,
        title: page.title,
        text,
        isTruncated: offset + text.length < whole.length,
        totalLength: whole.length,
        totalElements: page.totalElements,
        listedElements: page.listedElements,
        hiddenElements: page.hiddenElements,
        hiddenListed: includeHidden,
        elementsTruncated: page.elementsTruncated,
        scrollY: page.scrollY,
        scrollHeight: page.scrollHeight,
        scrollMax: page.scrollMax,
        collapsed: page.collapsed,
        unreachableFrames: page.unreachableFrames,
        scope: page.scope,
        outline: page.outline,
      },
      tabId
    );
  }

  private async showOutlineRegions(
    tabId: number,
    outline: PageRegion[]
  ): Promise<void> {
    // __bcmOutline emits its regions depth-first, so a region's descendants are the run that
    // follows it until the depth drops back; that is what makes a level readable from the list.
    // The setting is a floor, not a ceiling: it says how large a group has to be to earn a box.
    const reach = await getOutlineBoxDepth();
    const marks: OutlineRegionMark[] = [];
    for (let i = 0; i < outline.length; i++) {
      const region = outline[i];
      let deepest = region.depth;
      for (let j = i + 1; j < outline.length && outline[j].depth > region.depth; j++) {
        deepest = Math.max(deepest, outline[j].depth);
      }
      const level = deepest - region.depth;
      if (level < reach) {
        continue;
      }
      marks.push({
        ref: region.ref,
        label: region.name ? `${region.ref} ${region.name}` : region.ref,
        level,
      });
    }
    try {
      await this.runScript(tabId, { code: buildOutlineOverlayCode(marks) });
    } catch (error) {
      console.error("Could not outline the page regions on tab", tabId, error);
    }
  }

  private async reorderTabs(
    correlationId: string,
    tabOrder: number[]
  ): Promise<void> {
    // Reorder the tabs sequentially
    for (let newIndex = 0; newIndex < tabOrder.length; newIndex++) {
      const tabId = tabOrder[newIndex];
      await browser.tabs.move(tabId, { index: newIndex });
    }
    await this.client.sendResourceToServer({
      resource: "tabs-reordered",
      correlationId,
      tabOrder,
    });
  }

  private async findAndHighlightText(
    req: FindHighlightServerMessage & { correlationId: string }
  ): Promise<void> {
    const { correlationId, tabId, queryPhrase } = req;
    const tab = await browser.tabs.get(tabId);

    await ensureTabAccess(tab);

    await this.checkForGlobalPermission(["find"]);
    const includeHidden = await isHiddenElementsIncluded();
    await this.attachOverlay(tabId, "read", t("overlayFind"));

    const findResults = await browser.find.find(queryPhrase, {
      tabId,
      caseSensitive: true,
    });

    let matches: FindMatchResult[] = [];
    // If there are results, highlight them
    if (findResults.count > 0) {
      // Firefox only auto-scrolls to a hit in the active tab, so foregrounding is what makes
      // the highlight visible. In background mode the marks are still drawn, just not scrolled to.
      if (!(await isBackgroundMode())) {
        await browser.tabs.update(tabId, { active: true });
      }
      browser.find.highlightResults({
        tabId,
      });
      await this.guardDialogs(tabId);
      const located = await this.runScript(
        tabId,
        {
          code: buildFindCode(
            queryPhrase,
            Math.max(1, Math.min(MAX_FIND_MATCHES, req.maxMatches ?? MAX_FIND_MATCHES)),
            includeHidden
          ),
        },
        LONG_SCRIPT_STALL_MS
      );
      matches = (located[0] as { matches: FindMatchResult[] }).matches;
    }

    await this.sendResource(
      {
        resource: "find-highlight-result",
        correlationId,
        noOfResults: findResults.count,
        matches,
        hiddenListed: includeHidden,
      },
      tabId
    );
  }

  private async captureScreenshot(
    req: CaptureScreenshotServerMessage & { correlationId: string }
  ): Promise<void> {
    const { correlationId, tabId } = req;
    const format = req.format ?? "jpeg";
    const quality = req.quality ?? 70;
    const scale = req.scale ?? 1;
    const tab = await browser.tabs.get(tabId);

    await ensureTabAccess(tab);

    await this.runScript(tabId, { code: buildConcealOverlayCode() }).catch(
      () => undefined
    );
    await delay(SCROLL_SETTLE_MS);

    if (tab.windowId === undefined) {
      throw new Error(`Tab ${tabId} does not belong to a window`);
    }

    let restoreTabId: number | undefined;
    try {
      const maxSlices = Math.max(
        1,
        Math.min(req.maxSlices ?? 1, MAX_CAPTURE_SLICES)
      );
      const box = isElementTargeted(req)
        ? await this.measureElement(tabId, req)
        : req.region
          ? await this.measureRegion(tabId, req.region)
          : null;
      const rects = box ? sliceRects(box, maxSlices) : [undefined];

      let sliced = rects.length > 1;
      const dataUrls: string[] = [];
      try {
        for (const rect of rects) {
          dataUrls.push(
            await browser.tabs.captureTab(tabId, {
              format,
              quality,
              scale,
              ...(rect ? { rect } : {}),
            })
          );
        }
      } catch (error) {
        // captureTab reaches a tab wherever it sits, while captureVisibleTab only ever returns
        // the window's active tab, so falling back means bringing the target to the front.
        dataUrls.length = 0;
        sliced = false;
        restoreTabId = tab.active
          ? undefined
          : await this.activateTabForCapture(tabId, tab.windowId);
        try {
          dataUrls.push(
            await browser.tabs.captureVisibleTab(tab.windowId, {
              format,
              quality,
              scale,
              ...(box ? { rect: box.rect } : {}),
            })
          );
        } catch (fallbackError) {
          throw new Error(
            `Firefox refused to capture tab ${tabId}: ${
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError)
            }. The extension no longer holds the <all_urls> permission it was installed with.`
          );
        }
      }
      const parsed = dataUrls.map(parseImageDataUrl);
      const imageBytes = parsed.reduce(
        (sum, image) => sum + base64ByteLength(image.imageData),
        0
      );
      const size = await measureImage(dataUrls[0]);
      const lastRect = rects[rects.length - 1];
      const clipped =
        sliced && box && lastRect
          ? lastRect.y + lastRect.height < box.fullBottom
          : box?.clipped ?? false;
      await this.sendResource(
        {
          resource: "screenshot",
          correlationId,
          tabId,
          imageData: parsed[0].imageData,
          mimeType: parsed[0].mimeType,
          ...(size ? { imageWidth: size.width, imageHeight: size.height } : {}),
          imageBytes,
          ...(parsed.length > 1
            ? { extraSlices: parsed.slice(1).map((image) => image.imageData) }
            : {}),
          ...(box
            ? {
                captured: {
                  label: box.label,
                  width: Math.round(box.rect.width),
                  height: Math.round(box.rect.height),
                  elementWidth: box.elementWidth,
                  elementHeight: box.elementHeight,
                  clipped,
                  ...(sliced ? { slices: parsed.length } : {}),
                  scrollY: box.scrollY,
                  scrollHeight: box.scrollHeight,
                  scrollMax: box.scrollMax,
                },
              }
            : {}),
        },
        tabId
      );
    } finally {
      if (restoreTabId !== undefined) {
        try {
          await browser.tabs.update(restoreTabId, { active: true });
        } catch (error) {
          console.error("Failed to restore the previously active tab:", error);
        }
      }
      await this.runScript(tabId, { code: buildRevealOverlayCode() }).catch(
        () => undefined
      );
      await this.attachOverlay(
        tabId,
        "read",
        isElementTargeted(req) ? t("overlayCaptureElement") : t("overlayCapture"),
        isElementTargeted(req) ? req : undefined
      );
    }
  }

  private async sendPageMedia(
    req: GetPageMediaServerMessage & { correlationId: string }
  ): Promise<void> {
    const { correlationId, tabId } = req;
    const scoped = isElementTargeted(req);

    await this.prepareTabAccess(tabId);

    await this.attachOverlay(
      tabId,
      "read",
      scoped ? t("overlayMediaListElement") : t("overlayMediaList"),
      scoped ? req : undefined
    );

    const includeHidden = await isHiddenElementsIncluded();
    const results = await this.runScript(
      tabId,
      { code: buildMediaListCode(scoped ? req : undefined, includeHidden) },
      LONG_SCRIPT_STALL_MS
    );
    const media = results[0] as MediaListResult;
    const scope = await getUrlScope();
    const items = media.items.filter((item) => isUrlInScope(item.url, scope));

    let known = this.knownMediaUrls.get(tabId);
    if (!known) {
      known = new Set();
      this.knownMediaUrls.set(tabId, known);
    }
    for (const item of items) {
      known.add(item.url);
    }

    await this.sendResource(
      {
        resource: "page-media",
        correlationId,
        tabId,
        items,
        totalItems: media.totalItems,
        hiddenItems: media.hiddenItems,
        hiddenListed: includeHidden,
        isTruncated: media.isTruncated,
        unreachableFrames: media.unreachableFrames,
      },
      tabId
    );
  }

  private async fetchMedia(
    req: FetchMediaServerMessage & { correlationId: string }
  ): Promise<void> {
    const { correlationId, tabId, url } = req;

    await this.prepareTabAccess(tabId);

    // The model must not be able to point the user's cookies at an address of its own choosing:
    // only what list-page-media saw on this page is reachable.
    const known = this.knownMediaUrls.get(tabId);
    if (!known || !known.has(url)) {
      throw new Error(
        `This URL was not listed by list-page-media on tab ${tabId}. Call list-page-media ` +
          `first; only URLs from its answer for this page can be fetched.`
      );
    }

    await this.attachOverlay(tabId, "read", t("overlayFetchMedia"));

    const results = await this.runScript(
      tabId,
      { code: buildMediaFetchCode(url, await getUploadLimitBytes()) },
      MEDIA_FETCH_STALL_MS
    );
    const fetched = results[0] as MediaFetchResult;
    if (!MEDIA_IMAGE_TYPES.has(fetched.mimeType)) {
      throw new Error(
        `The server answered with ${
          fetched.mimeType || "an unknown content type"
        }, not an image format the client can display (jpeg, png, gif, webp).`
      );
    }

    const size = await measureImage(
      `data:${fetched.mimeType};base64,${fetched.base64}`
    );
    await this.sendResource(
      {
        resource: "media-content",
        correlationId,
        tabId,
        imageData: fetched.base64,
        mimeType: fetched.mimeType,
        byteLength: fetched.byteLength,
        ...(size ? { imageWidth: size.width, imageHeight: size.height } : {}),
      },
      tabId
    );
  }

  private async measureElement(
    tabId: number,
    target: ElementTarget
  ): Promise<ElementBoxResult> {
    const results = await this.runScript(tabId, {
      code: buildElementBoxCode(target),
    });
    return results[0] as ElementBoxResult;
  }

  private async measureRegion(
    tabId: number,
    region: ViewportRegion
  ): Promise<ElementBoxResult> {
    const results = await this.runScript(tabId, {
      code: buildRegionBoxCode(region),
    });
    return results[0] as ElementBoxResult;
  }

  // Foregrounds the tab to be captured, returning the tab that was active before, if any.
  private async activateTabForCapture(
    tabId: number,
    windowId: number
  ): Promise<number | undefined> {
    const [previouslyActive] = await browser.tabs.query({
      active: true,
      windowId,
    });
    await browser.tabs.update(tabId, { active: true });
    await new Promise((resolve) => setTimeout(resolve, TAB_PAINT_DELAY_MS));
    return previouslyActive?.id;
  }

  // A tab authorized in the popup carries activeTab, which already covers scripting, so
  // asking for a host permission on top of it would be a prompt the user cannot act on.
  private async prepareTabAccess(tabId: number): Promise<browser.tabs.Tab> {
    const tab = await browser.tabs.get(tabId);
    const grant = await ensureTabAccess(tab);
    if (!grant.viaTabAuthorization) {
      await this.checkForUrlPermission(tab.url);
    }
    await this.guardDialogs(tabId);
    return tab;
  }

  // A native dialog blocks the page's own script, so executeScript would never return and the
  // command would only time out. The dialog has to be stopped before it opens.
  private async guardDialogs(
    tabId: number,
    runAt: "document_start" | "document_idle" = "document_idle"
  ): Promise<void> {
    try {
      const code = buildDialogGuardCode(await this.consoleLevel());
      await this.runScript(tabId, { code, runAt });
    } catch (error) {
      // A page that cannot be scripted at all is not worth failing a command over, but a
      // frozen one is: every later command would hang the same way.
      if (error instanceof StalledPageError) {
        throw error;
      }
      console.error("Could not install the dialog guard on tab", tabId, error);
    }
  }

  // An open dialog suspends the page, so executeScript never settles. Racing it against a timer
  // is the only way to tell that apart from a slow script, and the tab itself still answers.
  private async runScript(
    tabId: number,
    details: browser.extensionTypes.InjectDetails,
    stallMs: number = SCRIPT_STALL_MS
  ): Promise<any[]> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(SCRIPT_STALLED)), stallMs);
    });

    try {
      return await Promise.race([
        browser.tabs.executeScript(tabId, details),
        stalled,
      ]);
    } catch (error) {
      if (error instanceof Error && error.message === SCRIPT_STALLED) {
        throw new StalledPageError(await this.describeStalledTab(tabId));
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private async describeStalledTab(tabId: number): Promise<string> {
    let title = "";
    try {
      const tab = await browser.tabs.get(tabId);
      title = tab.title ? ` ("${tab.title}")` : "";
    } catch (error) {
      return `Tab ${tabId} stopped responding and can no longer be read; it may have been closed.`;
    }

    return (
      `Tab ${tabId}${title} is open but its scripts are frozen, which is what a native dialog does: ` +
      `alert, confirm and prompt suspend the page until someone answers them. The extension ` +
      `answers them silently, but only through a guard that has to be in place before the page runs, ` +
      `and a tab this session never opened or navigated was never given one. ` +
      `The dialog has to be closed in the browser before this command can run.`
    );
  }

  private async sendResource(
    message: ExtensionMessage,
    tabId: number
  ): Promise<void> {
    const seen = drainPageEvents(tabId);
    if (seen.dialogs.length > 0) {
      message.dialogs = seen.dialogs;
    }
    if (seen.console.length > 0) {
      message.consoleMessages = seen.console;
    }
    await this.client.sendResourceToServer(message);
  }


  // The overlay stays up for as long as this session holds the tab, so every command renews
  // the idle timer rather than scheduling its own teardown.
  private async attachOverlay(
    tabId: number,
    state: OverlayState,
    status: string,
    target?: ElementTarget
  ): Promise<OverlayResult | null> {
    this.shownOutlines.delete(tabId);

    const showAurora = await isAuroraEnabled();
    const showFocus = await isFocusEnabled();
    const showBadge = await isBadgeEnabled();
    const markTab = await isMarkEnabled();
    if (!showAurora && !showFocus && !showBadge && !markTab) {
      return null;
    }
    const colors = await getOverlayColors();
    const timings = await getOverlayTimings();
    this.touchTab(tabId, timings.holdReleaseMs);
    try {
      const results = await this.runScript(tabId, {
        code: buildAttachOverlayCode({
          status,
          state,
          markTab,
          showAurora,
          showFocus,
          showBadge,
          idleStatus: idleStatus(),
          resetAfterMs: state === "read" ? 0 : timings.statusResetMs,
          accents: colors.accents,
          aurora: colors.aurora,
          target,
        }),
      });
      return (results?.[0] as OverlayResult) ?? null;
    } catch (error) {
      console.error("Failed to draw the interaction overlay:", error);
      return null;
    }
  }

  private touchTab(tabId: number, holdMs: number): void {
    const existing = this.claimedTabs.get(tabId);
    if (existing) {
      clearTimeout(existing);
    }
    this.claimedTabs.set(
      tabId,
      setTimeout(() => {
        void this.releaseTab(tabId);
      }, holdMs)
    );
  }

  public async redrawOutlines(): Promise<void> {
    if (!(await isFocusEnabled())) {
      return;
    }
    for (const [tabId, outline] of [...this.shownOutlines]) {
      await this.showOutlineRegions(tabId, outline);
    }
  }

  public async refreshOverlays(): Promise<void> {
    const anyPart =
      (await isAuroraEnabled()) ||
      (await isFocusEnabled()) ||
      (await isBadgeEnabled()) ||
      (await isMarkEnabled());

    for (const tabId of [...this.claimedTabs.keys()]) {
      try {
        if (anyPart) {
          await this.attachOverlay(tabId, "idle", idleStatus());
        } else {
          await this.runScript(tabId, {
            code: buildDetachOverlayCode(),
          });
        }
      } catch (error) {
        console.error("Could not refresh the overlay on tab", tabId, error);
      }
    }
  }

  private isGuarded(tabId: number): boolean {
    return this.claimedTabs.has(tabId) || this.openedTabs.has(tabId);
  }

  private forgetTab(tabId: number): void {
    this.openedTabs.delete(tabId);
    this.knownMediaUrls.delete(tabId);
    this.textBaselines.delete(tabId);
    this.lastMarkReclaim.delete(tabId);
    this.shownOutlines.delete(tabId);
    forgetPageEvents(tabId);
    forgetNetworkLog(tabId);
    const timer = this.claimedTabs.get(tabId);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    this.claimedTabs.delete(tabId);
  }

  private async releaseTab(tabId: number): Promise<boolean> {
    if (!this.claimedTabs.has(tabId) && !this.openedTabs.has(tabId)) {
      return false;
    }
    this.forgetTab(tabId);
    try {
      await this.runScript(tabId, {
        code: buildDetachOverlayCode(),
      });
    } catch (error) {
      console.error("Could not remove the overlay from tab", tabId, error);
    }
    return true;
  }

  public async releaseAllTabs(): Promise<number[]> {
    const tabIds = [...new Set([...this.claimedTabs.keys(), ...this.openedTabs])];
    for (const tabId of tabIds) {
      await this.releaseTab(tabId);
    }
    return tabIds;
  }

  private async releaseTabs(
    req: ReleaseTabsServerMessage & { correlationId: string }
  ): Promise<void> {
    let releasedTabIds: number[];
    if (req.tabIds && req.tabIds.length > 0) {
      releasedTabIds = [];
      for (const tabId of req.tabIds) {
        if (await this.releaseTab(tabId)) {
          releasedTabIds.push(tabId);
        }
      }
    } else {
      releasedTabIds = await this.releaseAllTabs();
    }

    await this.client.sendResourceToServer({
      resource: "tabs-released",
      correlationId: req.correlationId,
      releasedTabIds,
    });
  }

  private async performInteraction(
    req: ServerMessageRequest & ElementTarget & { tabId: number },
    state: OverlayState,
    label: string,
    action: InteractionResultExtensionMessage["action"],
    code: string
  ): Promise<void> {
    await this.prepareTabAccess(req.tabId);

    if (!(await isBackgroundMode())) {
      await browser.tabs.update(req.tabId, { active: true });
    }

    const shown = await this.attachOverlay(
      req.tabId,
      state,
      label,
      elementTargetOf(req)
    );
    if (shown) {
      await delay((await getOverlayTimings()).leadMs);
    }

    const results = await this.runScript(req.tabId, { code });
    const result = results[0] as InteractionScriptResult;

    const detail =
      action === "scroll" &&
      (req as ScrollPageServerMessage).direction === "element" &&
      shown?.wasInView &&
      result.scrollY === 0
        ? `${result.detail}. The element was already inside the viewport, so nothing moved.`
        : result.detail;

    await this.sendResource(
      {
        resource: "interaction-result",
        correlationId: req.correlationId,
        tabId: req.tabId,
        action,
        target: result.target,
        detail,
        url: result.url,
        scrollY: result.scrollY,
        scrollHeight: result.scrollHeight,
        scrollMax: result.scrollMax,
      },
      req.tabId
    );
  }

  private async clickElement(
    req: ClickElementServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.performInteraction(
      req,
      "click",
      t("overlayClick"),
      "click",
      buildClickCode(req)
    );
  }

  private async hoverElement(
    req: HoverElementServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.performInteraction(
      req,
      "click",
      t("overlayHover"),
      "hover",
      buildHoverCode(req)
    );
  }

  private async dragElement(
    req: DragElementServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.performInteraction(
      req,
      "click",
      t("overlayDrag"),
      "drag",
      buildDragCode(req)
    );
  }

  private async uploadFiles(
    req: UploadFilesServerMessage & { correlationId: string }
  ): Promise<void> {
    const bytes = req.files.reduce(
      (sum, file) => sum + base64ByteLength(file.base64),
      0
    );
    const limit = await getUploadLimitBytes();
    if (req.files.length === 0 || bytes > limit) {
      throw new Error(
        `An upload carries between one file and ${limit} bytes in total, the limit set in the extension popup; this one is ${req.files.length} file(s) and ${bytes} bytes.`
      );
    }
    await this.performInteraction(
      req,
      "type",
      t("overlayUpload"),
      "upload",
      buildUploadFilesCode(req)
    );
  }

  private async resizeWindow(
    req: ResizeWindowServerMessage & { correlationId: string }
  ): Promise<void> {
    const tab = await browser.tabs.get(req.tabId);
    if (tab.windowId === undefined) {
      throw new Error(`Tab ${req.tabId} does not belong to a window`);
    }
    const updated = await browser.windows.update(tab.windowId, {
      width: req.width,
      height: req.height,
      state: "normal",
    });
    await this.client.sendResourceToServer({
      resource: "window-resized",
      correlationId: req.correlationId,
      tabId: req.tabId,
      width: updated.width ?? req.width,
      height: updated.height ?? req.height,
    });
  }

  private async sendNetworkRequests(
    req: GetNetworkRequestsServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.prepareTabAccess(req.tabId);
    await this.attachOverlay(req.tabId, "read", t("overlayNetwork"));
    const scope = await getUrlScope();
    const log = readNetworkLog(req.tabId, {
      urlPattern: req.urlPattern,
      limit: req.limit,
      clear: req.clear,
    });
    await this.sendResource(
      {
        resource: "network-requests",
        correlationId: req.correlationId,
        tabId: req.tabId,
        requests: log.requests.filter((record) =>
          isUrlInScope(record.url, scope)
        ),
        total: log.total,
      },
      req.tabId
    );
  }

  private async typeText(
    req: TypeTextServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.performInteraction(
      req,
      "type",
      t("overlayType"),
      "type",
      buildTypeCode(req)
    );
  }

  // Read here, not in the injected script: a content script has only the promise-returning
  // navigator.clipboard.readText(), and executeScript cannot carry a promise back out.
  private readClipboardText(): string {
    const scratch = document.createElement("textarea");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    try {
      scratch.focus();
      if (!document.execCommand("paste")) {
        throw new Error(
          "The browser refused to read the clipboard. Check that the extension still holds the clipboardRead permission."
        );
      }
      return scratch.value;
    } finally {
      scratch.remove();
    }
  }

  private async pressKey(
    req: PressKeyServerMessage & { correlationId: string }
  ): Promise<void> {
    const modifiers = req.modifiers ?? [];
    const isPaste =
      (modifiers.includes("Control") || modifiers.includes("Meta")) &&
      !modifiers.includes("Alt") &&
      req.key.length === 1 &&
      req.key.toLowerCase() === "v";
    if (isPaste && !(await isClipboardReadAllowed())) {
      throw new Error(
        "Pasting is disabled in extension settings ('Paste the clipboard' in the popup); type-into-page-element enters the text instead."
      );
    }
    const pasteText = isPaste ? this.readClipboardText() : null;

    // Label only: a shortcut reads as Control+A, never Control+a. The event still carries the
    // key exactly as it was sent.
    const combo = req.modifiers?.length
      ? `${req.modifiers.join("+")}+${
          req.key.length === 1 ? req.key.toUpperCase() : req.key
        }`
      : req.key;
    await this.performInteraction(
      req,
      "type",
      t("overlayPressKey", combo),
      "press-key",
      buildPressKeyCode(req, pasteText)
    );
  }

  private async scrollPage(
    req: ScrollPageServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.performInteraction(
      req,
      "read",
      t("overlayScroll"),
      "scroll",
      buildScrollCode(req)
    );
  }

  private async selectOption(
    req: SelectOptionServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.performInteraction(
      req,
      "click",
      t("overlaySelect"),
      "select-option",
      buildSelectOptionCode(req)
    );
  }

  private async executeJs(
    req: ExecuteJsServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.prepareTabAccess(req.tabId);

    await this.attachOverlay(req.tabId, "exec", t("overlayExecuteJs"));

    const results = await this.runScript(
      req.tabId,
      {
        code: buildExecuteJsCode(req.code, MAX_SCRIPT_RESULT_LENGTH),
      },
      LONG_SCRIPT_STALL_MS
    );
    const output = results[0];

    await this.sendResource(
      {
        resource: "script-result",
        correlationId: req.correlationId,
        tabId: req.tabId,
        result: output.result,
        isTruncated: output.isTruncated,
      },
      req.tabId
    );
  }

  private async waitForPage(
    req: WaitForPageServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.prepareTabAccess(req.tabId);

    const within = isElementTargeted(req.within) ? req.within : undefined;
    if (req.selector) {
      await this.waitForElement(req, req.selector, within);
    } else {
      await this.waitForTextChange(req, within);
    }
  }

  private async waitForElement(
    req: WaitForPageServerMessage & { correlationId: string },
    selector: string,
    within: ElementTarget | undefined
  ): Promise<void> {
    await this.attachOverlay(
      req.tabId,
      "read",
      within ? t("overlayWaitElement") : t("overlayWait"),
      within
    );

    const timeoutMs = Math.min(
      MAX_WAIT_TIMEOUT_MS,
      Math.max(0, req.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
    );
    const code = buildWaitProbeCode({ selector, state: req.state, within });
    const startedAt = Date.now();

    let probe: WaitProbeResult = { matchCount: 0, satisfied: false };
    while (true) {
      const results = await this.runScript(req.tabId, { code });
      probe = results[0] as WaitProbeResult;
      if (probe.satisfied || Date.now() - startedAt >= timeoutMs) {
        break;
      }
      await delay(WAIT_POLL_INTERVAL_MS);
    }

    await this.sendResource(
      {
        resource: "page-wait-result",
        correlationId: req.correlationId,
        tabId: req.tabId,
        mode: "element",
        navigated: false,
        found: probe.satisfied,
        elapsedMs: Date.now() - startedAt,
        matchCount: probe.matchCount,
      },
      req.tabId
    );
  }

  private async waitForTextChange(
    req: WaitForPageServerMessage & { correlationId: string },
    within: ElementTarget | undefined
  ): Promise<void> {
    await this.attachOverlay(
      req.tabId,
      "read",
      within ? t("overlayWaitTextElement") : t("overlayWaitText"),
      within
    );

    const timeoutMs = Math.min(
      MAX_TEXT_WAIT_TIMEOUT_MS,
      Math.max(0, req.timeoutMs ?? DEFAULT_TEXT_WAIT_TIMEOUT_MS)
    );
    const settleMs = Math.min(
      MAX_TEXT_SETTLE_MS,
      Math.max(0, req.settleMs ?? DEFAULT_TEXT_SETTLE_MS)
    );
    const minChars = Math.max(0, req.minChars ?? 0);
    const startedAt = Date.now();

    // Anything the page said since the last wait has to be diffed against where that wait
    // stopped, not against the page as it looks now, or it is swallowed while the caller thinks.
    const scopeKey = within
      ? JSON.stringify([within.ref, within.selector, within.index])
      : "";
    const held =
      this.textBaselines.get(req.tabId) ?? new Map<string, string>();
    const carried = held.get(scopeKey) ?? null;

    const watchResults = await this.runScript(
      req.tabId,
      {
        code: buildTextWatchCode(
          within,
          req.correlationId,
          carried,
          settleMs,
          timeoutMs,
          minChars
        ),
      },
      LONG_SCRIPT_STALL_MS
    );
    const watch = watchResults[0] as TextWatchResult;

    let current = watch.current;
    let outcome: TextWaitOutcome = "changed";

    if (!watch.settled) {
      // The hold would otherwise expire under a wait longer than holdReleaseMs and end it.
      const timings = await getOverlayTimings();
      this.extendHold(req.tabId, timeoutMs + timings.holdReleaseMs);
      outcome = await awaitTextChange(
        req.tabId,
        req.correlationId,
        timeoutMs
      );
      this.extendHold(req.tabId, timings.holdReleaseMs);
      if (outcome !== "navigated") {
        const readResults = await this.runScript(
          req.tabId,
          { code: buildTextReadCode(within) },
          LONG_SCRIPT_STALL_MS
        );
        current = readResults[0] as string;
      }
    }

    const diff =
      outcome === "navigated"
        ? { added: "", removed: 0, delta: 0 }
        : diffText(watch.baseline, current);
    // A change too small to report leaves the baseline where it was, so the small ones that
    // follow are measured together and reported once they add up past the threshold.
    const changed =
      outcome !== "navigated" &&
      current !== watch.baseline &&
      diff.delta >= minChars;

    if (outcome === "navigated") {
      this.textBaselines.delete(req.tabId);
    } else {
      held.set(scopeKey, changed ? current : watch.baseline);
      this.textBaselines.set(req.tabId, held);
    }

    await this.sendResource(
      {
        resource: "page-wait-result",
        correlationId: req.correlationId,
        tabId: req.tabId,
        mode: "text",
        changed,
        navigated: outcome === "navigated",
        fresh: carried === null,
        addedText: diff.added.slice(0, MAX_ADDED_TEXT_LENGTH),
        rewritten: diff.removed > 0,
        removedChars: diff.removed,
        elapsedMs: Date.now() - startedAt,
      },
      req.tabId
    );
  }

  private extendHold(tabId: number, holdMs: number): void {
    if (this.claimedTabs.has(tabId)) {
      this.touchTab(tabId, holdMs);
    }
  }


  private async groupTabs(
    correlationId: string,
    tabIds: number[],
    isCollapsed: boolean,
    groupColor: browser.tabGroups.Color,
    groupTitle: string
  ): Promise<void> {
    const groupId = await browser.tabs.group({
      tabIds,
    });

    let tabGroup = await browser.tabGroups.update(groupId, {
      collapsed: isCollapsed,
      color: groupColor,
      title: groupTitle,
    });

    await this.client.sendResourceToServer({
      resource: "new-tab-group",
      correlationId,
      groupId: tabGroup.id,
    });
  }
}

function sliceRects(
  box: ElementBoxResult,
  maxSlices: number
): { x: number; y: number; width: number; height: number }[] {
  if (maxSlices <= 1 || !box.clipped) {
    return [box.rect];
  }
  const rects = [];
  let top = box.fullTop;
  while (top < box.fullBottom && rects.length < maxSlices) {
    const height = Math.min(MAX_CAPTURE_HEIGHT_PX, box.fullBottom - top);
    rects.push({ x: box.rect.x, y: top, width: box.rect.width, height });
    if (top + height >= box.fullBottom) {
      break;
    }
    top = top + height - SLICE_OVERLAP_PX;
  }
  return rects;
}

function base64ByteLength(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

async function measureImage(
  dataUrl: string
): Promise<{ width: number; height: number } | undefined> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch (error) {
    return undefined;
  }
}

function parseImageDataUrl(dataUrl: string): {
  mimeType: string;
  imageData: string;
} {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("The browser returned a screenshot in an unexpected format");
  }
  return { mimeType: match[1], imageData: match[2] };
}
