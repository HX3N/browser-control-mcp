import type {
  ClickElementServerMessage,
  ElementTarget,
  HoverElementServerMessage,
  DragElementServerMessage,
  PressKeyServerMessage,
  UploadFilesServerMessage,
  ViewportRegion,
  ScrollPageServerMessage,
  SelectOptionServerMessage,
  TypeTextServerMessage,
  ElementWaitState,
} from "@browser-control-mcp/common/server-messages";
import {
  ELEMENT_RESOLVER_SOURCE,
  PAGE_READ_SOURCE,
  REF_ATTRIBUTE,
  SCROLL_ANCHOR_SOURCE,
  SWEEP_EASE_SOURCE,
  isElementTargeted,
  jsValue,
  targetLiteral,
  VISIBILITY_SOURCE,
} from "./injected-common";
import { BLOCK_TAGS, INTERACTIVE_SELECTOR } from "./page-snapshot";

export interface InteractionScriptResult {
  target: string;
  detail: string;
  url: string;
  scrollY: number;
  scrollHeight: number;
  scrollMax: number;
}

export interface WaitProbeResult {
  matchCount: number;
  satisfied: boolean;
}

export interface ElementBoxResult {
  rect: { x: number; y: number; width: number; height: number };
  fullTop: number;
  fullBottom: number;
  label: string;
  elementWidth: number;
  elementHeight: number;
  clipped: boolean;
  scrollY: number;
  scrollHeight: number;
  scrollMax: number;
}

export interface MediaListResult {
  items: {
    url: string;
    kind: "image" | "video" | "audio";
    naturalWidth?: number;
    naturalHeight?: number;
    alt?: string;
    frame?: string;
    hidden?: boolean;
  }[];
  totalItems: number;
  hiddenItems: number;
  isTruncated: boolean;
  unreachableFrames: number;
}

export interface MediaFetchResult {
  base64: string;
  mimeType: string;
  byteLength: number;
}

export const CAPTURE_PADDING_PX = 8;
export const MAX_CAPTURE_HEIGHT_PX = 2000;

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

function __bcmMultiline(el, kind) {
  return kind === 'rich' || (kind === 'text' && el.tagName.toLowerCase() === 'textarea');
}

function __bcmInsertBreak(el, kind) {
  if (kind === 'rich') {
    var done = false;
    try { done = document.execCommand('insertLineBreak'); } catch (err) { done = false; }
    if (!done) {
      try { done = document.execCommand('insertHTML', false, '<br>'); } catch (err) { done = false; }
    }
    return done ? 'inserted a line break' : '';
  }
  var value = el.value == null ? '' : String(el.value);
  var from = el.selectionStart == null ? value.length : el.selectionStart;
  var to = el.selectionEnd == null ? value.length : el.selectionEnd;
  __bcmSetValue(el, value.slice(0, from) + '\\n' + value.slice(to));
  try { el.setSelectionRange(from + 1, from + 1); } catch (err) { /* caret is best effort */ }
  __bcmNotify(el);
  return 'inserted a line break';
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

function __bcmScrollByKey(el, key, whole) {
  var doc = document.scrollingElement || document.documentElement;
  var sideways = key === 'ArrowLeft' || key === 'ArrowRight';
  var box = null;
  for (var n = el; n && n !== doc && n !== document.body; n = n.parentElement) {
    var style = getComputedStyle(n);
    var overflow = sideways ? style.overflowX : style.overflowY;
    var room = sideways ? n.scrollWidth - n.clientWidth : n.scrollHeight - n.clientHeight;
    if ((overflow === 'auto' || overflow === 'scroll') && room > 1) { box = n; break; }
  }
  var page = box ? box.clientHeight : window.innerHeight;
  var line = 40;
  var dx = 0;
  var dy = 0;
  if (key === 'ArrowDown') { dy = line; }
  else if (key === 'ArrowUp') { dy = -line; }
  else if (key === 'ArrowRight') { dx = line; }
  else if (key === 'ArrowLeft') { dx = -line; }
  else if (key === 'PageDown') { dy = Math.round(page * 0.85); }
  else if (key === 'PageUp') { dy = -Math.round(page * 0.85); }
  else if (key === 'Home') { dy = -1e9; }
  else if (key === 'End') { dy = 1e9; }
  if (box) { box.scrollTop += dy; box.scrollLeft += dx; } else { window.scrollBy(dx, dy); }
  return 'scrolled ' + (box ? __bcmLabel(box) : 'the page');
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
    if (letter === 'z') { return __bcmHistory(shift ? 'redo' : 'undo'); }
    if (letter === 'y') { return __bcmHistory('redo'); }
  }

  if (alt) { return ''; }

  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' ||
      key === 'ArrowDown' || key === 'Home' || key === 'End' ||
      key === 'PageUp' || key === 'PageDown') {
    if (kind === 'text') { return __bcmMoveCaretInText(el, key, accel, shift); }
    if (kind === 'rich') { return __bcmMoveCaretInPage(el, key, accel, shift); }
    return __bcmScrollByKey(el, key);
  }

  if (key === 'Backspace' || key === 'Delete') {
    if (kind === 'text') { return __bcmDeleteInText(el, key === 'Backspace', accel); }
    if (kind === 'rich') { return __bcmDeleteInPage(el, key === 'Backspace', accel); }
    return '';
  }

  if (key === 'Enter' && !accel && __bcmMultiline(el, kind)) {
    return __bcmInsertBreak(el, kind);
  }

  return '';
}
`;

const CLICK_DISPATCH_SOURCE = `
function __bcmPointerInit(el, buttonIndex, modifiers) {
  var rect = el.getBoundingClientRect();
  var mods = modifiers || [];
  return {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: buttonIndex,
    buttons: buttonIndex === 0 ? 1 : buttonIndex === 1 ? 4 : 2,
    ctrlKey: mods.indexOf('Control') !== -1,
    shiftKey: mods.indexOf('Shift') !== -1,
    altKey: mods.indexOf('Alt') !== -1,
    metaKey: mods.indexOf('Meta') !== -1
  };
}

function __bcmDispatchHover(el) {
  __bcmScrollToAnchor(el, false);
  var pointerInit = __bcmPointerInit(el, 0, []);
  pointerInit.buttons = 0;
  el.dispatchEvent(new PointerEvent('pointerover', pointerInit));
  el.dispatchEvent(new PointerEvent('pointerenter', pointerInit));
  el.dispatchEvent(new MouseEvent('mouseover', pointerInit));
  el.dispatchEvent(new MouseEvent('mouseenter', pointerInit));
  el.dispatchEvent(new PointerEvent('pointermove', pointerInit));
  el.dispatchEvent(new MouseEvent('mousemove', pointerInit));
}

function __bcmDispatchClick(el, buttonIndex, clickCount, modifiers) {
  __bcmScrollToAnchor(el, false);
  var pointerInit = __bcmPointerInit(el, buttonIndex, modifiers);

  if (typeof el.focus === 'function') {
    try { el.focus({ preventScroll: true }); } catch (err) { /* focus is best effort */ }
  }

  el.dispatchEvent(new MouseEvent('mouseover', pointerInit));
  el.dispatchEvent(new MouseEvent('mousemove', pointerInit));
  el.dispatchEvent(new MouseEvent('mousedown', pointerInit));
  el.dispatchEvent(new MouseEvent('mouseup', pointerInit));

  var plain = !pointerInit.ctrlKey && !pointerInit.shiftKey && !pointerInit.altKey && !pointerInit.metaKey;
  if (buttonIndex === 0) {
    for (var i = 0; i < clickCount; i++) {
      // el.click() cannot carry modifier keys, and a modified click must not run the plain
      // default action (a link would navigate the tab instead of opening a new one).
      if (plain) { el.click(); } else { el.dispatchEvent(new MouseEvent('click', pointerInit)); }
    }
    if (clickCount > 1) {
      el.dispatchEvent(new MouseEvent('dblclick', pointerInit));
    }
  } else if (buttonIndex === 2) {
    el.dispatchEvent(new MouseEvent('contextmenu', pointerInit));
  } else {
    el.dispatchEvent(new MouseEvent('auxclick', pointerInit));
  }
}
`;

export function buildClickCode(request: ClickElementServerMessage): string {
  const button = request.button ?? "left";
  const buttonIndex = button === "middle" ? 1 : button === "right" ? 2 : 0;
  const clickCount = Math.max(1, Math.min(3, request.clickCount ?? 1));
  const modifiers = request.modifiers ?? [];
  const combo = modifiers.length ? `${modifiers.join("+")}+` : "";

  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${CLICK_DISPATCH_SOURCE}
  var el = __bcmResolve(${targetLiteral(request)});
  if (el.disabled) {
    throw new Error('The element is disabled and cannot be clicked');
  }

  var label = __bcmLabel(el);
  __bcmDispatchClick(el, ${buttonIndex}, ${clickCount}, ${jsValue(modifiers)});

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Dispatched ' + ${clickCount} + ' ' + ${jsValue(combo + button)} + ' click(s)',
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
  };
})();`;
}

export function buildHoverCode(request: HoverElementServerMessage): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${CLICK_DISPATCH_SOURCE}
  var el = __bcmResolve(${targetLiteral(request)});
  var label = __bcmLabel(el);
  __bcmDispatchHover(el);

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Moved the pointer over the element without clicking',
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
  };
})();`;
}

export function buildDragCode(request: DragElementServerMessage): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${CLICK_DISPATCH_SOURCE}
  var source = __bcmResolve(${targetLiteral(request)});
  var target = __bcmResolve(${targetLiteral(request.to)});
  if (source === target) {
    throw new Error('The drag source and the drop target are the same element');
  }
  var sourceLabel = __bcmLabel(source);
  var targetLabel = __bcmLabel(target);

  __bcmScrollToAnchor(source, false);
  var down = __bcmPointerInit(source, 0, []);
  source.dispatchEvent(new PointerEvent('pointerdown', down));
  source.dispatchEvent(new MouseEvent('mousedown', down));

  var dataTransfer = null;
  try { dataTransfer = new DataTransfer(); } catch (err) { dataTransfer = null; }
  var dragInit = function (base) {
    var init = {};
    for (var k in base) { init[k] = base[k]; }
    if (dataTransfer) { init.dataTransfer = dataTransfer; }
    return init;
  };
  var native = source.draggable || source.getAttribute('draggable') === 'true';
  var dragStarted = false;
  if (native) {
    dragStarted = source.dispatchEvent(new DragEvent('dragstart', dragInit(down)));
    source.dispatchEvent(new DragEvent('drag', dragInit(down)));
  }

  var over = __bcmPointerInit(target, 0, []);
  var steps = 4;
  for (var i = 1; i <= steps; i++) {
    var mid = {};
    for (var key in down) { mid[key] = down[key]; }
    mid.clientX = down.clientX + (over.clientX - down.clientX) * i / steps;
    mid.clientY = down.clientY + (over.clientY - down.clientY) * i / steps;
    var under = document.elementFromPoint(mid.clientX, mid.clientY) || target;
    under.dispatchEvent(new PointerEvent('pointermove', mid));
    under.dispatchEvent(new MouseEvent('mousemove', mid));
  }
  target.dispatchEvent(new PointerEvent('pointerover', over));
  target.dispatchEvent(new MouseEvent('mouseover', over));

  var dropped = false;
  if (native && dragStarted) {
    target.dispatchEvent(new DragEvent('dragenter', dragInit(over)));
    var accepted = !target.dispatchEvent(new DragEvent('dragover', dragInit(over)));
    if (accepted) {
      target.dispatchEvent(new DragEvent('drop', dragInit(over)));
      dropped = true;
    } else {
      target.dispatchEvent(new DragEvent('dragleave', dragInit(over)));
    }
    source.dispatchEvent(new DragEvent('dragend', dragInit(over)));
  }

  var up = {};
  for (var k2 in over) { up[k2] = over[k2]; }
  up.buttons = 0;
  target.dispatchEvent(new PointerEvent('pointerup', up));
  target.dispatchEvent(new MouseEvent('mouseup', up));

  var detail;
  if (!native) {
    detail = 'Dragged with pointer events from ' + sourceLabel + ' to ' + targetLabel + '; the source is not draggable, so no HTML drag-and-drop events were sent';
  } else if (!dragStarted) {
    detail = 'The page cancelled dragstart on ' + sourceLabel + ', so nothing was dropped';
  } else if (dropped) {
    detail = 'Dropped ' + sourceLabel + ' on ' + targetLabel;
  } else {
    detail = 'Dragged ' + sourceLabel + ' over ' + targetLabel + ', but the target did not accept the drop (dragover was not cancelled)';
  }

  var scroll = __bcmScroll();
  return {
    target: sourceLabel,
    detail: detail,
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
  };
})();`;
}

const UPLOAD_DECODE_SOURCE = `
function __bcmUploadBytes(b64) {
  var raw = atob(b64);
  var bytes = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) { bytes[i] = raw.charCodeAt(i); }
  return bytes;
}
`;

export function buildUploadChunkCode(uploadId: string, base64: string): string {
  return `(function () {
${UPLOAD_DECODE_SOURCE}
  if (!window.__bcmUploadParts) { window.__bcmUploadParts = {}; }
  var id = ${jsValue(uploadId)};
  var parts = window.__bcmUploadParts[id];
  if (!parts) { parts = []; window.__bcmUploadParts[id] = parts; }
  parts.push(__bcmUploadBytes(${jsValue(base64)}));
  var staged = 0;
  for (var i = 0; i < parts.length; i++) { staged += parts[i].length; }
  return { stagedBytes: staged };
})();`;
}

export function buildUploadFilesCode(request: UploadFilesServerMessage): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${UPLOAD_DECODE_SOURCE}
  var el = __bcmResolve(${targetLiteral(request)});
  var label = __bcmLabel(el);
  if (!(el.tagName && el.tagName.toLowerCase() === 'input' && el.type === 'file')) {
    throw new Error('The element ' + label + ' is not an <input type="file">, so no file can be attached to it. Find the file input with list-page-elements (it may be hidden) and pass its ref.');
  }
  if (el.disabled) {
    throw new Error('The file input is disabled');
  }
  var files = ${jsValue(request.files)};
  if (files.length > 1 && !el.multiple) {
    throw new Error('The file input accepts one file, but ' + files.length + ' were given');
  }
  __bcmScrollToAnchor(el, false);
  var staged = window.__bcmUploadParts || {};
  var transfer = new DataTransfer();
  for (var i = 0; i < files.length; i++) {
    var parts = [];
    if (files[i].uploadId) {
      var held = staged[files[i].uploadId];
      if (!held || held.length === 0) {
        throw new Error('The staged pieces of ' + files[i].name + ' are gone: the page navigated or reloaded while it was being sent. Upload the file again.');
      }
      parts = held.slice();
    }
    if (files[i].base64) { parts.push(__bcmUploadBytes(files[i].base64)); }
    transfer.items.add(new File(parts, files[i].name, { type: files[i].mimeType }));
    if (files[i].uploadId) { delete staged[files[i].uploadId]; }
  }
  el.files = transfer.files;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  var names = [];
  for (var k = 0; k < el.files.length; k++) { names.push(el.files[k].name); }
  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Attached ' + names.length + ' file(s): ' + names.join(', '),
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
  };
})();`;
}

export function buildTypeCode(request: TypeTextServerMessage): string {
  const targeted = isElementTargeted(request.clickAfter);
  const clickAfter = targeted
    ? `__bcmResolve(${targetLiteral(request.clickAfter!)})`
    : "null";
  const focusAfter = targeted
    ? `try {
      if (window.__bcmOverlay) { window.__bcmOverlay.focus(after, 'click'); }
    } catch (err) { /* the overlay must never break an interaction */ }
    `
    : "";

  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${CLICK_DISPATCH_SOURCE}
${VALUE_SETTER_SOURCE}
  var el = __bcmResolve(${targetLiteral(request)});
  if (el.tagName && el.tagName.toLowerCase() === 'select') {
    throw new Error('The element is a <select>; choose one of its options with select-page-option instead');
  }
  if (el.disabled || el.readOnly) {
    throw new Error('The element is disabled or read-only and cannot accept text');
  }

  var label = __bcmLabel(el);
  var text = ${jsValue(request.text)};
  var clearFirst = ${jsValue(request.clearFirst === true)};

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

  var clicked = '';
  var after = ${clickAfter};
  if (after) {
    if (after.disabled) {
      throw new Error('The text was typed, but the clickAfter element is disabled and cannot be clicked');
    }
    ${focusAfter}__bcmDispatchClick(after, 0, 1);
    clicked = __bcmLabel(after);
  }

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Typed ' + text.length + ' character(s)' + (submitted ? ' and submitted the owning form' : '') + (clicked ? ', then clicked "' + clicked + '"' : ''),
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
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

  var repeat = ${jsValue(Math.max(1, Math.min(100, request.repeat ?? 1)))};
  var allowed = true;
  var submitted = false;
  var performed = [];
  var pressed = 0;
  for (; pressed < repeat && !submitted; pressed++) {
    allowed = __bcmKeyEvents(el, key, modifiers);
    if (!allowed) { pressed++; break; }
    if (key === 'Enter' && modifiers.length === 0 && !__bcmMultiline(el, __bcmEditableKind(el))) {
      submitted = __bcmSubmitOwner(el);
    }
    if (!submitted) {
      var did = __bcmDefaultAction(el, key, modifiers);
      if (did) {
        var last = performed[performed.length - 1];
        if (last && last.text === did) { last.count++; } else { performed.push({ text: did, count: 1 }); }
      }
    }
  }

  var outcome = '';
  if (submitted) {
    outcome = ' and submitted the owning form';
  } else if (performed.length) {
    outcome = ' and ' + performed.map(function (part) {
      return part.text + (part.count > 1 ? ' x' + part.count : '');
    }).join(', then ');
  } else if (!allowed) {
    outcome = '; the page handled it and cancelled the default action';
  }

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Pressed ' + (modifiers.length ? modifiers.join('+') + '+' : '') + key + (pressed > 1 ? ' ' + pressed + ' times' : '') + outcome,
    url: location.href,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
  };
})();`;
}

export function buildScrollCode(request: ScrollPageServerMessage): string {
  const hasTarget = Boolean(request.ref || request.selector);
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${SWEEP_EASE_SOURCE}
  var doc = document.scrollingElement || document.documentElement;
  var direction = ${jsValue(request.direction)};
  var horizontal = direction === 'left' || direction === 'right';
  var label = 'document';
  var box = null;
  var el = null;
  ${
    hasTarget
      ? `el = __bcmResolve(${targetLiteral(request)});
  label = __bcmLabel(el);`
      : ""
  }

  function __bcmScrollBox(node) {
    for (var n = node; n && n !== doc && n !== document.body; n = n.parentElement) {
      var style = getComputedStyle(n);
      var overflow = horizontal ? style.overflowX : style.overflowY;
      var room = horizontal ? n.scrollWidth - n.clientWidth : n.scrollHeight - n.clientHeight;
      if ((overflow === 'auto' || overflow === 'scroll') && room > 1) { return n; }
    }
    return null;
  }

  function __bcmGlide(target, x0, y0, x1, y1, ms) {
    var set = function (x, y) { if (target) { target.scrollLeft = x; target.scrollTop = y; } else { window.scrollTo(x, y); } };
    if (x0 === x1 && y0 === y1) { return; }
    var started = null;
    var frame = function (now) {
      if (started === null) { started = now; }
      var p = Math.min(1, (now - started) / ms);
      var e = __bcmSweepEase(p);
      set(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e);
      if (p < 1) { requestAnimationFrame(frame); }
    };
    requestAnimationFrame(frame);
  }

  var scroll = __bcmScroll();
  var goalX = Math.round(window.scrollX);
  var goalY = scroll.scrollY;
  var maxX = Math.max(0, Math.round(doc.scrollWidth - doc.clientWidth));
  var maxY = scroll.scrollMax;
  if (direction === 'element') {
    if (!el) { throw new Error('Scrolling to an element needs a ref or a selector'); }
    if (typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (err) { el.scrollIntoView(); }
    }
    __bcmScrollToAnchor(el, true);
    scroll = __bcmScroll();
    goalY = scroll.scrollY;
  } else {
    if (el) {
      box = __bcmScrollBox(el);
      if (!box) { throw new Error('Neither ' + label + ' nor an ancestor of it scrolls ' + (horizontal ? 'horizontally' : 'vertically') + '; leave out the ref or selector to scroll the page itself'); }
    }
    var viewport = box ? (horizontal ? box.clientWidth : box.clientHeight) : (horizontal ? window.innerWidth || doc.clientWidth : window.innerHeight || doc.clientHeight);
    var step = ${jsValue(request.amount ?? null)};
    if (step === null) { step = Math.round(viewport * 0.85); }
    var fromX = box ? Math.round(box.scrollLeft) : goalX;
    var fromY = box ? Math.round(box.scrollTop) : goalY;
    if (box) {
      maxX = Math.max(0, box.scrollWidth - box.clientWidth);
      maxY = Math.max(0, box.scrollHeight - box.clientHeight);
    }
    goalX = fromX;
    goalY = fromY;
    if (direction === 'top') { goalY = 0; }
    else if (direction === 'bottom') { goalY = maxY; }
    else if (direction === 'up') { goalY = fromY - step; }
    else if (direction === 'down') { goalY = fromY + step; }
    else if (direction === 'left') { goalX = fromX - step; }
    else { goalX = fromX + step; }
    goalX = Math.max(0, Math.min(maxX, goalX));
    goalY = Math.max(0, Math.min(maxY, goalY));
    var ms = 0;
    try { ms = window.__bcmOverlay && window.__bcmOverlay.beginSwipe ? window.__bcmOverlay.beginSwipe() : 0; } catch (err) { ms = 0; }
    __bcmGlide(box, fromX, fromY, goalX, goalY, ms || 600);
  }

  var detail;
  if (box) {
    var at = horizontal ? goalX : goalY;
    detail = 'Scrolled ' + direction + ' inside ' + __bcmLabel(box) + ', now at ' + at + ' of ' + (horizontal ? maxX : maxY) + (at >= (horizontal ? maxX : maxY) ? ' (the end)' : '') + '; the page itself did not move';
  } else if (horizontal) {
    detail = 'Scrolled ' + direction + ', now at ' + goalX + ' of ' + maxX + ' horizontally';
  } else {
    detail = 'Scrolled ' + direction + ', now at ' + goalY + ' of ' + maxY + (goalY >= maxY ? ' (the bottom)' : '');
  }
  return {
    target: box ? __bcmLabel(box) : label,
    detail: detail,
    url: location.href,
    scrollY: box ? scroll.scrollY : goalY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
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
      if (matched) { chosen.push(optionText || option.value); }
    } else if (matched && chosen.length === 0) {
      el.selectedIndex = i;
      chosen.push(optionText || option.value);
    }
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
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
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

export function buildWaitProbeCode(request: {
  selector: string;
  state?: ElementWaitState;
  within?: ElementTarget;
}): string {
  const state = request.state ?? "visible";
  const scope = isElementTargeted(request.within)
    ? `__bcmResolve(${targetLiteral(request.within!)})`
    : "null";
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
  var scope = ${scope};
  var matches = [];
  try {
    var roots = __bcmRoots(scope);
    for (var r = 0; r < roots.length; r++) {
      var found = roots[r].querySelectorAll(${jsValue(request.selector)});
      for (var m = 0; m < found.length; m++) {
        if (matches.indexOf(found[m]) === -1) { matches.push(found[m]); }
      }
    }
    // querySelectorAll reaches descendants only, so the scope element is matched on its own.
    if (scope && scope.matches && scope.matches(${jsValue(request.selector)}) && matches.indexOf(scope) === -1) {
      matches.push(scope);
    }
  } catch (err) {
    throw new Error('Invalid CSS selector ' + ${jsValue(request.selector)} + ': ' + err.message);
  }

  function visible(el) {
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) { return false; }
    var view = el.ownerDocument && el.ownerDocument.defaultView;
    var style = view ? view.getComputedStyle(el) : null;
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

export interface QuietProbeResult {
  sinceMs: number;
}

export function buildQuietProbeCode(final: boolean): string {
  return `(function () {
  var w = window.__bcmQuietWatch;
  if (${jsValue(final)}) {
    if (w) {
      try { w.ob.disconnect(); } catch (err) { /* already gone */ }
      window.__bcmQuietWatch = null;
    }
    return { sinceMs: w ? Date.now() - w.at : 0 };
  }
  if (!w) {
    w = { at: Date.now(), ob: null };
    // The overlay host is added to the page like any other node, and counting our own drawing
    // as page activity restarts the wait every time a command redraws it.
    var allOurs = function (nodes) {
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].id !== 'bcm-overlay-host') { return false; }
      }
      return true;
    };
    w.ob = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var touched = records[i].addedNodes.length + records[i].removedNodes.length;
        if (touched > 0 && allOurs(records[i].addedNodes) && allOurs(records[i].removedNodes)) {
          continue;
        }
        w.at = Date.now();
        return;
      }
    });
    // Attributes are left out on purpose: a page that toggles classes forever would never read as quiet.
    w.ob.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    window.__bcmQuietWatch = w;
    return { sinceMs: 0 };
  }
  return { sinceMs: Date.now() - w.at };
})();`;
}

export interface TextWatchResult {
  baseline: string;
  current: string;
  settled: boolean;
  label: string;
  added?: string;
  removed?: string;
}

export interface TextWatchOutcome {
  added: string;
  removed: string;
  text: string;
}

const TEXT_LINES_SOURCE = `
function __bcmNewLines(baseline, sample) {
  var have = new Map();
  var before = baseline.split('\\n');
  for (var i = 0; i < before.length; i++) {
    have.set(before[i], (have.get(before[i]) || 0) + 1);
  }
  var out = [];
  var after = sample.split('\\n');
  for (var j = 0; j < after.length; j++) {
    var line = after[j];
    var left = have.get(line) || 0;
    if (left > 0) { have.set(line, left - 1); continue; }
    if (!line.trim()) { continue; }
    out.push(line);
  }
  return out;
}
`;

const TEXT_SCOPE_SOURCE = (target: ElementTarget | undefined) =>
  isElementTargeted(target)
    ? `__bcmResolve(${targetLiteral(target!)})`
    : "document.body";

export const DEFAULT_TEXT_SETTLE_MS = 800;
export const TEXT_STABLE_SAMPLES = 3;

export function buildTextWatchCode(
  scope: ElementTarget | undefined,
  token: string,
  carried: string | null,
  settleMs: number,
  timeoutMs: number
): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${PAGE_READ_SOURCE}
${TEXT_LINES_SOURCE}
  function scope() { return ${TEXT_SCOPE_SOURCE(scope)}; }
  var el = scope();
  var label = __bcmLabel(el);
  var carried = ${jsValue(carried)};
  var latest = __bcmReadText(el);
  try { if (window.__bcmTextWatch) { window.__bcmTextWatch(); window.__bcmTextWatch = null; } } catch (err) { /* nothing was watching */ }
  window.__bcmWatchResult = null;

  var baseline = carried === null ? latest : carried;
  var arrived = __bcmNewLines(baseline, latest);
  var erased = __bcmNewLines(latest, baseline);

  if (${jsValue(timeoutMs <= 0)}) {
    return {
      baseline: baseline,
      current: latest,
      settled: true,
      label: label,
      added: arrived.join('\\n'),
      removed: erased.join('\\n')
    };
  }

  var keep = ${jsValue(TEXT_STABLE_SAMPLES)};
  var arrivedLedger = new Map();
  var erasedLedger = new Map();
  var round = 0;
  var dirty = false;
  var done = false;
  var timer = null;

  function stop() {
    done = true;
    if (timer) { clearTimeout(timer); timer = null; }
    try { observer.disconnect(); } catch (err) { /* already gone */ }
  }
  function note(book, lines) {
    var once = new Set(lines);
    once.forEach(function (line) {
      var seen = book.get(line);
      if (seen) { seen.last = round; seen.count++; }
      else { book.set(line, { first: round, last: round, count: 1 }); }
    });
  }
  // A line that went missing for even one sample and came back is something the page keeps
  // rewriting, so it stays out for good: three sightings in a row can happen by chance when a
  // spinner has only a handful of frames.
  function steady(book) {
    var out = [];
    book.forEach(function (seen, line) {
      if (seen.last === round && seen.count >= keep && seen.last - seen.first + 1 === seen.count) {
        out.push(line);
      }
    });
    return out;
  }
  function sample() {
    if (done) { return; }
    if (dirty) {
      dirty = false;
      var text;
      try { text = __bcmReadText(scope()); } catch (err) { return; }
      latest = text;
      arrived = __bcmNewLines(baseline, latest);
      erased = __bcmNewLines(latest, baseline);
    }
    round++;
    note(arrivedLedger, arrived);
    note(erasedLedger, erased);
    var stableAdded = steady(arrivedLedger);
    // A line the page rewrites is missing from the samples as well as arriving in them, so
    // counting removals while anything is still churning would report the first reading of a
    // clock as deleted text. The cost is that a page taking text away while something else
    // ticks reports nothing: text alone cannot tell that removal from the clock's own.
    var settledArrivals = arrived.length === stableAdded.length;
    var stableGone = settledArrivals ? steady(erasedLedger) : [];
    if (!stableAdded.length && !stableGone.length) { return; }
    stop();
    window.__bcmWatchResult = {
      added: stableAdded.join('\\n'),
      removed: stableGone.join('\\n'),
      text: latest
    };
    try {
      browser.runtime.sendMessage({
        kind: 'page-event',
        channel: 'text-change',
        text: ${jsValue(token)}
      });
    } catch (err) { /* the background is the only listener and it may be gone */ }
  }
  // A spinner whose period divides the gap reads the same on every sample and passes for stopped,
  // so the gaps have to be uneven: no fixed cadence can stay in step with all three.
  var base = Math.max(50, ${jsValue(settleMs)});
  var gaps = [base, Math.round(base * 0.75), Math.round(base * 1.25)];
  var gapAt = 0;
  function arm() {
    timer = setTimeout(function () {
      sample();
      if (!done) { arm(); }
    }, gaps[gapAt++ % gaps.length]);
  }

  var observer = new MutationObserver(function () { dirty = true; });
  observer.observe(el.ownerDocument.documentElement, { childList: true, characterData: true, subtree: true });
  window.__bcmTextWatch = stop;
  arm();

  return { baseline: baseline, current: latest, settled: false, label: label };
})();`;
}

export function buildTextResultCode(target: ElementTarget | undefined): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${PAGE_READ_SOURCE}
  var held = window.__bcmWatchResult || null;
  try { if (window.__bcmTextWatch) { window.__bcmTextWatch(); window.__bcmTextWatch = null; } } catch (err) { /* nothing was watching */ }
  window.__bcmWatchResult = null;
  if (held) { return held; }
  return { added: '', removed: '', text: __bcmReadText(${TEXT_SCOPE_SOURCE(target)}) };
})();`;
}

export interface FindMatchResult {
  ref: string;
  tag: string;
  context: string;
  frame?: string;
  hidden?: boolean;
  controls?: { ref: string; label: string; hidden?: boolean }[];
  moreControls?: number;
}

export const MAX_FIND_MATCHES = 20;
const FIND_CONTEXT_CHARS = 120;
const MAX_FIND_CONTROLS = 12;

// Refs already on the page are kept: a find is a lookup, not a fresh snapshot, and the caller
// may still hold refs from the last read.
export const FIND_NAME_ATTRIBUTES = ["aria-label", "placeholder", "title", "alt", "name"];

export function buildFindCode(
  phrase: string,
  maxMatches: number,
  includeHidden = false,
  caseSensitive = false
): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${VISIBILITY_SOURCE}
  var phrase = ${jsValue(phrase)}.replace(/\\s+/g, ' ').trim();
  var maxMatches = ${jsValue(maxMatches)};
  var includeHidden = ${jsValue(includeHidden)};
  var caseSensitive = ${jsValue(caseSensitive)};
  var needle = caseSensitive ? phrase : phrase.toLowerCase();
  var nameAttributes = ${jsValue(FIND_NAME_ATTRIBUTES)};
  var blockTags = ${jsValue(BLOCK_TAGS)};
  var interactive = ${jsValue(INTERACTIVE_SELECTOR)};
  var maxControls = ${jsValue(MAX_FIND_CONTROLS)};
  var skipped = ['script', 'style', 'noscript', 'template'];
  var matches = [];
  if (!phrase) { return { matches: matches }; }

  var base = 0;
  var stamped = __bcmQueryAll('[${REF_ATTRIBUTE}]');
  for (var s = 0; s < stamped.length; s++) {
    var seen = /^e(\\d+)$/.exec(stamped[s].getAttribute('${REF_ATTRIBUTE}') || '');
    if (seen && parseInt(seen[1], 10) > base) { base = parseInt(seen[1], 10); }
  }
  __bcmSeedRefs(base);

  function container(node) {
    var el = node.parentElement;
    while (el && blockTags.indexOf(el.tagName.toLowerCase()) === -1 && el.parentElement) { el = el.parentElement; }
    return el || node.parentElement;
  }
  function stamp(el) {
    var existing = __bcmRefFor(el);
    if (existing) { return existing; }
    var ref = __bcmMintRef();
    el.setAttribute('${REF_ATTRIBUTE}', ref);
    __bcmRemember(ref, el);
    return ref;
  }
  function controls(block) {
    var found = [];
    var hiddenFound = [];
    var inner = block.querySelectorAll(interactive);
    for (var i = 0; i < inner.length; i++) {
      if (__bcmVisible(inner[i])) { found.push(inner[i]); }
      else if (includeHidden) { hiddenFound.push(inner[i]); }
    }
    var all = found.concat(hiddenFound);
    var listed = [];
    for (var c = 0; c < all.length && c < maxControls; c++) {
      var control = { ref: stamp(all[c]), label: __bcmLabel(all[c]) };
      if (c >= found.length) { control.hidden = true; }
      listed.push(control);
    }
    return { controls: listed, more: all.length - listed.length };
  }

  var visibleGroups = [];
  var hiddenGroups = [];
  var roots = __bcmRoots(null);
  for (var r = 0; r < roots.length; r++) {
    var root = roots[r];
    var doc = root.nodeType === 9 ? root : root.ownerDocument;
    if (!doc || !doc.createTreeWalker) { continue; }
    var start = root.nodeType === 9 ? root.body : root;
    if (!start) { continue; }
    var frame = __bcmFrameLabel(root);
    var walker = doc.createTreeWalker(start, 4);
    var byContainer = new Map();
    var hiddenByContainer = new Map();
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || skipped.indexOf(parent.tagName.toLowerCase()) !== -1) { continue; }
      var visible = __bcmVisible(parent);
      if (!visible && !includeHidden) { continue; }
      var block = container(node);
      var index = visible ? byContainer : hiddenByContainer;
      var group = index.get(block);
      if (!group) {
        group = { el: block, text: '', frame: frame, hidden: !visible };
        index.set(block, group);
        (visible ? visibleGroups : hiddenGroups).push(group);
      }
      group.text += node.nodeValue;
    }
  }

  var groups = visibleGroups.concat(hiddenGroups);
  for (var g = 0; g < groups.length && matches.length < maxMatches; g++) {
    var text = groups[g].text.replace(/\\s+/g, ' ');
    var hay = caseSensitive ? text : text.toLowerCase();
    var at = hay.indexOf(needle);
    while (at !== -1 && matches.length < maxMatches) {
      var from = Math.max(0, at - ${FIND_CONTEXT_CHARS});
      var to = Math.min(text.length, at + phrase.length + ${FIND_CONTEXT_CHARS});
      var entry = {
        ref: stamp(groups[g].el),
        tag: groups[g].el.tagName.toLowerCase(),
        context: (from > 0 ? '...' : '') + text.slice(from, to).trim() + (to < text.length ? '...' : '')
      };
      if (groups[g].frame) { entry.frame = groups[g].frame; }
      if (groups[g].hidden) { entry.hidden = true; }
      var inside = controls(groups[g].el);
      if (inside.controls.length) { entry.controls = inside.controls; }
      if (inside.more > 0) { entry.moreControls = inside.more; }
      matches.push(entry);
      at = hay.indexOf(needle, at + needle.length);
    }
  }
  if (matches.length === 0) {
    var namedRoots = __bcmRoots();
    for (var nr = 0; nr < namedRoots.length && matches.length < maxMatches; nr++) {
      if (!namedRoots[nr].querySelectorAll) { continue; }
      var namedFrame = __bcmFrameLabel(namedRoots[nr]);
      var candidates = namedRoots[nr].querySelectorAll(interactive);
      for (var nc = 0; nc < candidates.length && matches.length < maxMatches; nc++) {
        var candidate = candidates[nc];
        var candidateVisible = __bcmVisible(candidate);
        if (!candidateVisible && !includeHidden) { continue; }
        var hit = '';
        for (var na = 0; na < nameAttributes.length; na++) {
          var attribute = candidate.getAttribute(nameAttributes[na]);
          if (!attribute) { continue; }
          var attributeHay = caseSensitive ? attribute : attribute.toLowerCase();
          if (attributeHay.indexOf(needle) === -1) { continue; }
          hit = nameAttributes[na] + '="' + attribute.replace(/\\s+/g, ' ').trim().slice(0, 120) + '"';
          break;
        }
        if (!hit) { continue; }
        var named = { ref: stamp(candidate), tag: candidate.tagName.toLowerCase(), context: hit };
        if (namedFrame) { named.frame = namedFrame; }
        if (!candidateVisible) { named.hidden = true; }
        matches.push(named);
      }
    }
  }

  return { matches: matches };
})();`;
}

export function buildElementBoxCode(target: ElementTarget): string {
  return elementBoxCode(`__bcmResolve(${targetLiteral(target)})`);
}

// A cross-origin frame measures its own elements against its own viewport, and nothing in the
// top document can place that box. The frame's own element is what the capture rect can hold.
export function buildFrameBoxCode(frameUrl: string): string {
  return elementBoxCode(`__bcmFrameElement(${jsValue(frameUrl)})`);
}

function elementBoxCode(resolver: string): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
  function __bcmFrameElement(url) {
    var frames = __bcmQueryAll('iframe,frame');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].src === url) { return frames[i]; }
    }
    throw new Error('The element sits in a cross-origin frame, and the frame ' + url + ' is no longer on this page. Capture the whole tab instead.');
  }

  var el = ${resolver};
  var pad = ${jsValue(CAPTURE_PADDING_PX)};
  var maxHeight = ${jsValue(MAX_CAPTURE_HEIGHT_PX)};

  var box = __bcmRect(el);
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
    fullTop: Math.round(fullTop),
    fullBottom: Math.round(fullBottom),
    label: __bcmLabel(el),
    elementWidth: Math.round(box.width),
    elementHeight: Math.round(box.height),
    clipped: top > fullTop || top + height < fullBottom,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
  };
})();`;
}

export function buildRegionBoxCode(region: ViewportRegion): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
  var region = ${jsValue(region)};
  var viewWidth = document.documentElement.clientWidth || window.innerWidth;
  var viewHeight = document.documentElement.clientHeight || window.innerHeight;
  var x0 = Math.max(0, Math.min(region.x0, region.x1, viewWidth));
  var y0 = Math.max(0, Math.min(region.y0, region.y1, viewHeight));
  var x1 = Math.min(viewWidth, Math.max(region.x0, region.x1, 0));
  var y1 = Math.min(viewHeight, Math.max(region.y0, region.y1, 0));
  var width = Math.round(x1 - x0);
  var height = Math.round(y1 - y0);
  if (width <= 0 || height <= 0) {
    throw new Error('The region (' + region.x0 + ',' + region.y0 + ')-(' + region.x1 + ',' + region.y1 + ') lies outside the ' + viewWidth + 'x' + viewHeight + ' viewport.');
  }
  var scroll = __bcmScroll();
  var top = Math.round(y0 + window.scrollY);
  return {
    rect: { x: Math.round(x0 + window.scrollX), y: top, width: width, height: height },
    fullTop: top,
    fullBottom: top + height,
    label: 'the viewport region (' + Math.round(x0) + ',' + Math.round(y0) + ')-(' + Math.round(x1) + ',' + Math.round(y1) + ')',
    elementWidth: width,
    elementHeight: height,
    clipped: false,
    scrollY: scroll.scrollY,
    scrollHeight: scroll.scrollHeight,
    scrollMax: scroll.scrollMax
  };
})();`;
}

export const MAX_MEDIA_ITEMS = 100;

export function buildMediaListCode(
  target?: ElementTarget,
  includeHidden = false
): string {
  const scoped = !!(target && (target.ref || target.selector));
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${PAGE_READ_SOURCE}
${VISIBILITY_SOURCE}
  var scope = ${
    scoped ? `__bcmResolve(${targetLiteral(target!)})` : "document.body"
  };
  var limit = ${jsValue(MAX_MEDIA_ITEMS)};
  var includeHidden = ${jsValue(includeHidden)};
  var seen = {};
  var visible = [];
  var hidden = [];
  var total = 0;
  var hiddenTotal = 0;

  function frameOf(el) {
    var doc = el.ownerDocument;
    if (doc === document) { return undefined; }
    return __bcmFrameLabel(doc) || 'frame';
  }

  function add(el, kind, url, extra) {
    if (!url || url.slice(0, 5) === 'data:') { return; }
    if (seen[url]) { return; }
    seen[url] = true;
    var shown = __bcmVisible(el);
    if (!shown) { hiddenTotal++; }
    if (!shown && !includeHidden) { return; }
    total++;
    var item = { url: url, kind: kind };
    var frame = frameOf(el);
    if (frame) { item.frame = frame; }
    if (extra) {
      for (var key in extra) {
        if (extra[key] || extra[key] === 0) { item[key] = extra[key]; }
      }
    }
    if (shown) { visible.push(item); } else { item.hidden = true; hidden.push(item); }
  }

  function addImage(img) {
    add(img, 'image', img.currentSrc || img.src, {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      alt: (img.getAttribute('alt') || '').trim().slice(0, 120)
    });
  }

  function addPlayable(el) {
    var kind = el.tagName.toLowerCase() === 'video' ? 'video' : 'audio';
    var url = el.currentSrc || el.src;
    if (!url) {
      var source = el.querySelector && el.querySelector('source[src]');
      url = source ? source.src : '';
    }
    add(el, kind, url);
    if (kind === 'video' && el.poster) { add(el, 'image', el.poster); }
  }

  // querySelectorAll reaches descendants only, so a scope that is itself media is added here.
  if (scope.matches) {
    if (scope.matches('img')) { addImage(scope); }
    else if (scope.matches('video,audio')) { addPlayable(scope); }
  }

  var roots = __bcmReadRoots(scope);
  for (var r = 0; r < roots.length; r++) {
    var root = roots[r];
    if (!root.querySelectorAll) { continue; }
    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) { addImage(imgs[i]); }
    var playable = root.querySelectorAll('video,audio');
    for (var m = 0; m < playable.length; m++) { addPlayable(playable[m]); }
  }

  var items = visible.concat(hidden).slice(0, limit);
  return {
    items: items,
    totalItems: total,
    hiddenItems: hiddenTotal,
    isTruncated: total > items.length,
    unreachableFrames: __bcmUnreachableFrames(scope).length
  };
})();`;
}

export function buildMediaFetchCode(url: string, maxBytes: number): string {
  return `(function () {
  var url = ${jsValue(url)};
  var maxBytes = ${jsValue(maxBytes)};
  return fetch(url, { credentials: 'include' }).then(function (res) {
    if (!res.ok) {
      throw new Error('The server answered ' + res.status + ' for ' + url);
    }
    var type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    var declared = parseInt(res.headers.get('content-length') || '', 10);
    if (declared && declared > maxBytes) {
      throw new Error('The file is ' + declared + ' bytes, over the ' + maxBytes + ' byte limit.');
    }
    return res.arrayBuffer().then(function (buffer) {
      if (buffer.byteLength > maxBytes) {
        throw new Error('The file is ' + buffer.byteLength + ' bytes, over the ' + maxBytes + ' byte limit.');
      }
      var bytes = new Uint8Array(buffer);
      var chunks = [];
      for (var i = 0; i < bytes.length; i += 8192) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)));
      }
      return { base64: btoa(chunks.join('')), mimeType: type, byteLength: buffer.byteLength };
    });
  });
})();`;
}

export function buildDownloadUrlCode(target: ElementTarget): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
  var el = __bcmResolve(${targetLiteral(target)});
  var tag = el.tagName.toLowerCase();
  var url = '';
  if (tag === 'a' || tag === 'area') {
    url = el.href;
  } else if (tag === 'img' || tag === 'video' || tag === 'audio' || tag === 'source') {
    url = el.currentSrc || el.src;
  } else {
    throw new Error('The element ' + __bcmLabel(el) + ' is a ' + tag + ', not a link or a media element, so there is nothing to download.');
  }
  if (!url) {
    throw new Error('The element ' + __bcmLabel(el) + ' has no address to download.');
  }
  return url;
})();`;
}

export interface InPageNavigationStart {
  via: "link" | null;
  before: string;
}

export interface InPageNavigationCheck {
  moved: boolean;
  href: string;
}

export function buildInPageNavigateCode(url: string): string {
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${CLICK_DISPATCH_SOURCE}
  var before = location.href;
  var target = new URL(${jsValue(url)}, before);
  if (target.origin !== location.origin || target.href === before) {
    return { via: null, before: before };
  }
  var link = null;
  var links = document.querySelectorAll('a[href]');
  for (var i = 0; i < links.length; i++) {
    var candidate = links[i];
    if ((candidate.target && candidate.target !== '_self') || candidate.hasAttribute('download')) { continue; }
    if (candidate.href === target.href) { link = candidate; break; }
  }
  if (!link) {
    return { via: null, before: before };
  }
  if (window.__bcmNavWatch) { window.__bcmNavWatch.disconnect(); }
  var watch = new MutationObserver(function () { watch.count++; });
  watch.count = 0;
  watch.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.__bcmNavWatch = watch;
  __bcmDispatchClick(link, 0, 1, []);
  return { via: 'link', before: before };
})();`;
}

export function buildInPageNavigationCheckCode(
  start: InPageNavigationStart,
  final: boolean
): string {
  return `(function () {
  var watch = window.__bcmNavWatch;
  var moved = location.href !== ${jsValue(start.before)} && !!watch && watch.count > 0;
  if (moved || ${jsValue(final)}) {
    if (watch) { watch.disconnect(); }
    window.__bcmNavWatch = null;
  }
  return { moved: moved, href: location.href };
})();`;
}
