import { buildFindCode, FindMatchResult } from "../interaction-scripts";

function find(phrase: string): FindMatchResult[] {
  const code = buildFindCode(phrase, 10);
  return (new Function(`return ${code}`)() as { matches: FindMatchResult[] }).matches;
}

const originalRect = Element.prototype.getBoundingClientRect;

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { width: 10, height: 10, top: 0, left: 0, toJSON: () => ({}) } as DOMRect;
  };
});

afterAll(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

describe("the element a find match points at", () => {
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

describe("matches found by control name", () => {
  function findNamed(maxMatches: number): { matches: FindMatchResult[]; more?: boolean } {
    return new Function(`return ${buildFindCode("Search", maxMatches, false, false, true)}`)();
  }

  beforeEach(() => {
    document.body.innerHTML = `<input placeholder="Search"><input placeholder="Search"><input placeholder="Search">`;
  });

  it("says more are left only when one was left past maxMatches", () => {
    expect(findNamed(2)).toMatchObject({ more: true });
    expect(findNamed(2).matches).toHaveLength(2);
    expect(findNamed(3).more).toBe(false);
  });

  it("reports one more past the budget, even a budget of none", () => {
    expect(findNamed(0)).toEqual({ matches: [], more: true });
  });

  it("leaves control names alone in the text pass", () => {
    expect(new Function(`return ${buildFindCode("Search", 10)}`)()).toEqual({ matches: [], more: false });
  });
});

describe("matches found in rendered text", () => {
  it("says more are left only when one was left past maxMatches", () => {
    document.body.innerHTML = `<p>one Search</p><p>two Search</p><p>three Search</p>`;
    const found = (max: number) => new Function(`return ${buildFindCode("Search", max)}`)();
    expect(found(2)).toMatchObject({ more: true });
    expect(found(3).more).toBe(false);
  });
});
