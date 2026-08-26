import { buildTextWatchCode, TextWatchResult } from "../interaction-scripts";
import { mockBrowser } from "./setup";

const sendMessage = jest.fn();
(mockBrowser.runtime as { sendMessage?: jest.Mock }).sendMessage = sendMessage;

function install(
  carried: string | null,
  timeoutMs = 30000,
  selector?: string,
  minChars = 0
): TextWatchResult {
  const code = buildTextWatchCode(
    selector ? { selector } : undefined,
    "token-1",
    carried,
    800,
    timeoutMs,
    minChars
  );
  return new Function(`return ${code}`)() as TextWatchResult;
}

function stubInnerText() {
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get() {
      return (this as HTMLElement).textContent ?? "";
    },
  });
}

function append(parent: Element, text: string) {
  const p = document.createElement("p");
  p.textContent = text;
  parent.appendChild(p);
}

describe("text watch script", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    sendMessage.mockClear();
    stubInnerText();
    document.body.innerHTML = `<div id="log"><p>A: hi</p></div><div id="clock">0</div>`;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("reports once the text has been still for settleMs", async () => {
    const result = install(null);
    expect(result.settled).toBe(false);

    append(document.getElementById("log")!, "B: one");
    await jest.advanceTimersByTimeAsync(500);
    append(document.getElementById("log")!, "B: two");
    await jest.advanceTimersByTimeAsync(500);
    expect(sendMessage).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(400);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toEqual({
      kind: "page-event",
      channel: "text-change",
      text: "token-1",
    });
  });

  it("waits out the settle window even when the carried baseline already differs", async () => {
    const result = install("A: hi");
    append(document.getElementById("log")!, "B: late");
    expect(result.settled).toBe(false);

    await jest.advanceTimersByTimeAsync(700);
    expect(sendMessage).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(200);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("installs nothing for a zero timeout", async () => {
    const result = install("A: hi", 0);
    expect(result.settled).toBe(true);
    append(document.getElementById("log")!, "B: one");
    await jest.advanceTimersByTimeAsync(5000);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("notices a scope element the page replaced wholesale", async () => {
    install(null, 30000, "#log");
    const fresh = document.createElement("div");
    fresh.id = "log";
    fresh.innerHTML = "<p>A: hi</p><p>B: rendered anew</p>";
    document.getElementById("log")!.replaceWith(fresh);

    await jest.advanceTimersByTimeAsync(900);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting through a change smaller than minChars, then reports once they add up", async () => {
    install(null, 30000, "#log", 20);
    const log = document.getElementById("log")!;

    log.querySelector("p")!.textContent = "A: ho";
    await jest.advanceTimersByTimeAsync(900);
    expect(sendMessage).not.toHaveBeenCalled();

    append(log, "B: a whole sentence that clears the threshold");
    await jest.advanceTimersByTimeAsync(900);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("ignores mutation outside the scope, and keeps listening after the ceiling", async () => {
    install(null, 30000, "#log");
    const clock = document.getElementById("clock")!;
    for (let tick = 1; tick <= 20; tick++) {
      clock.textContent = String(tick);
      await jest.advanceTimersByTimeAsync(300);
    }
    expect(sendMessage).not.toHaveBeenCalled();

    append(document.getElementById("log")!, "B: finally");
    await jest.advanceTimersByTimeAsync(900);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});
