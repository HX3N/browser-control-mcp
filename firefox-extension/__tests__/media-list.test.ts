import { buildMediaListCode, MediaListResult } from "../interaction-scripts";

function listMedia(includeHidden = false): MediaListResult {
  const code = buildMediaListCode(undefined, includeHidden);
  return new Function(`return ${code}`)() as MediaListResult;
}

describe("media list script", () => {
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
    document.body.innerHTML = `
      <img src="https://example.com/ghost.png" style="display:none" alt="ghost">
      <img src="https://example.com/shown.png" alt="shown">
    `;
  });

  it("counts hidden media without listing it", () => {
    const media = listMedia();

    expect(media.items.map((item) => item.alt)).toEqual(["shown"]);
    expect(media.hiddenItems).toBe(1);
    expect(media.totalItems).toBe(1);
  });

  it("lists hidden media after the visible items, marked hidden, when asked to", () => {
    const media = listMedia(true);

    expect(media.items.map((item) => [item.alt, item.hidden])).toEqual([
      ["shown", undefined],
      ["ghost", true],
    ]);
    expect(media.hiddenItems).toBe(1);
    expect(media.totalItems).toBe(2);
  });
});
