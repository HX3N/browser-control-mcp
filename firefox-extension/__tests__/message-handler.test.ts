import { MessageHandler } from "../message-handler";
import { WebsocketClient } from "../client";
import type { ServerMessageRequest } from "@browser-control-mcp/common";
import { ExtensionConfig } from "../extension-config";
import { grantCaptureConsent, revokeCaptureConsent } from "../capture-consent";
import { forgetPageEvents, recordPageEvent } from "../page-events";

// Mock the WebsocketClient
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

describe("MessageHandler", () => {
  let messageHandler: MessageHandler;
  let mockClient: jest.Mocked<WebsocketClient>;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create a new instance of WebsocketClient and MessageHandler
    mockClient = new WebsocketClient(
      8080,
      "test-secret"
    ) as jest.Mocked<WebsocketClient>;
    messageHandler = new MessageHandler(mockClient);

    // Mock browser.storage.local.get to return default config
    const defaultConfig: ExtensionConfig = {
      secret: "test-secret",
      toolSettings: {
        "open-browser-tab": true,
        "close-browser-tabs": true,
        "get-list-of-open-tabs": true,
        "get-recent-browser-history": true,
        "get-tab-web-content": true,
        "reorder-browser-tabs": true,
        "find-highlight-in-browser-tab": true,
      },
      permissionMode: "denylist" as const,
      domainDenyList: [],
      ports: [8089],
      auditLog: [],
    };

    (browser.storage.local.get as jest.Mock).mockResolvedValue({
      config: defaultConfig,
    });
  });

  describe("handleDecodedMessage", () => {
    it("should throw an error if command is not allowed", async () => {
      // Arrange
      const configWithDisabledOpenTab: ExtensionConfig = {
        secret: "test-secret",
        toolSettings: {
          "open-browser-tab": false, // Disable open-tab command
          "close-browser-tabs": true,
          "get-list-of-open-tabs": true,
          "get-recent-browser-history": true,
          "get-tab-web-content": true,
          "reorder-browser-tabs": true,
          "find-highlight-in-browser-tab": true,
        },
        permissionMode: "denylist" as const,
        domainDenyList: [],
        ports: [8089],
        auditLog: [],
      };
      (browser.storage.local.get as jest.Mock).mockResolvedValue({
        config: configWithDisabledOpenTab,
      });

      const request: ServerMessageRequest = {
        cmd: "open-tab",
        url: "https://example.com",
        correlationId: "test-correlation-id",
      };

      // Act & Assert
      await expect(
        messageHandler.handleDecodedMessage(request)
      ).rejects.toThrow("Command 'open-tab' is disabled in extension settings");
    });

    describe("open-tab command", () => {
      const driveOpen = async (
        request: ServerMessageRequest,
        tabId = 123
      ): Promise<void> => {
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([true]);
        const pending = messageHandler.handleDecodedMessage(request);
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        for (const [listener] of (
          browser.tabs.onUpdated.addListener as jest.Mock
        ).mock.calls) {
          listener(tabId, { status: "loading" });
          listener(tabId, { status: "complete" });
        }
        await pending;
      };

      afterEach(() => {
        (browser.tabs.executeScript as jest.Mock).mockReset();
        (browser.tabs.onUpdated.addListener as jest.Mock).mockClear();
      });

      it("should open a new tab and send the tab ID to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "https://example.com",
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123 };
        (browser.tabs.create as jest.Mock).mockResolvedValue(mockTab);

        // Act
        await driveOpen(request);

        // Assert
        expect(browser.tabs.create).toHaveBeenCalledWith({
          url: "about:blank",
          active: false,
        });
        expect(browser.tabs.update).toHaveBeenCalledWith(123, {
          url: "https://example.com",
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "opened-tab-id",
          correlationId: "test-correlation-id",
          tabId: 123,
        });
      });

      it("marks the tab it opened with the overlay", async () => {
        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "https://example.com",
          correlationId: "test-correlation-id",
        };
        (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 123 });

        await driveOpen(request);

        const overlayCalls = (
          browser.tabs.executeScript as jest.Mock
        ).mock.calls.filter(([, details]) =>
          String(details.code).includes("__bcmOverlay")
        );
        expect(overlayCalls.length).toBeGreaterThan(0);
      });

      it("should open the tab in the foreground when background mode is off", async () => {
        // Arrange
        const foregroundConfig: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
          },
          permissionMode: "denylist" as const,
          domainDenyList: [],
          ports: [8089],
          auditLog: [],
          backgroundMode: false,
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: foregroundConfig,
        });

        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "https://example.com",
          correlationId: "test-correlation-id",
        };
        (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 123 });

        // Act
        await driveOpen(request);

        // Assert
        expect(browser.tabs.create).toHaveBeenCalledWith({
          url: "about:blank",
          active: true,
        });
      });

      describe("container inheritance", () => {
        afterEach(() => {
          (browser.tabs.query as jest.Mock).mockReset();
        });

        it("inherits the container of the tab on screen, not a hidden one", async () => {
          (browser.tabs.query as jest.Mock).mockResolvedValue([
            { id: 11, hidden: true, cookieStoreId: "firefox-container-9" },
            { id: 12, hidden: false, cookieStoreId: "firefox-container-1" },
          ]);
          (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 13 });

          await driveOpen(
            {
              cmd: "open-tab",
              url: "https://example.com",
              correlationId: "test-correlation-id",
            } as ServerMessageRequest,
            13
          );

          expect(browser.tabs.query).toHaveBeenCalledWith({
            active: true,
            lastFocusedWindow: true,
          });
          expect(browser.tabs.create).toHaveBeenCalledWith({
            url: "about:blank",
            cookieStoreId: "firefox-container-1",
            active: false,
          });
        });

        it("falls back to any active tab when the focused window reports none", async () => {
          (browser.tabs.query as jest.Mock)
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
              { id: 21, hidden: false, cookieStoreId: "firefox-container-2" },
            ]);
          (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 22 });

          await driveOpen(
            {
              cmd: "open-tab",
              url: "https://example.com",
              correlationId: "test-correlation-id",
            } as ServerMessageRequest,
            22
          );

          expect(browser.tabs.query).toHaveBeenLastCalledWith({ active: true });
          expect(browser.tabs.create).toHaveBeenCalledWith({
            url: "about:blank",
            cookieStoreId: "firefox-container-2",
            active: false,
          });
        });
      });

      it("should throw an error if the URL is out of the configured scope", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "http://example.com",
          correlationId: "test-correlation-id",
        };

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("HTTPS pages and http:// on localhost only");
        expect(browser.tabs.create).not.toHaveBeenCalled();
      });

      it("should throw an error if domain is in deny list", async () => {
        // Arrange
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
          },
          permissionMode: "denylist" as const,
          domainDenyList: ["example.com", "another.com"],
          ports: [8089],
          auditLog: [],
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "https://example.com",
          correlationId: "test-correlation-id",
        };

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Domain in user defined deny list");
        expect(browser.tabs.create).not.toHaveBeenCalled();
      });

      it("should open a new tab in the domain is not in the deny list", async () => {
        // Arrange
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
          },
          permissionMode: "denylist" as const,
          domainDenyList: ["example.com", "another.com"],
          ports: [8089],
          auditLog: [],
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const request: ServerMessageRequest = {
          cmd: "open-tab",
          url: "https://allowed.com",
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123 };
        (browser.tabs.create as jest.Mock).mockResolvedValue(mockTab);

        // Act
        await driveOpen(request);

        // Assert
        expect(browser.tabs.create).toHaveBeenCalledWith({
          url: "about:blank",
          active: false,
        });
        expect(browser.tabs.update).toHaveBeenCalledWith(123, {
          url: "https://allowed.com",
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "opened-tab-id",
          correlationId: "test-correlation-id",
          tabId: 123,
        });
      });
    });

    describe("close-tabs command", () => {
      it("should close tabs and send confirmation to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "close-tabs",
          tabIds: [123, 456],
          correlationId: "test-correlation-id",
        };

        (browser.tabs.remove as jest.Mock).mockResolvedValue(undefined);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.remove).toHaveBeenCalledWith([123, 456]);
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "tabs-closed",
          correlationId: "test-correlation-id",
        });
      });
    });

    describe("get-tab-list command", () => {
      it("should get tabs and send them to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-tab-list",
          correlationId: "test-correlation-id",
        };

        const mockTabs = [{ id: 123, url: "https://example.com" }];
        (browser.tabs.query as jest.Mock).mockResolvedValue(mockTabs);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.query).toHaveBeenCalledWith({});
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "tabs",
          correlationId: "test-correlation-id",
          tabs: mockTabs,
        });
      });
    });

    describe("get-browser-recent-history command", () => {
      it("should get history items and send them to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-browser-recent-history",
          searchQuery: "test",
          correlationId: "test-correlation-id",
        };

        const mockHistoryItems = [
          { url: "https://example.com", title: "Example" },
          { url: "https://test.com", title: "Test" },
        ];
        (browser.history.search as jest.Mock).mockResolvedValue(
          mockHistoryItems
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.history.search).toHaveBeenCalledWith({
          text: "test",
          maxResults: 200,
          startTime: 0,
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "history",
          correlationId: "test-correlation-id",
          historyItems: mockHistoryItems,
        });
      });

      it("should use empty string for search query if not provided", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-browser-recent-history",
          correlationId: "test-correlation-id",
        };

        const mockHistoryItems = [
          { url: "https://example.com", title: "Example" },
        ];
        (browser.history.search as jest.Mock).mockResolvedValue(
          mockHistoryItems
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.history.search).toHaveBeenCalledWith({
          text: "",
          maxResults: 200,
          startTime: 0,
        });
      });

      it("should filter out history items without URLs", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-browser-recent-history",
          correlationId: "test-correlation-id",
        };

        const mockHistoryItems = [
          { url: "https://example.com", title: "Example" },
          { title: "No URL" }, // This should be filtered out
        ];
        (browser.history.search as jest.Mock).mockResolvedValue(
          mockHistoryItems
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "history",
          correlationId: "test-correlation-id",
          historyItems: [{ url: "https://example.com", title: "Example" }],
        });
      });
    });

    describe("dialog guard", () => {
      const registration = () => ({
        unregister: jest.fn().mockResolvedValue(undefined),
      });

      const contentResult = [
        {
          links: [],
          fullText: "Page content",
          isTruncated: false,
          totalLength: 12,
        },
      ];

      const settleTab = (tabId: number): void => {
        for (const [listener] of (
          browser.tabs.onUpdated.addListener as jest.Mock
        ).mock.calls) {
          listener(tabId, { status: "loading" });
          listener(tabId, { status: "complete" });
        }
      };

      const flush = (): Promise<void> =>
        new Promise((resolve) => setTimeout(resolve, 0));

      const startOpen = (): Promise<void> =>
        messageHandler.handleDecodedMessage({
          cmd: "open-tab",
          url: "https://example.com/board?id=1",
          correlationId: "test-correlation-id",
        } as ServerMessageRequest);

      const openExample = async (): Promise<void> => {
        const pending = startOpen();
        await flush();
        await flush();
        settleTab(77);
        await pending;
      };

      const guardInjections = () =>
        (browser.tabs.executeScript as jest.Mock).mock.calls.filter(([, details]) =>
          String(details.code).includes("__bcmDialogGuard = true")
        );

      const committedListener = (): ((details: {
        tabId: number;
        frameId: number;
        url?: string;
      }) => void) => {
        const calls = (
          browser.webNavigation.onCommitted.addListener as jest.Mock
        ).mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        return calls[calls.length - 1][0];
      };

      const readFrozenTab = (): Promise<void> => {
        grantCaptureConsent(123, "https://example.com");
        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          title: "Frozen page",
        });
        (browser.permissions.contains as jest.Mock).mockResolvedValue(true);
        (browser.contentScripts.register as jest.Mock).mockResolvedValue(
          registration()
        );
        (browser.tabs.reload as jest.Mock).mockResolvedValue(undefined);
        return messageHandler.handleDecodedMessage({
          cmd: "get-tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
        } as ServerMessageRequest);
      };

      afterEach(() => {
        (browser.tabs.executeScript as jest.Mock).mockReset();
        (browser.tabs.create as jest.Mock).mockReset();
        (browser.tabs.get as jest.Mock).mockReset();
        (browser.tabs.reload as jest.Mock).mockReset();
        (browser.contentScripts.register as jest.Mock).mockReset();
        (browser.tabs.onUpdated.addListener as jest.Mock).mockClear();
        forgetPageEvents(77);
      });

      it("registers the guard while the tab still sits on about:blank", async () => {
        (browser.contentScripts.register as jest.Mock).mockResolvedValue(
          registration()
        );
        (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 77 });
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([true]);

        await openExample();

        const options = (browser.contentScripts.register as jest.Mock).mock
          .calls[0][0];
        expect(options.matches).toEqual(["https://example.com/*"]);
        expect(options.runAt).toBe("document_start");
        expect(options.allFrames).toBe(true);
        expect(String(options.js[0].code)).toContain("__bcmDialogGuard");
        expect(browser.tabs.create).toHaveBeenCalledWith(
          expect.objectContaining({ url: "about:blank" })
        );
        expect(
          (browser.contentScripts.register as jest.Mock).mock
            .invocationCallOrder[0]
        ).toBeLessThan(
          (browser.tabs.update as jest.Mock).mock.invocationCallOrder[0]
        );
      });

      const openWithCommit = async (announced: boolean): Promise<void> => {
        (browser.contentScripts.register as jest.Mock).mockResolvedValue(
          registration()
        );
        (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 77 });
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([true]);

        const pending = startOpen();
        await flush();
        await flush();
        committedListener()({
          tabId: 77,
          frameId: 0,
          url: "https://example.com/board?id=1",
        });
        if (announced) {
          recordPageEvent(77, "guard", "https://example.com/board?id=1");
        }
        settleTab(77);
        await pending;
      };

      it("names a document no guard reported itself on", async () => {
        await openWithCommit(false);

        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith(
          expect.objectContaining({
            resource: "opened-tab-id",
            consoleMessages: [
              expect.stringContaining("https://example.com/board?id=1"),
            ],
          })
        );
      });

      it("stays quiet when the guard announced the document it loaded in", async () => {
        await openWithCommit(true);

        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "opened-tab-id",
          correlationId: "test-correlation-id",
          tabId: 77,
        });
      });

      it("keeps the registration only until the tab has loaded", async () => {
        const handle = registration();
        (browser.contentScripts.register as jest.Mock).mockResolvedValue(
          handle
        );
        (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 77 });

        const pending = startOpen();
        await flush();
        await flush();
        expect(handle.unregister).not.toHaveBeenCalled();

        settleTab(77);
        await pending;

        expect(handle.unregister).toHaveBeenCalledTimes(1);
      });

      it("carries a dialog raised while the tab was loading", async () => {
        (browser.contentScripts.register as jest.Mock).mockResolvedValue(
          registration()
        );
        (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 77 });
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([true]);

        const pending = startOpen();
        await flush();
        recordPageEvent(77, "dialog", "alert: closed for maintenance");
        recordPageEvent(77, "console", "console.error: boom");
        settleTab(77);
        await pending;

        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith(
          expect.objectContaining({
            resource: "opened-tab-id",
            dialogs: ["alert: closed for maintenance"],
            consoleMessages: ["console.error: boom"],
          })
        );
      });

      it("falls back to injecting the guard when registration fails", async () => {
        (browser.contentScripts.register as jest.Mock).mockRejectedValue(
          new Error("no host permission")
        );
        (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 77 });
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([true]);

        await openExample();

        const injected = guardInjections();
        expect(injected).toHaveLength(1);
        expect(injected[0][0]).toBe(77);
        expect(injected[0][1].runAt).toBe("document_start");
      });

      it("leaves tabs the session never touched alone", async () => {
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([true]);

        committedListener()({ tabId: 999, frameId: 0 });
        await Promise.resolve();

        expect(guardInjections()).toHaveLength(0);
      });

      it("ignores sub-frames", async () => {
        (browser.contentScripts.register as jest.Mock).mockResolvedValue(
          registration()
        );
        (browser.tabs.create as jest.Mock).mockResolvedValue({ id: 77 });
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([true]);

        await openExample();
        (browser.tabs.executeScript as jest.Mock).mockClear();

        committedListener()({ tabId: 77, frameId: 3 });
        await Promise.resolve();

        expect(guardInjections()).toHaveLength(0);
      });

      it("reloads a frozen tab and carries the command through", async () => {
        jest.useFakeTimers();
        try {
          let guardAttempts = 0;
          (browser.tabs.executeScript as jest.Mock).mockImplementation(
            (_tabId, details) => {
              if (String(details.code).includes("__bcmDialogGuard")) {
                guardAttempts += 1;
                if (guardAttempts === 1) {
                  return new Promise(() => undefined);
                }
              }
              return Promise.resolve(contentResult);
            }
          );

          const pending = readFrozenTab();
          await jest.advanceTimersByTimeAsync(3000);
          await jest.advanceTimersByTimeAsync(15000);
          await pending;

          expect(browser.tabs.reload).toHaveBeenCalledTimes(1);
          expect(browser.tabs.reload).toHaveBeenCalledWith(123);
          expect(mockClient.sendResourceToServer).toHaveBeenCalledWith(
            expect.objectContaining({ resource: "tab-content" })
          );
        } finally {
          jest.useRealTimers();
        }
      });

      it("gives up after a single reload and names the dialog", async () => {
        jest.useFakeTimers();
        try {
          (browser.tabs.executeScript as jest.Mock).mockImplementation(
            (_tabId, details) =>
              String(details.code).includes("__bcmDialogGuard")
                ? new Promise(() => undefined)
                : Promise.resolve(contentResult)
          );

          const pending = readFrozenTab();
          const settled = expect(pending).rejects.toThrow(
            /reloaded once.*Ask the user to close the dialog/s
          );

          await jest.advanceTimersByTimeAsync(3000);
          await jest.advanceTimersByTimeAsync(15000);
          await jest.advanceTimersByTimeAsync(3000);
          await settled;

          expect(browser.tabs.reload).toHaveBeenCalledTimes(1);
        } finally {
          jest.useRealTimers();
        }
      });
    });

    describe("get-tab-content command", () => {
      it("should get tab content and send it to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123, url: "https://example.com" };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);
        (browser.permissions.contains as jest.Mock).mockResolvedValue(true);

        const mockScriptResult = [
          {
            links: [{ url: "https://example.com/page", text: "Page" }],
            fullText: "Page content",
            isTruncated: false,
            totalLength: 12,
          },
        ];
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue(
          mockScriptResult
        );

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.get).toHaveBeenCalledWith(123);
        expect(browser.permissions.contains).toHaveBeenCalledWith({
          origins: ["https://example.com/*"],
        });
        expect(browser.tabs.executeScript).toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
          isTruncated: false,
          fullText: "Page content",
          links: [{ url: "https://example.com/page", text: "Page" }],
          totalLength: 12,
        });
      });

      const injectedCode = (needle: string): string => {
        const calls = (browser.tabs.executeScript as jest.Mock).mock.calls;
        const call = calls.find(([, details]) =>
          String(details.code).includes(needle)
        );
        expect(call).toBeDefined();
        return String(call![1].code);
      };

      const readTabContent = async (
        extra: Record<string, unknown> = {}
      ): Promise<void> => {
        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
        });
        (browser.permissions.contains as jest.Mock).mockResolvedValue(true);
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([
          {
            links: [],
            fullText: "",
            isTruncated: false,
            totalLength: 0,
          },
        ]);

        await messageHandler.handleDecodedMessage({
          cmd: "get-tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
          ...extra,
        } as ServerMessageRequest);
      };

      it("reads the whole body when no element is targeted", async () => {
        await readTabContent();

        const code = injectedCode("getTextContent");
        expect(() => new Function(code)).not.toThrow();
        expect(code).toContain("document.body");
        expect(code).not.toContain("__bcmResolve({");
      });

      it("reads only the targeted element when a selector is given", async () => {
        await readTabContent({ selector: "#list", index: 0 });

        const code = injectedCode("getTextContent");
        expect(() => new Function(code)).not.toThrow();
        expect(code).toContain('__bcmResolve({"selector":"#list","index":0})');
        expect(code).not.toContain("document.body");
      });

      it("highlights the targeted element while reading it", async () => {
        await readTabContent({ selector: "#list", index: 0 });

        const overlay = injectedCode("__bcmOverlay.attach");
        expect(() => new Function(overlay)).not.toThrow();
        expect(overlay).toContain('{"selector":"#list","index":0}');
        expect(overlay).toContain("overlayReadingElement");
      });

      it("does not highlight any element on a whole-page read", async () => {
        await readTabContent();

        const overlay = injectedCode("__bcmOverlay.attach");
        expect(overlay).toContain("var target = true ? null : null");
        expect(overlay).toContain("overlayReadingContent");
      });

      it("leaves a read marked until the next command replaces it", async () => {
        await readTabContent();

        const overlay = injectedCode("__bcmOverlay.attach");
        expect(overlay).toContain("resetAfterMs: 0");
      });

      it("carries the configured palette into the overlay", async () => {
        await readTabContent();

        const overlay = injectedCode("__bcmOverlay.attach");
        expect(overlay).toContain('"read":"#00dfd8"');
        expect(overlay).toContain(
          'aurora: ["#ff007f","#7928ca","#00dfd8","#ffac1c"]'
        );
      });

      it("should throw an error if tab URL domain is in deny list", async () => {
        // Arrange
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
          },
          permissionMode: "denylist" as const,
          domainDenyList: ["example.com"], // Add example.com to deny list
          ports: [8089],
          auditLog: [],
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const request: ServerMessageRequest = {
          cmd: "get-tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123, url: "https://example.com" };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Domain in tab URL is in the deny list");
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
      });

      it("should throw an error if permissions are denied", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "get-tab-content",
          tabId: 123,
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123, url: "https://example.com" };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);
        (browser.permissions.contains as jest.Mock).mockResolvedValue(false);

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow();
        expect(browser.tabs.executeScript).not.toHaveBeenCalled();
      });
    });

    describe("reorder-tabs command", () => {
      it("should reorder tabs and send confirmation to the server", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "reorder-tabs",
          tabOrder: [123, 456, 789],
          correlationId: "test-correlation-id",
        };

        (browser.tabs.move as jest.Mock).mockResolvedValue(undefined);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.move).toHaveBeenCalledTimes(3);
        expect(browser.tabs.move).toHaveBeenNthCalledWith(1, 123, { index: 0 });
        expect(browser.tabs.move).toHaveBeenNthCalledWith(2, 456, { index: 1 });
        expect(browser.tabs.move).toHaveBeenNthCalledWith(3, 789, { index: 2 });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "tabs-reordered",
          correlationId: "test-correlation-id",
          tabOrder: [123, 456, 789],
        });
      });
    });

    describe("find-highlight command", () => {
      it("should find and highlight text in a tab", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "find-highlight",
          tabId: 123,
          queryPhrase: "test",
          correlationId: "test-correlation-id",
        };

        const mockFindResults = { count: 5 };
        (browser.find.find as jest.Mock).mockResolvedValue(mockFindResults);
        (browser.tabs.update as jest.Mock).mockResolvedValue(undefined);
        (browser.permissions.contains as jest.Mock).mockResolvedValue(true);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.find.find).toHaveBeenCalledWith("test", {
          tabId: 123,
          caseSensitive: true,
        });
        expect(browser.tabs.update).not.toHaveBeenCalled();
        expect(browser.find.highlightResults).toHaveBeenCalledWith({
          tabId: 123,
        });
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "find-highlight-result",
          correlationId: "test-correlation-id",
          noOfResults: 5,
        });
      });

      it("should activate the tab when background mode is off", async () => {
        // Arrange
        const foregroundConfig: ExtensionConfig = {
          secret: "test-secret",
          toolSettings: {
            "open-browser-tab": true,
            "close-browser-tabs": true,
            "get-list-of-open-tabs": true,
            "get-recent-browser-history": true,
            "get-tab-web-content": true,
            "reorder-browser-tabs": true,
            "find-highlight-in-browser-tab": true,
          },
          permissionMode: "denylist" as const,
          domainDenyList: [],
          ports: [8089],
          auditLog: [],
          backgroundMode: false,
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: foregroundConfig,
        });

        const request: ServerMessageRequest = {
          cmd: "find-highlight",
          tabId: 123,
          queryPhrase: "test",
          correlationId: "test-correlation-id",
        };
        (browser.find.find as jest.Mock).mockResolvedValue({ count: 5 });
        (browser.tabs.update as jest.Mock).mockResolvedValue(undefined);
        (browser.permissions.contains as jest.Mock).mockResolvedValue(true);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.update).toHaveBeenCalledWith(123, { active: true });
      });

      it("should not highlight or activate tab if no results found", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "find-highlight",
          tabId: 123,
          queryPhrase: "test",
          correlationId: "test-correlation-id",
        };

        const mockFindResults = { count: 0 };
        const mockTab = { id: 123, url: "https://example.com" };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);
        (browser.find.find as jest.Mock).mockResolvedValue(mockFindResults);
        (browser.permissions.contains as jest.Mock).mockResolvedValue(true);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.update).not.toHaveBeenCalled();
        expect(browser.find.highlightResults).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "find-highlight-result",
          correlationId: "test-correlation-id",
          noOfResults: 0,
        });
      });

      it("should throw an error if permissions are denied", async () => {
        // Arrange
        const request: ServerMessageRequest = {
          cmd: "find-highlight",
          tabId: 123,
          queryPhrase: "test",
          correlationId: "test-correlation-id",
        };

        const mockTab = { id: 123, url: "https://example.com" };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);
        (browser.permissions.contains as jest.Mock).mockResolvedValue(false);

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow();
        expect(browser.find.find).not.toHaveBeenCalled();
      });
    });

    describe("capture-screenshot command", () => {
      const request: ServerMessageRequest = {
        cmd: "capture-screenshot",
        tabId: 123,
        correlationId: "test-correlation-id",
      };

      beforeEach(() => {
        revokeCaptureConsent(123);
        (browser.tabs.captureTab as jest.Mock).mockResolvedValue(
          "data:image/jpeg;base64,QUJD"
        );
        (browser.tabs.captureVisibleTab as jest.Mock).mockResolvedValue(
          "data:image/jpeg;base64,QUJD"
        );
      });

      it("should refuse to capture a tab the user has not authorized", async () => {
        // Arrange
        const mockTab = {
          id: 123,
          url: "https://example.com",
          title: "Example",
          windowId: 1,
          active: true,
        };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow(/has not authorized screenshots of tab 123/);
        expect(browser.tabs.captureTab).not.toHaveBeenCalled();
        // The toolbar button is badged so the user can see which tab is waiting
        expect(browser.browserAction.setBadgeText).toHaveBeenCalledWith({
          text: "!",
          tabId: 123,
        });
      });

      it("should treat consent as revoked once the tab has navigated", async () => {
        // Arrange
        grantCaptureConsent(123, "https://example.com/first");
        const mockTab = {
          id: 123,
          url: "https://example.com/second",
          title: "Example",
          windowId: 1,
          active: true,
        };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow(/has not authorized screenshots of tab 123/);
        expect(browser.tabs.captureTab).not.toHaveBeenCalled();
      });

      it("should capture an authorized active tab and send the image to the server", async () => {
        // Arrange
        grantCaptureConsent(123, "https://example.com");
        const mockTab = {
          id: 123,
          url: "https://example.com",
          title: "Example",
          windowId: 1,
          active: true,
        };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.captureTab).toHaveBeenCalledWith(123, {
          format: "jpeg",
          quality: 70,
          scale: 1,
        });
        // An already-active tab must not be re-activated
        expect(browser.tabs.update).not.toHaveBeenCalled();
        expect(mockClient.sendResourceToServer).toHaveBeenCalledWith({
          resource: "screenshot",
          correlationId: "test-correlation-id",
          tabId: 123,
          imageData: "QUJD",
          mimeType: "image/jpeg",
        });
      });

      describe("element-scoped capture", () => {
        const box = {
          rect: { x: 8, y: 40, width: 300, height: 200 },
          label: 'div "post list"',
          elementWidth: 284,
          elementHeight: 184,
          clipped: false,
          scrollY: 0,
          scrollHeight: 2000,
        };

        const captureElement = async (
          override: Partial<typeof box> = {}
        ): Promise<void> => {
          grantCaptureConsent(123, "https://example.com");
          (browser.tabs.get as jest.Mock).mockResolvedValue({
            id: 123,
            url: "https://example.com",
            title: "Example",
            windowId: 1,
            active: true,
          });
          (browser.tabs.executeScript as jest.Mock).mockImplementation(
            (_tabId: number, details: { code: string }) =>
              String(details.code).includes("__bcmResolve")
                ? Promise.resolve([{ ...box, ...override }])
                : Promise.resolve([true])
          );

          await messageHandler.handleDecodedMessage({
            cmd: "capture-screenshot",
            tabId: 123,
            correlationId: "test-correlation-id",
            selector: "#list",
            index: 0,
          } as ServerMessageRequest);
        };

        it("crops the capture to the targeted element", async () => {
          await captureElement();

          expect(browser.tabs.captureTab).toHaveBeenCalledWith(123, {
            format: "jpeg",
            quality: 70,
            scale: 1,
            rect: { x: 8, y: 40, width: 300, height: 200 },
          });
        });

        it("reports what was captured so a clipped element can be followed up", async () => {
          await captureElement({ clipped: true, elementHeight: 1800 });

          expect(mockClient.sendResourceToServer).toHaveBeenCalledWith(
            expect.objectContaining({
              resource: "screenshot",
              captured: expect.objectContaining({
                label: 'div "post list"',
                width: 300,
                height: 200,
                elementHeight: 1800,
                clipped: true,
                scrollHeight: 2000,
              }),
            })
          );
        });

        it("measures the element before the shutter, not after", async () => {
          await captureElement();

          const measured = (
            browser.tabs.executeScript as jest.Mock
          ).mock.invocationCallOrder[
            (browser.tabs.executeScript as jest.Mock).mock.calls.findIndex(
              ([, details]) => String(details.code).includes("__bcmResolve")
            )
          ];
          const shot = (browser.tabs.captureTab as jest.Mock).mock
            .invocationCallOrder[0];
          expect(measured).toBeLessThan(shot);
        });
      });

      it("should capture a background tab without bringing it to the front", async () => {
        // Arrange
        grantCaptureConsent(123, "https://example.com");
        const mockTab = {
          id: 123,
          url: "https://example.com",
          title: "Example",
          windowId: 1,
          active: false,
        };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);
        (browser.tabs.query as jest.Mock).mockResolvedValue([{ id: 456 }]);

        // Act
        await messageHandler.handleDecodedMessage(request);

        // Assert
        expect(browser.tabs.captureTab).toHaveBeenCalledWith(123, {
          format: "jpeg",
          quality: 70,
          scale: 1,
        });
        expect(browser.tabs.update).not.toHaveBeenCalled();
      });

      it("hides the overlay for the shot instead of tearing it down", async () => {
        grantCaptureConsent(123, "https://example.com");
        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          title: "Example",
          windowId: 1,
          active: true,
        });
        (browser.tabs.executeScript as jest.Mock).mockResolvedValue([true]);

        await messageHandler.handleDecodedMessage(request);

        const injected = (
          browser.tabs.executeScript as jest.Mock
        ).mock.calls.map(([, details]) => String(details.code));
        expect(injected.some((code) => code.includes("conceal()"))).toBe(true);
        expect(injected.some((code) => code.includes("reveal()"))).toBe(true);
        expect(injected.some((code) => code.includes("detach()"))).toBe(false);
      });

      it("falls back to the visible tab when captureTab is refused", async () => {
        grantCaptureConsent(123, "https://example.com");
        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          title: "Example",
          windowId: 1,
          active: false,
        });
        (browser.tabs.captureTab as jest.Mock).mockRejectedValue(
          new Error("not supported")
        );
        (browser.tabs.query as jest.Mock).mockResolvedValue([{ id: 456 }]);

        await messageHandler.handleDecodedMessage(request);

        expect(browser.tabs.update).toHaveBeenNthCalledWith(1, 123, {
          active: true,
        });
        expect(browser.tabs.captureVisibleTab).toHaveBeenCalled();
        expect(browser.tabs.update).toHaveBeenLastCalledWith(456, {
          active: true,
        });
      });

      it("reports what the browser refused when both paths fail", async () => {
        grantCaptureConsent(123, "https://example.com");
        (browser.tabs.get as jest.Mock).mockResolvedValue({
          id: 123,
          url: "https://example.com",
          title: "Example",
          windowId: 1,
          active: false,
        });
        (browser.tabs.captureTab as jest.Mock).mockRejectedValue(
          new Error("not supported")
        );
        (browser.tabs.query as jest.Mock).mockResolvedValue([{ id: 456 }]);
        (browser.tabs.captureVisibleTab as jest.Mock).mockRejectedValue(
          new Error("Missing activeTab permission")
        );

        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow(
          /Missing activeTab permission.*reinstall the extension/s
        );
      });

      it("should throw an error if tab URL domain is in deny list", async () => {
        // Arrange
        grantCaptureConsent(123, "https://example.com");
        const configWithDenyList: ExtensionConfig = {
          secret: "test-secret",
          permissionMode: "denylist" as const,
          domainDenyList: ["example.com"],
          ports: [8089],
          auditLog: [],
        };
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: configWithDenyList,
        });

        const mockTab = {
          id: 123,
          url: "https://example.com",
          title: "Example",
          windowId: 1,
          active: true,
        };
        (browser.tabs.get as jest.Mock).mockResolvedValue(mockTab);

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Domain in tab URL is in the deny list");
        expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled();
      });

      it("should throw an error if the tool is disabled in settings", async () => {
        // Arrange
        grantCaptureConsent(123, "https://example.com");
        (browser.storage.local.get as jest.Mock).mockResolvedValue({
          config: {
            secret: "test-secret",
            toolSettings: { "capture-tab-screenshot": false },
            permissionMode: "denylist" as const,
            domainDenyList: [],
            ports: [8089],
            auditLog: [],
          } as ExtensionConfig,
        });

        // Act & Assert
        await expect(
          messageHandler.handleDecodedMessage(request)
        ).rejects.toThrow("Command 'capture-screenshot' is disabled");
        expect(browser.tabs.captureVisibleTab).not.toHaveBeenCalled();
      });
    });
  });
});
