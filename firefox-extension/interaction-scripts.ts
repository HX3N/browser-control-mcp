import type {
  ClickElementServerMessage,
  ElementTarget,
  PressKeyServerMessage,
  ScrollPageServerMessage,
  SelectOptionServerMessage,
  TypeTextServerMessage,
  WaitForElementServerMessage,
} from "@browser-control-mcp/common/server-messages";
import {
  ELEMENT_RESOLVER_SOURCE,
  jsValue,
  targetLiteral,
} from "./injected-common";

export interface InteractionScriptResult {
  target: string;
  detail: string;
  url: string;
  scrollY: number;
  scrollHeight: number;
}

export interface WaitProbeResult {
  matchCount: number;
  satisfied: boolean;
}

export interface ElementBoxResult {
  rect: { x: number; y: number; width: number; height: number };
  label: string;
  elementWidth: number;
  elementHeight: number;
  clipped: boolean;
  scrollY: number;
  scrollHeight: number;
}

export const CAPTURE_PADDING_PX = 8;
const MAX_CAPTURE_HEIGHT_PX = 2000;

const VALUE_SETTER_SOURCE = `
function __bcmSetValue(el, value) {
  var proto = Object.getPrototypeOf(el);
  var descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
}

function __bcmNotify(el) {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function __bcmSubmitOwner(el) {
  var form = el.form || (el.closest ? el.closest('form') : null);
  if (!form) { return false; }
  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
  } else {
    form.submit();
  }
  return true;
}

var __BCM_LEGACY_CODES = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ' ': 32,
  PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46
};

function __bcmCodeName(key) {
  if (key.length !== 1) { return key; }
  if (key === ' ') { return 'Space'; }
  if (/[a-zA-Z]/.test(key)) { return 'Key' + key.toUpperCase(); }
  if (/[0-9]/.test(key)) { return 'Digit' + key; }
  return '';
}

function __bcmLegacyCode(key) {
  if (Object.prototype.hasOwnProperty.call(__BCM_LEGACY_CODES, key)) {
    return __BCM_LEGACY_CODES[key];
  }
  if (key.length === 1) { return key.toUpperCase().charCodeAt(0); }
  return 0;
}

function __bcmKeyEvents(el, key, modifiers) {
  var legacy = __bcmLegacyCode(key);
  var init = {
    key: key,
    code: __bcmCodeName(key),
    keyCode: legacy,
    which: legacy,
    charCode: 0,
    bubbles: true,
    cancelable: true,
    composed: true,
    view: el.ownerDocument ? el.ownerDocument.defaultView : window,
    ctrlKey: modifiers.indexOf('Control') !== -1,
    shiftKey: modifiers.indexOf('Shift') !== -1,
    altKey: modifiers.indexOf('Alt') !== -1,
    metaKey: modifiers.indexOf('Meta') !== -1
  };
  var allowed = el.dispatchEvent(new KeyboardEvent('keydown', init));
  if (allowed && key.length === 1) {
    var press = {};
    for (var name in init) { press[name] = init[name]; }
    press.charCode = key.charCodeAt(0);
    press.keyCode = key.charCodeAt(0);
    press.which = key.charCodeAt(0);
    el.dispatchEvent(new KeyboardEvent('keypress', press));
  }
  el.dispatchEvent(new KeyboardEvent('keyup', init));
  return allowed;
}
`;

const KEY_DEFAULT_ACTION_SOURCE = `
function __bcmEditableKind(el) {
  if (!el || !el.tagName) { return 'none'; }
  var tag = el.tagName.toLowerCase();
  if (tag === 'textarea') { return 'text'; }
  if (tag === 'input') {
    var type = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'url', 'tel', 'password'].indexOf(type) !== -1 ? 'text' : 'field';
  }
  if (el.isContentEditable) { return 'rich'; }
  return 'none';
}

function __bcmEditingHost(el) {
  var node = el;
  while (node.parentElement && node.parentElement.isContentEditable) {
    node = node.parentElement;
  }
  return node;
}

function __bcmSelection(el) {
  var view = (el.ownerDocument || document).defaultView;
  return view ? view.getSelection() : null;
}

function __bcmWordEdge(value, index, forward) {
  var i = index;
  if (forward) {
    while (i < value.length && /\\s/.test(value.charAt(i))) { i++; }
    while (i < value.length && !/\\s/.test(value.charAt(i))) { i++; }
  } else {
    while (i > 0 && /\\s/.test(value.charAt(i - 1))) { i--; }
    while (i > 0 && !/\\s/.test(value.charAt(i - 1))) { i--; }
  }
  return i;
}

function __bcmLineStart(value, index) {
  return value.lastIndexOf('\\n', index - 1) + 1;
}

function __bcmLineEnd(value, index) {
  var end = value.indexOf('\\n', index);
  return end === -1 ? value.length : end;
}

function __bcmSelectAll(el, kind) {
  if (kind === 'text' || kind === 'field') {
    el.select();
    return 'selected every character in the field';
  }
  var doc = el.ownerDocument || document;
  var host = kind === 'rich' ? __bcmEditingHost(el) : doc.body;
  var sel = __bcmSelection(el);
  if (!sel || !host) { return ''; }
  var range = doc.createRange();
  range.selectNodeContents(host);
  sel.removeAllRanges();
  sel.addRange(range);
  return kind === 'rich' ? 'selected the whole editable region' : 'selected the whole document';
}

function __bcmClipboard(command) {
  var done = false;
  try { done = document.execCommand(command); } catch (err) { done = false; }
  if (!done) {
    throw new Error('The browser refused to ' + command + '. It needs a non-empty selection - select the text first, for example with Control+A.');
  }
  return command === 'cut' ? 'cut the selection to the clipboard' : 'copied the selection to the clipboard';
}

function __bcmHistory(command) {
  var done = false;
  try { done = document.execCommand(command); } catch (err) { done = false; }
  if (!done) { return 'found nothing to ' + command; }
  return command === 'undo' ? 'undid the last edit' : 'redid the last edit';
}

function __bcmMoveCaretInText(el, key, word, shift) {
  var value = el.value == null ? '' : String(el.value);
  var start = el.selectionStart == null ? value.length : el.selectionStart;
  var end = el.selectionEnd == null ? value.length : el.selectionEnd;

  if (!shift && !word && start !== end && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    var edge = key === 'ArrowLeft' ? start : end;
    el.setSelectionRange(edge, edge);
    return 'collapsed the selection to offset ' + edge;
  }

  var backward = el.selectionDirection === 'backward';
  var anchor = backward ? end : start;
  var focus = backward ? start : end;
  if (!shift) {
    focus = (key === 'ArrowLeft' || key === 'Home' || key === 'ArrowUp') ? start : end;
  }

  var pos = focus;
  if (key === 'ArrowLeft') {
    pos = word ? __bcmWordEdge(value, focus, false) : Math.max(0, focus - 1);
  } else if (key === 'ArrowRight') {
    pos = word ? __bcmWordEdge(value, focus, true) : Math.min(value.length, focus + 1);
  } else if (key === 'Home') {
    pos = word ? 0 : __bcmLineStart(value, focus);
  } else if (key === 'End') {
    pos = word ? value.length : __bcmLineEnd(value, focus);
  } else if (key === 'ArrowUp') {
    var upStart = __bcmLineStart(value, focus);
    if (upStart === 0) {
      pos = 0;
    } else {
      pos = Math.min(__bcmLineStart(value, upStart - 1) + (focus - upStart), upStart - 1);
    }
  } else if (key === 'ArrowDown') {
    var downStart = __bcmLineStart(value, focus);
    var downEnd = __bcmLineEnd(value, focus);
    if (downEnd === value.length) {
      pos = value.length;
    } else {
      pos = Math.min(downEnd + 1 + (focus - downStart), __bcmLineEnd(value, downEnd + 1));
    }
  }

  if (shift) {
    el.setSelectionRange(Math.min(anchor, pos), Math.max(anchor, pos), pos < anchor ? 'backward' : 'forward');
    return 'extended the selection to offset ' + pos;
  }
  el.setSelectionRange(pos, pos);
  return 'moved the caret to offset ' + pos;
}

function __bcmMoveCaretInPage(el, key, word, shift) {
  var sel = __bcmSelection(el);
  if (!sel || typeof sel.modify !== 'function') { return ''; }
  var direction = (key === 'ArrowLeft' || key === 'Home' || key === 'ArrowUp') ? 'backward' : 'forward';
  var granularity = 'character';
  if (key === 'Home' || key === 'End') {
    granularity = word ? 'documentboundary' : 'lineboundary';
  } else if (key === 'ArrowUp' || key === 'ArrowDown') {
    granularity = 'line';
  } else if (word) {
    granularity = 'word';
  }
  sel.modify(shift ? 'extend' : 'move', direction, granularity);
  return (shift ? 'extended the selection ' : 'moved the caret ') + direction + ' by one ' + granularity;
}

function __bcmDeleteInText(el, backspace, word) {
  var value = el.value == null ? '' : String(el.value);
  var from = el.selectionStart == null ? value.length : el.selectionStart;
  var to = el.selectionEnd == null ? value.length : el.selectionEnd;
  if (from === to) {
    if (backspace) {
      from = word ? __bcmWordEdge(value, from, false) : Math.max(0, from - 1);
    } else {
      to = word ? __bcmWordEdge(value, to, true) : Math.min(value.length, to + 1);
    }
  }
  if (from === to) { return 'found nothing to delete'; }
  var removed = to - from;
  __bcmSetValue(el, value.slice(0, from) + value.slice(to));
  el.setSelectionRange(from, from);
  __bcmNotify(el);
  return 'deleted ' + removed + (removed === 1 ? ' character' : ' characters');
}

function __bcmDeleteInPage(el, backspace, word) {
  var sel = __bcmSelection(el);
  if (word && sel && typeof sel.modify === 'function' && sel.isCollapsed) {
    sel.modify('extend', backspace ? 'backward' : 'forward', 'word');
  }
  var done = false;
  try {
    done = document.execCommand(backspace ? 'delete' : 'forwardDelete');
  } catch (err) {
    done = false;
  }
  if (!done) { return 'found nothing to delete'; }
  return 'deleted the ' + (backspace ? 'preceding' : 'following') + ' text';
}

function __bcmDefaultAction(el, key, modifiers) {
  var accel = modifiers.indexOf('Control') !== -1 || modifiers.indexOf('Meta') !== -1;
  var shift = modifiers.indexOf('Shift') !== -1;
  var alt = modifiers.indexOf('Alt') !== -1;
  var kind = __bcmEditableKind(el);

  if (accel && !alt) {
    var letter = key.length === 1 ? key.toLowerCase() : key;
    if (letter === 'a') { return __bcmSelectAll(el, kind); }
    if (letter === 'c') { return __bcmClipboard('copy'); }
    if (letter === 'x') { return __bcmClipboard('cut'); }
    if (letter === 'v') {
      throw new Error('Pasting cannot be emulated from a page script: the clipboard is not readable there. Use type-into-page-element to enter the text instead.');
    }
    if (letter === 'z') { return __bcmHistory(shift ? 'redo' : 'undo'); }
    if (letter === 'y') { return __bcmHistory('redo'); }
  }

  if (alt) { return ''; }

  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' ||
      key === 'ArrowDown' || key === 'Home' || key === 'End') {
    if (kind === 'text') { return __bcmMoveCaretInText(el, key, accel, shift); }
    return __bcmMoveCaretInPage(el, key, accel, shift);
  }

  if (key === 'Backspace' || key === 'Delete') {
    if (kind === 'text') { return __bcmDeleteInText(el, key === 'Backspace', accel); }
    if (kind === 'rich') { return __bcmDeleteInPage(el, key === 'Backspace', accel); }
    return '';
  }

  return '';
}
`;

export function buildClickCode(request: ClickElementServerMessage): string {
  const button = request.button ?? "left";
  const buttonIndex = button === "middle" ? 1 : button === "right" ? 2 : 0;
  const clickCount = Math.max(1, Math.min(3, request.clickCount ?? 1));

  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
  var el = __bcmResolve(${targetLiteral(request)});
  if (el.disabled) {
    throw new Error('The element is disabled and cannot be clicked');
  }

  var label = __bcmLabel(el);
  if (typeof el.scrollIntoView === 'function') {
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (err) { el.scrollIntoView(); }
  }
  var rect = el.getBoundingClientRect();
  var clientX = rect.left + rect.width / 2;
  var clientY = rect.top + rect.height / 2;
  var buttonIndex = ${buttonIndex};
  var pointerInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: clientX,
    clientY: clientY,
    button: buttonIndex,
    buttons: buttonIndex === 0 ? 1 : buttonIndex === 1 ? 4 : 2
  };

  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (err) { /* focus is best effort */ }
  }

  el.dispatchEvent(new MouseEvent('mouseover', pointerInit));
  el.dispatchEvent(new MouseEvent('mousemove', pointerInit));
  el.dispatchEvent(new MouseEvent('mousedown', pointerInit));
  el.dispatchEvent(new MouseEvent('mouseup', pointerInit));

  var clickCount = ${clickCount};
  if (buttonIndex === 0) {
    for (var i = 0; i < clickCount; i++) {
      el.click();
    }
    if (clickCount > 1) {
      el.dispatchEvent(new MouseEvent('dblclick', pointerInit));
    }
  } else if (buttonIndex === 2) {
    el.dispatchEvent(new MouseEvent('contextmenu', pointerInit));
  } else {
    el.dispatchEvent(new MouseEvent('auxclick', pointerInit));
  }

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Dispatched ' + clickCount + ' ' + ${jsValue(button)} + ' click(s)',
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight
  };
})();`;
}

export function buildTypeCode(request: TypeTextServerMessage): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${VALUE_SETTER_SOURCE}
  var el = __bcmResolve(${targetLiteral(request)});
  if (el.disabled || el.readOnly) {
    throw new Error('The element is disabled or read-only and cannot accept text');
  }

  var label = __bcmLabel(el);
  var text = ${jsValue(request.text)};
  var clearFirst = ${jsValue(request.clearFirst !== false)};

  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (err) { /* focus is best effort */ }
  }

  var isEditable = el.isContentEditable;
  if (isEditable) {
    if (clearFirst) { el.textContent = ''; }
    el.textContent = (el.textContent || '') + text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  } else if (typeof el.value === 'string') {
    var next = clearFirst ? text : (el.value || '') + text;
    __bcmSetValue(el, next);
    __bcmNotify(el);
  } else {
    throw new Error('The element is neither an input, a textarea nor a contenteditable node');
  }

  var submitted = false;
  if (${jsValue(request.submit === true)}) {
    __bcmKeyEvents(el, 'Enter', []);
    submitted = __bcmSubmitOwner(el);
  }

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Typed ' + text.length + ' character(s)' + (submitted ? ' and submitted the owning form' : ''),
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight
  };
})();`;
}

export function buildPressKeyCode(request: PressKeyServerMessage): string {
  const hasTarget = Boolean(request.ref || request.selector);
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${VALUE_SETTER_SOURCE}
${KEY_DEFAULT_ACTION_SOURCE}
  var el = ${
    hasTarget
      ? `__bcmResolve(${targetLiteral(request)})`
      : "document.activeElement || document.body"
  };
  var label = __bcmLabel(el);
  var key = ${jsValue(request.key)};
  var modifiers = ${jsValue(request.modifiers ?? [])};

  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (err) { /* focus is best effort */ }
  }

  var allowed = __bcmKeyEvents(el, key, modifiers);

  var submitted = false;
  var performed = '';
  if (allowed) {
    if (key === 'Enter' && modifiers.length === 0) {
      submitted = __bcmSubmitOwner(el);
    }
    if (!submitted) {
      performed = __bcmDefaultAction(el, key, modifiers);
    }
  }

  var outcome = '';
  if (submitted) {
    outcome = ' and submitted the owning form';
  } else if (performed) {
    outcome = ' and ' + performed;
  } else if (!allowed) {
    outcome = '; the page handled it and cancelled the default action';
  }

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Pressed ' + (modifiers.length ? modifiers.join('+') + '+' : '') + key + outcome,
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight
  };
})();`;
}

export function buildScrollCode(request: ScrollPageServerMessage): string {
  const hasTarget = Boolean(request.ref || request.selector);
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
  var doc = document.scrollingElement || document.documentElement;
  var direction = ${jsValue(request.direction)};
  var viewport = window.innerHeight || doc.clientHeight;
  var step = ${jsValue(request.amount ?? null)};
  if (step === null) { step = Math.round(viewport * 0.85); }
  var label = 'document';

  if (direction === 'element') {
    ${
      hasTarget
        ? `var el = __bcmResolve(${targetLiteral(request)});
    el.scrollIntoView({ block: 'center', inline: 'center' });
    label = __bcmLabel(el);`
        : `throw new Error('Scrolling to an element needs a ref or a selector');`
    }
  } else if (direction === 'top') {
    window.scrollTo(0, 0);
  } else if (direction === 'bottom') {
    window.scrollTo(0, doc.scrollHeight);
  } else if (direction === 'up') {
    window.scrollBy(0, -step);
  } else {
    window.scrollBy(0, step);
  }

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Scrolled ' + direction + ', now at ' + scroll.scrollY + ' of ' + scroll.scrollHeight,
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight
  };
})();`;
}

export function buildSelectOptionCode(
  request: SelectOptionServerMessage
): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${VALUE_SETTER_SOURCE}
  var el = __bcmResolve(${targetLiteral(request)});
  if (el.tagName.toLowerCase() !== 'select') {
    throw new Error('select-option only works on a <select> element, got <' + el.tagName.toLowerCase() + '>');
  }
  if (el.disabled) {
    throw new Error('The select element is disabled');
  }

  var wanted = ${jsValue(request.values)};
  var chosen = [];
  for (var i = 0; i < el.options.length; i++) {
    var option = el.options[i];
    var optionText = (option.text || '').replace(/\\s+/g, ' ').trim();
    var matched = false;
    for (var w = 0; w < wanted.length; w++) {
      if (option.value === wanted[w] || optionText === wanted[w]) { matched = true; break; }
    }
    if (el.multiple) {
      option.selected = matched;
    } else if (matched && chosen.length === 0) {
      el.selectedIndex = i;
    }
    if (matched) { chosen.push(optionText || option.value); }
  }

  if (chosen.length === 0) {
    throw new Error('None of the requested values matched an option. Take a page-snapshot to list the available options.');
  }

  __bcmNotify(el);

  var scroll = __bcmScroll();
  return {
    target: __bcmLabel(el),
    detail: 'Selected ' + chosen.join(', '),
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight
  };
})();`;
}

export function buildExecuteJsCode(code: string, maxLength: number): string {
  return `(function () {
  function __bcmSerialize(value, depth) {
    if (value === null || value === undefined) { return String(value); }
    var kind = typeof value;
    if (kind === 'string' || kind === 'number' || kind === 'boolean') { return String(value); }
    if (kind === 'function') { return '[Function ' + (value.name || 'anonymous') + ']'; }
    if (value instanceof Error) { return value.name + ': ' + value.message; }
    if (typeof Node !== 'undefined' && value instanceof Node) {
      var tag = value.nodeName ? value.nodeName.toLowerCase() : 'node';
      var text = (value.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
      return '[' + tag + (text ? ' "' + text + '"' : '') + ']';
    }
    if (typeof NodeList !== 'undefined' && (value instanceof NodeList || value instanceof HTMLCollection)) {
      var items = [];
      for (var n = 0; n < value.length && n < 40; n++) { items.push(__bcmSerialize(value[n], depth + 1)); }
      return '[' + items.join(', ') + (value.length > 40 ? ', ...' + value.length + ' total' : '') + ']';
    }
    if (depth > 4) { return '[nested]'; }
    try {
      return JSON.stringify(value, function (key, nested) {
        if (typeof Node !== 'undefined' && nested instanceof Node) { return __bcmSerialize(nested, depth + 1); }
        return nested;
      }, 2);
    } catch (err) {
      return String(value);
    }
  }

  var result = (function () {
${code}
  })();

  var serialized = __bcmSerialize(result, 0);
  var limit = ${jsValue(maxLength)};
  var isTruncated = serialized.length > limit;
  return {
    result: isTruncated ? serialized.slice(0, limit) : serialized,
    isTruncated: isTruncated
  };
})();`;
}

export function buildWaitProbeCode(
  request: WaitForElementServerMessage
): string {
  const state = request.state ?? "visible";
  return `(function () {
  var matches;
  try {
    matches = document.querySelectorAll(${jsValue(request.selector)});
  } catch (err) {
    throw new Error('Invalid CSS selector ' + ${jsValue(request.selector)} + ': ' + err.message);
  }

  function visible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) { return false; }
    var style = window.getComputedStyle(el);
    if (!style) { return false; }
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }

  var visibleCount = 0;
  for (var i = 0; i < matches.length; i++) {
    if (visible(matches[i])) { visibleCount++; }
  }

  var state = ${jsValue(state)};
  var satisfied;
  if (state === 'attached') {
    satisfied = matches.length > 0;
  } else if (state === 'detached') {
    satisfied = matches.length === 0;
  } else if (state === 'hidden') {
    satisfied = visibleCount === 0;
  } else {
    satisfied = visibleCount > 0;
  }

  return { matchCount: matches.length, satisfied: satisfied };
})();`;
}

export function buildElementBoxCode(target: ElementTarget): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
  var el = __bcmResolve(${targetLiteral(target)});
  var pad = ${jsValue(CAPTURE_PADDING_PX)};
  var maxHeight = ${jsValue(MAX_CAPTURE_HEIGHT_PX)};

  var box = el.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) {
    throw new Error('The element ' + __bcmLabel(el) + ' has no size on the page, so there is nothing to capture.');
  }

  var doc = document.scrollingElement || document.documentElement;
  var elementTop = box.top + window.scrollY;
  var elementBottom = elementTop + box.height;

  var fullTop = Math.max(0, elementTop - pad);
  var fullBottom = elementBottom + pad;
  var wanted = fullBottom - fullTop;

  var top = fullTop;
  var height = Math.max(1, Math.min(wanted, maxHeight));

  // Only an element too tall to fit in one shot follows the scroll; every other one is captured
  // whole, wherever the reader is standing.
  if (wanted > maxHeight && window.scrollY > fullTop) {
    top = Math.max(fullTop, Math.min(window.scrollY, fullBottom - maxHeight));
    height = Math.max(1, Math.min(fullBottom - top, maxHeight));
  }

  var left = Math.max(0, box.left + window.scrollX - pad);
  var width = Math.max(1, Math.min(box.width + pad * 2, doc.scrollWidth - left));

  var scroll = __bcmScroll();
  return {
    rect: {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(width),
      height: Math.round(height)
    },
    label: __bcmLabel(el),
    elementWidth: Math.round(box.width),
    elementHeight: Math.round(box.height),
    clipped: top > fullTop || top + height < fullBottom,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight
  };
})();`;
}
