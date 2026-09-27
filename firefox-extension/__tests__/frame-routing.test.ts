import { MessageHandler } from "../message-handler";
import { WebsocketClient } from "../client";
import { ExtensionConfig } from "../extension-config";
import {
  listDetachedFrames,
  parseFrameRef,
  stampFrameRef,
  MAX_DETACHED_FRAMES,
} from "../frames";

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

const emptyPage = (items: unknown[] = []) => ({
  url: "https://example.com/",
  title: "Example",
  items,
  totalElements: items.length,
  listedElements: items.length,
  hiddenElements: 0,
  elementsTruncated: false,
  scrollY: 0,
  scrollHeight: 100,
  scrollMax: 0,
  collapsed: [],
  unreachableFrames: [],
});

describe("frame refs", () => {
  it("carries the frame in the ref and gives it back", () => {
    expect(stampFrameRef("e12", 3)).toBe("f3e12");
    expect(parseFrameRef("f3e12")).toEqual({ frameId: 3, ref: "e12" });
  });

  it("leaves a top-document ref alone", () => {
    expect(stampFrameRef("e12", 0)).toBe("e12");
    expect(parseFrameRef("e12")).toEqual({ frameId: 0, ref: "e12" });
  });
});

describe("listDetachedFrames", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps only the frames the top document cannot walk into", async () => {
    (browser.webNavigation.getAllFrames as jest.Mock).mockResolvedValue([
      { frameId: 0, parentFrameId: -1, url: "https://example.com/" },
      { frameId: 1, parentFrameId: 0, url: "https://example.com/same.html" },
      { frameId: 2, parentFrameId: 0, url: "https://other.test/inner.html" },
      { frameId: 3, parentFrameId: 0, url: "about:blank", errorOccurred: true },
    ]);

    const frames = await listDetachedFrames(7, async (frameId) => [
      {
        reachable: frameId === 1,
        parentReachable: frameId === 1,
        url: frameId === 1 ? "https://example.com/same.html" : "https://other.test/inner.html",
      },
    ]);

    expect(frames).toEqual([
      {
        frameId: 2,
        parentFrameId: 0,
        url: "https://other.test/inner.html",
      },
    ]);
  });

  it("drops a frame its detached parent can already walk into", async () => {
    (browser.webNavigation.getAllFrames as jest.Mock).mockResolvedValue([
      { frameId: 0, parentFrameId: -1, url: "https://example.com/" },
      // The child comes first: getAllFrames promises no parent-first order.
      { frameId: 4, parentFrameId: 2, url: "https://other.test/child.html" },
      { frameId: 2, parentFrameId: 0, url: "https://other.test/outer.html" },
      { frameId: 5, parentFrameId: 2, url: "https://third.test/ad.html" },
    ]);

    const frames = await listDetachedFrames(7, async (frameId) => [
      {
        reachable: false,
        parentReachable: frameId === 4,
        url: `https://frame.test/${frameId}.html`,
      },
    ]);

    expect(frames.map((frame) => frame.frameId).sort()).toEqual([2, 5]);
  });

  it("stops after the frame budget", async () => {
    const many = Array.from({ length: MAX_DETACHED_FRAMES + 5 }, (_, index) => ({
      frameId: index + 1,
      parentFrameId: 0,
      url: `https://other.test/${index}.html`,
    }));
    (browser.webNavigation.getAllFrames as jest.Mock).mockResolvedValue([
      { frameId: 0, parentFrameId: -1, url: "https://example.com/" },
      ...many,
    ]);

    const frames = await listDetachedFrames(7, async () => [
      { reachable: false, url: "https://other.test/x.html" },
    ]);

    expect(frames).toHaveLength(MAX_DETACHED_FRAMES);
  });

  it("answers with nothing when the tab has no frame list", async () => {
    (browser.webNavigation.getAllFrames as jest.Mock).mockRejectedValue(
      new Error("no such tab")
    );
    expect(await listDetachedFrames(7, async () => [])).toEqual([]);
  });
});

describe("frame routing", () => {
  let messageHandler: MessageHandler;
  let mockClient: jest.Mocked<WebsocketClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new WebsocketClient(
      8080,
      "test-secret"
    ) as jest.Mocked<WebsocketClient>;
    messageHandler = new MessageHandler(mockClient);

    const config: ExtensionConfig = {
      secret: "test-secret",
      toolSettings: {},
      permissionMode: "denylist" as const,
      domainDenyList: [],
      ports: [8089],
      auditLog: [],
    };
    (browser.storage.local.get as jest.Mock).mockResolvedValue({ config });
    (browser.tabs.get as jest.Mock).mockResolvedValue({
      id: 123,
      url: "https://example.com/",
      windowId: 1,
    });
    (browser.tabs.update as jest.Mock).mockResolvedValue({ id: 123 });
    (browser.permissions.contains as jest.Mock).mockResolvedValue(true);
    (browser.webNavigation.getAllFrames as jest.Mock).mockResolvedValue([
      { frameId: 0, parentFrameId: -1, url: "https://example.com/" },
      { frameId: 4, parentFrameId: 0, url: "https://other.test/inner.html" },
    ]);
  });

  it("appends a detached frame's items with refs that name the frame", async () => {
    (browser.tabs.executeScript as jest.Mock).mockImplementation(
      async (_tabId: number, details: { code?: string; frameId?: number }) => {
        const code = details.code ?? "";
        if (code.includes("win !== window.top")) {
          return [{ reachable: false, url: "https://other.test/inner.html" }];
        }
        if (code.includes("__bcmCollapsed(")) {
          return details.frameId === 4
            ? [
                {
                  ...emptyPage([
                    { kind: "text", text: "inside the frame" },
                    {
                      kind: "element",
                      ref: "e1",
                      role: "button",
                      name: "Press",
                      tag: "button",
                      selector: "button",
                    },
                  ]),
                  url: "https://other.test/inner.html",
                },
              ]
            : [
                {
                  ...emptyPage([{ kind: "text", text: "the page itself" }]),
                  unreachableFrames: [
                    {
                      src: "https://other.test/inner.html",
                      width: 300,
                      height: 200,
                    },
                  ],
                },
              ];
        }
        return [true];
      }
    );

    await messageHandler.handleDecodedMessage({
      cmd: "read-page",
      tabId: 123,
      correlationId: "read-1",
    });

    const sent = mockClient.sendResourceToServer.mock.calls[0][0] as {
      text: string;
      unreachableFrames: unknown[];
      totalElements: number;
    };
    expect(sent.text).toContain("the page itself");
    expect(sent.text).toContain("## frame other.test/inner.html");
    expect(sent.text).toContain("[f4e1] button");
    expect(sent.unreachableFrames).toEqual([]);
    expect(sent.totalElements).toBe(3);
  });

  it("clicks inside the frame the ref names", async () => {
    (browser.tabs.executeScript as jest.Mock).mockImplementation(
      async (_tabId: number, details: { code?: string }) => {
        const code = details.code ?? "";
        if (code.includes("win !== window.top")) {
          return [{ reachable: false, url: "https://other.test/inner.html" }];
        }
        return [{ target: 'button "Press"', detail: "clicked", scrollY: 0 }];
      }
    );

    await messageHandler.handleDecodedMessage({
      cmd: "click-element",
      tabId: 123,
      ref: "f4e1",
      correlationId: "click-1",
    });

    const clickCall = (browser.tabs.executeScript as jest.Mock).mock.calls.find(
      ([, details]) => details.code?.includes("__bcmDispatchClick(el")
    );
    expect(clickCall?.[1].frameId).toBe(4);
    expect(clickCall?.[1].code).toContain('"ref":"e1"');
  });

  it("refuses a drag whose two ends sit in different documents", async () => {
    await expect(
      messageHandler.handleDecodedMessage({
        cmd: "drag-element",
        tabId: 123,
        ref: "f4e1",
        to: { ref: "e2" },
        correlationId: "drag-1",
      })
    ).rejects.toThrow("different frames");
  });

  describe("find across documents", () => {
    type FindAnswer = { matches: { ref: string; tag: string; context: string }[]; more?: boolean };

    function answerFind(answer: (byName: boolean, frameId: number | undefined, code: string) => FindAnswer) {
      (browser.find.find as jest.Mock).mockResolvedValue({ count: 0 });
      (browser.tabs.executeScript as jest.Mock).mockImplementation(
        async (_tabId: number, details: { code?: string; frameId?: number }) => {
          const code = details.code ?? "";
          if (code.includes("win !== window.top")) {
            return [{ reachable: false, url: "https://other.test/inner.html" }];
          }
          if (code.includes("var nameAttributes")) {
            return [answer(code.includes("var byName = true"), details.frameId, code)];
          }
          return [true];
        }
      );
    }

    async function find(maxMatches?: number) {
      await messageHandler.handleDecodedMessage({
        cmd: "find-highlight",
        tabId: 123,
        queryPhrase: "Search",
        maxMatches,
        correlationId: "find-1",
      });
      return mockClient.sendResourceToServer.mock.calls[0][0] as { matches: { ref: string }[]; moreMatches?: boolean };
    }

    it("reads text in a frame before falling back to control names anywhere", async () => {
      const passes: string[] = [];
      answerFind((byName, frameId) => {
        passes.push(`${byName ? "names" : "text"}:${frameId ?? 0}`);
        if (byName) {
          return { matches: [{ ref: "e9", tag: "input", context: 'placeholder="Search"' }] };
        }
        return { matches: frameId === 4 ? [{ ref: "e1", tag: "p", context: "Search here" }] : [] };
      });

      const sent = await find();

      expect(sent.matches.map((match) => match.ref)).toEqual(["f4e1"]);
      expect(passes).toEqual(["text:0", "text:4"]);
    });

    it("does not run the name pass in a frame the text pass could not reach", async () => {
      const passes: string[] = [];
      answerFind((byName, frameId) => {
        passes.push(`${byName ? "names" : "text"}:${frameId ?? 0}`);
        if (frameId === 4) {
          throw new Error("stalled");
        }
        return { matches: byName ? [{ ref: "e9", tag: "input", context: 'placeholder="Search"' }] : [] };
      });

      const sent = await find();

      expect(sent.matches.map((match) => match.ref)).toEqual(["e9"]);
      expect(passes).toEqual(["text:0", "text:4", "names:0"]);
    });

    it("says more exist when a frame past a full budget still holds a match", async () => {
      const name = { ref: "e9", tag: "input", context: 'placeholder="Search"' };
      answerFind((byName, frameId, code) => {
        if (!byName) {
          return { matches: [] };
        }
        if (frameId === 4) {
          return code.includes("var maxMatches = 0") ? { matches: [], more: true } : { matches: [name] };
        }
        return { matches: [name, name] };
      });

      const sent = await find(2);

      expect(sent.matches).toHaveLength(2);
      expect(sent.moreMatches).toBe(true);
    });
  });
});
