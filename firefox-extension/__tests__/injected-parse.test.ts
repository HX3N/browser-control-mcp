import {
  DEFAULT_OUTLINE_CHAR_THRESHOLD,
  DEFAULT_OUTLINE_ELEMENT_THRESHOLD,
  buildSnapshotCode,
} from "../page-snapshot";
import {
  buildAttachOverlayCode,
  buildConcealOverlayCode,
  buildDetachOverlayCode,
  buildOutlineOverlayCode,
  buildReclaimTabMarkCode,
  buildRestOverlayCode,
  buildRevealOverlayCode,
  buildScriptResultOverlayCode,
} from "../highlight-overlay";
import {
  buildDialogGuardCode,
} from "../dialog-guard";
import {
  buildClickCode,
  buildElementBoxCode,
  buildExecuteJsCode,
  buildFindCode,
  buildHoverCode,
  buildDragCode,
  buildInPageNavigateCode,
  buildInPageNavigationCheckCode,
  buildMediaFetchCode,
  buildMediaListCode,
  buildPressKeyCode,
  buildRegionBoxCode,
  buildScrollCode,
  buildSelectOptionCode,
  buildTextReadCode,
  buildTextWatchCode,
  buildTypeCode,
  buildDownloadUrlCode,
  buildUploadChunkCode,
  buildUploadFilesCode,
  buildQuietProbeCode,
  buildWaitProbeCode,
} from "../interaction-scripts";
import { PAGE_READ_SOURCE } from "../injected-common";
import { DEFAULT_OVERLAY_COLORS } from "../extension-config";

const target = { ref: "e7", selector: undefined, index: 0 };
const bySelector = { ref: undefined, selector: "#list", index: 2 };

const cases: [string, string][] = [
  ["page read, whole page", buildSnapshotCode({ maxElements: 200, includeHidden: false })],
  ["page read, hidden included", buildSnapshotCode({ maxElements: 5, includeHidden: true })],
  ["page read, full text forced", buildSnapshotCode({ maxElements: 200, includeHidden: false, full: true })],
  ["page read, scoped by ref", buildSnapshotCode({ maxElements: 200, includeHidden: false, target })],
  ["page read, scoped by selector", buildSnapshotCode({ maxElements: 200, includeHidden: true, target: bySelector })],
  ["find, plain phrase", buildFindCode("hello world", 10)],
  ["find, phrase with quotes and a backslash", buildFindCode("it's \"quoted\" \\ done", 3)],
  ["find, hidden included", buildFindCode("hello", 3, true)],
  [
    "overlay attach, no target",
    buildAttachOverlayCode({
      status: "Reading",
      state: "read",
      markTab: true,
      showAurora: true,
      showFocus: true,
      showBadge: true,
      idleStatus: "Claude connected",
      resetAfterMs: 0,
      sweepMs: 2000,
      accents: DEFAULT_OVERLAY_COLORS.accents,
      aurora: DEFAULT_OVERLAY_COLORS.aurora,
    }),
  ],
  [
    "overlay attach, targeted",
    buildAttachOverlayCode({
      status: "Clicking",
      state: "click",
      markTab: false,
      showAurora: false,
      showFocus: true,
      showBadge: true,
      idleStatus: "Claude connected",
      resetAfterMs: 4000,
      sweepMs: 2000,
      accents: DEFAULT_OVERLAY_COLORS.accents,
      aurora: ["#111111", "#222222", "#333333", "#444444"],
      target,
    }),
  ],
  [
    "overlay attach, drag with a drop target",
    buildAttachOverlayCode({
      status: "Dragging",
      state: "click",
      markTab: true,
      showAurora: true,
      showFocus: true,
      showBadge: true,
      idleStatus: "Claude connected",
      resetAfterMs: 4000,
      sweepMs: 2000,
      accents: DEFAULT_OVERLAY_COLORS.accents,
      aurora: DEFAULT_OVERLAY_COLORS.aurora,
      target,
      drop: bySelector,
    }),
  ],
  [
    "overlay attach, resting with a code panel",
    buildAttachOverlayCode({
      status: "Running JavaScript",
      state: "exec",
      markTab: true,
      showAurora: true,
      showFocus: false,
      showBadge: true,
      idleStatus: "Claude connected",
      resetAfterMs: 4000,
      sweepMs: 2000,
      accents: DEFAULT_OVERLAY_COLORS.accents,
      aurora: DEFAULT_OVERLAY_COLORS.aurora,
      resting: true,
      detail: "document.title = 'it\\'s \"quoted\"';\n</script>\n${x}",
    }),
  ],
  [
    "overlay attach, scroll swipe",
    buildAttachOverlayCode({
      status: "Scrolling",
      state: "read",
      markTab: true,
      showAurora: true,
      showFocus: true,
      showBadge: true,
      idleStatus: "Claude connected",
      resetAfterMs: 0,
      sweepMs: 2000,
      accents: DEFAULT_OVERLAY_COLORS.accents,
      aurora: DEFAULT_OVERLAY_COLORS.aurora,
      swipe: "bottom",
    }),
  ],
  ["overlay rest", buildRestOverlayCode()],
  [
    "overlay script result",
    buildScriptResultOverlayCode('["a", "b"]', "Result", false),
  ],
  [
    "overlay script result, error with quotes and a backslash",
    buildScriptResultOverlayCode("SyntaxError: it's \"bad\" \\ here", "Error", true),
  ],
  ["element box by ref", buildElementBoxCode(target)],
  ["element box by selector", buildElementBoxCode(bySelector)],
  ["media list, whole page", buildMediaListCode()],
  ["media list, scoped by ref", buildMediaListCode(target)],
  ["media list, scoped by selector", buildMediaListCode(bySelector)],
  ["media list, hidden included", buildMediaListCode(undefined, true)],
  ["media fetch", buildMediaFetchCode("https://example.com/a.png?x=1&y='2'", 8 * 1024 * 1024)],
  ["download url by ref", buildDownloadUrlCode({ ref: "e3" })],
  ["upload chunk", buildUploadChunkCode("u1", "AAAA")],
  ["download url by selector", buildDownloadUrlCode({ selector: "a[download]", index: 1 })],
  ["overlay detach", buildDetachOverlayCode()],
  ["overlay conceal", buildConcealOverlayCode()],
  ["overlay reveal", buildRevealOverlayCode()],
  ["overlay reclaim tab mark", buildReclaimTabMarkCode()],
  ["overlay outline regions", buildOutlineOverlayCode([{ ref: "e41", label: "e41 It's \"quoted\"", level: 1, depth: 0 }])],
  ["in-page navigation, start", buildInPageNavigateCode("https://example.com/a?b='c'")],
  ["in-page navigation, check", buildInPageNavigationCheckCode({ via: "link", before: "https://example.com/" }, true)],
  ["dialog guard, console off", buildDialogGuardCode()],
  ["dialog guard, errors only", buildDialogGuardCode("error")],
  ["dialog guard, errors and warnings", buildDialogGuardCode("warn")],
  ["dialog guard, every console level", buildDialogGuardCode("log")],
  [
    "click",
    buildClickCode({
      cmd: "click-element",
      tabId: 1,
      ...target,
      button: "left",
      clickCount: 1,
    }),
  ],
  [
    "type",
    buildTypeCode({
      cmd: "type-text",
      tabId: 1,
      ...bySelector,
      text: "hello 'world'\n",
      clearFirst: true,
      submit: true,
    }),
  ],
  [
    "type appending, clearFirst omitted",
    buildTypeCode({
      cmd: "type-text",
      tabId: 1,
      ...bySelector,
      text: "more",
      submit: false,
    }),
  ],
  [
    "type with a click after it",
    buildTypeCode({
      cmd: "type-text",
      tabId: 1,
      ...bySelector,
      text: "hello",
      clearFirst: true,
      submit: false,
      clickAfter: target,
    }),
  ],
  [
    "text watch, whole page, no baseline yet",
    buildTextWatchCode(
      undefined,
      "abc-1",
      null,
      800,
      30000,
      0
    ),
  ],
  [
    "text watch, carrying a baseline",
    buildTextWatchCode(
      undefined,
      "abc-2",
      "what the page said last time\n'quoted'",
      0,
      0,
      0
    ),
  ],
  [
    "text watch, scoped by selector",
    buildTextWatchCode(
      bySelector,
      "abc-3",
      null,
      5000,
      180000,
      0
    ),
  ],
  [
    "text watch, ignoring changes under a threshold",
    buildTextWatchCode(
      bySelector,
      "abc-4",
      "what the page said last time\n'quoted'",
      800,
      30000,
      12
    ),
  ],
  ["text read, whole page", buildTextReadCode(undefined)],
  ["text read, scoped by ref", buildTextReadCode(target)],
  [
    "press key",
    buildPressKeyCode({
      cmd: "press-key",
      tabId: 1,
      ...target,
      key: "Enter",
      modifiers: ["Control", "Shift"],
    }),
  ],
  [
    "press select-all shortcut",
    buildPressKeyCode({
      cmd: "press-key",
      tabId: 1,
      ...target,
      key: "a",
      modifiers: ["Control"],
    }),
  ],
  [
    "press caret key without a target",
    buildPressKeyCode({
      cmd: "press-key",
      tabId: 1,
      key: "Home",
      modifiers: ["Shift"],
    }),
  ],
  [
    "press delete key",
    buildPressKeyCode({
      cmd: "press-key",
      tabId: 1,
      ...bySelector,
      key: "Backspace",
      modifiers: [],
    }),
  ],
  [
    "scroll by amount",
    buildScrollCode({
      cmd: "scroll-page",
      tabId: 1,
      ...bySelector,
      direction: "down",
      amount: 400,
    }),
  ],
  [
    "scroll to element",
    buildScrollCode({
      cmd: "scroll-page",
      tabId: 1,
      ...target,
      direction: "element",
    }),
  ],
  [
    "select option",
    buildSelectOptionCode({
      cmd: "select-option",
      tabId: 1,
      ...target,
      values: ["a", "b'c"],
    }),
  ],
  ["execute js", buildExecuteJsCode("return document.title;", 20000)],
  [
    "click with modifiers",
    buildClickCode({
      cmd: "click-element",
      tabId: 1,
      ...target,
      button: "left",
      clickCount: 1,
      modifiers: ["Control", "Shift"],
    }),
  ],
  ["hover", buildHoverCode({ cmd: "hover-element", tabId: 1, ...bySelector })],
  [
    "drag",
    buildDragCode({
      cmd: "drag-element",
      tabId: 1,
      ...target,
      to: { selector: "#drop'zone", index: 1 },
    }),
  ],
  [
    "key repeat",
    buildPressKeyCode({
      cmd: "press-key",
      tabId: 1,
      ...target,
      key: "ArrowDown",
      repeat: 5,
    }),
  ],
  [
    "scroll inside an element",
    buildScrollCode({
      cmd: "scroll-page",
      tabId: 1,
      direction: "right",
      amount: 120,
      ...bySelector,
    }),
  ],
  [
    "upload files",
    buildUploadFilesCode({
      cmd: "upload-files",
      tabId: 1,
      ...target,
      files: [{ name: "a'b.png", mimeType: "image/png", base64: "AAAA" }],
    }),
  ],
  [
    "upload files from staged chunks",
    buildUploadFilesCode({
      cmd: "upload-files",
      tabId: 1,
      ...target,
      files: [{ name: "big.mp4", mimeType: "video/mp4", uploadId: "u1" }],
    }),
  ],
  ["region box", buildRegionBoxCode({ x0: 10, y0: 20, x1: 300, y1: 200 })],
  [
    "wait probe",
    buildWaitProbeCode({
      selector: "#done",
      state: "visible",
    }),
  ],
  [
    "wait probe, scoped by ref",
    buildWaitProbeCode({
      selector: "#done",
      state: "detached",
      within: target,
    }),
  ],
  ["quiet probe", buildQuietProbeCode(false)],
  ["quiet probe, final", buildQuietProbeCode(true)],
  ["page read helpers", PAGE_READ_SOURCE],
];

describe("injected script builders emit parsable JavaScript", () => {
  for (const [name, code] of cases) {
    it(name, () => {
      expect(() => new Function(code)).not.toThrow();
    });
  }
});

describe("injected source contracts", () => {
  it("glides a scroll for as long as the overlay's swipe runs", () => {
    const code = buildScrollCode({ cmd: "scroll-page", tabId: 1, direction: "down" });
    expect(code).toContain("__bcmOverlay.beginSwipe()");
    expect(code).toContain("__bcmGlide(box, fromX, fromY, goalX, goalY, ms || 600)");
    expect(code).toContain("__bcmSweepEase(p)");
  });

  it("outlines a large page only when the read is neither scoped nor forced full", () => {
    const whole = buildSnapshotCode({ maxElements: 200, includeHidden: false });
    expect(whole).toContain("outline = __bcmOutline(");
    expect(whole).toContain("var full = false");
    expect(buildSnapshotCode({ maxElements: 200, includeHidden: false, full: true })).toContain("var full = true");
    expect(buildSnapshotCode({ maxElements: 200, includeHidden: false, target })).toContain("if (!scopeRoot && !full");
  });

  it("takes the outline thresholds from the settings, and falls back to the defaults", () => {
    const fallback = buildSnapshotCode({ maxElements: 200, includeHidden: false });
    expect(fallback).toContain(
      `chars > ${DEFAULT_OUTLINE_CHAR_THRESHOLD} || totalElements > ${DEFAULT_OUTLINE_ELEMENT_THRESHOLD}`
    );
    const configured = buildSnapshotCode({
      maxElements: 200,
      includeHidden: false,
      outlineChars: 900,
      outlineElements: 7,
    });
    expect(configured).toContain("chars > 900 || totalElements > 7");
  });

  it("hands the overlay the element itself, not a frozen rectangle", () => {
    const code = buildAttachOverlayCode({
      state: "read",
      status: "Reading",
      showFocus: true,
      showAurora: true,
      showBadge: true,
      markTab: true,
      idleStatus: "Claude connected",
      resetAfterMs: 0,
      sweepMs: 2000,
      accents: DEFAULT_OVERLAY_COLORS.accents,
      aurora: DEFAULT_OVERLAY_COLORS.aurora,
      target,
    });

    expect(code).toContain("__bcmOverlay.focus(el");
    expect(code).toContain("window.scrollTo");
  });

  it("anchors every scroll a third of the way down, not at the centre", () => {
    const codes = [
      buildAttachOverlayCode({
        status: "Reading",
        state: "read",
        showAurora: true,
        showFocus: true,
        showBadge: true,
        markTab: true,
        idleStatus: "Claude connected",
        resetAfterMs: 0,
        sweepMs: 2000,
        accents: DEFAULT_OVERLAY_COLORS.accents,
        aurora: DEFAULT_OVERLAY_COLORS.aurora,
        target,
      }),
      buildClickCode({ cmd: "click-element", tabId: 1, ...target } as never),
      buildScrollCode({
        cmd: "scroll-page",
        tabId: 1,
        ...target,
        direction: "element",
      } as never),
    ];

    for (const code of codes) {
      expect(code).toContain("__bcmScrollToAnchor");
      expect(code).toContain("viewportHeight / 3");
      expect(code).not.toContain("viewportHeight / 2");
      expect(code).not.toContain("block: 'center'");
    }
  });

  it("measures a capture box in page coordinates so off-screen parts are reachable", () => {
    const code = buildElementBoxCode(target);

    expect(code).toContain("window.scrollY");
    expect(code).toContain("window.scrollX");
    expect(code).not.toContain("scrollIntoView");
  });

  it("adds the enclosing frames' offsets before mixing a rect with the top window's scroll", () => {
    const codes = [
      buildElementBoxCode(target),
      buildAttachOverlayCode({
        status: "Clicking",
        state: "click",
        markTab: false,
        showAurora: false,
        showFocus: true,
        showBadge: true,
        idleStatus: "Claude connected",
        resetAfterMs: 0,
        sweepMs: 2000,
        accents: DEFAULT_OVERLAY_COLORS.accents,
        aurora: DEFAULT_OVERLAY_COLORS.aurora,
        target,
      }),
    ];

    for (const code of codes) {
      expect(code).toContain("win.frameElement");
      expect(code).toContain("frame.clientTop");
      expect(code).toContain("frame.clientLeft");
      // A rect that reaches the top window's scroll must have come through __bcmRect.
      expect(code).not.toContain("window.scrollY + el.getBoundingClientRect()");
      expect(code).not.toContain("var box = el.getBoundingClientRect()");
    }
  });

  it("guards every blocking dialog the page can raise", () => {
    const code = buildDialogGuardCode("error");

    for (const name of ["alert", "confirm", "prompt", "print"]) {
      expect(code).toContain(`page.${name} = exportFunction`);
    }
    expect(code).toContain("beforeunload");
    expect(code).toContain("unhandledrejection");
  });

  it("queues page events instead of sending them from page-called code", () => {
    const code = buildDialogGuardCode("error");
    const report = code.slice(
      code.indexOf("function report("),
      code.indexOf("page.alert")
    );

    expect(report).toContain("queue({");
    expect(report).not.toContain("sendMessage");
    expect(code).toContain("Promise.resolve().then(flush)");
  });

  it("hands what the background never answered to the next document", () => {
    const code = buildDialogGuardCode("error");
    const leaving = code.slice(
      code.indexOf("addEventListener('pagehide'"),
      code.indexOf("addEventListener('error'")
    );

    expect(leaving).toContain("flush();");
    expect(leaving).toContain("stash();");
    expect(code).toContain("window.sessionStorage");
    expect(code).toContain("collect();");
  });

  it("announces the document it is installed in", () => {
    const code = buildDialogGuardCode("error");

    expect(code).toContain("channel: 'guard'");
    expect(code).toContain("window.top === window");
  });

  it("hooks only the console levels the chosen setting covers", () => {
    expect(buildDialogGuardCode()).toContain('var hooked = []');
    expect(buildDialogGuardCode("error")).toContain('var hooked = ["error"]');
    expect(buildDialogGuardCode("warn")).toContain('"error","warn"');
    expect(buildDialogGuardCode("log")).toContain('"info"');
  });
});
