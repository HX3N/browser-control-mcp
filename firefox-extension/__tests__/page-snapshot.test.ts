import {
  buildSnapshotCode,
  formatPageItems,
  PageElementItem,
  PageItem,
  PageReadResult,
} from "../page-snapshot";
import { REF_ATTRIBUTE } from "../injected-common";
import type { ElementTarget } from "@browser-control-mcp/common";

interface SnapshotResult {
  items: PageItem[];
  elements: { ref: string; tag: string; name: string }[];
  totalElements: number;
  hiddenElements: number;
  elementsTruncated: boolean;
}

function runSnapshot(options: {
  maxElements?: number;
  includeHidden?: boolean;
  target?: ElementTarget;
}): SnapshotResult {
  const code = buildSnapshotCode({
    maxElements: options.maxElements ?? 200,
    includeHidden: options.includeHidden ?? false,
    target: options.target,
  });
  const result = new Function(`return ${code}`)() as PageReadResult;
  return {
    ...result,
    elements: result.items.filter(
      (item): item is PageElementItem => item.kind === "element"
    ),
  };
}

function lines(result: SnapshotResult): string[] {
  return formatPageItems(result.items, { includeSelectors: false, includeHrefs: true }).split("\n");
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
    expect(result.elementsTruncated).toBe(true);
  });
});

describe("text and elements interleaved", () => {
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeAll(() => {
    Element.prototype.getBoundingClientRect = function () {
      return { width: 10, height: 10, top: 0, left: 0, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  it("keeps the order of the page, so a control sits next to the text it belongs to", () => {
    document.body.innerHTML = `
      <h2>Comments</h2>
      <div class="comment"><p>First comment by <a href="/alice">alice</a></p><button>Edit</button></div>
      <div class="comment"><p>Second comment</p><button>Edit</button></div>
    `;

    expect(lines(runSnapshot({}))).toEqual([
      "## Comments",
      "First comment by",
      '[e1] link "alice" - href: /alice',
      '[e2] button "Edit"',
      "Second comment",
      '[e3] button "Edit"',
    ]);
  });

  it("does not repeat the text of a control as a text line", () => {
    document.body.innerHTML = `<p>Go <a href="/x">there</a> now</p>`;

    expect(lines(runSnapshot({}))).toEqual([
      "Go",
      '[e1] link "there" - href: /x',
      "now",
    ]);
  });

  it("leaves out text the page does not render, and scripts", () => {
    document.body.innerHTML = `
      <p>Shown</p>
      <p style="display: none">Not shown</p>
      <script>var x = 1;</script>
      <pre>  keep\n    this</pre>
    `;

    expect(lines(runSnapshot({}))).toEqual(["Shown", "  keep", "    this"]);
  });

  it("puts the label of a heading once even when the heading is a link", () => {
    document.body.innerHTML = `<h1><a href="/">Home</a></h1>`;

    expect(lines(runSnapshot({}))).toEqual([
      "# Home",
      '[e1] link "Home" - href: /',
    ]);
  });

  it("reads the text inside a scoped element only", () => {
    document.body.innerHTML = `
      <nav>Outside</nav>
      <div id="main"><p>Inside</p><button>Go</button></div>
    `;

    expect(lines(runSnapshot({ target: { selector: "#main" } }))).toEqual([
      "Inside",
      '[e1] button "Go"',
    ]);
  });

  it("drops an unnamed avatar link that points where a named link does, and keeps the ref count honest", () => {
    document.body.innerHTML = `
      <a href="/alice"><img src="a.png"></a><a href="/alice">alice</a> commented
      <button aria-label=""></button>
      <a href="https://other.example/x">elsewhere</a>
      <ul><li><a href="/alice"><img src="a.png"></a> <a href="/c/1">first commit</a></li></ul>
      <a href="/only-icon"><img src="i.png"></a>
    `;
    const result = runSnapshot({});

    expect(lines(result)).toEqual([
      '[e2] link "alice" - href: /alice',
      "commented",
      '[e3] button ""',
      '[e4] link "elsewhere" - href: https://other.example/x',
      '[e6] link "first commit" - href: /c/1',
      '[e7] link "" - href: /only-icon',
    ]);
    expect(result.totalElements).toBe(5);
    expect(document.querySelectorAll(`[${REF_ATTRIBUTE}]`)).toHaveLength(5);
  });

  it("writes a link inside the current page relative to it", () => {
    window.history.replaceState(null, "", "/owner/repo/pull/7");
    document.body.innerHTML = `
      <a href="/owner/repo/pull/7#c-1">here</a>
      <a href="/owner/repo/pull/7/commits/abc">commit</a>
      <a href="/owner/repo/pull/71">other pull</a>
      <a href="/owner/repo/pull/7">self</a>
    `;

    expect(lines(runSnapshot({}))).toEqual([
      '[e1] link "here" - href: #c-1',
      '[e2] link "commit" - href: /commits/abc',
      '[e3] link "other pull" - href: /owner/repo/pull/71',
      '[e4] link "self" - href: /',
    ]);
    window.history.replaceState(null, "", "/");
  });

  it("leaves the href out unless asked for it", () => {
    document.body.innerHTML = `<a href="/x">there</a>`;
    const result = runSnapshot({});

    expect(formatPageItems(result.items, { includeSelectors: false, includeHrefs: false })).toBe(
      '[e1] link "there"'
    );
  });

  it("joins table cells with a separator and rows on lines", () => {
    document.body.innerHTML = `
      <table><tr><th>Name</th><th>Size</th></tr><tr><td>a.txt</td><td>12</td></tr></table>
    `;

    expect(lines(runSnapshot({}))).toEqual(["Name | Size", "a.txt | 12"]);
  });
});
