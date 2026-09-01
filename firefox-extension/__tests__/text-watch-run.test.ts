import {
  buildTextWatchCode,
  TextWatchOutcome,
  TextWatchResult,
} from "../interaction-scripts";
import { mockBrowser } from "./setup";

const sendMessage = jest.fn();
(mockBrowser.runtime as { sendMessage?: jest.Mock }).sendMessage = sendMessage;

const SETTLE_MS = 800;

function install(
  carried: string | null,
  timeoutMs = 30000,
  selector?: string
): TextWatchResult {
  const code = buildTextWatchCode(
    selector ? { selector } : undefined,
    "token-1",
    carried,
    SETTLE_MS,
    timeoutMs
  );
  return new Function(`return ${code}`)() as TextWatchResult;
}

function outcome(): TextWatchOutcome | null {
  return (window as unknown as { __bcmWatchResult: TextWatchOutcome | null })
    .__bcmWatchResult;
}

const BLOCKS = ["P", "DIV", "LI", "H1", "H2", "H3", "SECTION", "ARTICLE"];

function stubInnerText() {
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) {
      const walk = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
          return node.textContent ?? "";
        }
        const el = node as HTMLElement;
        const inner = Array.from(el.childNodes).map(walk).join("");
        return BLOCKS.includes(el.tagName) ? `\n${inner}\n` : inner;
      };
      return Array.from(this.childNodes)
        .map(walk)
        .join("")
        .replace(/\n{2,}/g, "\n")
        .replace(/^\n|\n$/g, "");
    },
  });
}

function append(parent: Element, text: string) {
  const p = document.createElement("p");
  p.textContent = text;
  parent.appendChild(p);
}

async function samples(count: number) {
  await jest.advanceTimersByTimeAsync(SETTLE_MS * count);
}

describe("text watch script", () => {
  let log: HTMLElement;
  let clock: HTMLElement;

  beforeEach(() => {
    jest.useFakeTimers();
    sendMessage.mockClear();
    stubInnerText();
    document.body.innerHTML = `<div id="log"><p>A: hi</p></div><div id="clock">0</div>`;
    log = document.getElementById("log")!;
    clock = document.getElementById("clock")!;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function tickClock(times: number) {
    for (let tick = 1; tick <= times; tick++) {
      await jest.advanceTimersByTimeAsync(SETTLE_MS / 2);
      clock.textContent = `12:00:${String(tick).padStart(2, "0")}`;
      await jest.advanceTimersByTimeAsync(SETTLE_MS / 2);
    }
  }

  it("reports a new line once it has stood across three samples", async () => {
    const started = install(null);
    expect(started.settled).toBe(false);

    append(log, "B: one");
    await samples(2);
    expect(sendMessage).not.toHaveBeenCalled();

    await samples(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toEqual({
      kind: "page-event",
      channel: "text-change",
      text: "token-1",
    });
    expect(outcome()?.added).toBe("B: one");
  });

  it("never ends on a line the page rewrites every sample", async () => {
    install(null);

    await tickClock(12);

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("keeps out a line that went missing once, even if it stands still after", async () => {
    install(null);
    const cycled = document.createElement("p");
    cycled.textContent = "frame one";
    clock.appendChild(cycled);

    await jest.advanceTimersByTimeAsync(1000);
    cycled.textContent = "frame two";
    await jest.advanceTimersByTimeAsync(500);
    cycled.textContent = "frame one";
    await samples(6);

    expect(sendMessage).not.toHaveBeenCalled();

    append(log, "B: a line that never blinked");
    await samples(3);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(outcome()?.added).toBe("B: a line that never blinked");
  });

  it("ends on the line that stood still and leaves the ticking one out", async () => {
    install(null);

    append(log, "B: hello");
    await tickClock(4);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(outcome()?.added).toBe("B: hello");
  });

  it("waits out a line that is still growing, then reports it whole", async () => {
    install(null);
    append(log, "B: ");
    const answer = log.querySelector("p:last-child")!;

    for (const word of ["one", " two", " three"]) {
      answer.textContent += word;
      await samples(1);
    }
    expect(sendMessage).not.toHaveBeenCalled();

    await samples(3);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(outcome()?.added).toBe("B: one two three");
  });

  it("reports a line the page took away", async () => {
    install(null);

    log.querySelector("p")!.remove();
    await samples(3);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(outcome()).toMatchObject({ added: "", removed: "A: hi" });
  });

  it("answers at once for a zero timeout, without watching", async () => {
    const started = install("A: hi\n0", 0);

    expect(started.settled).toBe(true);
    expect(started.added).toBe("");
    append(log, "B: one");
    await samples(6);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("carries the added line straight out of a zero timeout", () => {
    append(log, "B: one");

    const started = install("A: hi\n0", 0);

    expect(started.settled).toBe(true);
    expect(started.added).toBe("B: one");
  });

  it("ignores a clock outside the watched element", async () => {
    install(null, 30000, "#log");

    await tickClock(6);
    expect(sendMessage).not.toHaveBeenCalled();

    append(log, "B: finally");
    await samples(3);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(outcome()?.added).toBe("B: finally");
  });

  it("notices a scope element the page replaced wholesale", async () => {
    install(null, 30000, "#log");

    const fresh = document.createElement("div");
    fresh.id = "log";
    fresh.innerHTML = "<p>A: hi</p><p>B: rendered anew</p>";
    log.replaceWith(fresh);
    await samples(3);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(outcome()?.added).toBe("B: rendered anew");
  });
});
