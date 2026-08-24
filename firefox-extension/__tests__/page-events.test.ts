import {
  drainPageEvents,
  forgetPageEvents,
  isPageEventMessage,
  noteCommittedDocument,
  recordPageEvent,
  takeUnguardedDocuments,
} from "../page-events";

describe("page events", () => {
  afterEach(() => {
    forgetPageEvents(1);
    forgetPageEvents(2);
  });

  it("keeps dialogs and console lines apart", () => {
    recordPageEvent(1, "dialog", "alert: gone");
    recordPageEvent(1, "console", "console.error: boom");

    expect(drainPageEvents(1)).toEqual({
      dialogs: ["alert: gone"],
      console: ["console.error: boom"],
    });
  });

  it("survives the document that produced it", () => {
    recordPageEvent(1, "dialog", "alert: raised before the redirect");
    recordPageEvent(1, "dialog", "alert: raised after it");

    expect(drainPageEvents(1).dialogs).toEqual([
      "alert: raised before the redirect",
      "alert: raised after it",
    ]);
  });

  it("empties on drain so one command never reports another's events", () => {
    recordPageEvent(1, "dialog", "alert: once");

    expect(drainPageEvents(1).dialogs).toHaveLength(1);
    expect(drainPageEvents(1).dialogs).toHaveLength(0);
  });

  it("keeps tabs separate", () => {
    recordPageEvent(1, "console", "first tab");
    recordPageEvent(2, "console", "second tab");

    expect(drainPageEvents(1).console).toEqual(["first tab"]);
    expect(drainPageEvents(2).console).toEqual(["second tab"]);
  });

  it("drops the oldest lines rather than growing without a bound", () => {
    for (let i = 0; i < 60; i += 1) {
      recordPageEvent(1, "console", `line ${i}`);
    }

    const drained = drainPageEvents(1).console;
    expect(drained).toHaveLength(40);
    expect(drained[0]).toBe("line 20");
    expect(drained[drained.length - 1]).toBe("line 59");
  });

  it("forgets a closed tab", () => {
    recordPageEvent(1, "dialog", "alert: stale");
    forgetPageEvents(1);

    expect(drainPageEvents(1).dialogs).toHaveLength(0);
  });

  it("keeps a guard announcement out of the console channel", () => {
    recordPageEvent(1, "guard", "https://example.com/");

    expect(drainPageEvents(1)).toEqual({ dialogs: [], console: [] });
  });

  it("names the documents that committed without a guard", () => {
    noteCommittedDocument(1, "https://example.com/first");
    noteCommittedDocument(1, "https://example.com/second");
    recordPageEvent(1, "guard", "https://example.com/second");

    expect(takeUnguardedDocuments(1)).toEqual(["https://example.com/first"]);
  });

  it("starts a fresh comparison once it has been read", () => {
    noteCommittedDocument(1, "https://example.com/first");
    takeUnguardedDocuments(1);

    expect(takeUnguardedDocuments(1)).toEqual([]);
  });

  it("drops a report that arrives twice under one id", () => {
    recordPageEvent(1, "dialog", "alert: said once", "g1:1");
    recordPageEvent(1, "dialog", "alert: said once", "g1:1");

    expect(drainPageEvents(1).dialogs).toEqual(["alert: said once"]);
  });

  it("keeps two reports that only look alike", () => {
    recordPageEvent(1, "dialog", "alert: twice", "g1:1");
    recordPageEvent(1, "dialog", "alert: twice", "g1:2");

    expect(drainPageEvents(1).dialogs).toHaveLength(2);
  });

  it("only accepts messages that carry a channel and text", () => {
    expect(
      isPageEventMessage({ kind: "page-event", channel: "dialog", text: "x" })
    ).toBe(true);
    expect(isPageEventMessage({ kind: "get-status" })).toBe(false);
    expect(
      isPageEventMessage({ kind: "page-event", channel: "guard", text: "x" })
    ).toBe(true);
    expect(
      isPageEventMessage({ kind: "page-event", channel: "other", text: "x" })
    ).toBe(false);
    expect(isPageEventMessage(undefined)).toBe(false);
  });
});
