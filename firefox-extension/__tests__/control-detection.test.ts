import {
  buildSnapshotCode,
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

    expect(items.filter((item) => item.role === "clickable").map((item) => item.name)).toEqual([
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
    const names = elements(result).map((item) => item.name);

    expect(names).toEqual(["City", "Seoul", "Busan"]);
    expect(JSON.stringify(result.items)).not.toContain("Unrelated");
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
});
