import { buildFindCode, FindMatchResult } from "../interaction-scripts";
import { buildSnapshotCode } from "../page-snapshot";
import { ELEMENT_RESOLVER_SOURCE, REF_ATTRIBUTE } from "../injected-common";

function find(phrase: string, max = 10): FindMatchResult[] {
  const code = buildFindCode(phrase, max);
  return (new Function(`return ${code}`)() as { matches: FindMatchResult[] })
    .matches;
}

function resolve(ref: string): string {
  const code = `(function () {
${ELEMENT_RESOLVER_SOURCE}
  return __bcmResolve({ ref: ${JSON.stringify(ref)} }).id;
})();`;
  return new Function(`return ${code}`)() as string;
}

describe("find script", () => {
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeAll(() => {
    Element.prototype.getBoundingClientRect = function () {
      return { width: 10, height: 10, top: 0, left: 0, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  beforeEach(() => {
    delete (window as unknown as { __bcmRefs?: unknown }).__bcmRefs;
    document.body.innerHTML = `
      <div id="c1" class="comment"><p>Looks good to me.</p><button>Edit</button></div>
      <div id="c2" class="comment"><p>Confirmed on <b>KR</b>: level was missing.</p><button>Edit</button></div>
      <div id="c3" class="comment"><p>Thanks!</p></div>
    `;
  });

  it("stamps a ref on the block that holds the phrase and returns the text around it", () => {
    const matches = find("level was missing");

    expect(matches).toHaveLength(1);
    expect(matches[0].tag).toBe("p");
    expect(matches[0].context).toContain("Confirmed on KR: level was missing.");
    expect(document.querySelector(`[${REF_ATTRIBUTE}="${matches[0].ref}"]`)?.closest(".comment")?.id).toBe("c2");
  });

  it("matches across inline elements", () => {
    expect(find("on KR: level")).toHaveLength(1);
  });

  it("numbers new refs above the ones a read already stamped, and keeps those", () => {
    new Function(`return ${buildSnapshotCode({ maxElements: 200, includeHidden: false })}`)();
    const stampedBefore = document.querySelectorAll(`[${REF_ATTRIBUTE}]`).length;

    const matches = find("Thanks");

    expect(matches[0].ref).toBe(`e${stampedBefore + 1}`);
    expect(document.querySelectorAll(`[${REF_ATTRIBUTE}]`)).toHaveLength(stampedBefore + 1);
    expect(resolve(matches[0].ref)).toBe("");
  });

  it("returns every occurrence up to the limit", () => {
    expect(find("Edit", 10)).toHaveLength(2);
    expect(find("Edit", 1)).toHaveLength(1);
  });

  it("leaves out text the page does not render", () => {
    document.body.innerHTML = `<p style="display:none">secret phrase</p><script>var s = "secret phrase";</script>`;

    expect(find("secret phrase")).toHaveLength(0);
  });
});
