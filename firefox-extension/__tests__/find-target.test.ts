import { buildFindCode, FindMatchResult } from "../interaction-scripts";

function find(phrase: string): FindMatchResult[] {
  const code = buildFindCode(phrase, 10);
  return (new Function(`return ${code}`)() as { matches: FindMatchResult[] }).matches;
}

describe("the element a find match points at", () => {
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeAll(() => {
    Element.prototype.getBoundingClientRect = function () {
      return { width: 10, height: 10, top: 0, left: 0, toJSON: () => ({}) } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  it("is the control holding the phrase, not the big block around it", () => {
    const links = Array.from({ length: 30 }, (_, i) => `<a href="/l/${i}">Link ${i}</a>`).join(" ");
    document.body.innerHTML = `<main><button id="city">City: none</button> ${links}</main>`;
    const [match] = find("City");

    expect(match.tag).toBe("button");
    expect(match.controls).toBeUndefined();
    expect(match.moreControls).toBeUndefined();
  });

  it("is a label, carrying only the field it names", () => {
    document.body.innerHTML = `
      <form>
        <label>Email <input id="email" placeholder="you@example.com"></label>
        <label>Password <input type="password"></label>
        <button>Save</button>
      </form>`;
    const [match] = find("Email");

    expect(match.tag).toBe("label");
    expect(match.controls?.map((control) => control.label)).toEqual(['input "Email"']);
  });
});
