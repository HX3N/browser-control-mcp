import {
  buildSnapshotCode,
  DEFAULT_OUTLINE_ELEMENT_THRESHOLD,
  PageElementItem,
  PageReadResult,
} from "../page-snapshot";
import { REF_ATTRIBUTE } from "../injected-common";
import type { ElementTarget } from "@browser-control-mcp/common";

function runSnapshot(options: {
  full?: boolean;
  target?: ElementTarget;
}): PageReadResult {
  const code = buildSnapshotCode({
    maxElements: 500,
    includeHidden: false,
    full: options.full,
    target: options.target,
  });
  return new Function(`return ${code}`)() as PageReadResult;
}

function links(count: number, prefix: string): string {
  return Array.from({ length: count }, (_, i) => `<a href="/${prefix}/${i}">${prefix} ${i}</a>`).join("");
}

const ARTICLE_TEXT = "The article says something worth reading. ".repeat(60);

function largePage(): void {
  document.body.innerHTML = `
    <div id="wrap">
      <header id="top"><nav aria-label="Site">${links(60, "menu")}</nav></header>
      <div id="container">
        <article id="post"><div id="inner"><h1>Post title</h1><p>${ARTICLE_TEXT}</p><div id="tools">${links(12, "tool")}</div></div></article>
        <aside id="side"><h2>Related</h2>${links(80, "related")}</aside>
        <div id="comments"><h3>Comments</h3>${"<p>A comment on the post that runs to a few words. </p>".repeat(30)}</div>
      </div>
      <footer id="bottom">${links(70, "foot")}</footer>
    </div>
  `;
}

describe("outline of a large page", () => {
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeAll(() => {
    Element.prototype.getBoundingClientRect = function () {
      return { width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  it("returns regions instead of text once the page passes the element threshold", () => {
    largePage();
    const result = runSnapshot({});

    expect(result.totalElements).toBeGreaterThan(DEFAULT_OUTLINE_ELEMENT_THRESHOLD);
    expect(result.outline).toBeDefined();
    const ids = result.outline!.map((region) => region.id);
    expect(ids).toEqual(expect.arrayContaining(["container", "post", "side", "comments", "bottom"]));
    expect(ids).not.toContain("wrap");
    expect(ids).not.toContain("top");
    expect(ids).not.toContain("inner");
    expect(ids).toContain("tools");
    const nav = result.outline!.find((region) => region.tag === "nav")!;
    expect(nav.name).toBe("Site");
    expect(nav.controls).toBe(60);
    expect(result.outline!.map((region) => region.tag)).not.toContain("p");

    const post = result.outline!.find((region) => region.id === "post")!;
    expect(post.tag).toBe("article");
    expect(post.name).toBe("Post title");
    expect(post.chars).toBeGreaterThan(ARTICLE_TEXT.trim().length);
    expect(post.controls).toBe(12);

    const side = result.outline!.find((region) => region.id === "side")!;
    expect(side.controls).toBe(80);
  });

  it("numbers region refs above every element ref and stamps them on the page", () => {
    largePage();
    const result = runSnapshot({});
    const elementRefs = result.items
      .filter((item): item is PageElementItem => item.kind === "element")
      .map((item) => parseInt(item.ref.slice(1), 10));
    const highest = Math.max(...elementRefs);

    for (const region of result.outline!) {
      expect(parseInt(region.ref.slice(1), 10)).toBeGreaterThan(highest);
      expect(document.querySelector(`[${REF_ATTRIBUTE}="${region.ref}"]`)?.id || undefined).toBe(region.id);
    }
    const refs = result.outline!.map((region) => region.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("reads a region by the ref the outline handed out", () => {
    largePage();
    const outline = runSnapshot({}).outline!;
    const post = outline.find((region) => region.id === "post")!;

    const scoped = runSnapshot({ target: { ref: post.ref } });
    expect(scoped.outline).toBeUndefined();
    expect(scoped.scope?.tag).toBe("article");
    const text = scoped.items.map((item) => (item.kind === "text" ? item.text : "")).join(" ");
    expect(text).toContain("The article says something worth reading.");
    expect(text).not.toContain("menu 0");
  });

  it("keeps the whole text when full is forced or the read is scoped", () => {
    largePage();
    const full = runSnapshot({ full: true });
    expect(full.outline).toBeUndefined();
    expect(full.items.length).toBeGreaterThan(200);

    const scoped = runSnapshot({ target: { selector: "#container" } });
    expect(scoped.outline).toBeUndefined();
  });

  it("reaches the landmarks behind a wrapper that holds a single child", () => {
    document.body.innerHTML = `
      <div id="top">
        <header id="head"><script>var logo_img = "https://x/logo.png";</script><span style="display:none">Hidden menu</span>${links(14, "head")}</header>
        <div id="visit"><ul id="visited">${"<li><a href=\"/g\">gallery</a></li>".repeat(50)}</ul></div>
        <div id="wrap_inner">
          <main id="container">
            <section id="left"><article id="issue"><p>${ARTICLE_TEXT}</p></article><article id="list">${links(120, "post")}</article></section>
            <section id="right">${links(30, "side")}</section>
          </main>
        </div>
        <footer id="foot">${links(70, "foot")}</footer>
      </div>
    `;
    const result = runSnapshot({});
    const ids = result.outline!.map((region) => region.id);

    expect(ids).toEqual(expect.arrayContaining(["head", "container", "left", "issue", "list", "right", "foot"]));
    expect(ids).toContain("visited");
    expect(ids).not.toContain("wrap_inner");
    expect(ids).not.toContain("visit");
    const head = result.outline!.find((region) => region.id === "head")!;
    expect(head.name).not.toContain("logo_img");
    expect(head.name).not.toContain("Hidden menu");
    expect(head.name).toContain("head 0");
  });

  it("leaves a small page alone", () => {
    document.body.innerHTML = `<main><h1>Short</h1><p>A few words.</p><a href="/x">x</a></main>`;
    const result = runSnapshot({});
    expect(result.outline).toBeUndefined();
    expect(result.items.length).toBeGreaterThan(0);
  });
});
