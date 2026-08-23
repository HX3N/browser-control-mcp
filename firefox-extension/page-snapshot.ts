import { jsValue, REF_ATTRIBUTE, ROOT_WALKER_SOURCE } from "./injected-common";

const INTERACTIVE_SELECTOR = [
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

const CONTEXT_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "[role=heading]",
  "label",
  "[role=alert]",
  "[role=status]",
].join(",");

const SNAPSHOT_HELPERS_SOURCE = `
${ROOT_WALKER_SOURCE}
function __bcmScope(el) {
  var root = el.getRootNode ? el.getRootNode() : el.ownerDocument;
  return root && root.querySelectorAll ? root : el.ownerDocument;
}

function __bcmVisible(el) {
  var rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) { return false; }
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') { return false; }
  // Elements from a frame belong to another document, and the top window's getComputedStyle
  // rejects them.
  var view = el.ownerDocument && el.ownerDocument.defaultView;
  var style = view ? view.getComputedStyle(el) : null;
  if (!style) { return false; }
  if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') { return false; }
  return true;
}

function __bcmText(node) {
  if (!node) { return ''; }
  var raw = node.innerText || node.textContent || '';
  return raw.replace(/\\s+/g, ' ').trim();
}

function __bcmTrim(value, limit) {
  if (!value) { return ''; }
  return value.length > limit ? value.slice(0, limit) + '...' : value;
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

  var own = __bcmText(el);
  if (own) { return __bcmTrim(own, 120); }

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
    if (typeof el.value === 'string' && el.value) { entry.value = __bcmTrim(el.value, 120); }
    if (el.disabled) { entry.disabled = true; }
  }
  var placeholder = el.getAttribute('placeholder');
  if (placeholder) { entry.placeholder = __bcmTrim(placeholder, 80); }
  if (tag === 'a' && el.href) { entry.href = __bcmTrim(el.href, 200); }
  if (typeof el.checked === 'boolean' && (el.type === 'checkbox' || el.type === 'radio')) { entry.checked = el.checked; }

  var expanded = el.getAttribute('aria-expanded');
  if (expanded === 'true' || expanded === 'false') { entry.expanded = expanded === 'true'; }

  if (tag === 'select') {
    var options = [];
    for (var i = 0; i < el.options.length && i < 40; i++) {
      options.push(el.options[i].value + (el.options[i].text ? ' | ' + __bcmText(el.options[i]) : ''));
    }
    entry.options = options;
  }

  return entry;
}
`;

export function buildSnapshotCode(options: {
  maxElements: number;
  interactiveOnly: boolean;
  includeHidden: boolean;
}): string {
  return `(function () {
${SNAPSHOT_HELPERS_SOURCE}
  var roots = __bcmRoots();

  for (var r = 0; r < roots.length; r++) {
    var previous = roots[r].querySelectorAll('[${REF_ATTRIBUTE}]');
    for (var p = 0; p < previous.length; p++) {
      previous[p].removeAttribute('${REF_ATTRIBUTE}');
    }
  }

  var selector = ${jsValue(INTERACTIVE_SELECTOR)};
  if (!${jsValue(options.interactiveOnly)}) {
    selector = selector + ',' + ${jsValue(CONTEXT_SELECTOR)};
  }

  var includeHidden = ${jsValue(options.includeHidden)};
  var shown = [];
  var concealed = [];

  for (var r2 = 0; r2 < roots.length; r2++) {
    var frame = __bcmFrameLabel(roots[r2]);
    var candidates = roots[r2].querySelectorAll(selector);
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      if (__bcmVisible(candidate)) {
        shown.push({ el: candidate, frame: frame, hidden: false });
      } else if (includeHidden) {
        concealed.push({ el: candidate, frame: frame, hidden: true });
      }
    }
  }

  // Hidden ones go last so that maxElements truncates them before anything the user can see.
  var found = shown.concat(concealed);
  var maxElements = ${jsValue(options.maxElements)};
  var elements = [];

  for (var k = 0; k < found.length && elements.length < maxElements; k++) {
    var ref = 'e' + (k + 1);
    found[k].el.setAttribute('${REF_ATTRIBUTE}', ref);
    elements.push(__bcmDescribe(found[k].el, ref, found[k].hidden, found[k].frame));
  }

  var doc = document.scrollingElement || document.documentElement;
  return {
    url: location.href,
    title: document.title,
    elements: elements,
    totalElements: found.length,
    hiddenElements: concealed.length,
    isTruncated: found.length > elements.length,
    scrollY: Math.round(doc.scrollTop),
    scrollHeight: Math.round(doc.scrollHeight)
  };
})();`;
}
