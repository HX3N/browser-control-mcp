import { buildClickCode } from "../interaction-scripts";

function clickedTarget(selector: string): string {
  const code = buildClickCode({ cmd: "click-element", tabId: 1, selector, index: 0 });
  return (new Function(`return ${code}`)() as { target: string }).target;
}

describe("the name an action result gives its target", () => {
  beforeEach(() => {
    window.scrollTo = jest.fn();
  });

  it("uses the label a field is tied to, as read-page does", () => {
    document.body.innerHTML = `
      <input id="remember" type="checkbox"><label for="remember">Remember me</label>
      <label>Country <select id="country"><option>Korea</option></select></label>
      <span id="caption">Due date</span><input id="due" aria-labelledby="caption" placeholder="yyyy-mm-dd">
    `;
    expect(clickedTarget("#remember")).toBe('input "Remember me"');
    expect(clickedTarget("#country")).toBe('select "Country"');
    expect(clickedTarget("#due")).toBe('input "Due date"');
  });

  it("names a button input by its value and never shows another field's value", () => {
    document.body.innerHTML = `
      <input id="send" type="submit" value="Send">
      <input id="secret" type="password" value="hunter22">
    `;
    expect(clickedTarget("#send")).toBe('input "Send"');
    expect(clickedTarget("#secret")).toBe("input");
  });
});
