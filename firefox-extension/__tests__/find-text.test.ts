import { buildFindCode, FindMatchResult } from "../interaction-scripts";
import { buildSnapshotCode } from "../page-snapshot";
import { ELEMENT_RESOLVER_SOURCE, REF_ATTRIBUTE } from "../injected-common";

function find(phrase: string, max = 10, includeHidden = false): FindMatchResult[] {
  const code = buildFindCode(phrase, max, includeHidden);
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

  it("returns the controls inside the block, stamped with refs of their own", () => {
    document.body.innerHTML = `
      <div class="row">Row for KR <button>Edit</button><a href="/x">Reply</a><button style="display:none">Hidden</button></div>
    `;

    const match = find("Row for KR")[0];

    expect(match.tag).toBe("div");
    expect(match.controls?.map((control) => control.label.split(" ")[0])).toEqual(["button", "a"]);
    expect(match.moreControls).toBeUndefined();
    expect(document.querySelector("button")?.getAttribute(REF_ATTRIBUTE)).toBe(match.controls![0].ref);
    expect(match.controls![0].ref).not.toBe(match.ref);
  });

  it("leaves the controls out when the block holds none", () => {
    expect(find("level was missing")[0].controls).toBeUndefined();
  });

  it("leaves out a control the page hides from the user", () => {
    document.body.innerHTML = `
      <div class="row">Row for KR <button aria-hidden="true">Ghost</button><button>Edit</button></div>
    `;

    expect(find("Row for KR")[0].controls?.map((control) => control.label)).toHaveLength(1);
  });

  it("does not list the block itself when the block is the control", () => {
    document.body.innerHTML = `
      <div role="button">Row for KR <span>with a span</span></div>
    `;

    const match = find("Row for KR")[0];

    expect(match.tag).toBe("div");
    expect(match.controls).toBeUndefined();
  });

  it("caps the controls at twelve and counts the rest", () => {
    const buttons = Array.from({ length: 14 }, (_, i) => `<button>B${i}</button>`).join("");
    document.body.innerHTML = `<div class="row">Row for KR ${buttons}</div>`;

    const match = find("Row for KR")[0];

    expect(match.controls).toHaveLength(12);
    expect(match.moreControls).toBe(2);
  });

  it("does not match text the page hides from the user", () => {
    document.body.innerHTML = `
      <p>Ghosted KR phrase</p>
      <p aria-hidden="true">Ghosted KR phrase</p>
      <p style="display:none">Ghosted KR phrase</p>
      <p style="visibility:hidden">Ghosted KR phrase</p>
      <p style="opacity:0">Ghosted KR phrase</p>
    `;

    expect(find("Ghosted KR phrase")).toHaveLength(1);
  });

  it("lists hidden matches after the visible ones, marked hidden, when asked to", () => {
    document.body.innerHTML = `
      <p style="display:none">Ghosted KR phrase <button style="display:none">Ghost</button></p>
      <p>Ghosted KR phrase <button>Edit</button><button aria-hidden="true">Spectre</button></p>
    `;

    const matches = find("Ghosted KR phrase", 10, true);

    expect(matches.map((match) => match.hidden)).toEqual([undefined, true]);
    expect(matches[0].controls?.map((control) => [control.label.split(" ")[0], control.hidden])).toEqual([
      ["button", undefined],
      ["button", true],
    ]);
    expect(matches[1].controls?.[0].hidden).toBe(true);
  });

  it("truncates hidden matches before visible ones", () => {
    document.body.innerHTML = `
      <p style="display:none">Ghosted KR phrase</p>
      <p>Ghosted KR phrase</p>
    `;

    const matches = find("Ghosted KR phrase", 1, true);

    expect(matches).toHaveLength(1);
    expect(matches[0].hidden).toBeUndefined();
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
