// @ts-nocheck
export function overlayRuntime() {
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

  var MARK_SVG = (
    '<svg width="691" height="691" viewBox="0 0 691 691" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="283.418" y1="691" x2="283.418" y2="0" gradientUnits="userSpaceOnUse"><stop stop-color="#DC6038"/><stop offset="1" stop-color="#D97757"/></linearGradient><clipPath id="c"><rect width="691" height="691" rx="161.953" fill="white"/></clipPath></defs><g clip-path="url(#c)"><rect width="691" height="691" rx="161.953" fill="url(#g)"/><rect opacity="0.35" width="691" height="691" fill="#D97757"/><g fill="#FAF9F5" shape-rendering="crispEdges"><rect x="215.938" y="107.969" width="21.594" height="21.594"/><rect x="237.531" y="107.969" width="21.594" height="21.594"/><rect x="367.094" y="107.969" width="21.594" height="21.594"/><rect x="388.688" y="107.969" width="21.594" height="21.594"/><rect x="215.938" y="129.562" width="21.594" height="21.594"/><rect x="237.531" y="129.562" width="21.594" height="21.594"/><rect x="259.125" y="129.562" width="21.594" height="21.594"/><rect x="367.094" y="129.562" width="21.594" height="21.594"/><rect x="388.688" y="129.562" width="21.594" height="21.594"/><rect x="215.938" y="151.156" width="21.594" height="21.594"/><rect x="237.531" y="151.156" width="21.594" height="21.594"/><rect x="259.125" y="151.156" width="21.594" height="21.594"/><rect x="367.094" y="151.156" width="21.594" height="21.594"/><rect x="388.688" y="151.156" width="21.594" height="21.594"/><rect x="475.062" y="151.156" width="21.594" height="21.594"/><rect x="496.656" y="151.156" width="21.594" height="21.594"/><rect x="237.531" y="172.750" width="21.594" height="21.594"/><rect x="259.125" y="172.750" width="21.594" height="21.594"/><rect x="280.719" y="172.750" width="21.594" height="21.594"/><rect x="367.094" y="172.750" width="21.594" height="21.594"/><rect x="453.469" y="172.750" width="21.594" height="21.594"/><rect x="475.062" y="172.750" width="21.594" height="21.594"/><rect x="496.656" y="172.750" width="21.594" height="21.594"/><rect x="129.562" y="194.344" width="21.594" height="21.594"/><rect x="151.156" y="194.344" width="21.594" height="21.594"/><rect x="237.531" y="194.344" width="21.594" height="21.594"/><rect x="259.125" y="194.344" width="21.594" height="21.594"/><rect x="280.719" y="194.344" width="21.594" height="21.594"/><rect x="345.500" y="194.344" width="21.594" height="21.594"/><rect x="367.094" y="194.344" width="21.594" height="21.594"/><rect x="431.875" y="194.344" width="21.594" height="21.594"/><rect x="453.469" y="194.344" width="21.594" height="21.594"/><rect x="475.062" y="194.344" width="21.594" height="21.594"/><rect x="496.656" y="194.344" width="21.594" height="21.594"/><rect x="129.562" y="215.938" width="21.594" height="21.594"/><rect x="151.156" y="215.938" width="21.594" height="21.594"/><rect x="172.750" y="215.938" width="21.594" height="21.594"/><rect x="194.344" y="215.938" width="21.594" height="21.594"/><rect x="259.125" y="215.938" width="21.594" height="21.594"/><rect x="280.719" y="215.938" width="21.594" height="21.594"/><rect x="302.312" y="215.938" width="21.594" height="21.594"/><rect x="345.500" y="215.938" width="21.594" height="21.594"/><rect x="367.094" y="215.938" width="21.594" height="21.594"/><rect x="431.875" y="215.938" width="21.594" height="21.594"/><rect x="453.469" y="215.938" width="21.594" height="21.594"/><rect x="475.062" y="215.938" width="21.594" height="21.594"/><rect x="151.156" y="237.531" width="21.594" height="21.594"/><rect x="172.750" y="237.531" width="21.594" height="21.594"/><rect x="194.344" y="237.531" width="21.594" height="21.594"/><rect x="215.938" y="237.531" width="21.594" height="21.594"/><rect x="280.719" y="237.531" width="21.594" height="21.594"/><rect x="302.312" y="237.531" width="21.594" height="21.594"/><rect x="345.500" y="237.531" width="21.594" height="21.594"/><rect x="367.094" y="237.531" width="21.594" height="21.594"/><rect x="410.281" y="237.531" width="21.594" height="21.594"/><rect x="431.875" y="237.531" width="21.594" height="21.594"/><rect x="453.469" y="237.531" width="21.594" height="21.594"/><rect x="194.344" y="259.125" width="21.594" height="21.594"/><rect x="215.938" y="259.125" width="21.594" height="21.594"/><rect x="237.531" y="259.125" width="21.594" height="21.594"/><rect x="280.719" y="259.125" width="21.594" height="21.594"/><rect x="302.312" y="259.125" width="21.594" height="21.594"/><rect x="323.906" y="259.125" width="21.594" height="21.594"/><rect x="345.500" y="259.125" width="21.594" height="21.594"/><rect x="367.094" y="259.125" width="21.594" height="21.594"/><rect x="388.688" y="259.125" width="21.594" height="21.594"/><rect x="410.281" y="259.125" width="21.594" height="21.594"/><rect x="431.875" y="259.125" width="21.594" height="21.594"/><rect x="453.469" y="259.125" width="21.594" height="21.594"/><rect x="215.938" y="280.719" width="21.594" height="21.594"/><rect x="237.531" y="280.719" width="21.594" height="21.594"/><rect x="259.125" y="280.719" width="21.594" height="21.594"/><rect x="280.719" y="280.719" width="21.594" height="21.594"/><rect x="302.312" y="280.719" width="21.594" height="21.594"/><rect x="323.906" y="280.719" width="21.594" height="21.594"/><rect x="345.500" y="280.719" width="21.594" height="21.594"/><rect x="367.094" y="280.719" width="21.594" height="21.594"/><rect x="388.688" y="280.719" width="21.594" height="21.594"/><rect x="410.281" y="280.719" width="21.594" height="21.594"/><rect x="431.875" y="280.719" width="21.594" height="21.594"/><rect x="259.125" y="302.312" width="21.594" height="21.594"/><rect x="280.719" y="302.312" width="21.594" height="21.594"/><rect x="302.312" y="302.312" width="21.594" height="21.594"/><rect x="323.906" y="302.312" width="21.594" height="21.594"/><rect x="345.500" y="302.312" width="21.594" height="21.594"/><rect x="367.094" y="302.312" width="21.594" height="21.594"/><rect x="388.688" y="302.312" width="21.594" height="21.594"/><rect x="410.281" y="302.312" width="21.594" height="21.594"/><rect x="431.875" y="302.312" width="21.594" height="21.594"/><rect x="475.062" y="302.312" width="21.594" height="21.594"/><rect x="496.656" y="302.312" width="21.594" height="21.594"/><rect x="518.250" y="302.312" width="21.594" height="21.594"/><rect x="539.844" y="302.312" width="21.594" height="21.594"/><rect x="561.438" y="302.312" width="21.594" height="21.594"/><rect x="86.375" y="323.906" width="21.594" height="21.594"/><rect x="107.969" y="323.906" width="21.594" height="21.594"/><rect x="129.562" y="323.906" width="21.594" height="21.594"/><rect x="151.156" y="323.906" width="21.594" height="21.594"/><rect x="172.750" y="323.906" width="21.594" height="21.594"/><rect x="280.719" y="323.906" width="21.594" height="21.594"/><rect x="302.312" y="323.906" width="21.594" height="21.594"/><rect x="323.906" y="323.906" width="21.594" height="21.594"/><rect x="345.500" y="323.906" width="21.594" height="21.594"/><rect x="367.094" y="323.906" width="21.594" height="21.594"/><rect x="388.688" y="323.906" width="21.594" height="21.594"/><rect x="410.281" y="323.906" width="21.594" height="21.594"/><rect x="431.875" y="323.906" width="21.594" height="21.594"/><rect x="453.469" y="323.906" width="21.594" height="21.594"/><rect x="475.062" y="323.906" width="21.594" height="21.594"/><rect x="496.656" y="323.906" width="21.594" height="21.594"/><rect x="518.250" y="323.906" width="21.594" height="21.594"/><rect x="539.844" y="323.906" width="21.594" height="21.594"/><rect x="107.969" y="345.500" width="21.594" height="21.594"/><rect x="129.562" y="345.500" width="21.594" height="21.594"/><rect x="151.156" y="345.500" width="21.594" height="21.594"/><rect x="172.750" y="345.500" width="21.594" height="21.594"/><rect x="194.344" y="345.500" width="21.594" height="21.594"/><rect x="215.938" y="345.500" width="21.594" height="21.594"/><rect x="237.531" y="345.500" width="21.594" height="21.594"/><rect x="259.125" y="345.500" width="21.594" height="21.594"/><rect x="280.719" y="345.500" width="21.594" height="21.594"/><rect x="302.312" y="345.500" width="21.594" height="21.594"/><rect x="323.906" y="345.500" width="21.594" height="21.594"/><rect x="345.500" y="345.500" width="21.594" height="21.594"/><rect x="367.094" y="345.500" width="21.594" height="21.594"/><rect x="388.688" y="345.500" width="21.594" height="21.594"/><rect x="410.281" y="345.500" width="21.594" height="21.594"/><rect x="431.875" y="345.500" width="21.594" height="21.594"/><rect x="280.719" y="367.094" width="21.594" height="21.594"/><rect x="302.312" y="367.094" width="21.594" height="21.594"/><rect x="323.906" y="367.094" width="21.594" height="21.594"/><rect x="345.500" y="367.094" width="21.594" height="21.594"/><rect x="367.094" y="367.094" width="21.594" height="21.594"/><rect x="388.688" y="367.094" width="21.594" height="21.594"/><rect x="410.281" y="367.094" width="21.594" height="21.594"/><rect x="431.875" y="367.094" width="21.594" height="21.594"/><rect x="453.469" y="367.094" width="21.594" height="21.594"/><rect x="475.062" y="367.094" width="21.594" height="21.594"/><rect x="496.656" y="367.094" width="21.594" height="21.594"/><rect x="518.250" y="367.094" width="21.594" height="21.594"/><rect x="539.844" y="367.094" width="21.594" height="21.594"/><rect x="561.438" y="367.094" width="21.594" height="21.594"/><rect x="237.531" y="388.688" width="21.594" height="21.594"/><rect x="259.125" y="388.688" width="21.594" height="21.594"/><rect x="280.719" y="388.688" width="21.594" height="21.594"/><rect x="302.312" y="388.688" width="21.594" height="21.594"/><rect x="323.906" y="388.688" width="21.594" height="21.594"/><rect x="345.500" y="388.688" width="21.594" height="21.594"/><rect x="367.094" y="388.688" width="21.594" height="21.594"/><rect x="388.688" y="388.688" width="21.594" height="21.594"/><rect x="410.281" y="388.688" width="21.594" height="21.594"/><rect x="475.062" y="388.688" width="21.594" height="21.594"/><rect x="496.656" y="388.688" width="21.594" height="21.594"/><rect x="518.250" y="388.688" width="21.594" height="21.594"/><rect x="539.844" y="388.688" width="21.594" height="21.594"/><rect x="561.438" y="388.688" width="21.594" height="21.594"/><rect x="215.938" y="410.281" width="21.594" height="21.594"/><rect x="237.531" y="410.281" width="21.594" height="21.594"/><rect x="259.125" y="410.281" width="21.594" height="21.594"/><rect x="302.312" y="410.281" width="21.594" height="21.594"/><rect x="323.906" y="410.281" width="21.594" height="21.594"/><rect x="345.500" y="410.281" width="21.594" height="21.594"/><rect x="367.094" y="410.281" width="21.594" height="21.594"/><rect x="388.688" y="410.281" width="21.594" height="21.594"/><rect x="410.281" y="410.281" width="21.594" height="21.594"/><rect x="431.875" y="410.281" width="21.594" height="21.594"/><rect x="172.750" y="431.875" width="21.594" height="21.594"/><rect x="194.344" y="431.875" width="21.594" height="21.594"/><rect x="215.938" y="431.875" width="21.594" height="21.594"/><rect x="280.719" y="431.875" width="21.594" height="21.594"/><rect x="302.312" y="431.875" width="21.594" height="21.594"/><rect x="345.500" y="431.875" width="21.594" height="21.594"/><rect x="367.094" y="431.875" width="21.594" height="21.594"/><rect x="388.688" y="431.875" width="21.594" height="21.594"/><rect x="410.281" y="431.875" width="21.594" height="21.594"/><rect x="431.875" y="431.875" width="21.594" height="21.594"/><rect x="453.469" y="431.875" width="21.594" height="21.594"/><rect x="151.156" y="453.469" width="21.594" height="21.594"/><rect x="172.750" y="453.469" width="21.594" height="21.594"/><rect x="194.344" y="453.469" width="21.594" height="21.594"/><rect x="259.125" y="453.469" width="21.594" height="21.594"/><rect x="280.719" y="453.469" width="21.594" height="21.594"/><rect x="323.906" y="453.469" width="21.594" height="21.594"/><rect x="345.500" y="453.469" width="21.594" height="21.594"/><rect x="388.688" y="453.469" width="21.594" height="21.594"/><rect x="410.281" y="453.469" width="21.594" height="21.594"/><rect x="453.469" y="453.469" width="21.594" height="21.594"/><rect x="475.062" y="453.469" width="21.594" height="21.594"/><rect x="151.156" y="475.062" width="21.594" height="21.594"/><rect x="237.531" y="475.062" width="21.594" height="21.594"/><rect x="259.125" y="475.062" width="21.594" height="21.594"/><rect x="323.906" y="475.062" width="21.594" height="21.594"/><rect x="345.500" y="475.062" width="21.594" height="21.594"/><rect x="410.281" y="475.062" width="21.594" height="21.594"/><rect x="431.875" y="475.062" width="21.594" height="21.594"/><rect x="475.062" y="475.062" width="21.594" height="21.594"/><rect x="496.656" y="475.062" width="21.594" height="21.594"/><rect x="237.531" y="496.656" width="21.594" height="21.594"/><rect x="259.125" y="496.656" width="21.594" height="21.594"/><rect x="323.906" y="496.656" width="21.594" height="21.594"/><rect x="345.500" y="496.656" width="21.594" height="21.594"/><rect x="410.281" y="496.656" width="21.594" height="21.594"/><rect x="431.875" y="496.656" width="21.594" height="21.594"/><rect x="453.469" y="496.656" width="21.594" height="21.594"/><rect x="518.250" y="496.656" width="21.594" height="21.594"/><rect x="215.938" y="518.250" width="21.594" height="21.594"/><rect x="237.531" y="518.250" width="21.594" height="21.594"/><rect x="323.906" y="518.250" width="21.594" height="21.594"/><rect x="345.500" y="518.250" width="21.594" height="21.594"/><rect x="431.875" y="518.250" width="21.594" height="21.594"/><rect x="453.469" y="518.250" width="21.594" height="21.594"/><rect x="194.344" y="539.844" width="21.594" height="21.594"/><rect x="215.938" y="539.844" width="21.594" height="21.594"/><rect x="323.906" y="539.844" width="21.594" height="21.594"/><rect x="453.469" y="539.844" width="21.594" height="21.594"/><rect x="302.312" y="561.438" width="21.594" height="21.594"/><rect x="323.906" y="561.438" width="21.594" height="21.594"/><rect x="323.906" y="583.031" width="21.594" height="21.594"/></g></g></svg>'
  );
  var MARK_ICON = 'data:image/svg+xml,' + encodeURIComponent(MARK_SVG);
  var REST_ICON = 'data:image/svg+xml,' + encodeURIComponent(
    MARK_SVG
      .replace('<defs>', '<defs><filter id="r"><feColorMatrix type="saturate" values="0"/></filter>')
      .replace('<g clip-path="url(#c)">', '<g clip-path="url(#c)" filter="url(#r)" opacity="0.7">')
  );

  var host = null;
  var aurora = null;
  var GLIDE_MS = 340;
  var REGION_TAG_GAP = 1;
  var focusBox = null;
  var tracked = null;
  var trackFrame = 0;
  var glideTimer = null;
  var badge = null;
  var panel = null;
  var scriptBlock = null;
  var resultBlock = null;
  var scriptLabel = '';
  var ERROR_COLOR = '#ff6b6b';
  var regionLayer = null;
  var regions = [];
  var dropBox = null;
  var dragSweep = null;
  var swipeSweep = null;
  var dragFrom = null;
  var dragTo = null;
  var resting = false;
  var motionTimer = null;
  var SWEEP_MS = 2000;
  var sweepMs = SWEEP_MS;
  var style = null;
  var grainSpeeds = {};
  var SWIPE_SCALE = 1.5;
  var pendingSwipe = null;
  var SWEEP_FADE_IN = 0.08;
  var SWEEP_FADE_OUT = 0.22;
  var DUST_PER_CYCLE = 50;
  var DUST_LIFE = 500;
  var DUST_SPREAD = 9;
  var DUST_DRIFT = 5;
  var DUST_MIN = 5;
  var DUST_MAX = 14;
  var DUST_ALPHA = 0.84;
  var SWEEP_EASE = [0.33, 1, 0.68, 1];
  var SWIPE_ANGLES = { right: 0, down: 90, left: 180, up: 270, bottom: 90, top: 270 };

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
      ':host {',
      '  all: initial;',
      '  transition: --bcm-accent 0.45s ease, --bcm-focus-color 0.45s ease,',
      '    filter 0.8s ease, opacity 0.8s ease;',
      '}',
      ':host(.is-resting) { filter: grayscale(1); opacity: 0.4; }',
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
      '.bcm-drop {',
      '  position: absolute; box-sizing: border-box; border-radius: 9px;',
      '  border: 2px dashed var(--bcm-focus-color);',
      '  box-shadow: 0 0 0 5px color-mix(in srgb, var(--bcm-focus-color) 14%, transparent),',
      '    0 0 26px 8px color-mix(in srgb, var(--bcm-focus-color) 35%, transparent);',
      '  opacity: 0; transition: opacity 0.32s ease, border-color 0.45s ease, box-shadow 0.45s ease;',
      '}',
      '.bcm-drop.is-active { opacity: 1; }',
      '.bcm-sweep {',
      '  position: absolute; width: 0; height: 0;',
      '  opacity: 0; transition: opacity 0.3s ease;',
      '}',
      '.bcm-sweep.is-active { opacity: 1; }',
      '.bcm-sweep-track {',
      '  position: absolute; top: 0; left: 0; width: 0; height: 0;',
      '  transform: rotate(var(--bcm-sweep-angle, 0deg));',
      '}',
      '.bcm-sweep-head { position: absolute; top: 0; left: 0; width: 0; height: 0; opacity: 0; }',
      '.bcm-sweep-core {',
      '  position: absolute; top: -10px; left: -10px; width: 20px; height: 20px; border-radius: 50%;',
      '  box-sizing: border-box; border: 2px solid var(--bcm-accent);',
      '  background: color-mix(in srgb, var(--bcm-accent) 35%, transparent);',
      '  box-shadow: 0 0 18px var(--bcm-accent), 0 0 36px color-mix(in srgb, var(--bcm-accent) 60%, transparent),',
      '    inset 0 0 10px color-mix(in srgb, var(--bcm-accent) 70%, transparent);',
      '  transform: scale(var(--bcm-sweep-scale, 1));',
      '}',
      '.bcm-dust {',
      '  position: absolute; top: 0; left: 0; width: 0; height: 0;',
      '  transform: translate(calc(var(--bcm-sweep-travel, 200px) * var(--bcm-dust-p, 0) + var(--bcm-dust-ox, 0px)),',
      '    var(--bcm-dust-oy, 0px)) scale(var(--bcm-sweep-scale, 1));',
      '}',
      '.bcm-grain {',
      '  position: absolute; border-radius: 50%; box-sizing: border-box;',
      '  border: 1.5px solid var(--bcm-accent);',
      '  background: color-mix(in srgb, var(--bcm-accent) 30%, transparent);',
      '  box-shadow: 0 0 6px color-mix(in srgb, var(--bcm-accent) 60%, transparent),',
      '    inset 0 0 4px color-mix(in srgb, var(--bcm-accent) 60%, transparent);',
      '  width: var(--bcm-grain-size, 8px); height: var(--bcm-grain-size, 8px);',
      '  top: calc(var(--bcm-grain-size, 8px) / -2); left: calc(var(--bcm-grain-size, 8px) / -2);',
      '  opacity: 0; transform: scale(0);',
      '}',
      // The animations have to arrive with the class: declared on the element they would run once
      // as the overlay is built and never again, since re-adding a class changes no animation property.
      '.bcm-sweep.is-active .bcm-sweep-head {',
      '  animation: bcmSweepMove var(--bcm-sweep-speed, 2s) cubic-bezier(' + SWEEP_EASE.join(', ') + ') 1 both;',
      '}',
      '.bcm-sweep.is-active .bcm-grain {',
      '  animation: var(--bcm-grain-anim, bcmGrain2000) var(--bcm-sweep-speed, 2s) linear 1 both;',
      '  animation-delay: var(--bcm-grain-delay, 0ms);',
      '}',
      '@keyframes bcmSweepMove {',
      '  0% { transform: translateX(calc(var(--bcm-sweep-travel, 200px) / -2)); opacity: 0; }',
      '  ' + (SWEEP_FADE_IN * 100) + '%, ' + ((1 - SWEEP_FADE_OUT) * 100) + '% { opacity: 1; }',
      '  100% { transform: translateX(calc(var(--bcm-sweep-travel, 200px) / 2)); opacity: 0; }',
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
      '.bcm-code {',
      '  position: absolute; top: 50%; left: 50%;',
      '  transform: translate(-50%, -50%) scale(0.97);',
      '  box-sizing: border-box; width: min(720px, 80vw);',
      '  display: flex; flex-direction: column; gap: 12px;',
      '  opacity: 0; pointer-events: none;',
      '  transition: opacity 0.45s ease, transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);',
      '}',
      // The panel alone takes the pointer, or a script longer than the panel could not be scrolled.
      '.bcm-code.is-active { opacity: 1; transform: translate(-50%, -50%) scale(1); pointer-events: auto; }',
      '.bcm-code-block {',
      '  --bcm-code-color: var(--bcm-accent);',
      '  position: relative; box-sizing: border-box;',
      '  border: 1px solid color-mix(in srgb, var(--bcm-code-color) 55%, transparent);',
      '  border-radius: 14px;',
      '  background: rgba(9, 9, 14, 0.72);',
      '  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55),',
      '    0 0 30px color-mix(in srgb, var(--bcm-code-color) 25%, transparent);',
      '  backdrop-filter: blur(14px) saturate(1.2);',
      '  transition: border-color 0.45s ease, box-shadow 0.45s ease;',
      '}',
      '.bcm-code-block.is-error { --bcm-code-color: ' + ERROR_COLOR + '; }',
      '.bcm-code-block.is-empty { display: none; }',
      '.bcm-code-tag {',
      '  position: absolute; top: -1px; left: -1px; z-index: 1;',
      '  font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif;',
      '  color: #fff; background: var(--bcm-code-color);',
      '  padding: 4px 8px; border-radius: 14px 0 6px 0; white-space: nowrap;',
      '  max-width: 260px; overflow: hidden; text-overflow: ellipsis;',
      '  transition: background 0.45s ease;',
      '}',
      '.bcm-code-body {',
      '  margin: 0; padding: 26px 16px 14px;',
      '  max-height: 40vh; overflow: auto;',
      '  font: 500 12px/1.5 ui-monospace, "Cascadia Code", Consolas, "Malgun Gothic", monospace;',
      '  white-space: pre-wrap; word-break: break-all; tab-size: 2;',
      '  color: color-mix(in srgb, var(--bcm-code-color) 78%, #fff);',
      '  scrollbar-width: thin;',
      '  scrollbar-color: color-mix(in srgb, var(--bcm-code-color) 55%, transparent) transparent;',
      '  transition: color 0.45s ease;',
      '}',
      '.bcm-region {',
      '  position: absolute; box-sizing: border-box; border-radius: 9px;',
      '  border: 1px solid var(--bcm-region-color);',
      '}',
      '.bcm-region.is-top {',
      '  border-width: 2px;',
      '  box-shadow: 0 0 0 5px color-mix(in srgb, var(--bcm-region-color) 22%, transparent),',
      '    0 0 26px 8px color-mix(in srgb, var(--bcm-region-color) 55%, transparent),',
      '    0 0 60px 18px color-mix(in srgb, var(--bcm-region-color) 26%, transparent);',
      '}',
      '.bcm-region.is-bottom { border-style: dashed; }',
      '.bcm-region-tag {',
      '  position: absolute; top: -1px; left: -1px;',
      '  font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif;',
      '  color: #fff; background: var(--bcm-region-color);',
      '  padding: 3px 7px; border-radius: 6px 0 6px 0; white-space: nowrap;',
      '  max-width: 260px; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.bcm-region-tag.is-stacked { border-radius: 0 0 6px 6px; }',

      '@media (prefers-reduced-motion: reduce) {',
      '  .bcm-flow, .bcm-focus.is-active, .bcm-pip { animation: none; }',
      '  .bcm-sweep { display: none; }',
      '}'
    ].join('\n');
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
    style = document.createElement('style');
    style.textContent = styleText();
    grainSpeeds = {};

    aurora = document.createElement('div');
    aurora.className = 'bcm-aurora';
    var flow = document.createElement('div');
    flow.className = 'bcm-flow';
    aurora.appendChild(flow);

    regionLayer = document.createElement('div');
    regionLayer.className = 'bcm-regions';

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

    panel = document.createElement('div');
    panel.className = 'bcm-code';
    scriptBlock = buildCodeBlock();
    resultBlock = buildCodeBlock();
    panel.appendChild(scriptBlock);
    panel.appendChild(resultBlock);

    dropBox = document.createElement('div');
    dropBox.className = 'bcm-drop';

    root.appendChild(style);
    root.appendChild(aurora);
    root.appendChild(regionLayer);
    root.appendChild(dropBox);
    root.appendChild(focusBox);
    root.appendChild(badge);
    root.appendChild(panel);
    document.documentElement.appendChild(host);
    // Settles the initial opacity before attach adds is-active in the same task; without a
    // computed value to start from the fade-in transition never runs.
    getComputedStyle(aurora).opacity;
    host.classList.toggle('is-resting', resting);
  }

  function buildCodeBlock() {
    var block = document.createElement('div');
    block.className = 'bcm-code-block is-empty';
    var tag = document.createElement('span');
    tag.className = 'bcm-code-tag';
    var body = document.createElement('pre');
    body.className = 'bcm-code-body';
    block.appendChild(tag);
    block.appendChild(body);
    return block;
  }

  function fillCodeBlock(block, label, text, isError) {
    block.firstChild.textContent = label || '';
    block.lastChild.textContent = text;
    block.lastChild.scrollTop = 0;
    block.classList.toggle('is-error', !!isError);
    block.classList.remove('is-empty');
  }

  function showResult(text, label, isError) {
    if (!host || !host.isConnected || !panel) { return false; }
    // A result with no script above it would read as the page's own dialog, so it lands
    // only on a panel a script already opened.
    if (!panel.classList.contains('is-active')) { return false; }
    fillCodeBlock(resultBlock, label, text, isError);
    return true;
  }

  function sweepEase(x) {
    var cx = 3 * SWEEP_EASE[0];
    var bx = 3 * (SWEEP_EASE[2] - SWEEP_EASE[0]) - cx;
    var ax = 1 - cx - bx;
    var cy = 3 * SWEEP_EASE[1];
    var by = 3 * (SWEEP_EASE[3] - SWEEP_EASE[1]) - cy;
    var ay = 1 - cy - by;
    var t = x;
    for (var i = 0; i < 8; i++) {
      var e = ((ax * t + bx) * t + cx) * t - x;
      if (Math.abs(e) < 0.0001) { break; }
      t -= e / (((3 * ax * t + 2 * bx) * t + cx) || 0.000001);
    }
    return ((ay * t + by) * t + cy) * t;
  }

  function grainAnimation(speed) {
    var name = 'bcmGrain' + speed;
    if (!grainSpeeds[speed]) {
      grainSpeeds[speed] = true;
      style.textContent += '\n' + grainKeyframes(name, speed);
    }
    return name;
  }

  function grainKeyframes(name, speed) {
    var life = Math.min(DUST_LIFE / speed * 100, 100);
    return '@keyframes ' + name + ' {\n' +
      '  0% { opacity: 0; transform: translate(0, 0) scale(0); }\n' +
      '  0.4% { opacity: var(--bcm-grain-alpha, 0.8); transform: translate(0, 0) scale(1); }\n' +
      '  ' + life.toFixed(2) + '% { opacity: 0;' +
      ' transform: translate(var(--bcm-grain-dx, 0px), var(--bcm-grain-dy, 0px)) scale(0); }\n' +
      '  100% { opacity: 0; transform: scale(0); }\n' +
      '}';
  }

  function buildSweep(speed, scale) {
    var el = document.createElement('div');
    el.className = 'bcm-sweep';
    var track = document.createElement('div');
    track.className = 'bcm-sweep-track';
    track.style.setProperty('--bcm-sweep-speed', speed + 'ms');
    track.style.setProperty('--bcm-sweep-scale', String(scale));
    track.style.setProperty('--bcm-grain-anim', grainAnimation(speed));
    var window_ = 1 - SWEEP_FADE_IN - SWEEP_FADE_OUT;
    var count = Math.round(DUST_PER_CYCLE * window_);
    for (var i = 0; i < count; i++) {
      var phase = SWEEP_FADE_IN + (i + 0.5) / count * window_;
      var a = Math.random() * Math.PI * 2;
      var r = Math.random() * DUST_SPREAD * scale;
      var d = Math.random() * Math.PI * 2;
      var wrap = document.createElement('div');
      wrap.className = 'bcm-dust';
      wrap.style.setProperty('--bcm-dust-p', (sweepEase(phase) - 0.5).toFixed(4));
      wrap.style.setProperty('--bcm-dust-ox', (Math.cos(a) * r).toFixed(1) + 'px');
      wrap.style.setProperty('--bcm-dust-oy', (Math.sin(a) * r).toFixed(1) + 'px');
      var grain = document.createElement('span');
      grain.className = 'bcm-grain';
      grain.style.setProperty('--bcm-grain-size', (DUST_MIN + Math.random() * (DUST_MAX - DUST_MIN)).toFixed(1) + 'px');
      grain.style.setProperty('--bcm-grain-alpha', String(DUST_ALPHA));
      grain.style.setProperty('--bcm-grain-dx', (Math.cos(d) * DUST_DRIFT).toFixed(1) + 'px');
      grain.style.setProperty('--bcm-grain-dy', (Math.sin(d) * DUST_DRIFT).toFixed(1) + 'px');
      grain.style.setProperty('--bcm-grain-delay', Math.round(phase * speed) + 'ms');
      wrap.appendChild(grain);
      track.appendChild(wrap);
    }
    var head = document.createElement('div');
    head.className = 'bcm-sweep-head';
    var core = document.createElement('span');
    core.className = 'bcm-sweep-core';
    head.appendChild(core);
    track.appendChild(head);
    el.appendChild(track);
    return { el: el, track: track };
  }

  function placeSweep(sw, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    sw.el.style.left = ((x1 + x2) / 2) + 'px';
    sw.el.style.top = ((y1 + y2) / 2) + 'px';
    sw.track.style.setProperty('--bcm-sweep-angle', (Math.atan2(dy, dx) * 180 / Math.PI).toFixed(2) + 'deg');
    sw.track.style.setProperty('--bcm-sweep-travel', Math.round(Math.sqrt(dx * dx + dy * dy)) + 'px');
  }

  function startSweep(speed, scale) {
    var sw = buildSweep(speed, scale);
    host.shadowRoot.insertBefore(sw.el, focusBox);
    requestAnimationFrame(function () { sw.el.classList.add('is-active'); });
    sw.timer = setTimeout(function () { sw.el.remove(); }, speed + DUST_LIFE + 400);
    return sw;
  }

  function stopSweep(sw) {
    clearTimeout(sw.timer);
    sw.el.remove();
  }

  function currentIcon() {
    return resting ? REST_ICON : MARK_ICON;
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
      injectedIcon.href = currentIcon();
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

  function setStatus(label, state, detail) {
    if (!host || !host.isConnected) { return; }
    host.style.setProperty('--bcm-accent', ACCENTS[state] || ACCENTS.idle);
    var text = host.shadowRoot.querySelector('.bcm-text');
    if (label) {
      text.textContent = label;
      badge.classList.add('is-active');
    } else {
      badge.classList.remove('is-active');
    }
    resultBlock.classList.add('is-empty');
    resultBlock.classList.remove('is-error');
    if (detail) {
      fillCodeBlock(scriptBlock, scriptLabel, detail, false);
      panel.classList.add('is-active');
    } else {
      panel.classList.remove('is-active');
    }
  }

  function setResting(flag) {
    resting = !!flag;
    if (host && host.isConnected) { host.classList.toggle('is-resting', resting); }
    if (injectedIcon && injectedIcon.getAttribute('href') !== currentIcon()) { claimIcon(true); }
  }

  function rest() {
    setResting(true);
  }

  function attach(options) {
    if (!host || !host.isConnected) { build(); }
    clearRegions();
    clearDrag();
    applyPalette(options.accents, options.aurora);
    if (options.showAurora) {
      aurora.classList.add('is-active');
    } else {
      aurora.classList.remove('is-active');
    }

    scriptLabel = options.scriptLabel || '';
    setStatus(options.showBadge ? options.status : '', options.state, options.showBadge ? options.detail : '');
    setResting(options.resting);
    sweepMs = options.sweepMs > 0 ? Math.round(options.sweepMs) : SWEEP_MS;
    clearSwipe();
    pendingSwipe = options.swipe || null;

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
    if (motionTimer) { clearTimeout(motionTimer); motionTimer = null; }
    if (options.resetAfterMs > 0) {
      motionTimer = setTimeout(function () {
        motionTimer = null;
        clearDrag();
        clearSwipe();
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
    if (!host || !host.isConnected) { return; }
    if (tracked && !tracked.isConnected) { clearFocus(); }
    if (tracked) { place(__bcmRect(tracked)); }
    if (dragFrom && (!dragFrom.isConnected || !dragTo.isConnected)) { clearDrag(); }
    if (dragFrom) { placeDrag(); }
    for (var i = regions.length - 1; i >= 0; i--) {
      if (!regions[i].el.isConnected) {
        regions[i].box.remove();
        regions.splice(i, 1);
        continue;
      }
      placeRegion(regions[i]);
    }
    if (tracked || dragFrom || regions.length) { trackFrame = requestAnimationFrame(track); }
  }

  function placeDrag() {
    var from = __bcmRect(dragFrom);
    var to = __bcmRect(dragTo);
    var pad = 5;
    dropBox.style.top = (to.top - pad) + 'px';
    dropBox.style.left = (to.left - pad) + 'px';
    dropBox.style.width = (to.width + pad * 2) + 'px';
    dropBox.style.height = (to.height + pad * 2) + 'px';

    if (dragSweep) {
      placeSweep(dragSweep, from.left + from.width / 2, from.top + from.height / 2,
        to.left + to.width / 2, to.top + to.height / 2);
    }
  }

  function showSwipe(direction) {
    if (!host || !host.isConnected) { return 0; }
    var angle = SWIPE_ANGLES[direction];
    if (angle === undefined) { clearSwipe(); return 0; }
    var speed = sweepMs;
    var side = Math.min(window.innerWidth || 0, window.innerHeight || 0) || 600;
    var travel = side * 0.35;
    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;
    var ux = Math.cos(angle * Math.PI / 180);
    var uy = Math.sin(angle * Math.PI / 180);
    clearSwipe();
    swipeSweep = startSweep(speed, SWIPE_SCALE);
    placeSweep(swipeSweep, cx - ux * travel / 2, cy - uy * travel / 2, cx + ux * travel / 2, cy + uy * travel / 2);
    return speed;
  }

  function beginSwipe() {
    var direction = pendingSwipe;
    pendingSwipe = null;
    return direction ? showSwipe(direction) : 0;
  }

  function clearSwipe() {
    pendingSwipe = null;
    if (swipeSweep) { stopSweep(swipeSweep); swipeSweep = null; }
  }

  function showDrag(source, dropEl) {
    if (!host || !host.isConnected || !source || !dropEl) { return; }
    clearDrag();
    dragFrom = source;
    dragTo = dropEl;
    dragSweep = startSweep(sweepMs, 1);
    placeDrag();
    dropBox.classList.add('is-active');
    if (!trackFrame) { trackFrame = requestAnimationFrame(track); }
  }

  function clearDrag() {
    dragFrom = null;
    dragTo = null;
    if (dropBox) { dropBox.classList.remove('is-active'); }
    if (dragSweep) { stopSweep(dragSweep); dragSweep = null; }
  }

  function placeRegion(region) {
    var rect = __bcmRect(region.el);
    region.box.style.top = rect.top + 'px';
    region.box.style.left = rect.left + 'px';
    region.box.style.width = rect.width + 'px';
    region.box.style.height = rect.height + 'px';
  }

  function showRegions(list) {
    clearRegions();
    if (!host || !host.isConnected) { return; }
    host.style.setProperty('--bcm-region-color', ACCENTS.read);
    var top = -Infinity;
    var bottom = Infinity;
    var shallowest = Infinity;
    for (var k = 0; k < list.length; k++) {
      var lv = list[k].level || 0;
      if (lv > top) { top = lv; }
      if (lv < bottom) { bottom = lv; }
      var dp = list[k].depth || 0;
      if (dp < shallowest) { shallowest = dp; }
    }
    for (var i = 0; i < list.length; i++) {
      var el = list[i].el;
      var rect = el && el.getBoundingClientRect ? __bcmRect(el) : null;
      if (!rect || rect.width <= 0 || rect.height <= 0) { continue; }
      var t = top === bottom ? 0 : (top - (list[i].level || 0)) / (top - bottom);
      var box = document.createElement('div');
      box.className = 'bcm-region' + (t === 0 ? ' is-top' : t === 1 ? ' is-bottom' : '');
      if (t > 0 && t < 1) { box.style.borderWidth = (2 - t) + 'px'; }
      var step = Math.max(0, (list[i].depth || 0) - shallowest);
      var tag = document.createElement('span');
      tag.className = 'bcm-region-tag';
      tag.textContent = list[i].label;
      tag.style.zIndex = String(step + 1);
      if (step > 0) { tag.style.opacity = String(Math.max(0.62, 1 - step * 0.13)); }
      box.appendChild(tag);
      regionLayer.appendChild(box);
      regions.push({ el: el, box: box, tag: tag });
      placeRegion(regions[regions.length - 1]);
    }
    stackRegionTags();
    if (regions.length && !trackFrame) { trackFrame = requestAnimationFrame(track); }
  }

  function stackRegionTags() {
    var placed = [];
    for (var i = 0; i < regions.length; i++) {
      var tag = regions[i].tag;
      var boxLeft = parseFloat(regions[i].box.style.left) || 0;
      var boxTop = parseFloat(regions[i].box.style.top) || 0;
      var width = tag.offsetWidth;
      var height = tag.offsetHeight;
      var top = boxTop - 1;
      var left = boxLeft - 1;
      placed.sort(function (a, b) { return a.left - b.left; });
      for (var p = 0; p < placed.length; p++) {
        var other = placed[p];
        if (Math.abs(other.top - top) >= Math.min(other.height, height)) { continue; }
        if (left < other.left + other.width + REGION_TAG_GAP && left + width > other.left) {
          left = other.left + other.width + REGION_TAG_GAP;
        }
      }
      tag.style.left = (left - boxLeft) + 'px';
      if (left !== boxLeft - 1) { tag.classList.add('is-stacked'); }
      placed.push({ top: top, left: left, width: width, height: height });
    }
  }

  function clearRegions() {
    for (var i = 0; i < regions.length; i++) { regions[i].box.remove(); }
    regions = [];
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
    clearDrag();
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
    clearRegions();
    clearDrag();
    clearSwipe();
    if (trackFrame) { cancelAnimationFrame(trackFrame); trackFrame = 0; }
    restoreTabMark();
    resting = false;
    if (!host || !host.isConnected) { return; }
    aurora.classList.remove('is-active');
    focusBox.classList.remove('is-active');
    badge.classList.remove('is-active');
    panel.classList.remove('is-active');
    var dying = host;
    host = null;
    setTimeout(function () {
      if (dying && dying.isConnected) { dying.remove(); }
    }, 900);
  }

  window.__bcmOverlay = {
    attach: attach,
    setStatus: setStatus,
    showResult: showResult,
    focus: focus,
    clearFocus: clearFocus,
    showDrag: showDrag,
    showSwipe: showSwipe,
    beginSwipe: beginSwipe,
    rest: rest,
    showRegions: showRegions,
    reclaimTabMark: reclaimTabMark,
    conceal: conceal,
    reveal: reveal,
    detach: detach
  };
}
