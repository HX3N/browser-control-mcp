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

export const INTERACTIVE_SELECTOR = [
  "a[href]",
  "button",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  "[contenteditable=true]",
  "[role=button]",
  "[role=link]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=tab]",
  "[role=menuitem]",
  "[role=menuitemcheckbox]",
  "[role=menuitemradio]",
  "[role=option]",
  "[role=combobox]",
  "[role=textbox]",
  "[role=searchbox]",
  "[role=slider]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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
      var explicitText = __bcmText(explicitLabel);
      if (explicitText) { return __bcmTrim(explicitText, 120); }
    }
  }

  if (el.closest) {
    var wrappingLabel = el.closest('label');
    if (wrappingLabel && wrappingLabel !== el) {
      var wrappingText = __bcmText(wrappingLabel);
      if (wrappingText) { return __bcmTrim(wrappingText, 120); }
    }
  }

  if (!__bcmSensitive(el)) {
    var own = __bcmText(el);
    if (own) { return __bcmTrim(own, 120); }
  }

  var fallback = el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('name') || '';
  return __bcmTrim(fallback, 120);
}

function __bcmRole(el) {
  var explicit = el.getAttribute('role');
  if (explicit) { return explicit; }

  var tag = el.tagName.toLowerCase();
  if (tag === 'a') { return el.hasAttribute('href') ? 'link' : 'generic'; }
  if (tag === 'button' || tag === 'summary') { return 'button'; }
  if (tag === 'select') { return el.multiple ? 'listbox' : 'combobox'; }
  if (tag === 'textarea') { return 'textbox'; }
  if (tag === 'input') {
    var type = (el.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox') { return 'checkbox'; }
    if (type === 'radio') { return 'radio'; }
    if (type === 'submit' || type === 'button' || type === 'reset' || type === 'image') { return 'button'; }
    if (type === 'range') { return 'slider'; }
    if (type === 'search') { return 'searchbox'; }
    return 'textbox';
  }
  if (/^h[1-6]$/.test(tag)) { return 'heading'; }
  if (el.isContentEditable) { return 'textbox'; }
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

  if (hidden) { entry.hidden = true; }
  if (frame) { entry.frame = frame; }

  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    if (typeof el.value === 'string' && el.value) {
      entry.value = __bcmSensitive(el)
        ? '(' + el.value.length + ' characters, not shown)'
        : __bcmTrim(el.value, 120);
    }
    if (el.disabled) { entry.disabled = true; }
  }
  var placeholder = el.getAttribute('placeholder');
  if (placeholder) { entry.placeholder = __bcmTrim(placeholder, 80); }
  if (tag === 'a' && el.href) { entry.href = __bcmShortHref(el.href); }
  if (typeof el.checked === 'boolean' && (el.type === 'checkbox' || el.type === 'radio')) { entry.checked = el.checked; }

  var expanded = el.getAttribute('aria-expanded');
  if (expanded === 'true' || expanded === 'false') { entry.expanded = expanded === 'true'; }
  if (tag === 'summary' && el.parentElement && el.parentElement.tagName.toLowerCase() === 'details') {
    entry.expanded = el.parentElement.open === true;
  }

  if (tag === 'select' && !__bcmSensitive(el)) {
    var options = [];
    for (var i = 0; i < el.options.length && i < 40; i++) {
      options.push(el.options[i].value + (el.options[i].text ? ' | ' + __bcmText(el.options[i]) : ''));
    }
    entry.options = options;
  }

  return entry;
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
  hidden?: boolean;
  frame?: string;
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  options?: string[];
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
  outline?: PageRegion[];
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

function __bcmOutline(body, interactive) {
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
    if (el.matches(interactive)) { m.controls++; }
    measureChildren(el, m);
    if (el.shadowRoot) { measureChildren(el.shadowRoot, m); }
    return m;
  }
  function isLandmark(el) {
    if (${jsValue(LANDMARK_TAGS)}.indexOf(el.tagName.toLowerCase()) !== -1) { return true; }
    var role = el.getAttribute('role');
    return !!role && ${jsValue(LANDMARK_ROLES)}.indexOf(role) !== -1;
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
        if (k.matches(interactive)) { continue; }
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
  var regions = [];
  function emit(el, depth) {
    if (regions.length >= ${jsValue(MAX_OUTLINE_REGIONS)}) { return; }
    el = unwrap(el);
    var m = measure(el);
    var ref = __bcmRefFor(el) || __bcmMintRef();
    el.setAttribute('${REF_ATTRIBUTE}', ref);
    __bcmRemember(ref, el);
    var entry = { ref: ref, tag: el.tagName.toLowerCase(), name: __bcmTrim(label(el), 80), depth: depth, chars: m.chars, controls: m.controls };
    var role = el.getAttribute('role');
    if (role) { entry.role = role; }
    if (el.id) { entry.id = el.id; }
    regions.push(entry);
    if (depth >= ${jsValue(OUTLINE_MAX_DEPTH)}) { return; }
    var kids = innerRegions(el);
    for (var i = 0; i < kids.length; i++) { emit(kids[i], depth + 1); }
  }
  var start = unwrap(body);
  var top = regionChildren(start);
  if (top.length) {
    for (var t = 0; t < top.length; t++) { emit(top[t], 0); }
  } else {
    emit(start, 0);
  }
  return regions;
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
function __bcmRendered(el) {
  var view = el.ownerDocument && el.ownerDocument.defaultView;
  var style = view ? view.getComputedStyle(el) : null;
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
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

  __bcmSeedRefs(__bcmHighestRef());

  var interactive = ${jsValue(INTERACTIVE_SELECTOR)};
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
  function emitElement(el, frame) {
    var visible = hiddenDepth === 0 && __bcmVisible(el);
    totalElements++;
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
    entry.kind = 'element';
    items.push(entry);
    chars += entry.name.length + 24;
  }

  function walk(node, frame, suppressText) {
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
          walk(inner.body, label, suppressText);
          flush();
          bufferFrame = outerFrame;
        }
        continue;
      }

      if (child.matches(interactive)) {
        emitElement(child, frame);
        // A container made focusable by tabindex or a role still holds real controls.
        if (__bcmSwallows(tag) || !child.querySelector(interactive)) { continue; }
        walk(child, frame, true);
        if (child.shadowRoot) { walk(child.shadowRoot, 'shadow:' + tag, true); }
        continue;
      }

      if (!__bcmRendered(child)) {
        hiddenDepth++;
        walk(child, frame, true);
        hiddenDepth--;
        continue;
      }

      if (tag === 'pre' && hiddenDepth === 0) {
        flush();
        var pre = (child.innerText || child.textContent || '').replace(/\\s+$/, '');
        if (pre) { pushItem({ kind: 'text', text: pre }); }
        continue;
      }

      var level = __bcmHeadingLevel(child, tag);
      if (level && hiddenDepth === 0) {
        flush();
        var heading = __bcmText(child);
        if (heading) { pushItem({ kind: 'text', text: heading, level: level }); }
        walk(child, frame, true);
        continue;
      }

      var block = __bcmIsBlock(tag);
      if (block) { flush(); }
      if ((tag === 'td' || tag === 'th') && buffer.trim()) { buffer += ' | '; }
      if (tag === 'img' && child.alt && hiddenDepth === 0) { buffer += ' ' + child.alt + ' '; }
      walk(child, frame, suppressText);
      if (child.shadowRoot) { walk(child.shadowRoot, 'shadow:' + tag, suppressText); }
      if (block) { flush(); }
    }
  }

  var start = scopeRoot || document.body;
  if (start) {
    var startFrame = __bcmFrameLabel(start);
    if (scopeRoot && scopeRoot.matches && scopeRoot.matches(interactive)) {
      emitElement(scopeRoot, startFrame);
      if (!__bcmSwallows(scopeRoot.tagName.toLowerCase())) { walk(start, startFrame, true); }
    } else {
      walk(start, startFrame, false);
    }
    if (start.shadowRoot) { walk(start.shadowRoot, 'shadow:' + start.tagName.toLowerCase(), false); }
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
  if (!scopeRoot && !full && !controlsOnly && document.body &&
      (chars > ${jsValue(options.outlineChars ?? DEFAULT_OUTLINE_CHAR_THRESHOLD)} || totalElements > ${jsValue(options.outlineElements ?? DEFAULT_OUTLINE_ELEMENT_THRESHOLD)})) {
    outline = __bcmOutline(document.body, interactive);
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
    outline: outline
  };
})();`;
}

export function formatPageItems(
  items: PageItem[],
  options: { includeSelectors: boolean; includeHrefs: boolean }
): string {
  return items
    .map((item) => {
      if (item.kind === "text") {
        return item.level ? `${"#".repeat(item.level)} ${item.text}` : item.text;
      }
      const attributes: string[] = options.includeSelectors
        ? [`selector: ${item.selector}`]
        : [];
      if (item.value) {
        attributes.push(`value: ${item.value}`);
      }
      if (item.placeholder) {
        attributes.push(`placeholder: ${item.placeholder}`);
      }
      if (item.href && options.includeHrefs) {
        attributes.push(`href: ${item.href}`);
      }
      if (item.disabled) {
        attributes.push("disabled");
      }
      if (item.checked !== undefined) {
        attributes.push(`checked: ${item.checked}`);
      }
      if (item.expanded !== undefined) {
        attributes.push(`expanded: ${item.expanded}`);
      }
      if (item.options?.length) {
        attributes.push(`options: ${item.options.join(" / ")}`);
      }
      if (item.frame) {
        attributes.push(item.frame);
      }
      if (item.hidden) {
        attributes.push("hidden");
      }
      const suffix = attributes.length ? ` - ${attributes.join(", ")}` : "";
      const tag =
        (item.role === "link" && item.tag === "a") ||
        (item.role === "button" && item.tag === "button")
          ? ""
          : ` <${item.tag}>`;
      return `[${item.ref}] ${item.role}${tag} "${item.name}"${suffix}`;
    })
    .join("\n");
}
