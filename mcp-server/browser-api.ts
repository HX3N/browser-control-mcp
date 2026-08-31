import WebSocket from "ws";
import type {
  OriginGuarded,
  ExtensionMessage,
  BrowserTab,
  BrowserHistoryItem,
  ElementTarget,
  ElementWaitState,
  InteractionResultExtensionMessage,
  KeyModifier,
  NetworkRequestsExtensionMessage,
  UploadFile,
  ViewportRegion,
  WindowResizedExtensionMessage,
  PageExtensionMessage,
  PageWaitExtensionMessage,
  ScriptResultExtensionMessage,
  ServerMessage,
  FindHighlightExtensionMessage,
  ServerMessageRequest,
  ExtensionError,
  DownloadResultExtensionMessage,
  UploadChunkAckExtensionMessage,
  MediaContentExtensionMessage,
  PageMediaExtensionMessage,
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
// Room for a sliced capture: up to eight captureTab calls plus a decode for measuring.
const SCREENSHOT_RESPONSE_TIMEOUT_MS = 20000;

// A media fetch spends real network time inside the page before the answer starts back, and
// the extension gives it a minute before calling it stalled.
const MEDIA_RESPONSE_TIMEOUT_MS = 90000;
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
// Matches IMAGE_LIMIT_MB_RANGE.max in common/limits.ts; a value import would need the package at
// runtime, and the server only resolves common at compile time.
const MAX_LIMIT_MB = 256;
// The largest file the popup lets an image read carry, as base64, plus room for the frame
// around it. ws would otherwise cut the socket at its own 100MiB default.
const MAX_FRAME_BYTES = Math.ceil((MAX_LIMIT_MB * 1024 * 1024 * 4) / 3) + 1024 * 1024;

function listen(host: string, port: number): Promise<WebSocket.Server> {
  return new Promise((resolve, reject) => {
    const server = new WebSocket.Server({ host, port, maxPayload: MAX_FRAME_BYTES });
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

  async uploadChunk(
    tabId: number,
    uploadId: string,
    base64: string
  ): Promise<UploadChunkAckExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "upload-chunk",
      tabId,
      uploadId,
      base64,
    });
    return await this.waitForResponse(
      correlationId,
      "upload-chunk-ack",
      MEDIA_RESPONSE_TIMEOUT_MS
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

  async openTab(url: string): Promise<OpenedTabIdExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "open-tab",
      url,
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

  async readPage(
    tabId: number,
    options: {
      offset: number;
      maxElements: number;
      includeSelectors: boolean;
      includeHrefs: boolean;
      full: boolean;
      controlsOnly: boolean;
    },
    target?: ElementTarget
  ): Promise<PageExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "read-page",
      tabId,
      ...options,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "page",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async findHighlight(
    tabId: number,
    queryPhrase: string,
    maxMatches: number,
    caseSensitive: boolean
  ): Promise<FindHighlightExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "find-highlight",
      tabId,
      queryPhrase,
      maxMatches,
      caseSensitive,
    });
    return await this.waitForResponse(
      correlationId,
      "find-highlight-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async captureScreenshot(
    tabId: number,
    format: "jpeg" | "png",
    quality: number,
    scale: number,
    maxSlices: number,
    target?: ElementTarget,
    region?: ViewportRegion
  ): Promise<ScreenshotExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "capture-screenshot",
      tabId,
      format,
      quality,
      scale,
      maxSlices,
      region,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "screenshot",
      SCREENSHOT_RESPONSE_TIMEOUT_MS
    );
  }

  async getPageMedia(
    tabId: number,
    target?: ElementTarget
  ): Promise<PageMediaExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-media",
      tabId,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "page-media",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async fetchMediaContent(
    tabId: number,
    url: string
  ): Promise<MediaContentExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "fetch-media",
      tabId,
      url,
    });
    return await this.waitForResponse(
      correlationId,
      "media-content",
      MEDIA_RESPONSE_TIMEOUT_MS
    );
  }

  async clickElement(
    tabId: number,
    target: ElementTarget & OriginGuarded,
    button: "left" | "middle" | "right",
    clickCount: number,
    modifiers: KeyModifier[]
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "click-element",
      tabId,
      button,
      clickCount,
      modifiers,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async hoverElement(
    tabId: number,
    target: ElementTarget
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "hover-element",
      tabId,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async dragElement(
    tabId: number,
    target: ElementTarget & OriginGuarded,
    to: ElementTarget
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "drag-element",
      tabId,
      ...target,
      to,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async uploadFiles(
    tabId: number,
    target: ElementTarget & OriginGuarded,
    files: UploadFile[]
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "upload-files",
      tabId,
      files,
      ...target,
    });
    return await this.waitForResponse(
      correlationId,
      "interaction-result",
      MEDIA_RESPONSE_TIMEOUT_MS
    );
  }

  async downloadFile(
    tabId: number,
    target: ElementTarget,
    url: string | undefined,
    filename: string | undefined
  ): Promise<DownloadResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "download-file",
      tabId,
      ...target,
      ...(url ? { url } : {}),
      ...(filename ? { filename } : {}),
    });
    return await this.waitForResponse(
      correlationId,
      "download-result",
      MEDIA_RESPONSE_TIMEOUT_MS
    );
  }

  async resizeWindow(
    tabId: number,
    width: number,
    height: number
  ): Promise<WindowResizedExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "resize-window",
      tabId,
      width,
      height,
    });
    return await this.waitForResponse(correlationId, "window-resized");
  }

  async getNetworkRequests(
    tabId: number,
    urlPattern: string | undefined,
    clear: boolean,
    limit: number
  ): Promise<NetworkRequestsExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-network-requests",
      tabId,
      urlPattern,
      clear,
      limit,
    });
    return await this.waitForResponse(
      correlationId,
      "network-requests",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async typeText(
    tabId: number,
    target: ElementTarget & OriginGuarded,
    text: string,
    clearFirst: boolean,
    submit: boolean,
    clickAfter?: ElementTarget
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "type-text",
      tabId,
      text,
      clearFirst,
      submit,
      clickAfter,
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
    repeat: number,
    target: ElementTarget & OriginGuarded
  ): Promise<InteractionResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "press-key",
      tabId,
      key,
      modifiers,
      repeat,
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
    direction: "up" | "down" | "left" | "right" | "top" | "bottom" | "element",
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
    target: ElementTarget & OriginGuarded,
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
    code: string,
    expectedOrigin?: string
  ): Promise<ScriptResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "execute-js",
      tabId,
      code,
      expectedOrigin,
    });
    return await this.waitForResponse(
      correlationId,
      "script-result",
      INTERACTION_RESPONSE_TIMEOUT_MS
    );
  }

  async waitForPage(
    tabId: number,
    options: {
      selector?: string;
      state?: ElementWaitState;
      timeoutMs: number;
      settleMs?: number;
      minChars?: number;
      within?: ElementTarget;
    }
  ): Promise<PageWaitExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "wait-for-page",
      tabId,
      ...options,
    });
    return await this.waitForResponse(
      correlationId,
      "page-wait-result",
      options.timeoutMs + WAIT_RESPONSE_GRACE_MS
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
