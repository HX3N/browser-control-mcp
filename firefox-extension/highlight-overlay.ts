import type { ElementTarget } from "@browser-control-mcp/common/server-messages";
import { ELEMENT_RESOLVER_SOURCE, SCROLL_ANCHOR_SOURCE, jsValue, targetLiteral } from "./injected-common";
import { overlayRuntime } from "./overlay-runtime";

export type OverlayState = "idle" | "read" | "click" | "type" | "exec";

export interface OverlayResult {
    rect: { top: number; left: number; width: number; height: number } | null;
    target: string | null;
    wasInView: boolean;
}

const OVERLAY_RUNTIME_SOURCE = `(${overlayRuntime.toString()})();`;

export interface AttachRequest {
    status: string;
    state: OverlayState;
    markTab: boolean;
    showAurora: boolean;
    showFocus: boolean;
    showBadge: boolean;
    idleStatus: string;
    resetAfterMs: number;
    sweepMs: number;
    accents: Record<OverlayState, string>;
    aurora: string[];
    resting?: boolean;
    target?: ElementTarget;
    drop?: ElementTarget;
    detail?: string;
    swipe?: string;
}

export function buildAttachOverlayCode(request: AttachRequest): string {
    const target = request.target ? targetLiteral(request.target) : "null";
    const drop = request.drop ? targetLiteral(request.drop) : "null";
    return `(function () {
${ELEMENT_RESOLVER_SOURCE}
${SCROLL_ANCHOR_SOURCE}
${OVERLAY_RUNTIME_SOURCE}
  window.__bcmOverlay.attach({
    status: ${jsValue(request.status)},
    state: ${jsValue(request.state)},
    detail: ${jsValue(request.detail ?? "")},
    markTab: ${jsValue(request.markTab)},
    showAurora: ${jsValue(request.showAurora)},
    showBadge: ${jsValue(request.showBadge)},
    idleStatus: ${jsValue(request.idleStatus)},
    resetAfterMs: ${jsValue(request.resetAfterMs)},
    sweepMs: ${jsValue(request.sweepMs)},
    accents: ${jsValue(request.accents)},
    aurora: ${jsValue(request.aurora)},
    resting: ${jsValue(request.resting === true)},
    swipe: ${jsValue(request.showFocus ? (request.swipe ?? null) : null)}
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
  var drop = ${drop};
  if (drop) {
    try { window.__bcmOverlay.showDrag(el, __bcmResolve(drop)); } catch (err) {}
  }
  return { rect: rect, target: __bcmLabel(el), wasInView: wasInView };
})();`;
}

export function buildRestOverlayCode(): string {
    return `(function () {
  if (window.__bcmOverlay) { window.__bcmOverlay.rest(); }
  return true;
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

export interface OutlineRegionMark {
    ref: string;
    label: string;
    level: number;
}

export function buildOutlineOverlayCode(regions: OutlineRegionMark[]): string {
    return `(function () {
${ELEMENT_RESOLVER_SOURCE}
  if (!window.__bcmOverlay || !window.__bcmOverlay.showRegions) { return 0; }
  var marks = ${jsValue(regions)};
  var list = [];
  for (var i = 0; i < marks.length; i++) {
    try {
      list.push({ el: __bcmResolve({ ref: marks[i].ref }), label: marks[i].label, level: marks[i].level });
    } catch (err) {}
  }
  window.__bcmOverlay.showRegions(list);
  return list.length;
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
