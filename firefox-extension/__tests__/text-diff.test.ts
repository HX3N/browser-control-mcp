import { diffText } from "../text-diff";

describe("diffText", () => {
  it("returns what was appended at the end", () => {
    expect(diffText("A: hi", "A: hi\n\nB: hello")).toMatchObject({
      added: "B: hello",
      removed: 0,
    });
  });

  it("returns a line inserted before text that stays put", () => {
    const before = "log\n\nA: hi\n\nSend\nfooter";
    const after = "log\n\nA: hi\n\nB: hello\n\nSend\nfooter";
    expect(diffText(before, after)).toMatchObject({ added: "B: hello", removed: 0 });
  });

  it("returns a line inserted at the top", () => {
    expect(diffText("A: hi\nfooter", "older\nA: hi\nfooter")).toMatchObject({
      added: "older",
      removed: 0,
    });
  });

  it("reports how much old text is gone when the middle was replaced", () => {
    const before = "head\nold one\nold two\nfoot";
    const after = "head\nnew\nfoot";
    expect(diffText(before, after)).toMatchObject({
      added: "new",
      removed: "old one\nold two".length,
    });
  });

  it("reports nothing added when text was only removed", () => {
    expect(diffText("head\ngone\nfoot", "head\nfoot")).toMatchObject({
      added: "",
      removed: "gone".length,
    });
  });

  it("treats a line that only grew as an addition", () => {
    expect(diffText("head\nfeed idle", "head\nfeed idle message 1 arrived")).toMatchObject({
      added: "message 1 arrived",
      removed: 0,
    });
  });

  it("is empty for identical text", () => {
    expect(diffText("same", "same")).toMatchObject({ added: "", removed: 0 });
  });

  it("keeps a new line that repeats one the page already showed", () => {
    const before = "A: hi\n\nB: got it\n\ncomposer";
    const after =
      "A: hi\n\nB: got it\n\nA: again\n\nB: got it\n\ncomposer";
    expect(diffText(before, after)).toMatchObject({
      added: "A: again\n\nB: got it",
      removed: 0,
    });
  });

  it("reports new lines in the order the page shows them", () => {
    const before = "A: hello\nB is typing...\nA: one\nB: got it";
    const after =
      "A: hello\nB is typing.\nA: one\nB: got it\nA: two\nB: got it";
    expect(diffText(before, after).added).toContain("A: two\nB: got it");
  });

  it("leaves the untouched middle out when noise sits above it", () => {
    const before = "clock 1\n\nA: hi\n\nB: reply\n\nfooter";
    const after =
      "clock 2\n\nA: hi\n\nB: reply\n\nA: new\n\nfooter";
    const diff = diffText(before, after);
    expect(diff.added).toContain("clock 2");
    expect(diff.added).toContain("A: new");
    expect(diff.added).not.toContain("B: reply");
  });

  it("measures delta by the characters that moved, not by whole lines", () => {
    expect(diffText("B is typing..", "B is typing.").delta).toBe(1);
    expect(diffText("A: hi", "A: hi\n\nB: hello").delta).toBe(
      "\nB: hello".length
    );
  });
});
