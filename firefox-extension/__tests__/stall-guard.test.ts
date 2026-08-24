import { MessageHandler } from "../message-handler";
import { WebsocketClient } from "../client";
import type { ServerMessageRequest } from "@browser-control-mcp/common";
import { ExtensionConfig } from "../extension-config";
import {
  grantTabAuthorization,
  revokeTabAuthorization,
} from "../tab-authorization";
import { forgetPageEvents, recordPageEvent } from "../page-events";

jest.mock("../client", () => {
  return {
    WebsocketClient: jest.fn().mockImplementation(() => {
      return {
        sendResourceToServer: jest.fn().mockResolvedValue(undefined),
        sendErrorToServer: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

const TAB_ID = 123;
const SUPPORT_MARKERS = ["__bcmDialogGuard", "__bcmOverlay"];

const ANY_RESULT = [
  {
    target: "e1",
    detail: "did something",
    url: "https://example.com",
    scrollY: 0,
    scrollHeight: 1000,
    title: "Example",
    elements: [],
    totalElements: 0,
    hiddenElements: 0,
    isTruncated: false,
    links: [],
    fullText: "text",
    totalLength: 4,
    result: "ok",
    matchCount: 1,
    satisfied: true,
  },
];

const config: ExtensionConfig = {
  secret: "test-secret",
  toolSettings: {
    "get-tab-web-content": true,
    "interact-click": true,
    "interact-type": true,
    "execute-javascript": true,
  },
  permissionMode: "denylist" as const,
  domainDenyList: [],
  ports: [8089],
  auditLog: [],
};

function injectedCode(): string[] {
  return (browser.tabs.executeScript as jest.Mock).mock.calls.map(([, details]) =>
    String(details.code)
  );
}

// The guard and the overlay still answer so that the command reaches its own injection: a page
// frozen from the very first script would prove nothing about the call sites under test.
function freezeCommandScripts(): void {
  (browser.tabs.executeScript as jest.Mock).mockImplementation(
    (_tabId, details) =>
      SUPPORT_MARKERS.some((marker) => String(details.code).includes(marker))
        ? Promise.resolve(ANY_RESULT)
        : new Promise(() => undefined)
  );
}

describe("stalled pages", () => {
  let messageHandler: MessageHandler;
  let mockClient: jest.Mocked<WebsocketClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new WebsocketClient(
      8080,
      "test-secret"
    ) as jest.Mocked<WebsocketClient>;
    messageHandler = new MessageHandler(mockClient);
    (browser.storage.local.get as jest.Mock).mockResolvedValue({ config });
    (browser.tabs.get as jest.Mock).mockResolvedValue({
      id: TAB_ID,
      url: "https://example.com",
      title: "Frozen page",
      windowId: 1,
    });
    (browser.permissions.contains as jest.Mock).mockResolvedValue(true);
    (browser.tabs.reload as jest.Mock).mockResolvedValue(undefined);
    grantTabAuthorization(TAB_ID, "https://example.com");
  });

  afterEach(() => {
    revokeTabAuthorization(TAB_ID);
    forgetPageEvents(TAB_ID);
    (browser.tabs.executeScript as jest.Mock).mockReset();
    (browser.tabs.get as jest.Mock).mockReset();
    (browser.tabs.reload as jest.Mock).mockReset();
    jest.useRealTimers();
  });

  const commands: [string, ServerMessageRequest][] = [
    [
      "press-key",
      {
        cmd: "press-key",
        tabId: TAB_ID,
        correlationId: "c1",
        key: "a",
        modifiers: ["Control"],
      } as ServerMessageRequest,
    ],
    [
      "click-element",
      {
        cmd: "click-element",
        tabId: TAB_ID,
        correlationId: "c2",
        selector: "#go",
      } as ServerMessageRequest,
    ],
    [
      "type-text",
      {
        cmd: "type-text",
        tabId: TAB_ID,
        correlationId: "c3",
        selector: "#box",
        text: "hi",
      } as ServerMessageRequest,
    ],
    [
      "scroll-page",
      {
        cmd: "scroll-page",
        tabId: TAB_ID,
        correlationId: "c4",
        direction: "down",
      } as ServerMessageRequest,
    ],
    [
      "select-option",
      {
        cmd: "select-option",
        tabId: TAB_ID,
        correlationId: "c5",
        selector: "#pick",
        values: ["a"],
      } as ServerMessageRequest,
    ],
    [
      "page-snapshot",
      {
        cmd: "page-snapshot",
        tabId: TAB_ID,
        correlationId: "c6",
      } as ServerMessageRequest,
    ],
    [
      "get-tab-content",
      {
        cmd: "get-tab-content",
        tabId: TAB_ID,
        correlationId: "c7",
      } as ServerMessageRequest,
    ],
    [
      "execute-js",
      {
        cmd: "execute-js",
        tabId: TAB_ID,
        correlationId: "c8",
        code: "return 1;",
      } as ServerMessageRequest,
    ],
    [
      "wait-for-element",
      {
        cmd: "wait-for-element",
        tabId: TAB_ID,
        correlationId: "c9",
        selector: "#done",
        state: "visible",
        timeoutMs: 1000,
      } as ServerMessageRequest,
    ],
  ];

  for (const [name, request] of commands) {
    it(`${name} gives up on a frozen page instead of hanging`, async () => {
      jest.useFakeTimers();
      freezeCommandScripts();

      const pending = messageHandler.handleDecodedMessage(request);
      const settled = expect(pending).rejects.toThrow(
        /Ask the user to close the dialog/
      );

      await jest.advanceTimersByTimeAsync(11_000);
      await settled;

      expect(browser.tabs.reload).not.toHaveBeenCalled();
      expect(mockClient.sendResourceToServer).not.toHaveBeenCalled();
    });
  }

  it("names the tab so the user knows which one to answer", async () => {
    jest.useFakeTimers();
    freezeCommandScripts();

    const pending = messageHandler.handleDecodedMessage({
      cmd: "page-snapshot",
      tabId: TAB_ID,
      correlationId: "c10",
    } as ServerMessageRequest);
    const settled = expect(pending).rejects.toThrow(/Tab 123 \("Frozen page"\)/);

    await jest.advanceTimersByTimeAsync(11_000);
    await settled;
  });

  it("carries the dialogs and console messages out on the failure", async () => {
    jest.useFakeTimers();
    recordPageEvent(TAB_ID, "dialog", "confirm: leave this page?");
    recordPageEvent(TAB_ID, "console", "TypeError: undefined is not a function");
    freezeCommandScripts();

    const pending = messageHandler.handleDecodedMessage({
      cmd: "press-key",
      tabId: TAB_ID,
      correlationId: "c12",
      key: "m",
      modifiers: ["Control", "Shift"],
    } as ServerMessageRequest);
    const settled = expect(pending).rejects.toMatchObject({
      dialogs: ["confirm: leave this page?"],
      consoleMessages: ["TypeError: undefined is not a function"],
    });

    await jest.advanceTimersByTimeAsync(11_000);
    await settled;
  });

  it("leaves the error bare when the page said nothing", async () => {
    jest.useFakeTimers();
    freezeCommandScripts();

    const pending = messageHandler.handleDecodedMessage({
      cmd: "press-key",
      tabId: TAB_ID,
      correlationId: "c13",
      key: "m",
      modifiers: ["Control"],
    } as ServerMessageRequest);
    const settled = pending.catch((error) => error);

    await jest.advanceTimersByTimeAsync(11_000);
    const error = await settled;

    expect(error.dialogs).toBeUndefined();
    expect(error.consoleMessages).toBeUndefined();
  });

  it("still answers when the page is healthy", async () => {
    (browser.tabs.executeScript as jest.Mock).mockResolvedValue(ANY_RESULT);

    await messageHandler.handleDecodedMessage({
      cmd: "press-key",
      tabId: TAB_ID,
      correlationId: "c11",
      key: "a",
      modifiers: ["Control"],
    } as ServerMessageRequest);

    expect(mockClient.sendResourceToServer).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "interaction-result" })
    );
  });
});

describe("press-key overlay label", () => {
  let messageHandler: MessageHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    messageHandler = new MessageHandler(
      new WebsocketClient(8080, "test-secret") as jest.Mocked<WebsocketClient>
    );
    (browser.storage.local.get as jest.Mock).mockResolvedValue({ config });
    (browser.tabs.get as jest.Mock).mockResolvedValue({
      id: TAB_ID,
      url: "https://example.com",
      title: "Example",
      windowId: 1,
    });
    (browser.permissions.contains as jest.Mock).mockResolvedValue(true);
    (browser.tabs.executeScript as jest.Mock).mockResolvedValue(ANY_RESULT);
    (browser.i18n.getMessage as jest.Mock).mockImplementation(
      (key: string, substitutions?: string | string[]) =>
        substitutions === undefined
          ? key
          : `${key}:${[substitutions].flat().join(",")}`
    );
    grantTabAuthorization(TAB_ID, "https://example.com");
  });

  afterEach(() => {
    revokeTabAuthorization(TAB_ID);
    (browser.tabs.executeScript as jest.Mock).mockReset();
    (browser.tabs.get as jest.Mock).mockReset();
    (browser.i18n.getMessage as jest.Mock).mockImplementation(
      (key: string) => key
    );
  });

  const press = async (
    key: string,
    modifiers?: ("Control" | "Shift" | "Alt" | "Meta")[]
  ): Promise<string> => {
    await messageHandler.handleDecodedMessage({
      cmd: "press-key",
      tabId: TAB_ID,
      correlationId: "label",
      key,
      modifiers,
    } as ServerMessageRequest);
    const overlay = injectedCode().find((code) =>
      code.includes("overlayPressKey")
    );
    return overlay ?? "";
  };

  it("shows the modifiers alongside the key", async () => {
    expect(await press("a", ["Control"])).toContain("overlayPressKey:Control+A");
  });

  it("shows every modifier of a longer combination", async () => {
    expect(await press("m", ["Control", "Shift"])).toContain(
      "overlayPressKey:Control+Shift+M"
    );
  });

  it("shows a bare key on its own", async () => {
    expect(await press("Enter", [])).toContain("overlayPressKey:Enter");
  });

  it("shows a bare key when no modifiers were sent at all", async () => {
    expect(await press("Enter")).toContain("overlayPressKey:Enter");
  });
});
