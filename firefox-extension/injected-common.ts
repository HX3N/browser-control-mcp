import type { ElementTarget } from "@browser-control-mcp/common/server-messages";

export const REF_ATTRIBUTE = "data-bcm-ref";

export function jsValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export const MAX_ROOT_DEPTH = 5;

// A cross-origin frame throws on contentDocument and stays out of the walk. That is the
// browser's own boundary, not a bug to route around.
export const ROOT_WALKER_SOURCE = `
function __bcmRoots() {
  var roots = [];
  function walk(root, depth) {
    if (!root || depth > ${MAX_ROOT_DEPTH} || roots.indexOf(root) !== -1) { return; }
    roots.push(root);
    var nodes = root.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.shadowRoot) { walk(node.shadowRoot, depth + 1); }
      var tag = node.tagName;
      if (tag === 'IFRAME' || tag === 'FRAME') {
        var inner = null;
        try { inner = node.contentDocument; } catch (err) { inner = null; }
        if (inner) { walk(inner, depth + 1); }
      }
    }
  }
  walk(document, 0);
  return roots;
}

function __bcmFrameLabel(root) {
  var host = root.host;
  if (host) { return 'shadow:' + host.tagName.toLowerCase(); }
  if (root === document) { return ''; }
  var frame = root.defaultView && root.defaultView.frameElement;
  if (!frame) { return 'frame'; }
  var name = frame.getAttribute('name') || frame.getAttribute('id') || frame.getAttribute('src') || '';
  if (name.length > 80) { name = name.slice(0, 80) + '...'; }
  return name ? 'frame:' + name : 'frame';
}
`;

export const ELEMENT_RESOLVER_SOURCE = `
${ROOT_WALKER_SOURCE}
function __bcmQueryAll(selector) {
  var roots = __bcmRoots();
  var found = [];
  for (var i = 0; i < roots.length; i++) {
    var matches = roots[i].querySelectorAll(selector);
    for (var j = 0; j < matches.length; j++) { found.push(matches[j]); }
  }
  return found;
}

function __bcmResolve(target) {
  if (target && target.ref) {
    var byRef = __bcmQueryAll('[${REF_ATTRIBUTE}="' + String(target.ref).replace(/"/g, '') + '"]');
    if (byRef.length > 0) { return byRef[0]; }
    throw new Error('No element carries ref "' + target.ref + '" any more. Refs are stamped by page-snapshot and are dropped when the page re-renders or navigates, so take a fresh snapshot and retry.');
  }
  if (target && target.selector) {
    var matches;
    try {
      matches = __bcmQueryAll(target.selector);
    } catch (err) {
      throw new Error('Invalid CSS selector "' + target.selector + '": ' + err.message);
    }
    var index = target.index || 0;
    if (matches.length === 0) {
      throw new Error('No element matches the selector "' + target.selector + '"');
    }
    if (index >= matches.length) {
      throw new Error('The selector "' + target.selector + '" matched ' + matches.length + ' element(s), so index ' + index + ' is out of range');
    }
    return matches[index];
  }
  throw new Error('Provide either a ref from a page-snapshot or a CSS selector');
}

function __bcmRect(el) {
  var r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function __bcmLabel(el) {
  var text = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || (el.innerText || '').trim() || el.getAttribute('name') || el.getAttribute('value') || '').replace(/\\s+/g, ' ');
  if (text.length > 60) { text = text.slice(0, 60) + '...'; }
  var tag = el.tagName.toLowerCase();
  return text ? tag + ' "' + text + '"' : tag;
}

function __bcmScroll() {
  var doc = document.scrollingElement || document.documentElement;
  return { scrollY: Math.round(doc.scrollTop), scrollHeight: Math.round(doc.scrollHeight) };
}
`;

export function targetLiteral(target: ElementTarget): string {
  return jsValue({
    ref: target.ref,
    selector: target.selector,
    index: target.index,
  });
}
