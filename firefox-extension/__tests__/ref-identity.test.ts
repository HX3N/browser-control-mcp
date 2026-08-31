import { buildSnapshotCode } from "../page-snapshot";
import { ELEMENT_RESOLVER_SOURCE, REF_ATTRIBUTE } from "../injected-common";
import type { ElementTarget } from "@browser-control-mcp/common";

interface Resolved {
  text: string;
  tag: string;
}

function snapshot(target?: ElementTarget): { ref: string; name: string }[] {
  const code = buildSnapshotCode({
    maxElements: 200,
    includeHidden: false,
    target,
  });
  const result = new Function(`return ${code}`)() as {
    items: ({ kind: "element"; ref: string; name: string } | { kind: "text" })[];
  };
  return result.items.filter(
    (item): item is { kind: "element"; ref: string; name: string } =>
      item.kind === "element"
  );
}

function resolve(ref: string): Resolved {
  const code = `(function () {
${ELEMENT_RESOLVER_SOURCE}
  var el = __bcmResolve({ ref: ${JSON.stringify(ref)} });
  return { text: el.textContent, tag: el.tagName.toLowerCase() };
})();`;
  return new Function(`return ${code}`)() as Resolved;
}

function refOf(name: string): string {
  const element = Array.from(document.querySelectorAll("a")).find(
    (candidate) => candidate.textContent === name
  );
  return element?.getAttribute(REF_ATTRIBUTE) ?? "";
}

describe("ref identity", () => {
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
    delete (window as unknown as { __bcmRefs?: unknown }).__bcmRefs;
    document.body.innerHTML = `
      <nav>
        <ul>
          <li><a href="https://gall.dcinside.com/">갤러리</a></li>
          <li><a href="https://gall.dcinside.com/m">마이너갤</a></li>
        </ul>
      </nav>
      <div class="gall_list">
        <a href="/board/view/?no=1">first post</a>
        <a href="/board/view/?no=2">second post</a>
      </div>`;
  });

  it("resolves a ref to the element it was stamped on", () => {
    snapshot();

    expect(resolve(refOf("마이너갤")).text).toBe("마이너갤");
  });

  it("refuses a ref the page copied onto another element", () => {
    snapshot();
    const minor = refOf("마이너갤");
    const nav = document.querySelector("ul") as HTMLElement;

    nav.innerHTML = nav.innerHTML;

    expect(document.querySelectorAll(`[${REF_ATTRIBUTE}="${minor}"]`)).toHaveLength(1);
    expect(() => resolve(minor)).toThrow(/has left the page/);
  });

  it("refuses a ref that more than one element carries", () => {
    snapshot();
    const minor = refOf("마이너갤");
    const copy = document
      .querySelector(`[${REF_ATTRIBUTE}="${minor}"]`)!
      .cloneNode(true);
    document.querySelector("ul")!.appendChild(copy);
    delete (window as unknown as { __bcmRefs?: unknown }).__bcmRefs;

    expect(() => resolve(minor)).toThrow(/stamped on 2 elements/);
  });

  it("falls back to the attribute when the identity map is gone", () => {
    snapshot();
    const minor = refOf("마이너갤");
    delete (window as unknown as { __bcmRefs?: unknown }).__bcmRefs;

    expect(resolve(minor).text).toBe("마이너갤");
  });

  it("keeps a ref outside a scoped snapshot pointing at the same element", () => {
    snapshot();
    const minor = refOf("마이너갤");

    const scoped = snapshot({ selector: ".gall_list" });

    expect(scoped.map((element) => element.ref)).not.toContain(minor);
    expect(resolve(minor).text).toBe("마이너갤");
  });

  it("keeps the ref the element a scoped snapshot starts from already carries", () => {
    snapshot();
    const before = refOf("마이너갤");

    const scoped = snapshot({ ref: before });

    expect(scoped[0].ref).toBe(before);
    expect(resolve(before).text).toBe("마이너갤");
  });

  it("hands an element the same ref on every later read", () => {
    const first = snapshot();

    document.querySelector(".gall_list")!.insertAdjacentHTML(
      "beforeend",
      `<a href="/board/view/?no=3">third post</a>`
    );
    const second = snapshot();

    for (const element of first) {
      expect(second.find((later) => later.name === element.name)?.ref).toBe(
        element.ref
      );
    }
    expect(second).toHaveLength(first.length + 1);
  });

  it("never hands a number twice, so a ref goes stale instead of changing meaning", () => {
    const first = snapshot();
    const dropped = first[first.length - 1].ref;
    document.querySelector(".gall_list")!.lastElementChild!.remove();

    snapshot();
    document.querySelector(".gall_list")!.insertAdjacentHTML(
      "beforeend",
      `<a href="/board/view/?no=9">late post</a>`
    );
    const third = snapshot();

    expect(third.map((element) => element.ref)).not.toContain(dropped);
    expect(() => resolve(dropped)).toThrow(/No element carries ref/);
  });
});
