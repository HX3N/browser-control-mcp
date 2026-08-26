import { buildSnapshotCode } from "../page-snapshot";

interface SnapshotElement {
  ref: string;
  name: string;
  value?: string;
  hidden?: boolean;
}

interface SnapshotResult {
  elements: SnapshotElement[];
  text: string;
  hiddenElements: number;
  scrollMax: number;
}

function snapshot(includeHidden = false): SnapshotResult {
  const code = buildSnapshotCode({
    maxElements: 200,
    includeHidden,
  });
  const result = new Function(`return ${code}`)() as {
    items: ({ kind: string; text?: string } & SnapshotElement)[];
    hiddenElements: number;
    scrollMax: number;
  };
  return {
    elements: result.items.filter((item) => item.kind === "element"),
    text: result.items
      .filter((item) => item.kind === "text")
      .map((item) => item.text ?? "")
      .join(" "),
    hiddenElements: result.hiddenElements,
    scrollMax: result.scrollMax,
  };
}

function boxes(rects: Record<string, Partial<DOMRect>>) {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const id = this.id;
    const rect = rects[id] ?? { left: 0, top: 0, width: 30, height: 12 };
    return {
      left: 0,
      top: 0,
      width: 30,
      height: 12,
      ...rect,
    } as DOMRect;
  };
}

describe("what a snapshot counts as on screen", () => {
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    document.body.innerHTML = `
      <input id="pass" type="password" value="hunter2-and-then-some">
      <input id="user" type="text" value="claude">
      <button id="onscreen">on screen</button>
      <button id="parked">off to the left</button>
      <button id="above">scrolled past</button>
    `;
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalRect;
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("never repeats a password value", () => {
    boxes({});
    const pass = snapshot().elements.find((e) => e.ref && e.value?.includes("not shown"));
    expect(pass?.value).toBe("(21 characters, not shown)");
    const user = snapshot().elements.find((e) => e.value === "claude");
    expect(user).toBeDefined();
  });

  it("treats an element parked outside the document as hidden", () => {
    boxes({ parked: { left: -9999, width: 60 } });
    const listed = snapshot().elements.map((e) => e.name);
    expect(listed).toContain("on screen");
    expect(listed).not.toContain("off to the left");
  });

  it("still lists what the page has merely scrolled past", () => {
    Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
    boxes({ above: { top: -400 } });
    const listed = snapshot().elements.map((e) => e.name);
    expect(listed).toContain("scrolled past");
  });

  it("lists a parked element once the user asks for hidden ones", () => {
    boxes({ parked: { left: -9999, width: 60 } });
    const parked = snapshot(true).elements.find(
      (e) => e.name === "off to the left"
    );
    expect(parked?.hidden).toBe(true);
  });

  it("reaches a control inside a container the page does not render", () => {
    document.body.innerHTML = `
      <button id="onscreen">on screen</button>
      <div style="display:none">
        <h2>Hidden heading</h2>
        <pre>hidden pre</pre>
        <img src="x.png" alt="hidden alt">
        <p>hidden prose</p>
        <button id="nested">inside a hidden box</button>
      </div>
    `;
    boxes({});

    expect(snapshot(false).hiddenElements).toBe(1);
    const result = snapshot(true);
    const nested = result.elements.find((e) => e.name === "inside a hidden box");
    expect(nested?.hidden).toBe(true);
    expect(result.text).not.toMatch(/Hidden heading|hidden pre|hidden alt|hidden prose/);
  });

  it("counts a hidden element even when it is not listed", () => {
    boxes({ parked: { left: -9999, width: 60 } });
    const result = snapshot(false);
    expect(result.hiddenElements).toBe(1);
    expect(result.elements.map((e) => e.name)).not.toContain("off to the left");
  });
});
