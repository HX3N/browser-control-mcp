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
    // A frame has no light-DOM children, so a walk that starts on one reaches nothing at all.
    if (root.tagName === 'IFRAME' || root.tagName === 'FRAME') {
      var own = null;
      try { own = root.contentDocument; } catch (err) { own = null; }
      if (own) { walk(own, depth + 1); }
    }
    if (root.shadowRoot) { walk(root.shadowRoot, depth + 1); }
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

function __bcmUnreachableFrames(scope) {
  var roots = __bcmRoots(scope);
  var out = [];
  for (var i = 0; i < roots.length; i++) {
    if (!roots[i].querySelectorAll) { continue; }
    var frames = roots[i].querySelectorAll('iframe,frame');
    for (var f = 0; f < frames.length; f++) {
      var inner = null;
      try { inner = frames[f].contentDocument; } catch (err) { inner = null; }
      if (inner) { continue; }
      var el = frames[f];
      var rect = { width: 0, height: 0 };
      try { rect = el.getBoundingClientRect(); } catch (err) { rect = { width: 0, height: 0 }; }
      var src = '';
      try { src = el.src || el.getAttribute('src') || ''; } catch (err) { src = ''; }
      var entry = {
        src: src,
        width: Math.round(rect.width || 0),
        height: Math.round(rect.height || 0)
      };
      var name = el.getAttribute('name') || el.getAttribute('title') || el.getAttribute('id') || '';
      if (name) { entry.name = name.slice(0, 80); }
      if (!entry.width || !entry.height) { entry.hidden = true; }
      out.push(entry);
    }
  }
  return out;
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

// A rect from inside a frame is measured against that frame's viewport, while everything that
// consumes one - the capture rect, the scroll goal, the fixed overlay - lives in the top document.
function __bcmRect(el) {
  var r = el.getBoundingClientRect();
  var top = r.top;
  var left = r.left;
  var win = el.ownerDocument && el.ownerDocument.defaultView;
  while (win && win !== window) {
    var frame = null;
    try { frame = win.frameElement; } catch (err) { frame = null; }
    if (!frame) { break; }
    var fr = frame.getBoundingClientRect();
    top += fr.top + (frame.clientTop || 0);
    left += fr.left + (frame.clientLeft || 0);
    win = frame.ownerDocument && frame.ownerDocument.defaultView;
  }
  return { top: top, left: left, width: r.width, height: r.height };
}

function __bcmLabel(el) {
  var text = (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || (el.innerText || '').trim() || el.getAttribute('name') || el.getAttribute('value') || '').replace(/\\s+/g, ' ');
  if (text.length > 60) { text = text.slice(0, 60) + '...'; }
  var tag = el.tagName.toLowerCase();
  return text ? tag + ' "' + text + '"' : tag;
}

function __bcmScroll() {
  var doc = document.scrollingElement || document.documentElement;
  var height = Math.round(doc.scrollHeight);
  var seen = Math.round(doc.clientHeight || window.innerHeight || 0);
  return { scrollY: Math.round(doc.scrollTop), scrollHeight: height, scrollMax: Math.max(0, height - seen) };
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
    window.scrollY + __bcmRect(el).top - viewportHeight / 3,
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

export const PAGE_READ_SOURCE = `
function __bcmFlatText(el, limit) {
  var raw = el.getAttribute('aria-label') || el.innerText || el.textContent || '';
  raw = raw.replace(/\\s+/g, ' ').trim();
  return raw.length > limit ? raw.slice(0, limit) + '...' : raw;
}

function __bcmOnScreen(el) {
  var rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) { return false; }
  var view = el.ownerDocument && el.ownerDocument.defaultView;
  var style = view ? view.getComputedStyle(el) : null;
  if (!style) { return false; }
  return style.visibility !== 'hidden' && style.display !== 'none';
}

function __bcmPanelFor(el) {
  var controls = el.getAttribute('aria-controls');
  if (!controls) { return null; }
  var doc = el.ownerDocument;
  var ids = controls.split(/\\s+/);
  for (var i = 0; i < ids.length; i++) {
    var panel = ids[i] && doc.getElementById ? doc.getElementById(ids[i]) : null;
    if (panel) { return panel; }
  }
  return null;
}

// Only frame documents are added: a shadow root's text already rides the host's innerText.
function __bcmReadRoots(scope) {
  var roots = __bcmRoots(scope);
  var out = [scope];
  for (var i = 0; i < roots.length; i++) {
    var root = roots[i];
    if (root !== scope && root.nodeType === 9 && root !== document && root.body) { out.push(root.body); }
  }
  return out;
}

function __bcmReadText(scope) {
  var roots = __bcmReadRoots(scope);
  var parts = [scope.innerText || ''];
  for (var i = 1; i < roots.length; i++) {
    var text = roots[i].innerText || '';
    if (!text) { continue; }
    var label = __bcmFrameLabel(roots[i].ownerDocument) || 'frame';
    parts.push('[' + label + ']\\n' + text);
  }
  return parts.join('\\n\\n');
}

function __bcmFieldLabel(el) {
  var aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) { return aria.trim().slice(0, 80); }
  var labels = el.labels;
  if (labels && labels.length) {
    var text = (labels[0].textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) { return text.slice(0, 80); }
  }
  var fallback = el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || el.id || '';
  return fallback.slice(0, 80);
}

function __bcmFields(scope, limit) {
  var roots = __bcmReadRoots(scope);
  var out = [];
  for (var r = 0; r < roots.length && out.length < limit; r++) {
    if (!roots[r].querySelectorAll) { continue; }
    var nodes = roots[r].querySelectorAll('input,textarea,select');
    for (var i = 0; i < nodes.length && out.length < limit; i++) {
      var el = nodes[i];
      var tag = el.tagName.toLowerCase();
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (tag === 'input' && (type === 'password' || type === 'hidden')) { continue; }
      if (!__bcmOnScreen(el)) { continue; }
      var entry = { label: __bcmFieldLabel(el), kind: tag };
      if (tag === 'select') {
        var chosen = el.options && el.selectedIndex >= 0 ? el.options[el.selectedIndex] : null;
        entry.value = chosen ? __bcmFlatText(chosen, 120) : '';
        entry.options = el.options ? el.options.length : 0;
      } else if (type === 'checkbox' || type === 'radio') {
        entry.value = el.checked ? 'checked' : 'unchecked';
      } else {
        var value = typeof el.value === 'string' ? el.value.trim() : '';
        if (!value) { continue; }
        entry.value = value.length > 200 ? value.slice(0, 200) + '...' : value;
      }
      out.push(entry);
    }
  }
  return out;
}

function __bcmCollapsed(scope, limit) {
  var found = [];
  if (!scope || !scope.querySelectorAll) { return found; }
  var roots = __bcmReadRoots(scope);

  for (var r = 0; r < roots.length && found.length < limit; r++) {
    var root = roots[r];
    if (!root.querySelectorAll) { continue; }

    var closed = [];
    if (root.matches && root.matches('details:not([open])')) { closed.push(root); }
    var nested = root.querySelectorAll('details:not([open])');
    for (var d = 0; d < nested.length; d++) {
      var details = nested[d];
      var parent = details.parentElement;
      // A closed details inside another closed one is already covered by the outer entry.
      if (parent && parent.closest && parent.closest('details:not([open])')) { continue; }
      closed.push(details);
    }

    for (var c = 0; c < closed.length && found.length < limit; c++) {
      var summary = closed[c].querySelector('summary');
      if (summary && !__bcmOnScreen(summary)) { continue; }
      var summaryLength = summary ? summary.textContent.length : 0;
      found.push({
        label: summary ? __bcmFlatText(summary, 120) : '',
        kind: 'details',
        chars: Math.max(0, closed[c].textContent.length - summaryLength)
      });
    }

    var toggles = root.querySelectorAll('[aria-expanded="false"],[role="tab"][aria-selected="false"],[aria-controls]');
    for (var t = 0; t < toggles.length && found.length < limit; t++) {
      var toggle = toggles[t];
      if (toggle.tagName.toLowerCase() === 'summary') { continue; }
      if (toggle.closest && toggle.closest('details:not([open])')) { continue; }
      if (!__bcmOnScreen(toggle)) { continue; }

      var expanded = toggle.getAttribute('aria-expanded');
      var selected = toggle.getAttribute('aria-selected');
      if (expanded === 'true' || selected === 'true') { continue; }

      var panel = __bcmPanelFor(toggle);
      // Without aria-expanded the only proof of a collapse is a panel this control names and
      // the page does not show; a control with neither says nothing.
      if (expanded !== 'false' && !panel) { continue; }
      if (panel && __bcmOnScreen(panel)) { continue; }

      var kind = toggle.getAttribute('role') === 'tab' || selected === 'false' ? 'tab' : 'expandable';
      var entry = { label: __bcmFlatText(toggle, 120), kind: kind };
      if (panel) { entry.chars = panel.textContent.length; }
      found.push(entry);
    }
  }

  return found;
}
`;
