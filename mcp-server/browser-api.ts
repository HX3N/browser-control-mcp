import WebSocket from "ws";
import type {
  ExtensionMessage,
  BrowserTab,
  BrowserHistoryItem,
  ElementTarget,
  ElementWaitExtensionMessage,
  InteractionResultExtensionMessage,
  PageSnapshotExtensionMessage,
  ScriptResultExtensionMessage,
  TabsReleasedExtensionMessage,
  ServerMessage,
  TabContentExtensionMessage,
  ServerMessageRequest,
  ExtensionError,
  ScreenshotExtensionMessage,
  TabNavigatedExtensionMessage,
  OpenedTabIdExtensionMessage,
} from "@browser-control-mcp/common";
import { isPortInUse, withPageEvents } from "./util";
import * as crypto from "crypto";

const WS_DEFAULT_PORT = 8089;
const EXTENSION_RESPONSE_TIMEOUT_MS = 5000;
// Capturing may foreground the tab, wait for it to paint, encode the image and transfer a
// payload orders of magnitude larger than the other responses.
const SCREENSHOT_RESPONSE_TIMEOUT_MS = 10000;
// Interactions draw the overlay, hold it long enough to be seen, and only then act on the
// page, so they never fit inside the default response budget.
const INTERACTION_RESPONSE_TIMEOUT_MS = 15000;
// A navigation waits for the new page to finish loading before it answers, so its budget has
// to sit above the extension's own settle timeout.
const NAVIGATION_RESPONSE_TIMEOUT_MS = 20000;
const WAIT_RESPONSE_GRACE_MS = 5000;
// The extension grows its probe range on the same base port, so both sides converge without
// any discovery protocol.
const PORT_SCAN_RANGE = 16;

function listen(host: string, port: number): Promise<WebSocket.Server> {
  return new Promise((resolve, reject) => {
    const server = new WebSocket.Server({ host, port });
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server);
    };
    server.once("error", onError);
    server.once("listening", onListening);
  });
}

interface ExtensionRequestResolver<T extends ExtensionMessage["resource"]> {
  resource: T;
  resolve: (value: Extract<ExtensionMessage, { resource: T }>) => void;
  reject: (reason?: string) => void;
}

export class BrowserAPI {
  private ws: WebSocket | null = null;
  private wsServers: WebSocket.Server[] = [];
  private sharedSecret: string | null = null;
  private boundPort: number | null = null;

  // Map to persist the request to the extension. It maps the request correlationId
  // to a resolver, fulfulling a promise created when sending a message to the extension.
  private extensionRequestMap: Map<
    string,
    ExtensionRequestResolver<ExtensionMessage["resource"]>
  > = new Map();

  async init() {
    const { secret, port } = readConfig();
    if (!secret) {
      throw new Error(
        "EXTENSION_SECRET env var missing. See the extension's options page."
      );
    }
    this.sharedSecret = secret;

    // Bind explicitly to both loopback addresses so Firefox connects regardless of how
    // it resolves "localhost". On Linux, getaddrinfo("localhost") often returns ::1
    // before 127.0.0.1; binding only to "localhost" then yields an IPv6-only listener
    // and IPv4 connect attempts get refused. Listening on 127.0.0.1 *and* ::1 keeps
    // the server loopback-only (unlike "::"/"0.0.0.0", which would expose external
    // interfaces), while accepting both IPv4 and IPv6 clients.
    const hosts = ["127.0.0.1", "::1"];

    // Every concurrent client session starts its own copy of this server, so a taken base
    // port is the normal case rather than a misconfiguration. Exiting here would be wrong.
    const claimed = await this.claimPort(port, hosts);
    if (!claimed) {
      throw new Error(
        `No free port for the extension connection between ${port} and ${
          port + PORT_SCAN_RANGE - 1
        }. Close some sessions, or set EXTENSION_PORT to another base port.`
      );
    }

    const { port: boundPort, servers } = claimed;
    this.boundPort = boundPort;

    for (const wsServer of servers) {
      console.error(`WebSocket server listening on port ${boundPort}`);
      wsServer.on("connection", async (connection) => {
        this.ws = connection;

        console.error("WebSocket connection established on port", boundPort);

        this.ws.on("message", (message) => {
          // Anything thrown here escapes into the socket's own data handler and takes the
          // connection down, which surfaces on the next command as a dropped extension.
          try {
            const decoded = JSON.parse(message.toString());
            if (isErrorMessage(decoded)) {
              this.handleExtensionError(decoded);
              return;
            }
            const signature = this.createSignature(
              JSON.stringify(decoded.payload)
            );
            if (signature !== decoded.signature) {
              console.error("Invalid message signature");
              return;
            }
            this.handleDecodedExtensionMessage(decoded.payload);
          } catch (error) {
            console.error("Failed to handle a message from the extension:", error);
          }
        });
      });
      wsServer.on("error", (error) => {
        console.error(`WebSocket server error on port ${boundPort}:`, error);
      });

      this.wsServers.push(wsServer);
    }
  }

  async releaseTabs(tabIds?: number[]): Promise<TabsReleasedExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "release-tabs",
      tabIds,
    });
    return await this.waitForResponse(
      correlationId,
      "tabs-released",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  // Two sessions can see the same port as free at the same moment, so a successful bind is
  // the only reliable claim. Every host has to bind the same port or the pair is unusable.
  private async claimPort(
    basePort: number,
    hosts: string[]
  ): Promise<{ port: number; servers: WebSocket.Server[] } | null> {
    for (let offset = 0; offset < PORT_SCAN_RANGE; offset++) {
      const candidate = basePort + offset;
      if (await isPortInUse(candidate)) {
        continue;
      }

      const servers: WebSocket.Server[] = [];
      let failed = false;
      for (const host of hosts) {
        try {
          servers.push(await listen(host, candidate));
        } catch (error) {
          failed = true;
          break;
        }
      }

      if (failed) {
        for (const server of servers) {
          server.close();
        }
        continue;
      }

      return { port: candidate, servers };
    }
    return null;
  }

  close() {
    for (const wsServer of this.wsServers) {
      wsServer.close();
    }
    this.wsServers = [];
  }

  getSelectedPort() {
    return this.boundPort ?? undefined;
  }

  async openTab(
    url: string,
    cookieStoreId?: string
  ): Promise<OpenedTabIdExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "open-tab",
      url,
      cookieStoreId,
    });
    return await this.waitForResponse(
      correlationId,
      "opened-tab-id",
      NAVIGATION_RESPONSE_TIMEOUT_MS
    );
  }

  async navigateTab(
    tabId: number,
    url: string
  ): Promise<TabNavigatedExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "navigate-tab",
      tabId,
      url,
    });
    return await this.waitForResponse(
      correlationId,
      "tab-navigated",
      NAVIGATION_RESPONSE_TIMEOUT_MS
    );
  }

  async closeTabs(tabIds: number[]) {
    const correlationId = this.sendMessageToExtension({
      cmd: "close-tabs",
      tabIds,
    });
    await this.waitForResponse(
      correlationId,
      "tabs-closed",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async getTabList(): Promise<BrowserTab[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-list",
    });
    const message = await this.waitForResponse(correlationId, "tabs");
    return message.tabs;
  }

  async getBrowserRecentHistory(
    searchQuery?: string
  ): Promise<BrowserHistoryItem[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-browser-recent-history",
      searchQuery,
    });
    const message = await this.waitForResponse(correlationId, "history");
    return message.historyItems;
  }

  async getTabContent(
    tabId: number,
    offset: number,
    target?: ElementTarget
  ): Promise<TabContentExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-content",
      tabId,
      offset,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "tab-content",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async reorderTabs(tabOrder: number[]): Promise<number[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "reorder-tabs",
      tabOrder,
    });
    const message = await this.waitForResponse(correlationId, "tabs-reordered");
    return message.tabOrder;
  }

  async findHighlight(tabId: number, queryPhrase: string): Promise<number> {
    const correlationId = this.sendMessageToExtension({
      cmd: "find-highlight",
      tabId,
      queryPhrase,
    });
    const message = await this.waitForResponse(
      correlationId,
      "find-highlight-result"
    );
    return message.noOfResults;
  }

  async groupTabs(
    tabIds: number[],
    isCollapsed: boolean,
    groupColor: string,
    groupTitle: string
  ): Promise<number> {
    const correlationId = this.sendMessageToExtension({
      cmd: "group-tabs",
      tabIds,
      isCollapsed,
      groupColor,
      groupTitle,
    });
    const message = await this.waitForResponse(correlationId, "new-tab-group");
    return message.groupId;
  }

  async captureScreenshot(
    tabId: number,
    format: "jpeg" | "png",
    quality: number,
    scale: number,
    target?: ElementTarget
  ): Promise<ScreenshotExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "capture-screenshot",
      tabId,
      format,
      quality,
      scale,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "screenshot",
      SCREENSHOT_RESPONSE_TIMEOUT_MS
    );
  }

  async pageSnapshot(
    tabId: number,
    maxElements: number,
    interactiveOnly: boolean,
    target?: ElementTarget
  ): Promise<PageSnapshotExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "page-snapshot",
      tabId,
      maxElements,
      interactiveOnly,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "page-snapshot",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async clickElement(
    tabId: number,
    target: ElementTarget,
    button: "left" | "middle" | "right",
    clickCount: number
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "click-element",
      tabId,
      button,
      clickCount,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async typeText(
    tabId: number,
    target: ElementTarget,
    text: string,
    clearFirst: boolean,
    submit: boolean
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "type-text",
      tabId,
      text,
      clearFirst,
      submit,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async pressKey(
    tabId: number,
    key: string,
    modifiers: ("Control" | "Shift" | "Alt" | "Meta")[],
    target: ElementTarget
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "press-key",
      tabId,
      key,
      modifiers,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async scrollPage(
    tabId: number,
    direction: "up" | "down" | "top" | "bottom" | "element",
    amount: number | undefined,
    target: ElementTarget
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "scroll-page",
      tabId,
      direction,
      amount,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async selectOption(
    tabId: number,
    target: ElementTarget,
    values: string[]
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "select-option",
      tabId,
      values,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async executeJs(
    tabId: number,
    code: string
  ): Promise<ScriptResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "execute-js",
      tabId,
      code,
    });
    return await this.waitForResponse(
      correlationId,
      "script-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async waitForElement(
    tabId: number,
    selector: string,
    state: "visible" | "hidden" | "attached" | "detached",
    timeoutMs: number
  ): Promise<ElementWaitExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "wait-for-element",
      tabId,
      selector,
      state,
      timeoutMs,
    });
    return await this.waitForResponse(
      correlationId,
      "element-wait-result",
      timeoutMs + WAIT_RESPONSE_GRACE_MS
    );
  }

  private createSignature(payload: string): string {
    if (!this.sharedSecret) {
      throw new Error("Shared secret not initialized");
    }
    const hmac = crypto.createHmac("sha256", this.sharedSecret);
    hmac.update(payload);
    return hmac.digest("hex");
  }

  private sendMessageToExtension(message: ServerMessage): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }

    const correlationId = Math.random().toString(36).substring(2);
    const req: ServerMessageRequest = { ...message, correlationId };
    const payload = JSON.stringify(req);
    const signature = this.createSignature(payload);
    const signedMessage = {
      payload: req,
      signature: signature,
    };

    // Send the signed message to the extension
    this.ws.send(JSON.stringify(signedMessage));

    return correlationId;
  }

  private handleDecodedExtensionMessage(decoded: ExtensionMessage) {
    const { correlationId } = decoded;
    const pending = this.extensionRequestMap.get(correlationId);
    if (!pending) {
      console.error("No caller is waiting for", correlationId, decoded.resource);
      return;
    }
    if (pending.resource !== decoded.resource) {
      console.error("Resource mismatch:", pending.resource, decoded.resource);
      return;
    }
    this.extensionRequestMap.delete(correlationId);
    pending.resolve(decoded);
  }

  private handleExtensionError(decoded: ExtensionError) {
    const { correlationId, errorMessage } = decoded;
    const pending = this.extensionRequestMap.get(correlationId);
    if (!pending) {
      console.error("No caller is waiting for", correlationId, errorMessage);
      return;
    }
    this.extensionRequestMap.delete(correlationId);
    pending.reject(withPageEvents(errorMessage, decoded));
  }

  private async waitForResponse<T extends ExtensionMessage["resource"]>(
    correlationId: string,
    resource: T,
    timeoutMs: number = EXTENSION_RESPONSE_TIMEOUT_MS
  ): Promise<Extract<ExtensionMessage, { resource: T }>> {
    return new Promise<Extract<ExtensionMessage, { resource: T }>>(
      (resolve, reject) => {
        this.extensionRequestMap.set(correlationId, {
          resolve: resolve as (value: ExtensionMessage) => void,
          resource,
          reject,
        });
        setTimeout(() => {
          this.extensionRequestMap.delete(correlationId);
          reject("Timed out waiting for response");
        }, timeoutMs);
      }
    );
  }
}

function readConfig() {
  return {
    secret: process.env.EXTENSION_SECRET,
    port: process.env.EXTENSION_PORT
      ? parseInt(process.env.EXTENSION_PORT, 10)
      : WS_DEFAULT_PORT,
  };
}

export function isErrorMessage(message: any): message is ExtensionError {
  return (
    message.errorMessage !== undefined && message.correlationId !== undefined
  );
}
