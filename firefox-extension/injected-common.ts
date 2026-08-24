import type { ElementTarget } from "@browser-control-mcp/common/server-messages";

export const REF_ATTRIBUTE = "data-bcm-ref";

export function jsValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export const MAX_ROOT_DEPTH = 5;

// A cross-origin frame throws on contentDocument and stays out of the walk. That is the
// browser's own boundary, not a bug to route around.
export const ROOT_WALKER_SOURCE = `
function __bcmRoots(start) {
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
  walk(start || document, 0);
  return roots;
}

function __bcmFrameLabel(root) {
  if (root === document) { return ''; }
  // An anchor carries its own .host, so the element case has to be settled before that is read.
  if (root.nodeType === 1) {
    var owner = root.getRootNode ? root.getRootNode() : null;
    if (owner && owner !== root && owner.nodeType !== 1) { return __bcmFrameLabel(owner); }
    return '';
  }
  var host = root.host;
  if (host && host.tagName) { return 'shadow:' + host.tagName.toLowerCase(); }
  var frame = root.defaultView && root.defaultView.frameElement;
  if (!frame) { return 'frame'; }
  var name = frame.getAttribute('name') || frame.getAttribute('id') || frame.getAttribute('src') || '';
  if (name.length > 80) { name = name.slice(0, 80) + '...'; }
  return name ? 'frame:' + name : 'frame';
}
`;

export const RESOLVER_SOURCE = `
function __bcmMemory() {
  if (!window.__bcmRefs) { window.__bcmRefs = new Map(); }
  return window.__bcmRefs;
}

function __bcmRemember(ref, el) {
  __bcmMemory().set(ref, el);
}

function __bcmForget(ref) {
  if (ref) { __bcmMemory().delete(ref); }
}

function __bcmForgetAll() {
  __bcmMemory().clear();
}

function __bcmQueryAll(selector, start) {
  var roots = __bcmRoots(start);
  var found = [];
  for (var i = 0; i < roots.length; i++) {
    var matches = roots[i].querySelectorAll(selector);
    for (var j = 0; j < matches.length; j++) { found.push(matches[j]); }
  }
  return found;
}

function __bcmResolve(target) {
  if (target && target.ref) {
    var ref = String(target.ref);
    // The stamp is an attribute, so a page that copies markup copies the ref with it. The element
    // behind a ref is remembered as well, and a copy cannot inherit that.
    var known = __bcmMemory().get(ref);
    if (known) {
      if (known.isConnected && known.getAttribute('${REF_ATTRIBUTE}') === ref) { return known; }
      throw new Error('The element behind ref "' + ref + '" has left the page. Refs are stamped by page-snapshot and are dropped when the page re-renders or navigates, so take a fresh snapshot and retry.');
    }
    var byRef = __bcmQueryAll('[${REF_ATTRIBUTE}="' + ref.replace(/"/g, '') + '"]');
    if (byRef.length === 1) { return byRef[0]; }
    if (byRef.length > 1) {
      throw new Error('Ref "' + ref + '" is stamped on ' + byRef.length + ' elements, which is what a page that copies markup carrying a ref leaves behind. Take a fresh snapshot and retry.');
    }
    throw new Error('No element carries ref "' + ref + '" any more. Refs are stamped by page-snapshot and are dropped when the page re-renders or navigates, so take a fresh snapshot and retry.');
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

export const SCROLL_ANCHOR_SOURCE = `
function __bcmScrollToAnchor(el, smooth) {
  if (typeof el.scrollIntoView === 'function') {
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { el.scrollIntoView(); }
  }
  var doc = document.scrollingElement || document.documentElement;
  var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  var goal = Math.max(0, Math.min(
    window.scrollY + el.getBoundingClientRect().top - viewportHeight / 3,
    Math.max(0, doc.scrollHeight - viewportHeight)
  ));
  if (Math.abs(goal - window.scrollY) > 1) {
    if (smooth) {
      window.scrollTo({ top: goal, behavior: 'smooth' });
    } else {
      window.scrollTo(0, goal);
    }
  }
}
`;

export const ELEMENT_RESOLVER_SOURCE = `
${ROOT_WALKER_SOURCE}
${RESOLVER_SOURCE}
`;

export function isElementTargeted(target?: ElementTarget): boolean {
  return !!(target && (target.ref || target.selector));
}

export function targetLiteral(target: ElementTarget): string {
  return jsValue({
    ref: target.ref,
    selector: target.selector,
    index: target.index,
  });
}
