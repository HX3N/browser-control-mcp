import {
  buildClickCode,
  buildScrollCode,
  buildTypeCode,
} from "../interaction-scripts";

interface ClickResult {
  target: string;
  detail: string;
}

interface TypeResult {
  target: string;
  detail: string;
}

function run<T>(code: string): T {
  return new Function(`return ${code}`)() as T;
}

describe("interaction scripts run against a document", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="composer" placeholder="message">
      <button id="send">Send</button>
      <div id="log"></div>
    `;
    window.scrollTo = jest.fn();
    const log = document.getElementById("log")!;
    const composer = document.getElementById("composer") as HTMLInputElement;
    let draft = "";
    composer.addEventListener("input", () => {
      draft = composer.value;
    });
    document.getElementById("send")!.addEventListener("click", () => {
      log.textContent += `[${draft}]`;
    });
  });

  it("clicks and reports the click count", () => {
    const result = run<ClickResult>(
      buildClickCode({
        cmd: "click-element",
        tabId: 1,
        selector: "#send",
        clickCount: 2,
      })
    );
    expect(result.detail).toBe("Dispatched 2 left click(s)");
    expect(document.getElementById("log")!.textContent).toBe("[][]");
  });

  it("types, fires input, then clicks the clickAfter element", () => {
    const result = run<TypeResult>(
      buildTypeCode({
        cmd: "type-text",
        tabId: 1,
        selector: "#composer",
        text: "hello",
        clickAfter: { selector: "#send" },
      })
    );
    expect(result.detail).toContain("clicked");
    expect(document.getElementById("log")!.textContent).toBe("[hello]");
  });

  it("moves the overlay outline onto the element it clicks after typing", () => {
    const focus = jest.fn();
    (window as unknown as { __bcmOverlay: unknown }).__bcmOverlay = { focus };

    run<TypeResult>(
      buildTypeCode({
        cmd: "type-text",
        tabId: 1,
        selector: "#composer",
        text: "hello",
        clickAfter: { selector: "#send" },
      })
    );

    expect(focus).toHaveBeenCalledWith(document.getElementById("send"), "click");
    delete (window as unknown as { __bcmOverlay?: unknown }).__bcmOverlay;
  });

  it("scrolls at once in a hidden document, where animation frames never run", () => {
    const root = document.documentElement;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(root, "scrollHeight", {
      configurable: true,
      get: () => 5000,
    });
    const raf = jest.spyOn(window, "requestAnimationFrame");

    try {
      const result = run<{ scrollY: number; scrollMax: number }>(
        buildScrollCode({ cmd: "scroll-page", tabId: 1, direction: "bottom" })
      );

      expect(result.scrollY).toBeGreaterThan(0);
      expect(result.scrollY).toBe(result.scrollMax);
      expect(window.scrollTo).toHaveBeenCalledTimes(1);
      expect(window.scrollTo).toHaveBeenCalledWith({
        left: 0,
        top: result.scrollY,
        behavior: "instant",
      });
      expect(raf).not.toHaveBeenCalled();
    } finally {
      raf.mockRestore();
      delete (root as unknown as { scrollHeight?: number }).scrollHeight;
      delete (document as unknown as { hidden?: boolean }).hidden;
    }
  });
});
