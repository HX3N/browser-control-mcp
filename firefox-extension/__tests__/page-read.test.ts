import { PAGE_READ_SOURCE, ROOT_WALKER_SOURCE } from "../injected-common";

interface CollapsedSection {
  label: string;
  kind: string;
  chars?: number;
}

interface FormField {
  label: string;
  kind: string;
  value: string;
  options?: number;
}

function run<T>(call: string): T {
  return new Function(
    `${ROOT_WALKER_SOURCE}\n${PAGE_READ_SOURCE}\nreturn ${call};`
  )() as T;
}

const collapsed = (limit = 30) =>
  run<CollapsedSection[]>(`__bcmCollapsed(document.body, ${limit})`);
const fields = (limit = 40) =>
  run<FormField[]>(`__bcmFields(document.body, ${limit})`);
interface UnreachableFrame {
  src: string;
  name?: string;
  width: number;
  height: number;
  hidden?: boolean;
}

const unreachableFrames = () =>
  run<UnreachableFrame[]>("__bcmUnreachableFrames(document.body)");
const readRoots = () => run<Element[]>("__bcmReadRoots(document.body)");

function stubRects() {
  const original = Element.prototype.getBoundingClientRect;

  beforeAll(() => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const size = (this as HTMLElement).style?.display === "none" ? 0 : 10;
      return { width: size, height: size, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = original;
  });
}

function frameOn(iframe: HTMLIFrameElement, contentDocument: Document | null) {
  if (contentDocument) {
    // createHTMLDocument leaves defaultView null, and getComputedStyle is reached through it.
    Object.defineProperty(contentDocument, "defaultView", {
      configurable: true,
      get: () => window,
    });
  }
  Object.defineProperty(iframe, "contentDocument", {
    configurable: true,
    get() {
      if (!contentDocument) {
        throw new DOMException("cross-origin");
      }
      return contentDocument;
    },
  });
}

describe("collapsed sections", () => {
  stubRects();

  it("reports a closed details with its summary and the size of what is hidden", () => {
    document.body.innerHTML = `
      <details><summary>Release notes</summary><p>Twelve chars</p></details>
    `;

    expect(collapsed()).toEqual([
      {
        label: "Release notes",
        kind: "details",
        chars: "Twelve chars".length,
      },
    ]);
  });

  it("stays quiet about an open details, whose text the page already renders", () => {
    document.body.innerHTML = `
      <details open><summary>Release notes</summary><p>Visible</p></details>
    `;

    expect(collapsed()).toHaveLength(0);
  });

  it("counts a closed details inside another closed one only once", () => {
    document.body.innerHTML = `
      <details><summary>Outer</summary>
        <details><summary>Inner</summary><p>Deep</p></details>
      </details>
    `;

    expect(collapsed().map((section) => section.label)).toEqual(["Outer"]);
  });

  it("reports a visible toggle that says it is collapsed", () => {
    document.body.innerHTML = `
      <button aria-expanded="false" aria-controls="panel">Advanced options</button>
      <div id="panel" style="display: none">Hidden body</div>
    `;

    expect(collapsed()).toEqual([
      {
        label: "Advanced options",
        kind: "expandable",
        chars: "Hidden body".length,
      },
    ]);
  });

  it("reports the panel behind an unselected tab", () => {
    document.body.innerHTML = `
      <div role="tab" aria-selected="true" aria-controls="one">First</div>
      <div role="tab" aria-selected="false" aria-controls="two">Second</div>
      <div id="one">Shown body</div>
      <div id="two" style="display: none">Other body</div>
    `;

    expect(collapsed()).toEqual([
      { label: "Second", kind: "tab", chars: "Other body".length },
    ]);
  });

  it("reports a toggle that only names a panel the page does not show", () => {
    document.body.innerHTML = `
      <button aria-controls="drawer">More</button>
      <div id="drawer" style="display: none">Drawer body</div>
    `;

    expect(collapsed()).toEqual([
      { label: "More", kind: "expandable", chars: "Drawer body".length },
    ]);
  });

  it("stays quiet when nothing proves a collapse", () => {
    document.body.innerHTML = `
      <button aria-expanded="true" aria-controls="open-panel">Open</button>
      <div id="open-panel">Body</div>
      <button aria-controls="missing-panel">Names nothing that exists</button>
      <button>Plain button</button>
      <button aria-expanded="false" style="display: none">Offscreen toggle</button>
    `;

    expect(collapsed()).toHaveLength(0);
  });

  it("stops at the limit it is given", () => {
    document.body.innerHTML = Array.from(
      { length: 5 },
      (_, i) => `<details><summary>S${i}</summary><p>Body</p></details>`
    ).join("");

    expect(collapsed(2)).toHaveLength(2);
  });
});

describe("frames", () => {
  stubRects();

  it("lists the frames it cannot open, and leaves out the ones it can", () => {
    document.body.innerHTML = `<iframe id="near"></iframe><iframe id="far" src="https://chat.example.com/" title="Chat"></iframe>`;
    frameOn(
      document.getElementById("near") as HTMLIFrameElement,
      document.implementation.createHTMLDocument("near")
    );
    frameOn(document.getElementById("far") as HTMLIFrameElement, null);

    expect(unreachableFrames()).toEqual([
      {
        src: "https://chat.example.com/",
        name: "Chat",
        width: 10,
        height: 10,
      },
    ]);
  });

  it("marks a frame the page does not render", () => {
    document.body.innerHTML = `<iframe id="far" src="https://ads.example.com/" style="display:none"></iframe>`;
    frameOn(document.getElementById("far") as HTMLIFrameElement, null);

    expect(unreachableFrames()[0].hidden).toBe(true);
  });

  it("adds the body of a frame it can open, and no shadow root", () => {
    document.body.innerHTML = `<iframe id="near"></iframe><div id="host"></div>`;
    const inner = document.implementation.createHTMLDocument("near");
    inner.body.innerHTML = "<p>Frame body</p>";
    frameOn(document.getElementById("near") as HTMLIFrameElement, inner);
    (document.getElementById("host") as HTMLElement)
      .attachShadow({ mode: "open" })
      .append(document.createElement("p"));

    const roots = readRoots();

    expect(roots).toHaveLength(2);
    expect(roots[0]).toBe(document.body);
    expect(roots[1]).toBe(inner.body);
  });

  it("finds a collapsed section inside a frame", () => {
    document.body.innerHTML = `<iframe id="near"></iframe>`;
    const inner = document.implementation.createHTMLDocument("near");
    inner.body.innerHTML = `<details><summary>In a frame</summary><p>Body</p></details>`;
    frameOn(document.getElementById("near") as HTMLIFrameElement, inner);

    expect(collapsed().map((section) => section.label)).toEqual(["In a frame"]);
  });
});

describe("form fields", () => {
  stubRects();

  it("reports values the page text cannot carry", () => {
    document.body.innerHTML = `
      <label for="city">City</label><input id="city" value="Seoul">
      <textarea aria-label="Notes">Ship it</textarea>
      <select aria-label="Size"><option>Small</option><option selected>Large</option></select>
      <input type="checkbox" aria-label="Agree" checked>
    `;

    expect(fields()).toEqual([
      { label: "City", kind: "input", value: "Seoul" },
      { label: "Notes", kind: "textarea", value: "Ship it" },
      { label: "Size", kind: "select", value: "Large", options: 2 },
      { label: "Agree", kind: "input", value: "checked" },
    ]);
  });

  it("leaves out passwords, hidden inputs, empty values and fields off screen", () => {
    document.body.innerHTML = `
      <input type="password" aria-label="Password" value="hunter2">
      <input type="hidden" name="csrf" value="token">
      <input aria-label="Empty" value="">
      <input aria-label="Offscreen" value="x" style="display: none">
    `;

    expect(fields()).toEqual([]);
  });
});
