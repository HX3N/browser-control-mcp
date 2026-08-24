import { buildPressKeyCode } from "../interaction-scripts";

type Modifier = "Control" | "Shift" | "Alt" | "Meta";

interface PressResult {
  target: string;
  detail: string;
  url: string;
  scrollY: number;
  scrollHeight: number;
}

function press(key: string, modifiers: Modifier[] = []): PressResult {
  const code = buildPressKeyCode({
    cmd: "press-key",
    correlationId: "test",
    tabId: 1,
    key,
    modifiers,
  } as never);
  return new Function("return " + code)() as PressResult;
}

function makeInput(value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  document.body.appendChild(input);
  input.focus();
  return input;
}

function makeTextarea(value: string): HTMLTextAreaElement {
  const area = document.createElement("textarea");
  area.value = value;
  document.body.appendChild(area);
  area.focus();
  return area;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("key event fields", () => {
  it("reports a letter, a digit and a space with the right code", () => {
    const seen: KeyboardEvent[] = [];
    const input = makeInput("");
    input.addEventListener("keydown", (event) => seen.push(event));

    press("a");
    press("1");
    press(" ");

    expect(seen.map((event) => event.code)).toEqual(["KeyA", "Digit1", "Space"]);
  });

  it("fills the legacy keyCode and which fields", () => {
    const seen: KeyboardEvent[] = [];
    const input = makeInput("");
    input.addEventListener("keydown", (event) => seen.push(event));

    press("Enter");

    expect(seen[0].keyCode).toBe(13);
    expect(seen[0].which).toBe(13);
  });
});

describe("select all", () => {
  it("selects the whole value of a text field", () => {
    const input = makeInput("hello world");

    const result = press("a", ["Control"]);

    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(11);
    expect(result.detail).toContain("selected every character");
  });

  it("selects the document when nothing editable has focus", () => {
    document.body.innerHTML = "<p>some text</p>";

    press("a", ["Control"]);

    expect(document.getSelection()?.toString()).toBe("some text");
  });

  it("leaves the field alone when the page cancels the event", () => {
    const input = makeInput("hello world");
    input.addEventListener("keydown", (event) => event.preventDefault());

    const result = press("a", ["Control"]);

    expect(input.selectionStart).toBe(input.selectionEnd);
    expect(result.detail).toContain("cancelled the default action");
  });
});

describe("caret movement", () => {
  it("moves to the start of the current line on Home", () => {
    const area = makeTextarea("first line\nsecond line");
    area.setSelectionRange(15, 15);

    press("Home");

    expect(area.selectionStart).toBe(11);
    expect(area.selectionEnd).toBe(11);
  });

  it("extends the selection to the end of the line on Shift+End", () => {
    const area = makeTextarea("first line\nsecond line");
    area.setSelectionRange(11, 11);

    press("End", ["Shift"]);

    expect(area.selectionStart).toBe(11);
    expect(area.selectionEnd).toBe(22);
  });

  it("moves one character left", () => {
    const input = makeInput("abc");
    input.setSelectionRange(3, 3);

    press("ArrowLeft");

    expect(input.selectionStart).toBe(2);
  });

  it("jumps a whole word with Control", () => {
    const input = makeInput("alpha beta gamma");
    input.setSelectionRange(16, 16);

    press("ArrowLeft", ["Control"]);

    expect(input.selectionStart).toBe(11);
  });

  it("collapses an existing selection instead of moving", () => {
    const input = makeInput("abcdef");
    input.setSelectionRange(2, 5);

    press("ArrowLeft");

    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(2);
  });

  it("keeps the column when moving down a line", () => {
    const area = makeTextarea("first line\nsecond line");
    area.setSelectionRange(3, 3);

    press("ArrowDown");

    expect(area.selectionStart).toBe(14);
  });
});

describe("deletion", () => {
  it("removes the character before the caret", () => {
    const input = makeInput("abc");
    input.setSelectionRange(3, 3);

    press("Backspace");

    expect(input.value).toBe("ab");
    expect(input.selectionStart).toBe(2);
  });

  it("removes the character after the caret on Delete", () => {
    const input = makeInput("abc");
    input.setSelectionRange(0, 0);

    press("Delete");

    expect(input.value).toBe("bc");
  });

  it("removes the whole selection", () => {
    const input = makeInput("abcdef");
    input.setSelectionRange(1, 4);

    press("Backspace");

    expect(input.value).toBe("aef");
  });

  it("removes a whole word with Control", () => {
    const input = makeInput("alpha beta");
    input.setSelectionRange(10, 10);

    press("Backspace", ["Control"]);

    expect(input.value).toBe("alpha ");
  });

  it("fires input and change so a framework sees the edit", () => {
    const input = makeInput("abc");
    input.setSelectionRange(3, 3);
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    press("Backspace");

    expect(events).toEqual(["input", "change"]);
  });
});

describe("clipboard", () => {
  it("refuses to paste and points at the typing tool", () => {
    makeInput("abc");

    expect(() => press("v", ["Control"])).toThrow(/type-into-page-element/);
  });
});
