import type {
  ClickElementServerMessage,
  NavigateTabServerMessage,
  ElementTarget,
  ExtensionMessage,
  ExecuteJsServerMessage,
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
  isBackgroundMode,
  getUrlScope,
  isUrlInScope,
  describeUrlScope,
} from "./extension-config";
import { hasCaptureConsent, markTabAsAwaitingConsent } from "./capture-consent";
import { ensureTabAccess, hasAllUrlsPermission } from "./tab-access";
import { buildSnapshotCode } from "./page-snapshot";
import {
  buildAttachOverlayCode,
  buildDetachOverlayCode,
  OverlayResult,
  OverlayState,
} from "./highlight-overlay";
import { buildDialogGuardCode, buildDrainDialogsCode } from "./dialog-guard";
import {
  buildClickCode,
  buildExecuteJsCode,
  buildPressKeyCode,
  buildScrollCode,
  buildSelectOptionCode,
  buildTypeCode,
  buildWaitProbeCode,
  InteractionScriptResult,
  WaitProbeResult,
} from "./interaction-scripts";

// Time to let a newly foregrounded tab paint before capturing it
const TAB_PAINT_DELAY_MS = 250;

// The pause is deliberate: it lets the overlay paint before the action changes the page, so
// the user sees which element is about to be touched rather than only its aftermath.
const INTERACTION_LEAD_MS = 220;

// MCP has no notion of a turn ending, so the hold has to outlast the pauses between commands:
// a model can think for minutes between two clicks.
const HOLD_RELEASE_MS = 300_000;
const STATUS_RESET_MS = 4000;
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

  constructor(client: WebsocketClient) {
    this.client = client;
    browser.tabs.onRemoved.addListener((tabId) => {
      this.forgetTab(tabId);
    });
    // The overlay is injected DOM, so a navigation wipes it. Nothing redraws it on its own:
    // there is no registered content script.
    browser.tabs.onUpdated.addListener(
      (tabId, changeInfo) => {
        if (changeInfo.status !== "complete" || !this.claimedTabs.has(tabId)) {
          return;
        }
        void this.redrawOverlay(tabId);
      },
      { properties: ["status"] }
    );
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
        await this.sendTabsContent(req.correlationId, req.tabId, req.offset);
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
        await this.captureScreenshot(
          req.correlationId,
          req.tabId,
          req.format,
          req.quality,
          req.scale
        );
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

    const container = await this.resolveCookieStore(cookieStoreId);
    const active = !(await isBackgroundMode());
    const tab = await browser.tabs.create(
      container ? { url, cookieStoreId: container, active } : { url, active }
    );

    await this.client.sendResourceToServer({
      resource: "opened-tab-id",
      correlationId,
      tabId: tab.id,
    });
  }

  private async navigateTab(
    req: NavigateTabServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.ensureUrlInScope(req.url);

    if (await isDomainInDenyList(req.url)) {
      throw new Error("Domain in user defined deny list");
    }

    await this.prepareTabAccess(req.tabId);
    await this.attachOverlay(req.tabId, "read", t("overlayNavigate"));
    await delay(INTERACTION_LEAD_MS);

    const settling = this.waitForTabToSettle(req.tabId);
    await browser.tabs.update(req.tabId, { url: req.url });
    const settled = await settling;
    const tab = await browser.tabs.get(req.tabId);

    await this.client.sendResourceToServer({
      resource: "tab-navigated",
      correlationId: req.correlationId,
      tabId: req.tabId,
      url: tab.url ?? req.url,
      title: tab.title ?? "",
      settled,
    });
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
      const [active] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      return active?.cookieStoreId;
    } catch (error) {
      console.error("Could not read the active tab container:", error);
      return undefined;
    }
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
    correlationId: string,
    tabId: number,
    offset?: number
  ): Promise<void> {
    await this.prepareTabAccess(tabId);

    await this.attachOverlay(tabId, "read", t("overlayReadingContent"));

    const MAX_CONTENT_LENGTH = 50_000;
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        function getLinks() {
          const linkElements = document.querySelectorAll('a[href]');
          return Array.from(linkElements).map(el => ({
            url: el.href,
            text: el.innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || ''
          })).filter(link => link.text !== '' && !link.url.includes('#'));
        }

        function getTextContent() {
          let isTruncated = false;
          let text = document.body.innerText.substring(${Number(offset) || 0});
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
          totalLength: document.body.innerText.length
        };
      })();
    `,
    });
    const { isTruncated, fullText, totalLength } = results[0];
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
    correlationId: string,
    tabId: number,
    format: "jpeg" | "png" = "jpeg",
    quality: number = 70,
    scale: number = 1
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);

    await ensureTabAccess(tab);

    // captureVisibleTab is gated on the broad host permission or on activeTab, and an
    // origin-scoped grant satisfies neither, so the per-tab authorization is still required.
    if (!(await hasAllUrlsPermission()) && !hasCaptureConsent(tabId, tab.url)) {
      await markTabAsAwaitingConsent(tabId);
      throw new Error(
        `The user has not authorized screenshots of tab ${tabId} ("${
          tab.title ?? tab.url
        }"). The extension's toolbar button is now marked with a "!" badge on that tab. ` +
          `Ask the user to open the Browser Control MCP popup while that tab is in front and press the authorize button, then try again. ` +
          `The authorization covers only that tab, and ends when the tab navigates or closes. ` +
          `Switching the popup to full-access mode removes the need to authorize each tab.`
      );
    }

    await browser.tabs
      .executeScript(tabId, { code: buildDetachOverlayCode() })
      .catch(() => undefined);

    if (tab.windowId === undefined) {
      throw new Error(`Tab ${tabId} does not belong to a window`);
    }

    // captureVisibleTab() captures whichever tab is active in the window, and activeTab is
    // only granted for the tab the user clicked, so the target tab has to be foregrounded
    // first. Restore the previous tab afterwards so the capture is not disruptive.
    const restoreTabId = tab.active
      ? undefined
      : await this.activateTabForCapture(tabId, tab.windowId);

    try {
      let dataUrl: string;
      try {
        dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, {
          format,
          quality,
          scale,
        });
      } catch (error) {
        // The browser is the real enforcer of the activeTab grant, so it can still refuse
        // even when the tracked consent looks valid.
        throw new Error(
          `Firefox refused to capture tab ${tabId}: ${
            error instanceof Error ? error.message : String(error)
          }. Capturing with per-tab authorization requires Firefox 126 or later. ` +
            `Otherwise, ask the user to click the extension's toolbar button on that tab again.`
        );
      }
      const { mimeType, imageData } = parseImageDataUrl(dataUrl);
      await this.sendResource(
        {
          resource: "screenshot",
          correlationId,
          tabId,
          imageData,
          mimeType,
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
    }
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
    if (!grant.viaTabConsent) {
      await this.checkForUrlPermission(tab.url);
    }
    await this.guardDialogs(tabId);
    return tab;
  }

  // A native dialog blocks the page's own script, so executeScript would never return and the
  // command would only time out. The dialog has to be stopped before it opens.
  private async guardDialogs(tabId: number): Promise<void> {
    try {
      await browser.tabs.executeScript(tabId, { code: buildDialogGuardCode() });
    } catch (error) {
      console.error("Could not install the dialog guard on tab", tabId, error);
    }
  }

  private async sendResource(
    message: ExtensionMessage,
    tabId: number
  ): Promise<void> {
    const dialogs = await this.drainDialogs(tabId);
    if (dialogs.length > 0) {
      message.dialogs = dialogs;
    }
    await this.client.sendResourceToServer(message);
  }

  private async drainDialogs(tabId: number): Promise<string[]> {
    try {
      const results = await browser.tabs.executeScript(tabId, {
        code: buildDrainDialogsCode(),
      });
      const seen = results?.[0];
      return Array.isArray(seen) ? seen : [];
    } catch (error) {
      return [];
    }
  }

  // The overlay stays up for as long as this session holds the tab, so every command renews
  // the idle timer rather than scheduling its own teardown.
  private async attachOverlay(
    tabId: number,
    state: OverlayState,
    status: string,
    target?: ElementTarget
  ): Promise<OverlayResult | null> {
    this.touchTab(tabId);

    const showAurora = await isAuroraEnabled();
    const showFocus = await isFocusEnabled();
    const showBadge = await isBadgeEnabled();
    const markTab = await isMarkEnabled();
    if (!showAurora && !showFocus && !showBadge && !markTab) {
      return null;
    }
    try {
      const results = await browser.tabs.executeScript(tabId, {
        code: buildAttachOverlayCode({
          status,
          state,
          markTab,
          showAurora,
          showFocus,
          showBadge,
          idleStatus: idleStatus(),
          resetAfterMs: STATUS_RESET_MS,
          target,
        }),
      });
      return (results?.[0] as OverlayResult) ?? null;
    } catch (error) {
      console.error("Failed to draw the interaction overlay:", error);
      return null;
    }
  }

  private touchTab(tabId: number): void {
    const existing = this.claimedTabs.get(tabId);
    if (existing) {
      clearTimeout(existing);
    }
    this.claimedTabs.set(
      tabId,
      setTimeout(() => {
        void this.releaseTab(tabId);
      }, HOLD_RELEASE_MS)
    );
  }

  private forgetTab(tabId: number): void {
    const timer = this.claimedTabs.get(tabId);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    this.claimedTabs.delete(tabId);
  }

  private async releaseTab(tabId: number): Promise<boolean> {
    if (!this.claimedTabs.has(tabId)) {
      return false;
    }
    this.forgetTab(tabId);
    try {
      await browser.tabs.executeScript(tabId, {
        code: buildDetachOverlayCode(),
      });
    } catch (error) {
      console.error("Could not remove the overlay from tab", tabId, error);
    }
    return true;
  }

  public async releaseAllTabs(): Promise<number[]> {
    const tabIds = [...this.claimedTabs.keys()];
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

    const shown = await this.attachOverlay(
      req.tabId,
      state,
      label,
      elementTargetOf(req)
    );
    if (shown) {
      await delay(INTERACTION_LEAD_MS);
    }

    const results = await browser.tabs.executeScript(req.tabId, { code });
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
    await this.prepareTabAccess(req.tabId);

    await this.attachOverlay(req.tabId, "read", t("overlaySnapshot"));

    const results = await browser.tabs.executeScript(req.tabId, {
      code: buildSnapshotCode({
        maxElements: Math.max(1, req.maxElements ?? DEFAULT_SNAPSHOT_LIMIT),
        interactiveOnly: req.interactiveOnly !== false,
        includeHidden: await isHiddenElementsIncluded(),
      }),
    });
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

  private async pressKey(
    req: PressKeyServerMessage & { correlationId: string }
  ): Promise<void> {
    await this.performInteraction(
      req,
      "type",
      t("overlayPressKey", req.key),
      "press-key",
      buildPressKeyCode(req)
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

    const results = await browser.tabs.executeScript(req.tabId, {
      code: buildExecuteJsCode(req.code, MAX_SCRIPT_RESULT_LENGTH),
    });
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
      const results = await browser.tabs.executeScript(req.tabId, { code });
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
