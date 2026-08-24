import { buildElementBoxCode } from "../interaction-scripts";

interface Box {
  rect: { x: number; y: number; width: number; height: number };
  label: string;
  elementWidth: number;
  elementHeight: number;
  clipped: boolean;
  scrollY: number;
  scrollHeight: number;
}

const PAD = 8;
const CAP = 2000;

function place(options: {
  viewportTop: number;
  height: number;
  scrollY: number;
}): void {
  document.body.innerHTML = `<div id="target">post list</div>`;
  const element = document.getElementById("target") as HTMLElement;

  Object.defineProperty(window, "scrollX", { value: 0, configurable: true });
  Object.defineProperty(window, "scrollY", {
    value: options.scrollY,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, "scrollTop", {
    value: options.scrollY,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, "scrollWidth", {
    value: 1200,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: 20000,
    configurable: true,
  });

  element.getBoundingClientRect = () =>
    ({
      top: options.viewportTop,
      left: 0,
      width: 800,
      height: options.height,
      right: 800,
      bottom: options.viewportTop + options.height,
      x: 0,
      y: options.viewportTop,
      toJSON: () => ({}),
    } as DOMRect);
}

function measure(): Box {
  const code = buildElementBoxCode({ selector: "#target" });
  return new Function(`return ${code}`)() as Box;
}

describe("buildElementBoxCode", () => {
  it("starts at the element's top when the page has not been scrolled", () => {
    place({ viewportTop: 100, height: 1000, scrollY: 0 });

    const box = measure();

    expect(box.rect.y).toBe(100 - PAD);
    expect(box.rect.height).toBe(1000 + PAD * 2);
    expect(box.clipped).toBe(false);
  });

  it("still starts at the element's top when the page is scrolled past it", () => {
    place({ viewportTop: -500, height: 1000, scrollY: 600 });

    const box = measure();

    expect(box.rect.y).toBe(100 - PAD);
    expect(box.rect.height).toBe(1000 + PAD * 2);
    expect(box.clipped).toBe(false);
  });

  it("gives the same rect wherever the reader happens to be", () => {
    place({ viewportTop: 100, height: 1000, scrollY: 0 });
    const fromTop = measure();

    place({ viewportTop: -1400, height: 1000, scrollY: 1500 });
    const fromBelow = measure();

    expect(fromBelow.rect).toEqual(fromTop.rect);
  });

  it("caps an element taller than the limit and says so", () => {
    place({ viewportTop: 100, height: 5000, scrollY: 0 });

    const box = measure();

    expect(box.rect.y).toBe(100 - PAD);
    expect(box.rect.height).toBe(CAP);
    expect(box.elementHeight).toBe(5000);
    expect(box.clipped).toBe(true);
  });

  it("walks a capped element on from where the reader scrolled to", () => {
    place({ viewportTop: -1400, height: 5000, scrollY: 1500 });

    const box = measure();

    expect(box.rect.y).toBe(1500);
    expect(box.rect.height).toBe(CAP);
    expect(box.clipped).toBe(true);
  });

  it("never asks for a rect above the page", () => {
    place({ viewportTop: 2, height: 400, scrollY: 0 });

    const box = measure();

    expect(box.rect.y).toBe(0);
  });

  it("refuses an element with no size", () => {
    place({ viewportTop: 100, height: 0, scrollY: 0 });

    expect(() => measure()).toThrow(/no size on the page/);
  });
});
