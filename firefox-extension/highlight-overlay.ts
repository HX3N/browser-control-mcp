import type { ElementTarget } from "@browser-control-mcp/common/server-messages";
import {
  ELEMENT_RESOLVER_SOURCE,
  SCROLL_ANCHOR_SOURCE,
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
    '<svg width="691" height="691" viewBox="0 0 691 691" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="283.418" y1="691" x2="283.418" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#DC6038"/><stop offset="1" stop-color="#D97757"/></linearGradient><clipPath id="c"><rect width="691" height="691" rx="161.953" fill="white"/></clipPath></defs><g clip-path="url(#c)"><rect width="691" height="691" rx="161.953" fill="url(#g)"/><rect opacity="0.35" width="691" height="691" fill="#D97757"/><g fill="#FAF9F5" shape-rendering="crispEdges"><rect x="215.938" y="107.969" width="21.594" height="21.594"/><rect x="237.531" y="107.969" width="21.594" height="21.594"/><rect x="367.094" y="107.969" width="21.594" height="21.594"/><rect x="388.688" y="107.969" width="21.594" height="21.594"/><rect x="215.938" y="129.562" width="21.594" height="21.594"/><rect x="237.531" y="129.562" width="21.594" height="21.594"/><rect x="259.125" y="129.562" width="21.594" height="21.594"/><rect x="367.094" y="129.562" width="21.594" height="21.594"/><rect x="388.688" y="129.562" width="21.594" height="21.594"/><rect x="215.938" y="151.156" width="21.594" height="21.594"/><rect x="237.531" y="151.156" width="21.594" height="21.594"/><rect x="259.125" y="151.156" width="21.594" height="21.594"/><rect x="367.094" y="151.156" width="21.594" height="21.594"/><rect x="388.688" y="151.156" width="21.594" height="21.594"/><rect x="475.062" y="151.156" width="21.594" height="21.594"/><rect x="496.656" y="151.156" width="21.594" height="21.594"/><rect x="237.531" y="172.750" width="21.594" height="21.594"/><rect x="259.125" y="172.750" width="21.594" height="21.594"/><rect x="280.719" y="172.750" width="21.594" height="21.594"/><rect x="367.094" y="172.750" width="21.594" height="21.594"/><rect x="453.469" y="172.750" width="21.594" height="21.594"/><rect x="475.062" y="172.750" width="21.594" height="21.594"/><rect x="496.656" y="172.750" width="21.594" height="21.594"/><rect x="129.562" y="194.344" width="21.594" height="21.594"/><rect x="151.156" y="194.344" width="21.594" height="21.594"/><rect x="237.531" y="194.344" width="21.594" height="21.594"/><rect x="259.125" y="194.344" width="21.594" height="21.594"/><rect x="280.719" y="194.344" width="21.594" height="21.594"/><rect x="345.500" y="194.344" width="21.594" height="21.594"/><rect x="367.094" y="194.344" width="21.594" height="21.594"/><rect x="431.875" y="194.344" width="21.594" height="21.594"/><rect x="453.469" y="194.344" width="21.594" height="21.594"/><rect x="475.062" y="194.344" width="21.594" height="21.594"/><rect x="496.656" y="194.344" width="21.594" height="21.594"/><rect x="129.562" y="215.938" width="21.594" height="21.594"/><rect x="151.156" y="215.938" width="21.594" height="21.594"/><rect x="172.750" y="215.938" width="21.594" height="21.594"/><rect x="194.344" y="215.938" width="21.594" height="21.594"/><rect x="259.125" y="215.938" width="21.594" height="21.594"/><rect x="280.719" y="215.938" width="21.594" height="21.594"/><rect x="302.312" y="215.938" width="21.594" height="21.594"/><rect x="345.500" y="215.938" width="21.594" height="21.594"/><rect x="367.094" y="215.938" width="21.594" height="21.594"/><rect x="431.875" y="215.938" width="21.594" height="21.594"/><rect x="453.469" y="215.938" width="21.594" height="21.594"/><rect x="475.062" y="215.938" width="21.594" height="21.594"/><rect x="151.156" y="237.531" width="21.594" height="21.594"/><rect x="172.750" y="237.531" width="21.594" height="21.594"/><rect x="194.344" y="237.531" width="21.594" height="21.594"/><rect x="215.938" y="237.531" width="21.594" height="21.594"/><rect x="280.719" y="237.531" width="21.594" height="21.594"/><rect x="302.312" y="237.531" width="21.594" height="21.594"/><rect x="345.500" y="237.531" width="21.594" height="21.594"/><rect x="367.094" y="237.531" width="21.594" height="21.594"/><rect x="410.281" y="237.531" width="21.594" height="21.594"/><rect x="431.875" y="237.531" width="21.594" height="21.594"/><rect x="453.469" y="237.531" width="21.594" height="21.594"/><rect x="194.344" y="259.125" width="21.594" height="21.594"/><rect x="215.938" y="259.125" width="21.594" height="21.594"/><rect x="237.531" y="259.125" width="21.594" height="21.594"/><rect x="280.719" y="259.125" width="21.594" height="21.594"/><rect x="302.312" y="259.125" width="21.594" height="21.594"/><rect x="323.906" y="259.125" width="21.594" height="21.594"/><rect x="345.500" y="259.125" width="21.594" height="21.594"/><rect x="367.094" y="259.125" width="21.594" height="21.594"/><rect x="388.688" y="259.125" width="21.594" height="21.594"/><rect x="410.281" y="259.125" width="21.594" height="21.594"/><rect x="431.875" y="259.125" width="21.594" height="21.594"/><rect x="453.469" y="259.125" width="21.594" height="21.594"/><rect x="215.938" y="280.719" width="21.594" height="21.594"/><rect x="237.531" y="280.719" width="21.594" height="21.594"/><rect x="259.125" y="280.719" width="21.594" height="21.594"/><rect x="280.719" y="280.719" width="21.594" height="21.594"/><rect x="302.312" y="280.719" width="21.594" height="21.594"/><rect x="323.906" y="280.719" width="21.594" height="21.594"/><rect x="345.500" y="280.719" width="21.594" height="21.594"/><rect x="367.094" y="280.719" width="21.594" height="21.594"/><rect x="388.688" y="280.719" width="21.594" height="21.594"/><rect x="410.281" y="280.719" width="21.594" height="21.594"/><rect x="431.875" y="280.719" width="21.594" height="21.594"/><rect x="259.125" y="302.312" width="21.594" height="21.594"/><rect x="280.719" y="302.312" width="21.594" height="21.594"/><rect x="302.312" y="302.312" width="21.594" height="21.594"/><rect x="323.906" y="302.312" width="21.594" height="21.594"/><rect x="345.500" y="302.312" width="21.594" height="21.594"/><rect x="367.094" y="302.312" width="21.594" height="21.594"/><rect x="388.688" y="302.312" width="21.594" height="21.594"/><rect x="410.281" y="302.312" width="21.594" height="21.594"/><rect x="431.875" y="302.312" width="21.594" height="21.594"/><rect x="475.062" y="302.312" width="21.594" height="21.594"/><rect x="496.656" y="302.312" width="21.594" height="21.594"/><rect x="518.250" y="302.312" width="21.594" height="21.594"/><rect x="539.844" y="302.312" width="21.594" height="21.594"/><rect x="561.438" y="302.312" width="21.594" height="21.594"/><rect x="86.375" y="323.906" width="21.594" height="21.594"/><rect x="107.969" y="323.906" width="21.594" height="21.594"/><rect x="129.562" y="323.906" width="21.594" height="21.594"/><rect x="151.156" y="323.906" width="21.594" height="21.594"/><rect x="172.750" y="323.906" width="21.594" height="21.594"/><rect x="280.719" y="323.906" width="21.594" height="21.594"/><rect x="302.312" y="323.906" width="21.594" height="21.594"/><rect x="323.906" y="323.906" width="21.594" height="21.594"/><rect x="345.500" y="323.906" width="21.594" height="21.594"/><rect x="367.094" y="323.906" width="21.594" height="21.594"/><rect x="388.688" y="323.906" width="21.594" height="21.594"/><rect x="410.281" y="323.906" width="21.594" height="21.594"/><rect x="431.875" y="323.906" width="21.594" height="21.594"/><rect x="453.469" y="323.906" width="21.594" height="21.594"/><rect x="475.062" y="323.906" width="21.594" height="21.594"/><rect x="496.656" y="323.906" width="21.594" height="21.594"/><rect x="518.250" y="323.906" width="21.594" height="21.594"/><rect x="539.844" y="323.906" width="21.594" height="21.594"/><rect x="107.969" y="345.500" width="21.594" height="21.594"/><rect x="129.562" y="345.500" width="21.594" height="21.594"/><rect x="151.156" y="345.500" width="21.594" height="21.594"/><rect x="172.750" y="345.500" width="21.594" height="21.594"/><rect x="194.344" y="345.500" width="21.594" height="21.594"/><rect x="215.938" y="345.500" width="21.594" height="21.594"/><rect x="237.531" y="345.500" width="21.594" height="21.594"/><rect x="259.125" y="345.500" width="21.594" height="21.594"/><rect x="280.719" y="345.500" width="21.594" height="21.594"/><rect x="302.312" y="345.500" width="21.594" height="21.594"/><rect x="323.906" y="345.500" width="21.594" height="21.594"/><rect x="345.500" y="345.500" width="21.594" height="21.594"/><rect x="367.094" y="345.500" width="21.594" height="21.594"/><rect x="388.688" y="345.500" width="21.594" height="21.594"/><rect x="410.281" y="345.500" width="21.594" height="21.594"/><rect x="431.875" y="345.500" width="21.594" height="21.594"/><rect x="280.719" y="367.094" width="21.594" height="21.594"/><rect x="302.312" y="367.094" width="21.594" height="21.594"/><rect x="323.906" y="367.094" width="21.594" height="21.594"/><rect x="345.500" y="367.094" width="21.594" height="21.594"/><rect x="367.094" y="367.094" width="21.594" height="21.594"/><rect x="388.688" y="367.094" width="21.594" height="21.594"/><rect x="410.281" y="367.094" width="21.594" height="21.594"/><rect x="431.875" y="367.094" width="21.594" height="21.594"/><rect x="453.469" y="367.094" width="21.594" height="21.594"/><rect x="475.062" y="367.094" width="21.594" height="21.594"/><rect x="496.656" y="367.094" width="21.594" height="21.594"/><rect x="518.250" y="367.094" width="21.594" height="21.594"/><rect x="539.844" y="367.094" width="21.594" height="21.594"/><rect x="561.438" y="367.094" width="21.594" height="21.594"/><rect x="237.531" y="388.688" width="21.594" height="21.594"/><rect x="259.125" y="388.688" width="21.594" height="21.594"/><rect x="280.719" y="388.688" width="21.594" height="21.594"/><rect x="302.312" y="388.688" width="21.594" height="21.594"/><rect x="323.906" y="388.688" width="21.594" height="21.594"/><rect x="345.500" y="388.688" width="21.594" height="21.594"/><rect x="367.094" y="388.688" width="21.594" height="21.594"/><rect x="388.688" y="388.688" width="21.594" height="21.594"/><rect x="410.281" y="388.688" width="21.594" height="21.594"/><rect x="475.062" y="388.688" width="21.594" height="21.594"/><rect x="496.656" y="388.688" width="21.594" height="21.594"/><rect x="518.250" y="388.688" width="21.594" height="21.594"/><rect x="539.844" y="388.688" width="21.594" height="21.594"/><rect x="561.438" y="388.688" width="21.594" height="21.594"/><rect x="215.938" y="410.281" width="21.594" height="21.594"/><rect x="237.531" y="410.281" width="21.594" height="21.594"/><rect x="259.125" y="410.281" width="21.594" height="21.594"/><rect x="302.312" y="410.281" width="21.594" height="21.594"/><rect x="323.906" y="410.281" width="21.594" height="21.594"/><rect x="345.500" y="410.281" width="21.594" height="21.594"/><rect x="367.094" y="410.281" width="21.594" height="21.594"/><rect x="388.688" y="410.281" width="21.594" height="21.594"/><rect x="410.281" y="410.281" width="21.594" height="21.594"/><rect x="431.875" y="410.281" width="21.594" height="21.594"/><rect x="172.750" y="431.875" width="21.594" height="21.594"/><rect x="194.344" y="431.875" width="21.594" height="21.594"/><rect x="215.938" y="431.875" width="21.594" height="21.594"/><rect x="280.719" y="431.875" width="21.594" height="21.594"/><rect x="302.312" y="431.875" width="21.594" height="21.594"/><rect x="345.500" y="431.875" width="21.594" height="21.594"/><rect x="367.094" y="431.875" width="21.594" height="21.594"/><rect x="388.688" y="431.875" width="21.594" height="21.594"/><rect x="410.281" y="431.875" width="21.594" height="21.594"/><rect x="431.875" y="431.875" width="21.594" height="21.594"/><rect x="453.469" y="431.875" width="21.594" height="21.594"/><rect x="151.156" y="453.469" width="21.594" height="21.594"/><rect x="172.750" y="453.469" width="21.594" height="21.594"/><rect x="194.344" y="453.469" width="21.594" height="21.594"/><rect x="259.125" y="453.469" width="21.594" height="21.594"/><rect x="280.719" y="453.469" width="21.594" height="21.594"/><rect x="323.906" y="453.469" width="21.594" height="21.594"/><rect x="345.500" y="453.469" width="21.594" height="21.594"/><rect x="388.688" y="453.469" width="21.594" height="21.594"/><rect x="410.281" y="453.469" width="21.594" height="21.594"/><rect x="453.469" y="453.469" width="21.594" height="21.594"/><rect x="475.062" y="453.469" width="21.594" height="21.594"/><rect x="151.156" y="475.062" width="21.594" height="21.594"/><rect x="237.531" y="475.062" width="21.594" height="21.594"/><rect x="259.125" y="475.062" width="21.594" height="21.594"/><rect x="323.906" y="475.062" width="21.594" height="21.594"/><rect x="345.500" y="475.062" width="21.594" height="21.594"/><rect x="410.281" y="475.062" width="21.594" height="21.594"/><rect x="431.875" y="475.062" width="21.594" height="21.594"/><rect x="475.062" y="475.062" width="21.594" height="21.594"/><rect x="496.656" y="475.062" width="21.594" height="21.594"/><rect x="237.531" y="496.656" width="21.594" height="21.594"/><rect x="259.125" y="496.656" width="21.594" height="21.594"/><rect x="323.906" y="496.656" width="21.594" height="21.594"/><rect x="345.500" y="496.656" width="21.594" height="21.594"/><rect x="410.281" y="496.656" width="21.594" height="21.594"/><rect x="431.875" y="496.656" width="21.594" height="21.594"/><rect x="453.469" y="496.656" width="21.594" height="21.594"/><rect x="518.250" y="496.656" width="21.594" height="21.594"/><rect x="215.938" y="518.250" width="21.594" height="21.594"/><rect x="237.531" y="518.250" width="21.594" height="21.594"/><rect x="323.906" y="518.250" width="21.594" height="21.594"/><rect x="345.500" y="518.250" width="21.594" height="21.594"/><rect x="431.875" y="518.250" width="21.594" height="21.594"/><rect x="453.469" y="518.250" width="21.594" height="21.594"/><rect x="194.344" y="539.844" width="21.594" height="21.594"/><rect x="215.938" y="539.844" width="21.594" height="21.594"/><rect x="323.906" y="539.844" width="21.594" height="21.594"/><rect x="453.469" y="539.844" width="21.594" height="21.594"/><rect x="302.312" y="561.438" width="21.594" height="21.594"/><rect x="323.906" y="561.438" width="21.594" height="21.594"/><rect x="323.906" y="583.031" width="21.594" height="21.594"/></g></g></svg>'
  );

  var host = null;
  var aurora = null;
  var GLIDE_MS = 340;
  var focusBox = null;
  var tracked = null;
  var trackFrame = 0;
  var glideTimer = null;
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

  function auroraFlow() {
    return RAINBOW.concat(RAINBOW).concat([RAINBOW[0]]).join(', ');
  }

  function applyPalette(accents, aurora) {
    if (accents) {
      for (var key in ACCENTS) {
        if (accents[key]) { ACCENTS[key] = accents[key]; }
      }
    }
    if (aurora && aurora.length) { RAINBOW = aurora.slice(); }
    if (host) { host.style.setProperty('--bcm-flow-colors', auroraFlow()); }
  }

  function styleText() {
    var masks = ramp('to right') + ', ' + ramp('to bottom');
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
      '  background: linear-gradient(135deg, var(--bcm-flow-colors));',
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
      '.bcm-focus.is-tracking {',
      '  transition: opacity 0.32s ease, border-color 0.45s ease, box-shadow 0.45s ease;',
      '}',
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

  function claimIcon(force) {
    if (!document.head) { return; }
    if (removedIcons === null) { removedIcons = []; }

    var taken = 0;
    var existing = document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]');
    for (var i = 0; i < existing.length; i++) {
      if (existing[i] === injectedIcon) { continue; }
      removedIcons.push(existing[i]);
      existing[i].remove();
      taken++;
    }

    // Firefox reads an icon when its link is inserted, so ours has to go back in after theirs.
    if (injectedIcon && injectedIcon.isConnected && (taken > 0 || force)) {
      injectedIcon.remove();
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

  function reclaimTabMark() {
    if (injectedIcon) { claimIcon(true); }
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
    applyPalette(options.accents, options.aurora);
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

  function place(rect) {
    var pad = 5;
    focusBox.style.top = (rect.top - pad) + 'px';
    focusBox.style.left = (rect.left - pad) + 'px';
    focusBox.style.width = (rect.width + pad * 2) + 'px';
    focusBox.style.height = (rect.height + pad * 2) + 'px';
  }

  // A fixed layer is never clipped by the page but never moves with it either, so the box is
  // re-measured every frame; the geometry transition is dropped once tracking starts or it lags.
  function track() {
    trackFrame = 0;
    if (!host || !host.isConnected || !tracked) { return; }
    if (!tracked.isConnected) { clearFocus(); return; }
    place(__bcmRect(tracked));
    trackFrame = requestAnimationFrame(track);
  }

  function focus(el, state) {
    if (!host || !host.isConnected) { return; }
    host.style.setProperty('--bcm-focus-color', ACCENTS[state] || ACCENTS.idle);
    var rect = el && el.getBoundingClientRect ? __bcmRect(el) : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      clearFocus();
      return;
    }
    if (tracked !== el) {
      focusBox.classList.remove('is-tracking');
      if (glideTimer) { clearTimeout(glideTimer); }
      glideTimer = setTimeout(function () {
        glideTimer = null;
        if (focusBox) { focusBox.classList.add('is-tracking'); }
      }, GLIDE_MS);
    }
    tracked = el;
    place(rect);
    focusBox.classList.add('is-active');
    if (!trackFrame) { trackFrame = requestAnimationFrame(track); }
  }

  function clearFocus() {
    tracked = null;
    if (trackFrame) { cancelAnimationFrame(trackFrame); trackFrame = 0; }
    if (glideTimer) { clearTimeout(glideTimer); glideTimer = null; }
    if (focusBox) {
      focusBox.classList.remove('is-active');
      focusBox.classList.remove('is-tracking');
    }
  }

  function conceal() {
    if (host) { host.style.setProperty('display', 'none', 'important'); }
  }

  function reveal() {
    if (host) { host.style.removeProperty('display'); }
  }

  function detach() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    tracked = null;
    if (trackFrame) { cancelAnimationFrame(trackFrame); trackFrame = 0; }
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
    reclaimTabMark: reclaimTabMark,
    conceal: conceal,
    reveal: reveal,
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
  accents: Record<OverlayState, string>;
  aurora: string[];
  target?: ElementTarget;
}

export function buildAttachOverlayCode(request: AttachRequest): string {
  const target = request.target ? targetLiteral(request.target) : "null";
  return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${OVERLAY_RUNTIME_SOURCE}
  window.__bcmOverlay.attach({
    status: ${jsValue(request.status)},
    state: ${jsValue(request.state)},
    markTab: ${jsValue(request.markTab)},
    showAurora: ${jsValue(request.showAurora)},
    showBadge: ${jsValue(request.showBadge)},
    idleStatus: ${jsValue(request.idleStatus)},
    resetAfterMs: ${jsValue(request.resetAfterMs)},
    accents: ${jsValue(request.accents)},
    aurora: ${jsValue(request.aurora)}
  });

  var target = ${jsValue(request.showFocus)} ? ${target} : null;
  if (!target) {
    window.__bcmOverlay.clearFocus();
    return { rect: null, target: null, wasInView: true };
  }

  var el = __bcmResolve(target);
  var before = __bcmRect(el);
  var viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  var viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  var wasInView = before.top + before.height > 0 && before.top < viewportHeight &&
    before.left + before.width > 0 && before.left < viewportWidth;
  __bcmScrollToAnchor(el, true);

  var rect = __bcmRect(el);
  window.__bcmOverlay.focus(el, ${jsValue(request.state)});
  return { rect: rect, target: __bcmLabel(el), wasInView: wasInView };
})();`;
}

export function buildConcealOverlayCode(): string {
  return `(function () {
  if (window.__bcmOverlay) { window.__bcmOverlay.conceal(); }
  return true;
})();`;
}

export function buildRevealOverlayCode(): string {
  return `(function () {
  if (window.__bcmOverlay) { window.__bcmOverlay.reveal(); }
  return true;
})();`;
}

export function buildReclaimTabMarkCode(): string {
  return `(function () {
  if (window.__bcmOverlay) { window.__bcmOverlay.reclaimTabMark(); }
  return true;
})();`;
}

export function buildDetachOverlayCode(): string {
  return `(function () {
  if (window.__bcmOverlay) { window.__bcmOverlay.detach(); }
  return true;
})();`;
}
