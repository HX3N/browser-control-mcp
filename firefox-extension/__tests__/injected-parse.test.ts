import { buildSnapshotCode } from "../page-snapshot";
import {
  buildAttachOverlayCode,
  buildConcealOverlayCode,
  buildDetachOverlayCode,
  buildRevealOverlayCode,
} from "../highlight-overlay";
import {
  buildDialogGuardCode,
} from "../dialog-guard";
import {
  buildClickCode,
  buildElementBoxCode,
  buildExecuteJsCode,
  buildPressKeyCode,
  buildScrollCode,
  buildSelectOptionCode,
  buildTypeCode,
  buildWaitProbeCode,
} from "../interaction-scripts";
import { PAGE_READ_SOURCE } from "../injected-common";
import { DEFAULT_OVERLAY_COLORS } from "../extension-config";

const target = { ref: "e7", selector: undefined, index: 0 };
const bySelector = { ref: undefined, selector: "#list", index: 2 };

const cases: [string, string][] = [
  ["snapshot, whole page", buildSnapshotCode({ maxElements: 200, interactiveOnly: true, includeHidden: false })],
  ["snapshot, hidden included", buildSnapshotCode({ maxElements: 5, interactiveOnly: false, includeHidden: true })],
  ["snapshot, scoped by ref", buildSnapshotCode({ maxElements: 200, interactiveOnly: true, includeHidden: false, target })],
  ["snapshot, scoped by selector", buildSnapshotCode({ maxElements: 200, interactiveOnly: false, includeHidden: true, target: bySelector })],
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
      accents: DEFAULT_OVERLAY_COLORS.accents,
      aurora: ["#111111", "#222222", "#333333", "#444444"],
      target,
    }),
  ],
  ["element box by ref", buildElementBoxCode(target)],
  ["element box by selector", buildElementBoxCode(bySelector)],
  ["overlay detach", buildDetachOverlayCode()],
  ["overlay conceal", buildConcealOverlayCode()],
  ["overlay reveal", buildRevealOverlayCode()],
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
    "press paste shortcut with clipboard text",
    buildPressKeyCode(
      {
        cmd: "press-key",
        tabId: 1,
        ...target,
        key: "v",
        modifiers: ["Control"],
      },
      "line one\nline 'two'"
    ),
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
    "wait probe",
    buildWaitProbeCode({
      cmd: "wait-for-element",
      tabId: 1,
      selector: "#done",
      state: "visible",
      timeoutMs: 5000,
    }),
  ],
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
