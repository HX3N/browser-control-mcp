import { buildSnapshotCode } from "../page-snapshot";
import { REF_ATTRIBUTE } from "../injected-common";
import type { ElementTarget } from "@browser-control-mcp/common";

interface SnapshotResult {
  elements: { ref: string; tag: string; name: string }[];
  totalElements: number;
  hiddenElements: number;
  isTruncated: boolean;
}

function runSnapshot(options: {
  maxElements?: number;
  interactiveOnly?: boolean;
  includeHidden?: boolean;
  target?: ElementTarget;
}): SnapshotResult {
  const code = buildSnapshotCode({
    maxElements: options.maxElements ?? 200,
    interactiveOnly: options.interactiveOnly ?? true,
    includeHidden: options.includeHidden ?? false,
    target: options.target,
  });
  return new Function(`return ${code}`)() as SnapshotResult;
}

function refsOnPage(): Record<string, string> {
  const map: Record<string, string> = {};
  document.querySelectorAll(`[${REF_ATTRIBUTE}]`).forEach((element) => {
    map[element.textContent ?? ""] = element.getAttribute(REF_ATTRIBUTE) ?? "";
  });
  return map;
}

function refNumber(ref: string): number {
  return parseInt(ref.replace("e", ""), 10);
}

describe("buildSnapshotCode", () => {
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeAll(() => {
    Element.prototype.getBoundingClientRect = function () {
      return {
        width: 10,
        height: 10,
        top: 0,
        left: 0,
        right: 10,
        bottom: 10,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  beforeEach(() => {
    document.body.innerHTML = `
      <nav id="side">
        <a href="/hot1">hot one</a>
        <a href="/hot2">hot two</a>
      </nav>
      <div id="list">
        <a href="/p1">post one</a>
        <a href="/p2">post two</a>
        <button>load more</button>
      </div>
    `;
  });

  it("lists the whole document when no target is given", () => {
    const result = runSnapshot({});

    expect(result.elements.map((element) => element.name)).toEqual([
      "hot one",
      "hot two",
      "post one",
      "post two",
      "load more",
    ]);
    expect(result.elements[0].ref).toBe("e1");
    expect(result.totalElements).toBe(5);
  });

  it("lists only what is inside the target element", () => {
    const result = runSnapshot({ target: { selector: "#list" } });

    expect(result.elements.map((element) => element.name)).toEqual([
      "post one",
      "post two",
      "load more",
    ]);
    expect(result.totalElements).toBe(3);
  });

  it("keeps refs stamped outside the scope and never reuses one of them", () => {
    runSnapshot({});
    const before = refsOnPage();
    const outside = [before["hot one"], before["hot two"]];

    const scoped = runSnapshot({ target: { selector: "#list" } });
    const after = refsOnPage();

    expect(after["hot one"]).toBe(before["hot one"]);
    expect(after["hot two"]).toBe(before["hot two"]);
    expect(Object.values(after)).toHaveLength(5);

    const highestOutside = Math.max(...outside.map(refNumber));
    for (const element of scoped.elements) {
      expect(outside).not.toContain(element.ref);
      expect(refNumber(element.ref)).toBeGreaterThan(highestOutside);
    }
  });

  it("accepts a ref from an earlier snapshot as the scope", () => {
    const full = runSnapshot({});
    const buttonRef = full.elements.find(
      (element) => element.name === "load more"
    )!.ref;

    const scoped = runSnapshot({ target: { ref: buttonRef } });

    expect(scoped.elements.map((element) => element.name)).toEqual([
      "load more",
    ]);
    expect(document.querySelectorAll(`[${REF_ATTRIBUTE}]`)).toHaveLength(5);
  });

  it("includes the target element itself when it matches the selector", () => {
    const result = runSnapshot({ target: { selector: "#list a" } });

    expect(result.elements.map((element) => element.name)).toEqual([
      "post one",
    ]);
  });

  it("honours the selector index", () => {
    const result = runSnapshot({ target: { selector: "#list a", index: 1 } });

    expect(result.elements.map((element) => element.name)).toEqual([
      "post two",
    ]);
  });

  it("throws with a retry hint when the scope ref is gone", () => {
    expect(() => runSnapshot({ target: { ref: "e99" } })).toThrow(
      /take a fresh snapshot and retry/
    );
  });

  it("throws when the scope selector matches nothing", () => {
    expect(() => runSnapshot({ target: { selector: "#missing" } })).toThrow(
      /No element matches the selector/
    );
  });

  it("truncates a scoped snapshot with maxElements", () => {
    const result = runSnapshot({
      target: { selector: "#list" },
      maxElements: 2,
    });

    expect(result.elements).toHaveLength(2);
    expect(result.totalElements).toBe(3);
    expect(result.isTruncated).toBe(true);
  });
});
