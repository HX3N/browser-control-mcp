import {
  buildSnapshotCode,
  formatPageItems,
  PageElementItem,
  PageReadResult,
} from "../page-snapshot";
import type { ElementTarget } from "@browser-control-mcp/common";

function read(options: { target?: ElementTarget; includeHidden?: boolean } = {}): PageReadResult {
  const code = buildSnapshotCode({
    maxElements: 500,
    includeHidden: options.includeHidden ?? false,
    target: options.target,
  });
  return new Function(`return ${code}`)() as PageReadResult;
}

function elements(result: PageReadResult): PageElementItem[] {
  return result.items.filter((item): item is PageElementItem => item.kind === "element");
}

function listed(html: string): PageElementItem[] {
  document.body.innerHTML = html;
  return elements(read());
}

function byName(items: PageElementItem[], name: string): PageElementItem | undefined {
  return items.find((item) => item.name === name);
}

describe("controls a read lists", () => {
  const originalRect = Element.prototype.getBoundingClientRect;
  let boxes: Record<string, Partial<DOMRect>> = {};

  beforeEach(() => {
    boxes = {};
    Element.prototype.getBoundingClientRect = function (this: Element) {
      return { left: 0, top: 0, width: 100, height: 20, ...boxes[this.id] } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  it("lists the widget roles a custom dropdown, tree, grid or spinner uses", () => {
    const items = listed(`
      <div role="listbox" aria-label="Fruit"></div>
      <div role="treeitem">Folder</div>
      <div role="spinbutton" aria-label="Count" aria-valuenow="3"></div>
      <div role="grid"><div role="row"><div role="gridcell">Cell</div></div></div>
      <div role="columnheader" aria-sort="ascending">Sorted</div>
      <div role="columnheader">Plain header</div>
    `);

    expect(byName(items, "Fruit")?.role).toBe("listbox");
    expect(byName(items, "Folder")?.role).toBe("treeitem");
    expect(byName(items, "Count")).toMatchObject({ role: "spinbutton", value: "3" });
    expect(byName(items, "Cell")?.role).toBe("gridcell");
    expect(byName(items, "Sorted")?.role).toBe("columnheader");
    expect(byName(items, "Plain header")).toBeUndefined();
  });

  it("takes the first token of a role list", () => {
    const items = listed(`<div role="treeitem none">Leaf</div>`);
    expect(byName(items, "Leaf")?.role).toBe("treeitem");
  });

  it("gives native inputs the role their type implies", () => {
    const items = listed(`
      <input type="number" aria-label="Qty">
      <input list="cities" aria-label="City"><datalist id="cities"></datalist>
      <select size="3" aria-label="Many"><option>a</option></select>
    `);

    expect(byName(items, "Qty")?.role).toBe("spinbutton");
    expect(byName(items, "City")?.role).toBe("combobox");
    expect(byName(items, "Many")?.role).toBe("listbox");
  });

  it("lists every editing host once, with its text as the value", () => {
    const items = listed(`
      <div contenteditable="" aria-label="Empty flag">typed <b>bold</b></div>
      <div contenteditable="plaintext-only" aria-label="Plain">plain</div>
      <div contenteditable="false">Not editable</div>
    `);

    expect(byName(items, "Empty flag")).toMatchObject({ role: "textbox", value: "typed bold" });
    expect(byName(items, "Plain")).toMatchObject({ role: "textbox", value: "plain" });
    expect(items).toHaveLength(2);
  });

  it("lists a control that only an onclick attribute or a popup relation marks", () => {
    const items = listed(`
      <div onclick="void 0">Open</div>
      <span aria-haspopup="listbox">Choose</span>
      <span aria-haspopup="false">Nothing</span>
    `);

    expect(byName(items, "Open")).toBeDefined();
    expect(byName(items, "Choose")).toBeDefined();
    expect(byName(items, "Nothing")).toBeUndefined();
  });

  it("lists an aria-expanded row only when no real control sits inside it", () => {
    const items = listed(`
      <div aria-expanded="false">Section</div>
      <li aria-expanded="false"><button>Menu</button></li>
    `);

    expect(byName(items, "Section")).toMatchObject({ role: "clickable", expanded: false });
    expect(items.map((item) => item.name)).toEqual(["Section", "Menu"]);
  });

  it("lists the pointer boundary of a role-less option list, not the text inside it", () => {
    const items = listed(`
      <ul>
        <li style="cursor: pointer"><span>Seoul</span></li>
        <li style="cursor: pointer">Busan</li>
      </ul>
      <label for="agree" style="cursor: pointer">Agree</label><input id="agree" type="checkbox">
    `);

    expect(items.filter((item) => item.role === "clickable?").map((item) => item.name)).toEqual([
      "Seoul",
      "Busan",
    ]);
    expect(items.find((item) => item.tag === "label")).toBeUndefined();
  });

  it("does not repeat a pointer inherited from a clickable parent", () => {
    const items = listed(`
      <div style="cursor: pointer"><span style="cursor: pointer">Card title</span></div>
    `);
    expect(items).toHaveLength(1);
    expect(items[0].tag).toBe("div");
  });

  it("lists a native control drawn invisible over a styled box", () => {
    boxes = { overlay: { width: 100, height: 20 } };
    const items = listed(`
      <div id="box"><span>Korea</span><select id="overlay" style="opacity: 0" aria-label="Country"><option>Korea</option></select></div>
    `);
    expect(byName(items, "Country")).toMatchObject({ role: "combobox" });
    expect(byName(items, "Country")?.hidden).toBeUndefined();
  });

  it("lists a checkbox shrunk out of sight whose label the user sees", () => {
    boxes = { tick: { width: 0, height: 0 } };
    const items = listed(`<input id="tick" type="checkbox"><label for="tick">Remember me</label>`);
    expect(byName(items, "Remember me")).toMatchObject({ role: "checkbox", checked: false });
  });

  it("keeps a trap field parked off the page hidden", () => {
    boxes = { trap: { left: -9999 }, trapLabel: { left: -9999 } };
    const items = listed(`<label id="trapLabel" for="trap">Leave empty</label><input id="trap">`);
    expect(items).toHaveLength(0);
  });

  it("keeps a text field parked off the page hidden even when its label shows", () => {
    boxes = { trap: { left: -9999 } };
    const items = listed(`<label for="trap">Website</label><input id="trap">`);
    expect(items).toHaveLength(0);
  });

  it("lists a checkbox parked off the page whose label the user sees", () => {
    boxes = { tick: { left: -9999 } };
    const items = listed(`<input id="tick" type="checkbox"><label for="tick">Remember me</label>`);
    expect(byName(items, "Remember me")).toMatchObject({ role: "checkbox" });
  });

  it("lists a control taken out of the layout behind a label the user sees", () => {
    const items = listed(`
      <label for="upload">Upload</label><input id="upload" type="file" style="display: none">
      <input id="dark" type="checkbox" hidden disabled><label for="dark">Dark mode</label>
      <input id="size" type="radio" style="visibility: hidden"><label for="size">Large</label>
    `);
    expect(byName(items, "Upload")).toMatchObject({ tag: "input" });
    expect(byName(items, "Upload")?.hidden).toBeUndefined();
    expect(byName(items, "Dark mode")).toMatchObject({ role: "checkbox", disabled: true });
    expect(byName(items, "Large")).toMatchObject({ role: "radio" });
  });

  it("keeps a label-driven control hidden when an ancestor hides it or no label shows", () => {
    const items = listed(`
      <div style="display: none"><input id="a" type="file"></div><label for="a">Upload A</label>
      <input id="b" type="file" style="display: none" aria-hidden="true"><label for="b">Upload B</label>
      <input id="c" type="checkbox" style="display: none"><label for="c" style="display: none">Hidden label</label>
      <input id="d" type="text" style="display: none"><label for="d">Website</label>
    `);
    expect(items).toHaveLength(0);
  });

  it("keeps a field inside a hidden widget hidden", () => {
    boxes = { closed: { width: 0, height: 0 }, secret: { width: 0, height: 0 } };
    const items = listed(
      `<div id="closed" role="listbox" style="display: none"><select id="secret" style="opacity: 0" aria-label="Secret"></select></div>`
    );
    expect(items).toHaveLength(0);
  });

  it("does not take a see-through trap input for an overlay", () => {
    boxes = { trap: { width: 1, height: 1 } };
    const items = listed(`<form><input id="trap" name="website" style="opacity: 0"></form>`);
    expect(items).toHaveLength(0);
  });

  it("lists a tree or grid container that says it is expanded, beside its items", () => {
    const items = listed(`<div role="tree" aria-expanded="true" aria-label="Files"><div role="treeitem">A</div></div>`);
    expect(items.map((item) => item.role)).toEqual(["tree", "treeitem"]);
  });

  it("does not list an editable span inside an editing host as a control of its own", () => {
    const items = listed(`<div contenteditable="true" aria-label="Body">x <span contenteditable="true">inner</span></div>`);
    expect(items.map((item) => item.name)).toEqual(["Body"]);
  });

  it("keeps a long label as text, since the name carries only its start", () => {
    const terms = "I have read the terms of service and agree to all of them, including the parts about data, billing and the arbitration clause at the end.";
    document.body.innerHTML = `<label for="agree">${terms}</label><input id="agree" type="checkbox">`;
    const text = formatPageItems(read().items, { includeSelectors: false, includeHrefs: false });
    expect(text).toContain("arbitration clause at the end.");
  });

  it("reports the states a model needs before acting", () => {
    const items = listed(`
      <button disabled>Save</button>
      <div role="button" aria-disabled="true">Send</div>
      <input readonly aria-label="Locked" value="x">
      <div role="checkbox" aria-checked="mixed">Some</div>
      <button aria-pressed="true">Bold</button>
      <div role="tab" aria-selected="false">Other tab</div>
    `);

    expect(byName(items, "Save")?.disabled).toBe(true);
    expect(byName(items, "Send")?.disabled).toBe(true);
    expect(byName(items, "Locked")?.readonly).toBe(true);
    expect(byName(items, "Some")?.checked).toBe("mixed");
    expect(byName(items, "Bold")?.pressed).toBe(true);
    expect(byName(items, "Other tab")?.selected).toBe(false);
  });

  it("does not name a composite widget after all the text inside it", () => {
    const items = listed(`
      <select><option>One</option><option>Two</option></select>
      <div role="combobox" title="Pick a city">Seoul</div>
    `);
    expect(items[0].name).toBe("");
    expect(items[1].name).toBe("Pick a city");
  });

  it("caps the options of a long select and still names the chosen one", () => {
    const options = Array.from(
      { length: 250 },
      (_, i) => `<option value="v${i}"${i === 240 ? " selected" : ""}>Option ${i}</option>`
    ).join("");
    const [select] = listed(`<select aria-label="Long">${options}</select>`);

    expect(select.options).toHaveLength(201);
    expect(select.options?.[200]).toBe("Option 240");
    expect(select.selectedValues).toEqual(["v240"]);
    expect(select.moreOptions).toBe(49);
  });

  it("follows an open combobox to the popup rendered elsewhere when reading it alone", () => {
    document.body.innerHTML = `
      <div id="field"><input role="combobox" aria-expanded="true" aria-controls="pop" aria-label="City"></div>
      <p>Unrelated text</p>
      <ul id="pop" role="listbox"><li role="option">Seoul</li><li role="option">Busan</li></ul>
    `;
    const result = read({ target: { selector: "#field" } });
    const listedRoles = elements(result).map((item) => `${item.role} ${item.name}`);

    expect(listedRoles).toEqual(["combobox City", "listbox ", "option Seoul", "option Busan"]);
    expect(JSON.stringify(result.items)).not.toContain("Unrelated");
  });

  it("keeps a popup rendered elsewhere hidden when a parent of it is hidden", () => {
    document.body.innerHTML = `
      <div id="field"><input role="combobox" aria-expanded="true" aria-controls="pop" aria-label="City"></div>
      <div style="display: none"><div id="pop" role="dialog">Secret text <button>Go</button></div></div>
    `;
    const result = read({ target: { selector: "#field" } });

    expect(JSON.stringify(result.items)).not.toContain("Secret");
    expect(elements(result).map((item) => item.name)).toEqual(["City"]);
    expect(result.hiddenElements).toBe(1);
  });

  it("reads a popup that makes itself visible inside a parent hidden by visibility", () => {
    document.body.innerHTML = `
      <div id="field"><input role="combobox" aria-expanded="true" aria-controls="pop" aria-label="City"></div>
      <div style="visibility: hidden"><ul id="pop" role="listbox" style="visibility: visible"><li role="option">Seoul</li></ul></div>
    `;
    const result = read({ target: { selector: "#field" } });

    expect(elements(result).map((item) => item.name)).toContain("Seoul");
    expect(result.hiddenElements).toBe(0);
  });

  it("follows a popup that opens another popup rendered elsewhere", () => {
    document.body.innerHTML = `
      <div id="field"><button aria-haspopup="menu" aria-expanded="true" aria-controls="menu1">Actions</button></div>
      <p>Unrelated text</p>
      <div id="menu1" role="menu"><div role="menuitem" aria-haspopup="menu" aria-expanded="true" aria-controls="menu2">More</div></div>
      <div id="menu2" role="menu"><div role="menuitem">Archive</div></div>
    `;
    const names = elements(read({ target: { selector: "#field" } })).map((item) => item.name);

    expect(names).toContain("More");
    expect(names).toContain("Archive");
  });
});

describe("outline keeps an open popup", () => {
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeAll(() => {
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 100, height: 20 } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  it("keeps the trigger of a popup as a region, so it can be opened from the outline", () => {
    const links = Array.from({ length: 150 }, (_, i) => `<a href="/l/${i}">Link ${i}</a>`).join("");
    document.body.innerHTML = `
      <main><button id="city" aria-haspopup="listbox" aria-expanded="false">City: none</button><p>${links}</p></main>
    `;
    const result = read();

    expect(result.outline?.some((region) => region.tag === "button" && region.name === "City: none")).toBe(true);
  });

  it("makes a small listbox at the end of the body a region of its own", () => {
    const links = Array.from({ length: 150 }, (_, i) => `<a href="/l/${i}">Link ${i}</a>`).join("");
    document.body.innerHTML = `
      <main><input role="combobox" aria-expanded="true" aria-controls="pop" aria-label="City">${links}</main>
      <div id="pop" role="listbox"><div role="option">Seoul</div><div role="option">Busan</div></div>
    `;
    const result = read();

    expect(result.outline).toBeDefined();
    expect(result.outline!.some((region) => region.role === "listbox")).toBe(true);
  });

  it("does not spend the outline on tabs that only name their panel", () => {
    const tabs = Array.from({ length: 45 }, (_, i) => `<div role="tab" aria-controls="p${i}">Tab ${i}</div>`).join("");
    const links = Array.from({ length: 150 }, (_, i) => `<a href="/l/${i}">Link ${i}</a>`).join("");
    document.body.innerHTML = `<header><div>${tabs}</div></header><main><p>${links}</p></main>`;
    const result = read();

    expect(result.outline?.some((region) => region.tag === "main")).toBe(true);
    expect(result.outline?.some((region) => region.role === "tab")).toBe(false);
  });

  it("lists every top region before the popup triggers inside one, and counts what did not fit", () => {
    const menus = Array.from({ length: 45 }, (_, i) => `<button aria-haspopup="menu">Menu ${i}</button>`).join("");
    const links = Array.from({ length: 150 }, (_, i) => `<a href="/l/${i}">Link ${i}</a>`).join("");
    document.body.innerHTML = `<nav>${menus}</nav><main><p>${links}</p></main>`;
    const result = read();

    expect(result.outline?.map((region) => region.tag).slice(0, 2)).toEqual(["nav", "button"]);
    expect(result.outline?.[result.outline.length - 1].tag).toBe("main");
    expect(result.outline).toHaveLength(40);
    expect(result.outlineOmitted).toBe(7);
  });

  it("counts controls known only by their pointer among a region's controls", () => {
    const items = Array.from({ length: 120 }, (_, i) => `<div style="cursor: pointer">Item ${i}</div>`).join("");
    document.body.innerHTML = `<main>${items}</main>`;
    const result = read();

    expect(result.outline?.find((region) => region.tag === "main")?.controls).toBe(120);
  });

  it("does not count pointer-only controls the user cannot see", () => {
    const items = Array.from({ length: 120 }, (_, i) => `<div style="cursor: pointer">Item ${i}</div>`).join("");
    const unseen = Array.from(
      { length: 120 },
      (_, i) => `<div aria-hidden="true" style="cursor: pointer">Unseen ${i}</div>`
    ).join("");
    document.body.innerHTML = `<main>${items}</main><aside>${unseen}</aside>`;
    const result = read();

    expect(result.outline?.find((region) => region.tag === "aside")?.controls ?? 0).toBe(0);
  });
});

describe("the line a control is written as", () => {
  function line(item: Partial<PageElementItem>): string {
    return formatPageItems(
      [{ kind: "element", ref: "e1", role: "textbox", name: "", tag: "input", selector: "input", ...item }],
      { includeSelectors: false, includeHrefs: true }
    );
  }

  it("leaves out a tag the role implies and keeps one it does not", () => {
    expect(line({ role: "textbox", tag: "input", name: "Email" })).toBe('[e1] textbox "Email"');
    expect(line({ role: "textbox", tag: "textarea", name: "Notes" })).toBe('[e1] textbox <textarea> "Notes"');
    expect(line({ role: "button", tag: "div", name: "Menu" })).toBe('[e1] button <div> "Menu"');
    expect(line({ role: "button", tag: "input", name: "Run", explicitRole: true })).toBe('[e1] button <input> "Run"');
  });

  it("puts punctuation left between inline controls on the line before it", () => {
    const text = formatPageItems(
      [
        { kind: "text", text: "See" },
        { kind: "element", ref: "e1", role: "link", name: "Help", tag: "a", selector: "a" },
        { kind: "text", text: "," },
        { kind: "element", ref: "e2", role: "link", name: "Terms", tag: "a", selector: "a" },
        { kind: "text", text: "." },
      ],
      { includeSelectors: false, includeHrefs: false }
    );
    expect(text).toBe('See\n[e1] link "Help",\n[e2] link "Terms".');
  });

  it("folds a straight quote only when closing punctuation comes with it", () => {
    const link = { kind: "element", role: "link", tag: "a", selector: "a" } as const;
    const text = formatPageItems(
      [
        { ...link, ref: "e1", name: "Help" },
        { kind: "text", text: '".' },
        { ...link, ref: "e2", name: "Terms" },
        { kind: "text", text: '"' },
      ],
      { includeSelectors: false, includeHrefs: false }
    );
    expect(text).toBe('[e1] link "Help"".\n[e2] link "Terms"\n"');
  });

  it("leaves a line of dashes or stars on a line of its own", () => {
    const text = formatPageItems(
      [
        { kind: "text", text: "Hello" },
        { kind: "text", text: "---" },
        { kind: "text", text: "***" },
        { kind: "text", text: "World" },
        { kind: "text", text: ")." },
      ],
      { includeSelectors: false, includeHrefs: false }
    );
    expect(text).toBe("Hello\n---\n***\nWorld).");
  });

  it("drops an empty name and a placeholder that only repeats the name", () => {
    expect(line({ role: "button", tag: "button" })).toBe("[e1] button");
    expect(line({ name: "Search", placeholder: "Search" })).toBe('[e1] textbox "Search"');
  });

  it("escapes values so quotes and separators stay unambiguous", () => {
    expect(line({ name: 'Say "hi"', value: "a / b | c" })).toBe(
      '[e1] textbox "Say \\"hi\\"" value="a / b | c"'
    );
  });

  it("writes states as words", () => {
    expect(line({ role: "checkbox", checked: "mixed", disabled: true })).toBe("[e1] checkbox disabled mixed");
    expect(line({ role: "button", tag: "button", pressed: false, expanded: true })).toBe(
      "[e1] button unpressed expanded"
    );
    expect(line({ role: "tab", tag: "div", selected: false })).toBe("[e1] tab <div>");
  });

  it("lists options by label, adding values only where one differs", () => {
    expect(
      line({ role: "combobox", tag: "select", options: ["S", "M"], selectedValues: ["M"] })
    ).toBe('[e1] combobox options=["S","M"] selected=["M"]');
    expect(
      line({
        role: "combobox",
        tag: "select",
        options: ["Korea"],
        optionValues: ["kr"],
        selectedValues: ["kr"],
        moreOptions: 3,
      })
    ).toBe('[e1] combobox options=["Korea"] values=["kr"] selected=["kr"] (+3 more)');
  });
});

describe("a field and its label", () => {
  const originalRect = Element.prototype.getBoundingClientRect;

  beforeAll(() => {
    Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, width: 100, height: 20 } as DOMRect;
    };
  });

  afterAll(() => {
    Element.prototype.getBoundingClientRect = originalRect;
  });

  it("names the field after the label alone and does not repeat the label as text", () => {
    document.body.innerHTML = `
      <label>Country <select><option value="kr">Korea</option><option value="jp">Japan</option></select></label>
      <label>Notes <textarea>Hello</textarea></label>
      <label for="agree">I agree</label><input id="agree" type="checkbox">
    `;
    const text = formatPageItems(read().items, { includeSelectors: false, includeHrefs: false });

    expect(text.split("\n")).toEqual([
      '[e1] combobox "Country" options=["Korea","Japan"] values=["kr","jp"] selected=["kr"]',
      '[e2] textbox <textarea> "Notes" value="Hello"',
      '[e3] checkbox "I agree" unchecked',
    ]);
  });
});
