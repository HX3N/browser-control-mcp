import type {
  CaptureScreenshotServerMessage,
  ClickElementServerMessage,
  NavigateTabServerMessage,
  ElementTarget,
  ExtensionMessage,
  ExecuteJsServerMessage,
  GetTabContentServerMessage,
  PageSnapshotServerMessage,
  PressKeyServerMessage,
  ReleaseTabsServerMessage,
  ScrollPageServerMessage,
  SelectOptionServerMessage,
  ServerMessageRequest,
  TypeTextServerMessage,
  WaitForElementServerMessage,
} from "@browser-control-mcp/common";
import { WebsocketClient } from "./client";
import { t } from "./i18n";
import {
  isClipboardReadAllowed,
  isCommandAllowed,
  isDomainInDenyList,
  COMMAND_TO_TOOL_ID,
  addAuditLogEntry,
  isAuroraEnabled,
  isBadgeEnabled,
  isFocusEnabled,
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
} from "./extension-config";
import { ensureTabAccess } from "./tab-access";
import { buildSnapshotCode } from "./page-snapshot";
import {
  ELEMENT_RESOLVER_SOURCE,
  isElementTargeted,
  PAGE_READ_SOURCE,
  targetLiteral,
} from "./injected-common";
import {
  buildAttachOverlayCode,
  buildConcealOverlayCode,
  buildDetachOverlayCode,
  buildRevealOverlayCode,
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
  drainPageEvents,
  forgetPageEvents,
  noteCommittedDocument,
  recordPageEvent,
  takeUnguardedDocuments,
} from "./page-events";
import {
  buildClickCode,
  buildElementBoxCode,
  buildExecuteJsCode,
  buildPressKeyCode,
  buildScrollCode,
  buildSelectOptionCode,
  buildTypeCode,
  buildWaitProbeCode,
  ElementBoxResult,
  InteractionScriptResult,
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

const DEFAULT_SNAPSHOT_LIMIT = 200;
const MAX_SCRIPT_RESULT_LENGTH = 20_000;
const DEFAULT_WAIT_TIMEOUT_MS = 5_000;
const MAX_WAIT_TIMEOUT_MS = 60_000;
const WAIT_POLL_INTERVAL_MS = 200;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    if (details.frameId !== 0 || !this.isGuarded(details.tabId)) {
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
    changeInfo: { status?: string }
  ) => {
    if (changeInfo.status !== "complete" || !this.claimedTabs.has(tabId)) {
      return;
    }
    void this.redrawOverlay(tabId);
  };

  constructor(client: WebsocketClient) {
    this.client = client;
    browser.tabs.onRemoved.addListener(this.onTabRemoved);
    browser.webNavigation.onCommitted.addListener(this.onNavigationCommitted);
    browser.tabs.onUpdated.addListener(this.onTabUpdated, {
      properties: ["status"],
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
      throw new Error(`Command '${req.cmd}' is disabled in extension settings`);
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
      case "get-tab-content":
        await this.sendTabsContent(req);
        break;
      case "reorder-tabs":
        await this.reorderTabs(req.correlationId, req.tabOrder);
        break;
      case "find-highlight":
        await this.findAndHighlightText(
          req.correlationId,
          req.tabId,
          req.queryPhrase
        );
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
      case "page-snapshot":
        await this.sendPageSnapshot(req);
        break;
      case "click-element":
        await this.clickElement(req);
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
      case "wait-for-element":
        await this.waitForElement(req);
        break;
      case "release-tabs":
        await this.releaseTabs(req);
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
        )}. Ask the user to widen "Allowed addresses" in the Browser Control MCP popup.`
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
        await settling;
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
    await this.ensureUrlInScope(req.url);

    if (await isDomainInDenyList(req.url)) {
      throw new Error("Domain in user defined deny list");
    }

    const current = await this.prepareTabAccess(req.tabId);
    await this.attachOverlay(req.tabId, "read", t("overlayNavigate"));
    await delay((await getOverlayTimings()).leadMs);

    const registration = await registerDialogGuard(
      req.url,
      buildDialogGuardCode(await this.consoleLevel()),
      current.cookieStoreId
    );
    let settled: boolean;
    try {
      const settling = this.waitForTabToSettle(req.tabId);
      await browser.tabs.update(req.tabId, { url: req.url });
      settled = await settling;
    } finally {
      await unregisterDialogGuard(registration);
    }
    await this.verifyGuard(req.tabId);
    const tab = await browser.tabs.get(req.tabId);

    await this.sendResource(
      {
        resource: "tab-navigated",
        correlationId: req.correlationId,
        tabId: req.tabId,
        url: tab.url ?? req.url,
        title: tab.title ?? "",
        settled,
      },
      req.tabId
    );
  }

  // The tab the command lands on is still showing the old page for a moment, so a "complete"
  // that arrives before the first "loading" belongs to the page being left behind.
  private waitForTabToSettle(tabId: number): Promise<boolean> {
    return new Promise((resolve) => {
      let started = false;
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
    });
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

  private async sendTabsContent(
    req: GetTabContentServerMessage & { correlationId: string }
  ): Promise<void> {
    const { correlationId, tabId, offset } = req;
    const scoped = isElementTargeted(req);

    await this.prepareTabAccess(tabId);

    await this.attachOverlay(
      tabId,
      "read",
      scoped ? t("overlayReadingElement") : t("overlayReadingContent"),
      scoped ? req : undefined
    );

    const MAX_CONTENT_LENGTH = 50_000;
    const MAX_COLLAPSED_SECTIONS = 30;
    const MAX_FORM_FIELDS = 40;
    const results = await this.runScript(
      tabId,
      {
        code: `
      (function () {
        ${ELEMENT_RESOLVER_SOURCE}
        ${PAGE_READ_SOURCE}
        const scope = ${
          scoped ? `__bcmResolve(${targetLiteral(req)})` : "document.body"
        };

        function getLinks() {
          const linkElements = [];
          __bcmReadRoots(scope).forEach(root => {
            linkElements.push(...Array.from(root.querySelectorAll('a[href]')));
          });
          return linkElements.map(el => ({
            url: el.href,
            text: el.innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || ''
          })).filter(link => link.text !== '' && !link.url.includes('#'));
        }

        const pageText = __bcmReadText(scope);

        function getTextContent() {
          let isTruncated = false;
          let text = pageText.substring(${Number(offset) || 0});
          if (text.length > ${MAX_CONTENT_LENGTH}) {
            text = text.substring(0, ${MAX_CONTENT_LENGTH});
            isTruncated = true;
          }
          return {
            text, isTruncated
          }
        }

        const textContent = getTextContent();

        return {
          links: getLinks(),
          fullText: textContent.text,
          isTruncated: textContent.isTruncated,
          totalLength: pageText.length,
          collapsed: __bcmCollapsed(scope, ${MAX_COLLAPSED_SECTIONS}),
          fields: __bcmFields(scope, ${MAX_FORM_FIELDS}),
          unreachableFrames: __bcmUnreachableFrames(scope)
        };
      })();
    `,
      },
      LONG_SCRIPT_STALL_MS
    );
    const { isTruncated, fullText, totalLength, collapsed, fields, unreachableFrames } =
      results[0];
    const scope = await getUrlScope();
    const links = (
      results[0].links as { url: string; text: string }[]
    ).filter((link) => isUrlInScope(link.url, scope));
    await this.sendResource(
      {
        resource: "tab-content",
        tabId,
        correlationId,
        isTruncated,
        fullText,
        links,
        totalLength,
        collapsed,
        fields,
        unreachableFrames,
      },
      tabId
    );
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
    correlationId: string,
    tabId: number,
    queryPhrase: string
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);

    await ensureTabAccess(tab);

    await this.checkForGlobalPermission(["find"]);

    const findResults = await browser.find.find(queryPhrase, {
      tabId,
      caseSensitive: true,
    });

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
    }

    await this.client.sendResourceToServer({
      resource: "find-highlight-result",
      correlationId,
      noOfResults: findResults.count,
    });
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
      const box = isElementTargeted(req)
        ? await this.measureElement(tabId, req)
        : null;
      const options = {
        format,
        quality,
        scale,
        ...(box ? { rect: box.rect } : {}),
      };

      let dataUrl: string;
      try {
        dataUrl = await browser.tabs.captureTab(tabId, options);
      } catch (error) {
        // captureTab reaches a tab wherever it sits, while captureVisibleTab only ever returns
        // the window's active tab, so falling back means bringing the target to the front.
        restoreTabId = tab.active
          ? undefined
          : await this.activateTabForCapture(tabId, tab.windowId);
        try {
          dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, options);
        } catch (fallbackError) {
          throw new Error(
            `Firefox refused to capture tab ${tabId}: ${
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError)
            }. Ask the user to reinstall the extension so that it holds the <all_urls> ` +
              `permission, or to click its toolbar button on that tab.`
          );
        }
      }
      const { mimeType, imageData } = parseImageDataUrl(dataUrl);
      await this.sendResource(
        {
          resource: "screenshot",
          correlationId,
          tabId,
          imageData,
          mimeType,
          ...(box
            ? {
                captured: {
                  label: box.label,
                  width: Math.round(box.rect.width),
                  height: Math.round(box.rect.height),
                  elementWidth: box.elementWidth,
                  elementHeight: box.elementHeight,
                  clipped: box.clipped,
                  scrollY: box.scrollY,
                  scrollHeight: box.scrollHeight,
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
    }
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
      `Ask the user to close the dialog in the browser, then run this command again.`
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
    forgetPageEvents(tabId);
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
    action: "click" | "type" | "scroll" | "press-key" | "select-option",
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
      action === "scroll" && shown?.wasInView && result.scrollY === 0
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
      },
      req.tabId
    );
  }

  private async sendPageSnapshot(
    req: PageSnapshotServerMessage & { correlationId: string }
  ): Promise<void> {
    const scoped = isElementTargeted(req);

    await this.prepareTabAccess(req.tabId);

    await this.attachOverlay(
      req.tabId,
      "read",
      scoped ? t("overlaySnapshotElement") : t("overlaySnapshot"),
      scoped ? req : undefined
    );

    const results = await this.runScript(
      req.tabId,
      {
        code: buildSnapshotCode({
          maxElements: Math.max(1, req.maxElements ?? DEFAULT_SNAPSHOT_LIMIT),
          interactiveOnly: req.interactiveOnly !== false,
          includeHidden: await isHiddenElementsIncluded(),
          target: scoped ? req : undefined,
        }),
      },
      LONG_SCRIPT_STALL_MS
    );
    const snapshot = results[0];

    await this.sendResource(
      {
        resource: "page-snapshot",
        correlationId: req.correlationId,
        tabId: req.tabId,
        url: snapshot.url,
        title: snapshot.title,
        elements: snapshot.elements,
        totalElements: snapshot.totalElements,
        hiddenElements: snapshot.hiddenElements,
        isTruncated: snapshot.isTruncated,
        scrollY: snapshot.scrollY,
        scrollHeight: snapshot.scrollHeight,
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
        "Pasting is disabled in extension settings. Ask the user to turn on 'Paste the clipboard' in the extension popup, or use type-into-page-element to enter the text instead."
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

  private async waitForElement(
    req: WaitForElementServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.prepareTabAccess(req.tabId);

    await this.attachOverlay(req.tabId, "read", t("overlayWait"));

    const timeoutMs = Math.min(
      MAX_WAIT_TIMEOUT_MS,
      Math.max(0, req.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS)
    );
    const code = buildWaitProbeCode(req);
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
        resource: "element-wait-result",
        correlationId: req.correlationId,
        tabId: req.tabId,
        found: probe.satisfied,
        elapsedMs: Date.now() - startedAt,
        matchCount: probe.matchCount,
      },
      req.tabId
    );
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
