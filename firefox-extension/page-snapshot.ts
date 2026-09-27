import type { ElementTarget } from "@browser-control-mcp/common/server-messages";
import type { PageRegion } from "@browser-control-mcp/common/extension-messages";
import {
  isElementTargeted,
  jsValue,
  PAGE_READ_SOURCE,
  REF_ATTRIBUTE,
  RESOLVER_SOURCE,
  VISIBILITY_SOURCE,
  ROOT_WALKER_SOURCE,
  targetLiteral,
} from "./injected-common";

const WIDGET_ROLES = [
  "button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox",
  "menuitemradio", "option", "combobox", "textbox", "searchbox", "slider", "listbox", "treeitem",
  "spinbutton", "gridcell", "scrollbar",
];

const CONTAINER_ROLES = ["grid", "tree", "treegrid", "menu", "menubar", "tablist", "radiogroup"];

export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "[contenteditable]:not([contenteditable=false])",
  ...WIDGET_ROLES.map((role) => `[role~=${role}]`),
  "[role~=rowheader][aria-sort]",
  "[role~=columnheader][aria-sort]",
  ...CONTAINER_ROLES.map((role) => `[role~=${role}][aria-expanded]`),
  "[aria-activedescendant]",
  "[aria-haspopup]:not([aria-haspopup=false])",
  "[onclick]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const LOOSE_CONTROL_SELECTOR = "[aria-expanded],[aria-controls],[aria-owns]";

const CONTENT_NAMED_NOT = [
  "combobox", "listbox", "tree", "treegrid", "grid", "menu", "menubar", "tablist", "radiogroup",
  "textbox", "searchbox", "spinbutton", "slider", "scrollbar",
];

const POPUP_ROLES = ["listbox", "menu", "tree", "grid", "treegrid"];

const IMPLIED_TAGS: Record<string, string[]> = {
  link: ["a", "area"],
  button: ["button", "input"],
  textbox: ["input"],
  checkbox: ["input"],
  radio: ["input"],
  slider: ["input"],
  searchbox: ["input"],
  spinbutton: ["input"],
  combobox: ["select", "input"],
  listbox: ["select"],
};

const MAX_SELECT_OPTIONS = 200;

const SELF_EVIDENT_INPUT_TYPES = [
  "text", "checkbox", "radio", "submit", "button", "reset", "image", "range", "number", "search",
];

// Computed display is not consulted for this: it costs a style flush per element.
export const BLOCK_TAGS = [
  "address", "article", "aside", "blockquote", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "tbody", "tfoot",
  "thead", "tr", "ul", "br", "legend", "caption", "menu", "option", "optgroup",
];

const SKIPPED_TAGS = ["script", "style", "noscript", "template", "svg", "canvas", "video", "audio", "object", "embed", "map"];

const SNAPSHOT_HELPERS_SOURCE = `
${ROOT_WALKER_SOURCE}
${RESOLVER_SOURCE}
${VISIBILITY_SOURCE}
function __bcmScope(el) {
  var root = el.getRootNode ? el.getRootNode() : el.ownerDocument;
  return root && root.querySelectorAll ? root : el.ownerDocument;
}


function __bcmText(node) {
  if (!node) { return ''; }
  var raw = node.innerText || node.textContent || '';
  return raw.replace(/\\s+/g, ' ').trim();
}

function __bcmShortHref(href) {
  try {
    var url = new URL(href);
    if (url.origin === location.origin) {
      var path = url.pathname + url.search + url.hash;
      var here = location.pathname.replace(/\\/$/, '');
      if (here && path.indexOf(here) === 0 && /^[\\/?#]|^$/.test(path.slice(here.length))) { path = path.slice(here.length) || '/'; }
      return __bcmTrim(path, 120);
    }
  } catch (err) { /* not a URL the page can parse */ }
  return __bcmTrim(href, 120);
}

function __bcmTrim(value, limit) {
  if (!value) { return ''; }
  return value.length > limit ? value.slice(0, limit) + '...' : value;
}

function __bcmSensitive(el) {
  if (el.tagName.toLowerCase() === 'input') {
    var kind = (el.getAttribute('type') || 'text').toLowerCase();
    if (kind === 'password' || kind === 'hidden') { return true; }
  }
  var hint = (el.getAttribute('autocomplete') || '').toLowerCase();
  if (!hint) { return false; }
  var tokens = ['current-password', 'new-password', 'one-time-code', 'cc-number', 'cc-csc', 'cc-exp'];
  for (var i = 0; i < tokens.length; i++) {
    if (hint.indexOf(tokens[i]) !== -1) { return true; }
  }
  return false;
}

function __bcmName(el) {
  var aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) { return __bcmTrim(aria.trim(), 120); }

  var scope = __bcmScope(el);

  var labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    var parts = [];
    var ids = labelledBy.split(/\\s+/);
    for (var i = 0; i < ids.length; i++) {
      var referenced = scope.getElementById ? scope.getElementById(ids[i]) : null;
      if (referenced) { parts.push(__bcmText(referenced)); }
    }
    var joined = parts.filter(Boolean).join(' ');
    if (joined) { return __bcmTrim(joined, 120); }
  }

  if (el.id) {
    var explicitLabel = scope.querySelector('label[for="' + el.id.replace(/"/g, '') + '"]');
    if (explicitLabel) {
      var explicitText = __bcmLabelText(explicitLabel);
      if (explicitText) { return __bcmTrim(explicitText, 120); }
    }
  }

  if (el.closest) {
    var wrappingLabel = el.closest('label');
    if (wrappingLabel && wrappingLabel !== el) {
      var wrappingText = __bcmLabelText(wrappingLabel);
      if (wrappingText) { return __bcmTrim(wrappingText, 120); }
    }
  }

  if (!__bcmSensitive(el) && __bcmNamedByContent(el)) {
    var own = __bcmText(el);
    if (own) { return __bcmTrim(own, 120); }
  }

  var fallback = el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('name') || '';
  return __bcmTrim(fallback, 120);
}

function __bcmNamedByContent(el) {
  var tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') { return false; }
  return ${jsValue(CONTENT_NAMED_NOT)}.indexOf(__bcmRole(el)) === -1;
}

function __bcmEditingHost(el) {
  var flag = el.getAttribute('contenteditable');
  if (flag === null || flag.toLowerCase() === 'false') { return false; }
  var above = el.parentElement ? el.parentElement.closest('[contenteditable]') : null;
  return !above || (above.getAttribute('contenteditable') || '').toLowerCase() === 'false';
}

function __bcmInnerEditable(el) {
  var flag = el.getAttribute('contenteditable');
  return flag !== null && flag.toLowerCase() !== 'false' && !el.hasAttribute('role') && !__bcmEditingHost(el);
}

function __bcmRole(el) {
  var explicit = (el.getAttribute('role') || '').trim().split(/\\s+/)[0];
  if (explicit) { return explicit; }

  var tag = el.tagName.toLowerCase();
  if (tag === 'a' || tag === 'area') { return el.hasAttribute('href') ? 'link' : 'generic'; }
  if (tag === 'button' || tag === 'summary') { return 'button'; }
  if (tag === 'select') { return el.multiple || el.size > 1 ? 'listbox' : 'combobox'; }
  if (tag === 'textarea') { return 'textbox'; }
  if (tag === 'input') {
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox') { return 'checkbox'; }
    if (type === 'radio') { return 'radio'; }
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') { return 'button'; }
    if (type === 'range') { return 'slider'; }
    if (type === 'number') { return 'spinbutton'; }
    if (el.hasAttribute('list')) { return 'combobox'; }
    if (type === 'search') { return 'searchbox'; }
    return 'textbox';
  }
  if (/^h[1-6]$/.test(tag)) { return 'heading'; }
  if (__bcmEditingHost(el)) { return 'textbox'; }
  return 'generic';
}

function __bcmUniqueId(el) {
  if (!el.id) { return null; }
  var escaped;
  try {
    escaped = '#' + CSS.escape(el.id);
  } catch (err) {
    return null;
  }
  try {
    return __bcmScope(el).querySelectorAll(escaped).length === 1 ? escaped : null;
  } catch (err) {
    return null;
  }
}

function __bcmSelector(el) {
  var direct = __bcmUniqueId(el);
  if (direct) { return direct; }

  var parts = [];
  var node = el;
  var depth = 0;
  while (node && node.nodeType === 1 && depth < 6) {
    var anchor = __bcmUniqueId(node);
    if (anchor) {
      parts.unshift(anchor);
      break;
    }

    var part = node.tagName.toLowerCase();
    var parent = node.parentElement;
    if (parent) {
      var siblings = [];
      for (var i = 0; i < parent.children.length; i++) {
        if (parent.children[i].tagName === node.tagName) { siblings.push(parent.children[i]); }
      }
      if (siblings.length > 1) { part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')'; }
    }
    parts.unshift(part);
    node = parent;
    depth++;
  }
  return parts.join(' > ');
}

function __bcmDescribe(el, ref, hidden, frame) {
  var tag = el.tagName.toLowerCase();
  var entry = {
    ref: ref,
    role: __bcmRole(el),
    name: __bcmName(el),
    tag: tag,
    selector: __bcmSelector(el)
  };

  if ((el.getAttribute('role') || '').trim()) { entry.explicitRole = true; }
  if (hidden) { entry.hidden = true; }
  if (frame) { entry.frame = frame; }

  var toggle = tag === 'input' && (el.type === 'checkbox' || el.type === 'radio');
  var telling = !toggle || (el.value !== 'on' && el.value !== entry.name);
  if ((tag === 'input' && telling) || tag === 'textarea' || (tag === 'select' && __bcmSensitive(el))) {
    if (typeof el.value === 'string' && el.value) {
      entry.value = __bcmSensitive(el)
        ? '(' + el.value.length + ' characters, not shown)'
        : __bcmTrim(el.value, 120);
    }
  } else if (tag !== 'select' && entry.role === 'textbox' && !__bcmSensitive(el)) {
    var typed = __bcmText(el);
    if (typed) { entry.value = __bcmTrim(typed, 120); }
  } else if (entry.role === 'slider' || entry.role === 'spinbutton') {
    var spoken = el.getAttribute('aria-valuetext') || el.getAttribute('aria-valuenow');
    if (spoken) { entry.value = __bcmTrim(spoken, 120); }
  }
  if (tag === 'input') {
    var inputType = (el.getAttribute('type') || 'text').toLowerCase();
    if (${jsValue(SELF_EVIDENT_INPUT_TYPES)}.indexOf(inputType) === -1) { entry.type = inputType; }
  }
  if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') { entry.disabled = true; }
  if (el.readOnly === true || el.getAttribute('aria-readonly') === 'true') { entry.readonly = true; }
  var placeholder = el.getAttribute('placeholder');
  if (placeholder) { entry.placeholder = __bcmTrim(placeholder, 80); }
  if ((tag === 'a' || tag === 'area') && el.href) { entry.href = __bcmShortHref(el.href); }

  if (typeof el.checked === 'boolean' && (el.type === 'checkbox' || el.type === 'radio')) {
    entry.checked = el.indeterminate ? 'mixed' : el.checked;
  } else {
    var ariaChecked = __bcmTristate(el.getAttribute('aria-checked'));
    if (ariaChecked !== undefined) { entry.checked = ariaChecked; }
  }
  var pressed = __bcmTristate(el.getAttribute('aria-pressed'));
  if (pressed !== undefined) { entry.pressed = pressed; }
  var selected = el.getAttribute('aria-selected');
  if (selected === 'true' || selected === 'false') { entry.selected = selected === 'true'; }

  var expanded = el.getAttribute('aria-expanded');
  if (expanded === 'true' || expanded === 'false') { entry.expanded = expanded === 'true'; }
  if (tag === 'summary' && el.parentElement && el.parentElement.tagName.toLowerCase() === 'details') {
    entry.expanded = el.parentElement.open === true;
  }

  if (tag === 'select' && !__bcmSensitive(el)) {
    var labels = [];
    var values = [];
    var chosen = [];
    var differs = false;
    for (var i = 0; i < el.options.length; i++) {
      var option = el.options[i];
      if (i >= ${MAX_SELECT_OPTIONS} && !option.selected) { continue; }
      var text = __bcmText(option);
      labels.push(text);
      values.push(option.value);
      if (option.value !== text) { differs = true; }
      if (option.selected) { chosen.push(option.value); }
    }
    entry.options = labels;
    if (differs) { entry.optionValues = values; }
    entry.selectedValues = chosen;
    if (el.options.length > labels.length) { entry.moreOptions = el.options.length - labels.length; }
  }

  return entry;
}

function __bcmTristate(value) {
  if (value === 'true') { return true; }
  if (value === 'false') { return false; }
  if (value === 'mixed') { return 'mixed'; }
  return undefined;
}
`;

export interface PageTextItem {
  kind: "text";
  text: string;
  level?: number;
  frame?: string;
}

export interface PageElementItem {
  kind: "element";
  ref: string;
  role: string;
  name: string;
  tag: string;
  selector: string;
  value?: string;
  placeholder?: string;
  href?: string;
  explicitRole?: boolean;
  hidden?: boolean;
  frame?: string;
  type?: string;
  disabled?: boolean;
  readonly?: boolean;
  checked?: boolean | "mixed";
  pressed?: boolean | "mixed";
  selected?: boolean;
  expanded?: boolean;
  options?: string[];
  optionValues?: string[];
  selectedValues?: string[];
  moreOptions?: number;
}

export type PageItem = PageTextItem | PageElementItem;

export interface PageReadResult {
  scope?: { role: string; tag: string; name: string };
  url: string;
  title: string;
  items: PageItem[];
  totalElements: number;
  listedElements: number;
  hiddenElements: number;
  elementsTruncated: boolean;
  scrollY: number;
  scrollHeight: number;
  scrollMax: number;
  collapsed: { label: string; kind: "details" | "expandable" | "tab"; chars?: number }[];
  unreachableFrames: {
    src: string;
    name?: string;
    width: number;
    height: number;
    hidden?: boolean;
  }[];
  scopeUnreachableFrame?: { src: string };
  outline?: PageRegion[];
  outlineOmitted?: number;
}

export const MAX_READ_TEXT_CHARS = 400_000;
const MAX_COLLAPSED_SECTIONS = 30;
export const DEFAULT_OUTLINE_CHAR_THRESHOLD = 6_000;
export const DEFAULT_OUTLINE_ELEMENT_THRESHOLD = 100;
const MAX_OUTLINE_REGIONS = 40;
const OUTLINE_MIN_SHARE = 0.05;
const OUTLINE_MIN_CONTROLS = 10;
const OUTLINE_DOMINANCE = 0.8;
const OUTLINE_MAX_DEPTH = 3;

const LANDMARK_TAGS = ["main", "article", "section", "nav", "aside", "header", "footer", "form"];
const LANDMARK_ROLES = [
  "main", "article", "region", "navigation", "complementary", "banner", "contentinfo",
  "form", "search", "feed", "dialog",
];

const OUTLINE_SOURCE = `
function __bcmHighestRef() {
  var highest = 0;
  var stamped = __bcmQueryAll('[${REF_ATTRIBUTE}]');
  for (var s = 0; s < stamped.length; s++) {
    var seen = /^e(\\d+)$/.exec(stamped[s].getAttribute('${REF_ATTRIBUTE}') || '');
    if (seen) {
      var value = parseInt(seen[1], 10);
      if (value > highest) { highest = value; }
    }
  }
  return highest;
}

function __bcmOutline(body, interactive, counted) {
  var measures = new Map();
  function measureChildren(node, m) {
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) {
        m.chars += k.nodeValue.replace(/\\s+/g, ' ').trim().length;
      } else if (k.nodeType === 1) {
        var km = measure(k);
        m.chars += km.chars;
        m.controls += km.controls;
      }
    }
  }
  function measure(el) {
    var cached = measures.get(el);
    if (cached) { return cached; }
    var m = { chars: 0, controls: 0 };
    measures.set(el, m);
    var tag = el.tagName.toLowerCase();
    if (__bcmIsSkipped(tag) || tag === 'iframe' || tag === 'frame' || !__bcmRendered(el)) { return m; }
    if (el.matches(interactive) || counted.has(el)) { m.controls++; }
    measureChildren(el, m);
    if (el.shadowRoot) { measureChildren(el.shadowRoot, m); }
    return m;
  }
  var popups = new Set();
  var triggers = __bcmQueryAll('[aria-expanded=true][aria-controls],[aria-expanded=true][aria-owns]');
  for (var p = 0; p < triggers.length; p++) {
    var named = ((triggers[p].getAttribute('aria-controls') || '') + ' ' + (triggers[p].getAttribute('aria-owns') || '')).split(/\\s+/);
    var home = triggers[p].getRootNode();
    for (var q = 0; q < named.length; q++) {
      var panel = named[q] && home.getElementById ? home.getElementById(named[q]) : null;
      if (panel) { popups.add(panel); }
    }
  }
  function isLandmark(el) {
    if (${jsValue(LANDMARK_TAGS)}.indexOf(el.tagName.toLowerCase()) !== -1) { return true; }
    if (popups.has(el)) { return true; }
    var popup = el.getAttribute('aria-haspopup');
    if (el.matches(interactive) && ((popup !== null && popup !== 'false') ||
        (el.hasAttribute('aria-expanded') && (el.hasAttribute('aria-controls') || el.hasAttribute('aria-owns'))))) { return true; }
    var role = __bcmRole(el);
    return ${jsValue(LANDMARK_ROLES)}.indexOf(role) !== -1 || ${jsValue(POPUP_ROLES)}.indexOf(role) !== -1;
  }
  var total = measure(body);
  var minChars = Math.max(200, Math.floor(total.chars * ${jsValue(OUTLINE_MIN_SHARE)}));
  function qualifies(el) {
    var m = measure(el);
    if (m.chars === 0 && m.controls === 0) { return false; }
    if (isLandmark(el)) { return true; }
    if (el.children.length < 2) { return regionChildren(el).length > 0; }
    return m.chars >= minChars || m.controls >= ${jsValue(OUTLINE_MIN_CONTROLS)};
  }
  function regionChildren(el) {
    var out = [];
    function scan(node) {
      var kids = node.children;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        var tag = k.tagName.toLowerCase();
        if (__bcmIsSkipped(tag) || tag === 'iframe' || tag === 'frame' || !__bcmRendered(k)) { continue; }
        if (k.matches(interactive) && !isLandmark(k)) { continue; }
        if (qualifies(k)) { out.push(k); }
      }
    }
    scan(el);
    if (el.shadowRoot) { scan(el.shadowRoot); }
    return out;
  }
  function dominates(child, parent) {
    var m = measure(parent);
    var km = measure(child);
    return km.chars >= m.chars * ${jsValue(OUTLINE_DOMINANCE)} && km.controls >= m.controls * ${jsValue(OUTLINE_DOMINANCE)};
  }
  function unwrap(el) {
    while (true) {
      var kids = regionChildren(el);
      if (kids.length !== 1 || !dominates(kids[0], el)) { break; }
      if (isLandmark(el) && !isLandmark(kids[0])) { break; }
      el = kids[0];
    }
    return el;
  }
  function innerRegions(el) {
    var kids = regionChildren(el);
    while (kids.length === 1 && dominates(kids[0], el)) {
      el = kids[0];
      kids = regionChildren(el);
    }
    return kids;
  }
  function visibleText(el) {
    var parts = [];
    function collect(node) {
      var kids = node.childNodes;
      for (var i = 0; i < kids.length; i++) {
        var k = kids[i];
        if (k.nodeType === 3) {
          parts.push(k.nodeValue);
        } else if (k.nodeType === 1 && !__bcmIsSkipped(k.tagName.toLowerCase()) && __bcmRendered(k)) {
          collect(k);
          if (k.shadowRoot) { collect(k.shadowRoot); }
        }
      }
    }
    collect(el);
    return parts.join(' ').replace(/\\s+/g, ' ').trim();
  }
  function label(el) {
    var aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) { return aria.trim(); }
    var heading = el.querySelector('h1,h2,h3,h4,h5,h6,[role=heading]');
    if (heading) {
      var text = visibleText(heading);
      if (text) { return text; }
    }
    return visibleText(el);
  }
  var start = unwrap(body);
  var top = regionChildren(start);
  if (!top.length) { top = [start]; }
  var roots = [];
  var queue = [];
  for (var t = 0; t < top.length; t++) { queue.push({ el: unwrap(top[t]), depth: 0, into: roots }); }
  var chosen = 0;
  var omitted = 0;
  for (var h = 0; h < queue.length; h++) {
    var node = queue[h];
    if (chosen < ${jsValue(MAX_OUTLINE_REGIONS)}) {
      chosen++;
      node.into.push(node);
    } else {
      omitted++;
    }
    node.children = [];
    if (node.depth >= ${jsValue(OUTLINE_MAX_DEPTH)}) { continue; }
    var inner = innerRegions(node.el);
    for (var i = 0; i < inner.length; i++) { queue.push({ el: unwrap(inner[i]), depth: node.depth + 1, into: node.children }); }
  }
  var regions = [];
  function emit(node) {
    var el = node.el;
    var m = measure(el);
    var ref = __bcmRefFor(el) || __bcmMintRef();
    el.setAttribute('${REF_ATTRIBUTE}', ref);
    __bcmRemember(ref, el);
    var entry = { ref: ref, tag: el.tagName.toLowerCase(), name: __bcmTrim(label(el), 80), depth: node.depth, chars: m.chars, controls: m.controls };
    var role = el.getAttribute('role');
    if (role) { entry.role = role; }
    if (el.id) { entry.id = el.id; }
    regions.push(entry);
    for (var i = 0; i < node.children.length; i++) { emit(node.children[i]); }
  }
  for (var r = 0; r < roots.length; r++) { emit(roots[r]); }
  return { regions: regions, omitted: omitted };
}
`;

const WALKER_SOURCE = `
function __bcmIsBlock(tag) { return ${jsValue(BLOCK_TAGS)}.indexOf(tag) !== -1; }
function __bcmIsSkipped(tag) { return ${jsValue(SKIPPED_TAGS)}.indexOf(tag) !== -1; }
function __bcmHeadingLevel(el, tag) {
  var m = /^h([1-6])$/.exec(tag);
  if (m) { return parseInt(m[1], 10); }
  if (el.getAttribute('role') === 'heading') {
    var level = parseInt(el.getAttribute('aria-level') || '2', 10);
    return level > 0 && level < 7 ? level : 2;
  }
  return 0;
}
function __bcmStyle(el) {
  var view = el.ownerDocument && el.ownerDocument.defaultView;
  return view ? view.getComputedStyle(el) : null;
}
function __bcmShown(style) {
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
}
function __bcmRendered(el) {
  return __bcmShown(__bcmStyle(el));
}
function __bcmStandIn(el) {
  var tag = el.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') { return false; }
  var labelDriven = tag === 'input' && (el.type === 'checkbox' || el.type === 'radio' || el.type === 'file');
  if (labelDriven && !el.closest('[inert],[aria-hidden=true]')) {
    var shownAbove = true;
    for (var up = el.parentElement; up && shownAbove; up = up.parentElement) {
      var upStyle = __bcmStyle(up);
      shownAbove = !up.hasAttribute('hidden') && !(upStyle && upStyle.display === 'none');
    }
    var labels = shownAbove ? el.labels || [] : [];
    for (var i = 0; i < labels.length; i++) {
      if (__bcmVisible(labels[i])) { return true; }
    }
  }
  if (!__bcmRendered(el) || el.closest('[hidden],[inert],[aria-hidden=true]')) { return false; }
  var box = el.getBoundingClientRect();
  var overlay = tag === 'select' || (tag === 'input' && el.type === 'file');
  if (!overlay || box.width < 4 || box.height < 4) { return false; }
  var host = el.parentElement;
  while (host) {
    var size = host.getBoundingClientRect();
    if (size.width > 0 && size.height > 0) { break; }
    host = host.parentElement;
  }
  if (!host || !__bcmVisible(host)) { return false; }
  var outer = host.getBoundingClientRect();
  return box.left >= outer.left - 1 && box.top >= outer.top - 1 &&
    box.left + box.width <= outer.left + outer.width + 1 &&
    box.top + box.height <= outer.top + outer.height + 1;
}
function __bcmSwallows(tag) {
  return tag === 'a' || tag === 'button' || tag === 'input' || tag === 'select' ||
    tag === 'textarea' || tag === 'summary';
}
`;

export function buildSnapshotCode(options: {
  maxElements: number;
  includeHidden: boolean;
  full?: boolean;
  target?: ElementTarget;
  outlineChars?: number;
  outlineElements?: number;
  controlsOnly?: boolean;
}): string {
  const scopeExpression = isElementTargeted(options.target)
    ? `__bcmResolve(${targetLiteral(options.target!)})`
    : "null";

  return `(function () {
${SNAPSHOT_HELPERS_SOURCE}
${PAGE_READ_SOURCE}
${WALKER_SOURCE}
${OUTLINE_SOURCE}
  var scopeRoot = ${scopeExpression};

  var scopeFrameSrc = null;
  if (scopeRoot && (scopeRoot.tagName === 'IFRAME' || scopeRoot.tagName === 'FRAME')) {
    var scopeInner = null;
    try { scopeInner = scopeRoot.contentDocument; } catch (err) { scopeInner = null; }
    if (!scopeInner) { scopeFrameSrc = scopeRoot.src || scopeRoot.getAttribute('src') || ''; }
  }

  __bcmSeedRefs(__bcmHighestRef());

  var interactive = ${jsValue(INTERACTIVE_SELECTOR)};
  var LOOSE_CONTROL = ${jsValue(LOOSE_CONTROL_SELECTOR)};
  var includeHidden = ${jsValue(options.includeHidden)};
  var maxElements = ${jsValue(options.maxElements)};
  var maxChars = ${jsValue(MAX_READ_TEXT_CHARS)};
  var full = ${jsValue(options.full === true)};
  var controlsOnly = ${jsValue(options.controlsOnly === true)};

  var items = [];
  var chars = 0;
  var totalElements = 0;
  var listedElements = 0;
  var hiddenElements = 0;
  var elementsTruncated = false;
  var buffer = '';
  var bufferFrame = '';

  function pushItem(item) {
    if (controlsOnly && item.kind === 'text') { return; }
    if (chars >= maxChars) { return; }
    if (bufferFrame && !item.frame) { item.frame = bufferFrame; }
    items.push(item);
    chars += item.text.length;
  }

  function flush() {
    var text = buffer.replace(/\\s+/g, ' ').trim();
    buffer = '';
    if (text) { pushItem({ kind: 'text', text: text }); }
  }

  var hiddenDepth = 0;
  var counted = new Set();
  function emitElement(el, frame, guessed) {
    var visible = hiddenDepth === 0 && (__bcmVisible(el) || __bcmStandIn(el));
    totalElements++;
    if (visible) { counted.add(el); }
    if (!visible) {
      hiddenElements++;
      if (!includeHidden) { return; }
    }
    if (listedElements >= maxElements) { elementsTruncated = true; return; }
    flush();
    var ref = __bcmRefFor(el) || __bcmMintRef();
    el.setAttribute('${REF_ATTRIBUTE}', ref);
    __bcmRemember(ref, el);
    listedElements++;
    var entry = __bcmDescribe(el, ref, !visible, frame);
    if (entry.role === 'generic') { entry.role = guessed ? 'clickable?' : 'clickable'; }
    entry.kind = 'element';
    items.push(entry);
    chars += entry.name.length + 24;
  }

  function looseControl(el, tag, style, parentCursor) {
    if (tag === 'body' || (tag === 'label' && el.control)) { return false; }
    var pointer = !!style && style.cursor === 'pointer' && parentCursor !== 'pointer';
    if (!pointer && !el.matches(LOOSE_CONTROL)) { return false; }
    return !el.querySelector(interactive) && !!__bcmName(el);
  }

  function walk(node, frame, suppressText, cursor) {
    var children = node.childNodes;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.nodeType === 3) {
        if (!suppressText) { buffer += child.nodeValue; }
        continue;
      }
      if (child.nodeType !== 1) { continue; }
      var tag = child.tagName.toLowerCase();
      if (__bcmIsSkipped(tag)) { continue; }

      if (tag === 'iframe' || tag === 'frame') {
        var inner = null;
        try { inner = child.contentDocument; } catch (err) { inner = null; }
        if (inner && inner.body) {
          flush();
          var label = __bcmFrameLabel(inner) || 'frame';
          var outerFrame = bufferFrame;
          bufferFrame = label;
          pushItem({ kind: 'text', text: '[' + label + ']', frame: label });
          walk(inner.body, label, suppressText, '');
          flush();
          bufferFrame = outerFrame;
        }
        continue;
      }

      if (child.matches(interactive) && !__bcmInnerEditable(child)) {
        emitElement(child, frame);
        // A container made focusable by tabindex or a role still holds real controls.
        if (__bcmSwallows(tag) || !child.querySelector(interactive)) { continue; }
        var within = __bcmStyle(child);
        var withinShown = __bcmShown(within);
        if (!withinShown) { hiddenDepth++; }
        walk(child, frame, true, within ? within.cursor : '');
        if (child.shadowRoot) { walk(child.shadowRoot, 'shadow:' + tag, true, within ? within.cursor : ''); }
        if (!withinShown) { hiddenDepth--; }
        continue;
      }

      var style = __bcmStyle(child);
      var ownCursor = style ? style.cursor : '';
      if (!__bcmShown(style)) {
        hiddenDepth++;
        walk(child, frame, true, ownCursor);
        hiddenDepth--;
        continue;
      }

      if (tag === 'pre' && hiddenDepth === 0) {
        flush();
        var pre = (child.innerText || child.textContent || '').replace(/\\s+$/, '');
        if (pre) { pushItem({ kind: 'text', text: pre }); }
        continue;
      }

      if (tag === 'label' && hiddenDepth === 0 && child.control && child.control.matches(interactive) &&
          (__bcmVisible(child.control) || __bcmStandIn(child.control)) && __bcmLabelText(child).length <= 120) {
        walk(child, frame, true, ownCursor);
        continue;
      }

      var level = __bcmHeadingLevel(child, tag);
      if (level && hiddenDepth === 0) {
        flush();
        var heading = __bcmText(child);
        if (heading) { pushItem({ kind: 'text', text: heading, level: level }); }
        walk(child, frame, true, ownCursor);
        continue;
      }

      if (hiddenDepth === 0 && looseControl(child, tag, style, cursor)) {
        emitElement(child, frame, !child.matches(LOOSE_CONTROL));
        // A clickable card holds more text than its name carries, so that text is still read.
        if (__bcmText(child).length <= 120) { continue; }
      }

      var block = __bcmIsBlock(tag);
      if (block) { flush(); }
      if ((tag === 'td' || tag === 'th') && buffer.trim()) { buffer += ' | '; }
      if (tag === 'img' && child.alt && hiddenDepth === 0) { buffer += ' ' + child.alt + ' '; }
      walk(child, frame, suppressText, ownCursor);
      if (child.shadowRoot) { walk(child.shadowRoot, 'shadow:' + tag, suppressText, ownCursor); }
      if (block) { flush(); }
    }
  }

  function walkOwned(root, frame) {
    var OWNER = '[aria-owns],[aria-expanded=true][aria-controls]';
    var walked = [root];
    var owners = [root].concat(Array.prototype.slice.call(root.querySelectorAll(OWNER)));
    for (var o = 0; o < owners.length; o++) {
      var owner = owners[o];
      var ids = (owner.getAttribute('aria-owns') || '') + ' ' +
        (owner.getAttribute('aria-expanded') === 'true' ? owner.getAttribute('aria-controls') || '' : '');
      var list = ids.split(/\\s+/);
      var home = owner.getRootNode();
      for (var d = 0; d < list.length; d++) {
        var target = list[d] && home.getElementById ? home.getElementById(list[d]) : null;
        if (!target || walked.some(function (seen) { return seen.contains(target); })) { continue; }
        walked.push(target);
        flush();
        var outerStyle = target.parentElement ? __bcmStyle(target.parentElement) : null;
        var hiddenAbove = false;
        for (var up = target.parentNode; up && !hiddenAbove; up = up.parentNode || up.host) {
          var upStyle = up.nodeType === 1 ? __bcmStyle(up) : null;
          hiddenAbove = !!upStyle && upStyle.display === 'none';
        }
        if (hiddenAbove) { hiddenDepth++; }
        walk({ childNodes: [target] }, frame, hiddenAbove, outerStyle ? outerStyle.cursor : '');
        if (hiddenAbove) { hiddenDepth--; }
        flush();
        owners = owners.concat(target.matches(OWNER) ? [target] : [], Array.prototype.slice.call(target.querySelectorAll(OWNER)));
      }
    }
  }

  var start = scopeRoot || document.body;
  if (start && (start.tagName === 'IFRAME' || start.tagName === 'FRAME')) {
    var startInner = null;
    try { startInner = start.contentDocument; } catch (err) { startInner = null; }
    if (startInner && startInner.body) { start = startInner.body; }
  }
  if (start) {
    var startFrame = __bcmFrameLabel(start);
    var startStyle = start.tagName === 'IFRAME' || start.tagName === 'FRAME' ? null : __bcmStyle(start);
    var startCursor = startStyle ? startStyle.cursor : '';
    if (scopeRoot && scopeRoot.matches && scopeRoot.matches(interactive)) {
      emitElement(scopeRoot, startFrame);
      if (!__bcmSwallows(scopeRoot.tagName.toLowerCase())) { walk(start, startFrame, true, startCursor); }
    } else {
      walk(start, startFrame, false, startCursor);
    }
    if (start.shadowRoot) { walk(start.shadowRoot, 'shadow:' + start.tagName.toLowerCase(), false, startCursor); }
    if (scopeRoot) { walkOwned(start, startFrame); }
  }
  flush();

  // An avatar link points where a name link does: the name is enough.
  var named = new Set();
  for (var n = 0; n < items.length; n++) {
    if (items[n].kind === 'element' && items[n].tag === 'a' && items[n].name && items[n].href) { named.add(items[n].href); }
  }
  var kept = [];
  for (var k = 0; k < items.length; k++) {
    var item = items[k];
    if (item.kind === 'element' && item.tag === 'a' && !item.name && item.href && named.has(item.href)) {
      var el = __bcmRecall(item.ref);
      if (el) { el.removeAttribute('${REF_ATTRIBUTE}'); }
      __bcmForget(item.ref);
      listedElements--;
      totalElements--;
      continue;
    }
    kept.push(item);
  }
  items = kept;

  var outline;
  var outlineOmitted;
  if (!scopeRoot && !full && !controlsOnly && document.body &&
      (chars > ${jsValue(options.outlineChars ?? DEFAULT_OUTLINE_CHAR_THRESHOLD)} || totalElements > ${jsValue(options.outlineElements ?? DEFAULT_OUTLINE_ELEMENT_THRESHOLD)})) {
    var outlined = __bcmOutline(document.body, interactive, counted);
    outline = outlined.regions;
    if (outlined.omitted) { outlineOmitted = outlined.omitted; }
  }

  __bcmSweepRefs();

  var doc = document.scrollingElement || document.documentElement;
  return {
    scope: scopeRoot ? { role: __bcmRole(scopeRoot), tag: scopeRoot.tagName.toLowerCase(), name: __bcmTrim(__bcmName(scopeRoot), 60) } : undefined,
    url: location.href,
    title: document.title,
    items: items,
    totalElements: totalElements,
    listedElements: listedElements,
    hiddenElements: hiddenElements,
    elementsTruncated: elementsTruncated,
    scrollY: Math.round(doc.scrollTop),
    scrollHeight: Math.round(doc.scrollHeight),
    scrollMax: Math.max(0, Math.round(doc.scrollHeight) - Math.round(doc.clientHeight || 0)),
    collapsed: __bcmCollapsed(start || document.body, ${jsValue(MAX_COLLAPSED_SECTIONS)}),
    unreachableFrames: __bcmUnreachableFrames(scopeRoot),
    scopeUnreachableFrame: scopeFrameSrc === null ? undefined : { src: scopeFrameSrc },
    outline: outline,
    outlineOmitted: outlineOmitted
  };
})();`;
}

function tristateWord(
  value: boolean | "mixed" | undefined,
  on: string,
  off: string,
  mixed: string
): string | null {
  if (value === undefined) {
    return null;
  }
  return value === "mixed" ? mixed : value ? on : off;
}

function formatElement(
  item: PageElementItem,
  options: { includeSelectors: boolean; includeHrefs: boolean }
): string {
  const implied = !item.explicitRole && IMPLIED_TAGS[item.role]?.includes(item.tag);
  const parts = [`[${item.ref}] ${item.role}${implied ? "" : ` <${item.tag}>`}`];
  if (item.name) {
    parts.push(JSON.stringify(item.name));
  }
  if (options.includeSelectors) {
    parts.push(`selector=${JSON.stringify(item.selector)}`);
  }
  if (item.type) {
    parts.push(`type=${item.type}`);
  }
  if (item.value) {
    parts.push(`value=${JSON.stringify(item.value)}`);
  }
  if (item.placeholder && item.placeholder !== item.name) {
    parts.push(`placeholder=${JSON.stringify(item.placeholder)}`);
  }
  if (item.href && options.includeHrefs) {
    parts.push(`href=${JSON.stringify(item.href)}`);
  }
  const states = [
    item.disabled ? "disabled" : null,
    item.readonly ? "readonly" : null,
    tristateWord(item.checked, "checked", "unchecked", "mixed"),
    tristateWord(item.pressed, "pressed", "unpressed", "pressed=mixed"),
    item.selected ? "selected" : null,
    tristateWord(item.expanded, "expanded", "collapsed", ""),
  ];
  for (const state of states) {
    if (state) {
      parts.push(state);
    }
  }
  if (item.options?.length) {
    parts.push(`options=${JSON.stringify(item.options)}`);
    if (item.optionValues) {
      parts.push(`values=${JSON.stringify(item.optionValues)}`);
    }
    parts.push(`selected=${JSON.stringify(item.selectedValues ?? [])}`);
    if (item.moreOptions) {
      parts.push(`(+${item.moreOptions} more)`);
    }
  }
  if (item.frame) {
    parts.push(item.frame);
  }
  if (item.hidden) {
    parts.push("hidden");
  }
  return parts.join(" ");
}

export function formatPageItems(
  items: PageItem[],
  options: { includeSelectors: boolean; includeHrefs: boolean }
): string {
  const lines: string[] = [];
  for (const item of items) {
    if (item.kind === "element") {
      lines.push(formatElement(item, options));
    } else if (
      !item.level &&
      lines.length &&
      /^[\p{Pe}\p{Pf},.;:!?…、。，．！？：；"']+$/u.test(item.text) &&
      /[^"']/.test(item.text)
    ) {
      lines[lines.length - 1] += item.text;
    } else {
      lines.push(item.level ? `${"#".repeat(item.level)} ${item.text}` : item.text);
    }
  }
  return lines.join("\n");
}
