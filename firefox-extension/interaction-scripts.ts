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

function __bcmKeyEvents(el, key, modifiers) {
  var init = {
    key: key,
    code: key.length === 1 ? 'Key' + key.toUpperCase() : key,
    bubbles: true,
    cancelable: true,
    ctrlKey: modifiers.indexOf('Control') !== -1,
    shiftKey: modifiers.indexOf('Shift') !== -1,
    altKey: modifiers.indexOf('Alt') !== -1,
    metaKey: modifiers.indexOf('Meta') !== -1
  };
  el.dispatchEvent(new KeyboardEvent('keydown', init));
  if (key.length === 1) {
    el.dispatchEvent(new KeyboardEvent('keypress', init));
  }
  el.dispatchEvent(new KeyboardEvent('keyup', init));
  return init;
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

  __bcmKeyEvents(el, key, modifiers);

  var submitted = false;
  if (key === 'Enter' && modifiers.length === 0) {
    submitted = __bcmSubmitOwner(el);
  }

  var scroll = __bcmScroll();
  return {
    target: label,
    detail: 'Pressed ' + (modifiers.length ? modifiers.join('+') + '+' : '') + key + (submitted ? ' and submitted the owning form' : ''),
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
