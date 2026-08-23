import type { ElementTarget } from "@browser-control-mcp/common/server-messages";
import {
  ELEMENT_RESOLVER_SOURCE,
  jsValue,
  targetLiteral,
} from "./injected-common";

export type OverlayState = "idle" | "read" | "click" | "type" | "exec";

export interface OverlayResult {
  rect: { top: number; left: number; width: number; height: number } | null;
  target: string | null;
  wasInView: boolean;
}

const OVERLAY_RUNTIME_SOURCE = `
(function () {
  if (window.__bcmOverlay) { return; }

  var HOST_ID = 'bcm-overlay-host';
  var RAINBOW = ['#ff007f', '#7928ca', '#00dfd8', '#ffac1c'];
  var ACCENTS = {
    idle: '#d97757',
    read: '#00dfd8',
    click: '#ff007f',
    type: '#a855f7',
    exec: '#ffac1c'
  };

  var MARK_ICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="8" fill="#d97757"/>' +
    '<g stroke="#fff" stroke-width="3.4" stroke-linecap="round">' +
    '<line x1="16" y1="7" x2="16" y2="25"/>' +
    '<line x1="8.2" y1="11.5" x2="23.8" y2="20.5"/>' +
    '<line x1="8.2" y1="20.5" x2="23.8" y2="11.5"/>' +
    '</g></svg>'
  );

  var host = null;
  var aurora = null;
  var focusBox = null;
  var badge = null;

  var removedIcons = null;
  var injectedIcon = null;
  var iconKeeper = null;
  var idleTimer = null;

  function ramp(direction) {
    return 'linear-gradient(' + direction + ',' +
      'rgba(0,0,0,1) 0,' +
      'rgba(0,0,0,0.66) calc(var(--bcm-spread) * 0.25),' +
      'rgba(0,0,0,0.33) calc(var(--bcm-spread) * 0.5),' +
      'rgba(0,0,0,0.13) calc(var(--bcm-spread) * 0.75),' +
      'rgba(0,0,0,0.051) var(--bcm-spread),' +
      'rgba(0,0,0,0.051) calc(100% - var(--bcm-spread)),' +
      'rgba(0,0,0,0.13) calc(100% - var(--bcm-spread) * 0.75),' +
      'rgba(0,0,0,0.33) calc(100% - var(--bcm-spread) * 0.5),' +
      'rgba(0,0,0,0.66) calc(100% - var(--bcm-spread) * 0.25),' +
      'rgba(0,0,0,1) 100%)';
  }

  function styleText() {
    var masks = ramp('to right') + ', ' + ramp('to bottom');
    var flow = RAINBOW.concat(RAINBOW).concat([RAINBOW[0]]).join(', ');
    return [
      '@property --bcm-accent {',
      '  syntax: "<color>";',
      '  inherits: true;',
      '  initial-value: #d97757;',
      '}',
      '@property --bcm-focus-color {',
      '  syntax: "<color>";',
      '  inherits: true;',
      '  initial-value: #d97757;',
      '}',
      ':host { all: initial; transition: --bcm-accent 0.45s ease, --bcm-focus-color 0.45s ease; }',
      '.bcm-aurora {',
      '  position: absolute; inset: 0; overflow: hidden; pointer-events: none;',
      '  --bcm-spread: 17%;',
      '  -webkit-mask-image: ' + masks + ';',
      '  mask-image: ' + masks + ';',
      '  opacity: 0; transition: opacity 0.8s ease;',
      '}',
      '.bcm-aurora.is-active { opacity: 1; }',
      '.bcm-flow {',
      '  position: absolute; top: -3rem; left: -3rem;',
      '  width: calc(200% + 6rem); height: calc(200% + 6rem);',
      '  background: linear-gradient(135deg, ' + flow + ');',
      '  animation: bcmFlow 9s linear infinite;',
      '  will-change: transform; opacity: 0.32;',
      '}',
      '@keyframes bcmFlow {',
      '  0% { transform: translate3d(0, 0, 0); }',
      '  100% { transform: translate3d(-50%, -50%, 0); }',
      '}',
      '.bcm-focus {',
      '  position: absolute; box-sizing: border-box; border-radius: 9px;',
      '  border: 2px solid var(--bcm-focus-color);',
      '  box-shadow: 0 0 0 5px color-mix(in srgb, var(--bcm-focus-color) 22%, transparent),',
      '    0 0 26px 8px color-mix(in srgb, var(--bcm-focus-color) 55%, transparent),',
      '    0 0 60px 18px color-mix(in srgb, var(--bcm-focus-color) 26%, transparent);',
      '  opacity: 0;',
      '  transition: opacity 0.32s ease, top 0.32s cubic-bezier(0.22, 1, 0.36, 1),',
      '    left 0.32s cubic-bezier(0.22, 1, 0.36, 1),',
      '    width 0.32s cubic-bezier(0.22, 1, 0.36, 1),',
      '    height 0.32s cubic-bezier(0.22, 1, 0.36, 1),',
      '    border-color 0.45s ease, box-shadow 0.45s ease;',
      '}',
      '.bcm-focus.is-active { opacity: 1; animation: bcmBreathe 2.4s ease-in-out infinite; }',
      '@keyframes bcmBreathe {',
      '  0%, 100% { filter: brightness(1); }',
      '  50% { filter: brightness(1.35); }',
      '}',
      '.bcm-badge {',
      '  position: absolute; top: 16px; left: 50%;',
      '  transform: translateX(-50%) translateY(-14px);',
      '  display: flex; align-items: center; gap: 7px;',
      '  font: 600 12.5px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif;',
      '  color: var(--bcm-accent);',
      '  background: rgba(9, 9, 14, 0.86);',
      '  border: 1px solid color-mix(in srgb, var(--bcm-accent) 55%, transparent);',
      '  padding: 7px 13px 7px 10px; border-radius: 999px;',
      '  white-space: nowrap; letter-spacing: 0.01em;',
      '  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5),',
      '    0 0 22px color-mix(in srgb, var(--bcm-accent) 30%, transparent);',
      '  opacity: 0;',
      '  transition: opacity 0.45s ease, transform 0.45s cubic-bezier(0.22, 1, 0.36, 1),',
      '    color 0.45s ease, border-color 0.45s ease, box-shadow 0.45s ease;',
      '  backdrop-filter: blur(6px);',
      '}',
      '.bcm-badge.is-active { opacity: 1; transform: translateX(-50%) translateY(0); }',
      '.bcm-pip {',
      '  width: 7px; height: 7px; border-radius: 50%;',
      '  background: var(--bcm-accent);',
      '  box-shadow: 0 0 8px var(--bcm-accent);',
      '  animation: bcmPip 1.8s ease-in-out infinite;',
      '  transition: background 0.45s ease;',
      '}',
      '@keyframes bcmPip {',
      '  0%, 100% { opacity: 1; }',
      '  50% { opacity: 0.35; }',
      '}',
      '@media (prefers-reduced-motion: reduce) {',
      '  .bcm-flow, .bcm-focus.is-active, .bcm-pip { animation: none; }',
      '}'
    ].join('\\n');
  }

  function build() {
    var stale = document.getElementById(HOST_ID);
    if (stale) { stale.remove(); }

    host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('style', [
      'position:fixed!important', 'top:0!important', 'left:0!important',
      'width:100vw!important', 'height:100vh!important',
      'margin:0!important', 'padding:0!important', 'border:0!important',
      'pointer-events:none!important', 'z-index:2147483647!important',
      'contain:layout style size!important'
    ].join(';'));

    var root = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent = styleText();

    aurora = document.createElement('div');
    aurora.className = 'bcm-aurora';
    var flow = document.createElement('div');
    flow.className = 'bcm-flow';
    aurora.appendChild(flow);

    focusBox = document.createElement('div');
    focusBox.className = 'bcm-focus';

    badge = document.createElement('div');
    badge.className = 'bcm-badge';
    var pip = document.createElement('span');
    pip.className = 'bcm-pip';
    var text = document.createElement('span');
    text.className = 'bcm-text';
    badge.appendChild(pip);
    badge.appendChild(text);

    root.appendChild(style);
    root.appendChild(aurora);
    root.appendChild(focusBox);
    root.appendChild(badge);
    document.documentElement.appendChild(host);
  }

  function claimIcon() {
    if (!document.head) { return; }
    if (removedIcons === null) { removedIcons = []; }

    var existing = document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]');
    for (var i = 0; i < existing.length; i++) {
      if (existing[i] === injectedIcon) { continue; }
      removedIcons.push(existing[i]);
      existing[i].remove();
    }

    if (!injectedIcon || !injectedIcon.isConnected) {
      injectedIcon = document.createElement('link');
      injectedIcon.rel = 'icon';
      injectedIcon.type = 'image/svg+xml';
      injectedIcon.href = MARK_ICON;
      document.head.appendChild(injectedIcon);
    }
  }

  function applyTabMark() {
    claimIcon();

    // Sites re-write their icon link on route changes, and a later link wins over ours, so the
    // mark has to be reclaimed for as long as the session holds the tab.
    if (!iconKeeper && document.head) {
      iconKeeper = new MutationObserver(function () {
        claimIcon();
      });
      iconKeeper.observe(document.head, { childList: true, subtree: true });
    }
  }

  function restoreTabMark() {
    if (iconKeeper) { iconKeeper.disconnect(); iconKeeper = null; }

    if (injectedIcon) {
      injectedIcon.remove();
      injectedIcon = null;
    }
    if (removedIcons) {
      for (var i = 0; i < removedIcons.length; i++) {
        document.head.appendChild(removedIcons[i]);
      }
      removedIcons = null;
    }
  }

  function setStatus(label, state) {
    if (!host || !host.isConnected) { return; }
    host.style.setProperty('--bcm-accent', ACCENTS[state] || ACCENTS.idle);
    var text = host.shadowRoot.querySelector('.bcm-text');
    if (label) {
      text.textContent = label;
      badge.classList.add('is-active');
    } else {
      badge.classList.remove('is-active');
    }
  }

  function attach(options) {
    if (!host || !host.isConnected) { build(); }
    if (options.showAurora) {
      aurora.classList.add('is-active');
    } else {
      aurora.classList.remove('is-active');
    }

    setStatus(options.showBadge ? options.status : '', options.state);

    if (options.markTab) {
      applyTabMark();
    } else {
      restoreTabMark();
    }

    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    // The element highlight keeps its own colour, so the badge can fall back to the resting
    // label without dragging the last action's colour off the element with it.
    if (options.showBadge && options.idleStatus && options.resetAfterMs > 0) {
      idleTimer = setTimeout(function () {
        setStatus(options.idleStatus, 'idle');
      }, options.resetAfterMs);
    }
  }

  function focus(rect, state) {
    if (!host || !host.isConnected) { return; }
    host.style.setProperty('--bcm-focus-color', ACCENTS[state] || ACCENTS.idle);
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      focusBox.classList.remove('is-active');
      return;
    }
    var pad = 5;
    focusBox.style.top = (rect.top - pad) + 'px';
    focusBox.style.left = (rect.left - pad) + 'px';
    focusBox.style.width = (rect.width + pad * 2) + 'px';
    focusBox.style.height = (rect.height + pad * 2) + 'px';
    focusBox.classList.add('is-active');
  }

  function clearFocus() {
    if (focusBox) { focusBox.classList.remove('is-active'); }
  }

  function detach() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    restoreTabMark();
    if (!host || !host.isConnected) { return; }
    aurora.classList.remove('is-active');
    focusBox.classList.remove('is-active');
    badge.classList.remove('is-active');
    var dying = host;
    host = null;
    setTimeout(function () {
      if (dying && dying.isConnected) { dying.remove(); }
    }, 900);
  }

  window.__bcmOverlay = {
    attach: attach,
    setStatus: setStatus,
    focus: focus,
    clearFocus: clearFocus,
    detach: detach
  };
})();
`;

export interface AttachRequest {
  status: string;
  state: OverlayState;
  markTab: boolean;
  showAurora: boolean;
  showFocus: boolean;
  showBadge: boolean;
  idleStatus: string;
  resetAfterMs: number;
  target?: ElementTarget;
}

export function buildAttachOverlayCode(request: AttachRequest): string {
  const target = request.target ? targetLiteral(request.target) : "null";
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${OVERLAY_RUNTIME_SOURCE}
  window.__bcmOverlay.attach({
    status: ${jsValue(request.status)},
    state: ${jsValue(request.state)},
    markTab: ${jsValue(request.markTab)},
    showAurora: ${jsValue(request.showAurora)},
    showBadge: ${jsValue(request.showBadge)},
    idleStatus: ${jsValue(request.idleStatus)},
    resetAfterMs: ${jsValue(request.resetAfterMs)}
  });

  var target = ${jsValue(request.showFocus)} ? ${target} : null;
  if (!target) {
    window.__bcmOverlay.clearFocus();
    return { rect: null, target: null, wasInView: true };
  }

  var el = __bcmResolve(target);
  var before = el.getBoundingClientRect();
  var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  var wasInView = before.bottom > 0 && before.top < viewportHeight &&
    before.right > 0 && before.left < viewportWidth;
  if (!wasInView && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', inline: 'center' });
  }

  var rect = __bcmRect(el);
  window.__bcmOverlay.focus(rect, ${jsValue(request.state)});
  return { rect: rect, target: __bcmLabel(el), wasInView: wasInView };
})();`;
}

export function buildDetachOverlayCode(): string {
  return `(function () {
  if (window.__bcmOverlay) { window.__bcmOverlay.detach(); }
  return true;
})();`;
}
