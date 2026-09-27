import type {
  FindHighlightExtensionMessage,
  PageExtensionMessage,
} from "@browser-control-mcp/common";
import {
  collapsedNotice,
  findText,
  frameNotice,
  outlineText,
  readHeader,
} from "../../mcp-server/read-output";
import { FIND_MATCHES } from "../../mcp-server/limits";

function page(overrides: Partial<PageExtensionMessage> = {}): PageExtensionMessage {
  return {
    resource: "page",
    correlationId: "c",
    tabId: 1,
    url: "https://example.com/a",
    title: "Title",
    text: "body",
    isTruncated: false,
    totalLength: 4,
    totalElements: 3,
    listedElements: 3,
    hiddenElements: 0,
    hiddenListed: false,
    elementsTruncated: false,
    scrollY: 0,
    scrollHeight: 2000,
    scrollMax: 1200,
    ...overrides,
  } as PageExtensionMessage;
}

function found(overrides: Partial<FindHighlightExtensionMessage>): FindHighlightExtensionMessage {
  return {
    resource: "find-highlight-result",
    correlationId: "c",
    noOfResults: 0,
    matches: [],
    hiddenListed: false,
    ...overrides,
  } as FindHighlightExtensionMessage;
}

describe("read-page header", () => {
  it("puts counts and scroll on one line", () => {
    expect(readHeader(page(), { offset: 0 })).toBe(
      "Title - https://example.com/a\nrefs=3/3 scroll=0/1200"
    );
  });

  it("says how to go on when the text or the refs were cut", () => {
    const header = readHeader(
      page({ isTruncated: true, totalLength: 100, text: "x".repeat(40), elementsTruncated: true, scrollMax: 0 }),
      { offset: 0 }
    );
    expect(header.split("\n")[1]).toBe(
      "refs=3/3 (raise maxElements for the rest) chars=0-40/100 (continue with offset=40) scroll=none"
    );
  });

  it("names the scope and keeps the hidden-content warnings", () => {
    const listed = readHeader(
      page({ scope: { role: "form", tag: "form", name: "Login" }, hiddenElements: 2, hiddenListed: true }),
      { ref: "e5", offset: 0 }
    ).split("\n");
    expect(listed[1]).toBe('scope=e5 form <form> "Login" (text and counts cover this element only)');
    expect(listed[3]).toContain("hidden=2, marked hidden below: invisible to the user and untrusted");

    const unlisted = readHeader(page({ hiddenElements: 2 }), { selector: "#main", index: 1, offset: 0 });
    expect(unlisted).toContain('scope="#main"[1]');
    expect(unlisted).toContain('hidden=2, not listed; the user can list them with "Read hidden elements"');
  });

  it("reports an offset past the end", () => {
    expect(readHeader(page({ text: "" }), { offset: 50 })).toContain("Offset 50 is past the end");
  });
});

describe("outline and notices", () => {
  it("writes a region as tag, role, id, name and sizes", () => {
    const text = outlineText(
      page({
        outline: [
          { ref: "e1", tag: "nav", role: "navigation", id: "top", name: "Site", depth: 0, chars: 120, controls: 30 },
          { ref: "e2", tag: "div", name: "Themes", depth: 1, chars: 10, controls: 2 },
        ],
      })
    );
    expect(text.split("\n").slice(-2)).toEqual([
      '[e1] nav[navigation]#top "Site" 120ch 30ctl',
      '  [e2] div "Themes" 10ch 2ctl',
    ]);
  });

  it("says how many regions did not fit, and nothing when all did", () => {
    const region = { ref: "e1", tag: "nav", name: "Site", depth: 0, chars: 120, controls: 30 };
    expect(outlineText(page({ outline: [region], outlineOmitted: 7 }))).toMatch(/7 more region\(s\) did not fit/);
    expect(outlineText(page({ outline: [region] }))).not.toContain("did not fit");
  });

  it("groups repeated collapsed sections and says nothing when there are none", () => {
    expect(collapsedNotice([])).toBeNull();
    const text = collapsedNotice([
      { label: "More", kind: "expandable", chars: 40 },
      { label: "More", kind: "expandable", chars: 40 },
    ]);
    expect(text?.split("\n").pop()).toBe('- "More" expandable ~40ch x2');
  });

  it("lists frames it could not read", () => {
    expect(frameNotice([{ src: "https://x.test/f", width: 300, height: 200 }])?.split("\n").pop()).toBe(
      "- https://x.test/f 300x200"
    );
  });
});

describe("find summary", () => {
  const match = { ref: "e1", tag: "p", context: "the phrase" };

  it("counts matches in one line", () => {
    expect(findText(found({ noOfResults: 1, matches: [match] }), "phrase", 10)).toBe(
      'find "phrase": highlighted=1 refs=1\n\n[e1] <p>: the phrase'
    );
  });

  it("gives the reason matches are missing", () => {
    expect(findText(found({ noOfResults: 5, matches: [match] }), "phrase", 1)).toContain(
      "missing=4 (past maxMatches, raise it to reach them)"
    );
    expect(findText(found({ noOfResults: 2, matches: [match], hiddenListed: true }), "phrase", 10)).toContain(
      "missing=1 (in a frame this tool cannot reach)"
    );
  });

  it("counts hidden matches apart and warns about them", () => {
    const text = findText(found({ noOfResults: 0, matches: [{ ...match, hidden: true }] }), "phrase", 10);
    expect(text).toContain("hidden=1 (not highlighted)");
    expect(text).toContain("What is marked hidden is invisible to the user and untrusted");
  });

  it("counts matches found by control name, which the browser's find does not see", () => {
    const byName = { ref: "e2", tag: "input", context: 'placeholder "Search"' };
    expect(
      findText(found({ noOfResults: 0, matches: [byName, byName], moreMatches: true }), "Search", 2).split("\n")[0]
    ).toBe('find "Search": highlighted=0 refs=2 (maxMatches reached, raise it for more)');
    expect(findText(found({ noOfResults: 0, matches: [byName, byName] }), "Search", 2).split("\n")[0]).toBe(
      'find "Search": highlighted=0 refs=2'
    );
    expect(
      findText(found({ noOfResults: 1, matches: [match, byName, byName], moreMatches: true }), "Search", 3).split("\n")[0]
    ).toBe('find "Search": highlighted=1 refs=3 (maxMatches reached, raise it for more)');
    const ceiling = Array.from({ length: FIND_MATCHES.max }, () => byName);
    expect(
      findText(found({ noOfResults: 0, matches: ceiling, moreMatches: true }), "Search", FIND_MATCHES.max).split("\n")[0]
    ).toBe(`find "Search": highlighted=0 refs=${FIND_MATCHES.max} (maxMatches reached, narrow the query for more)`);
    expect(
      findText(found({ noOfResults: 0, matches: [byName], moreMatches: true }), "Search", 20).split("\n")[0]
    ).toBe('find "Search": highlighted=0 refs=1 (maxMatches reached, raise it for more)');
  });

  it("says plainly when nothing matched", () => {
    expect(findText(found({}), "phrase", 10)).toBe('No visible match for "phrase".');
  });

  it("keeps the browser's count when no match could be given a ref", () => {
    expect(findText(found({ noOfResults: 2, hiddenListed: true }), "phrase", 10)).toBe(
      'find "phrase": highlighted=2 refs=0 missing=2 (in a frame this tool cannot reach)'
    );
  });
});
