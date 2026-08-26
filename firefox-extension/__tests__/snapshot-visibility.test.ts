import { buildSnapshotCode } from "../page-snapshot";

interface SnapshotElement {
  ref: string;
  name: string;
  value?: string;
  hidden?: boolean;
}

interface SnapshotResult {
  elements: SnapshotElement[];
  hiddenElements: number;
  scrollMax: number;
}

function snapshot(includeHidden = false): SnapshotResult {
  const code = buildSnapshotCode({
    maxElements: 200,
    interactiveOnly: true,
    includeHidden,
  });
  return new Function(`return ${code}`)() as SnapshotResult;
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
});
