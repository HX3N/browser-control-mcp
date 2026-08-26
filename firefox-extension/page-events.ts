export type PageEventChannel = "dialog" | "console" | "guard" | "text-change";

export interface PageEventMessage {
  kind: "page-event";
  channel: PageEventChannel;
  text: string;
  id?: string;
}

export interface DrainedPageEvents {
  dialogs: string[];
  console: string[];
}

const MAX_EVENTS_PER_TAB = 40;
const MAX_IDS_PER_TAB = 200;

interface PageEvent {
  channel: PageEventChannel;
  text: string;
}

const byTabId = new Map<number, PageEvent[]>();
const guardedByTabId = new Map<number, Set<string>>();
const committedByTabId = new Map<number, string[]>();
const seenIdsByTabId = new Map<number, Set<string>>();

export function isPageEventMessage(
  message: unknown
): message is PageEventMessage {
  const candidate = message as PageEventMessage | undefined;
  return (
    !!candidate &&
    candidate.kind === "page-event" &&
    (candidate.channel === "dialog" ||
      candidate.channel === "console" ||
      candidate.channel === "guard" ||
      candidate.channel === "text-change") &&
    typeof candidate.text === "string"
  );
}

// A report the guard could not get an answer for is handed to the next document and sent again,
// so the same event can arrive twice under one id.
function isRepeat(tabId: number, id: string | undefined): boolean {
  if (!id) {
    return false;
  }
  const seen = seenIdsByTabId.get(tabId) ?? new Set<string>();
  if (seen.has(id)) {
    return true;
  }
  seen.add(id);
  while (seen.size > MAX_IDS_PER_TAB) {
    const oldest = seen.values().next().value;
    if (oldest === undefined) {
      break;
    }
    seen.delete(oldest);
  }
  seenIdsByTabId.set(tabId, seen);
  return false;
}

export function recordPageEvent(
  tabId: number,
  channel: PageEventChannel,
  text: string,
  id?: string
): void {
  if (isRepeat(tabId, id)) {
    return;
  }
  if (channel === "guard") {
    noteGuardedDocument(tabId, text);
    return;
  }
  if (channel === "text-change") {
    resolveTextWait(tabId, "changed", text);
    return;
  }
  const events = byTabId.get(tabId) ?? [];
  events.push({ channel, text });
  while (events.length > MAX_EVENTS_PER_TAB) {
    events.shift();
  }
  byTabId.set(tabId, events);
}

export function noteGuardedDocument(tabId: number, url: string): void {
  const guarded = guardedByTabId.get(tabId) ?? new Set<string>();
  guarded.add(url);
  guardedByTabId.set(tabId, guarded);
}

export type TextWaitOutcome = "changed" | "navigated" | "timeout";

interface TextWaiter {
  token: string;
  settle: (outcome: TextWaitOutcome) => void;
}

const textWaiterByTabId = new Map<number, TextWaiter>();

export function awaitTextChange(
  tabId: number,
  token: string,
  timeoutMs: number
): Promise<TextWaitOutcome> {
  textWaiterByTabId.get(tabId)?.settle("timeout");
  return new Promise<TextWaitOutcome>((resolve) => {
    const timer = setTimeout(() => {
      textWaiterByTabId.delete(tabId);
      resolve("timeout");
    }, timeoutMs);
    textWaiterByTabId.set(tabId, {
      token,
      settle: (outcome) => {
        clearTimeout(timer);
        textWaiterByTabId.delete(tabId);
        resolve(outcome);
      },
    });
  });
}

export function resolveTextWait(
  tabId: number,
  outcome: TextWaitOutcome,
  token?: string
): void {
  const waiter = textWaiterByTabId.get(tabId);
  if (!waiter) {
    return;
  }
  // A watcher left behind by an earlier wait can still report from the same tab.
  if (token !== undefined && token !== waiter.token) {
    return;
  }
  waiter.settle(outcome);
}

export function noteCommittedDocument(tabId: number, url: string): void {
  const committed = committedByTabId.get(tabId) ?? [];
  if (committed.indexOf(url) === -1) {
    committed.push(url);
  }
  committedByTabId.set(tabId, committed);
}

export function takeUnguardedDocuments(tabId: number): string[] {
  const committed = committedByTabId.get(tabId) ?? [];
  const guarded = guardedByTabId.get(tabId) ?? new Set<string>();
  committedByTabId.delete(tabId);
  guardedByTabId.delete(tabId);
  return committed.filter((url) => !guarded.has(url));
}

export function drainPageEvents(tabId: number): DrainedPageEvents {
  const events = byTabId.get(tabId);
  byTabId.delete(tabId);
  if (!events) {
    return { dialogs: [], console: [] };
  }
  return {
    dialogs: events.filter((e) => e.channel === "dialog").map((e) => e.text),
    console: events.filter((e) => e.channel === "console").map((e) => e.text),
  };
}

export function forgetPageEvents(tabId: number): void {
  resolveTextWait(tabId, "timeout");
  byTabId.delete(tabId);
  guardedByTabId.delete(tabId);
  committedByTabId.delete(tabId);
  seenIdsByTabId.delete(tabId);
}
