import { buildPressKeyCode } from "../interaction-scripts";

interface KeyResult {
  target: string;
  detail: string;
}

function press(selector: string): KeyResult {
  const code = buildPressKeyCode({
    cmd: "press-key",
    tabId: 1,
    selector,
    key: "Enter",
    modifiers: [],
  });
  return new Function(`return ${code}`)() as KeyResult;
}

describe("Enter in a field the browser treats as multi-line", () => {
  let submitted = 0;

  beforeEach(() => {
    submitted = 0;
    window.scrollTo = jest.fn();
    document.body.innerHTML = `
      <form id="f">
        <input id="single" type="text" value="one">
        <textarea id="multi">line</textarea>
      </form>
      <div id="rich" contenteditable="true">rich</div>
    `;
    const form = document.getElementById("f") as HTMLFormElement;
    form.requestSubmit = () => {
      submitted++;
    };
    form.submit = () => {
      submitted++;
    };
  });

  it("submits the owning form from a single-line input", () => {
    const result = press("#single");
    expect(result.detail).toContain("submitted the owning form");
    expect(submitted).toBe(1);
  });

  it("inserts a line break in a textarea instead of submitting", () => {
    const result = press("#multi");
    expect(submitted).toBe(0);
    expect(result.detail).toContain("inserted a line break");
    expect((document.getElementById("multi") as HTMLTextAreaElement).value).toContain(
      "\n"
    );
  });

  it("leaves the form alone for a contenteditable", () => {
    document.execCommand = jest.fn().mockReturnValue(true);
    Object.defineProperty(document.getElementById("rich")!, "isContentEditable", {
      value: true,
      configurable: true,
    });
    const result = press("#rich");
    expect(submitted).toBe(0);
    expect(result.detail).toContain("inserted a line break");
  });
});
