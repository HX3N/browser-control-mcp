import { getOverlayColors, getOverlayTimings } from "./extension-config";
import type { OverlayState } from "./highlight-overlay";
import { formatScript } from "./format-script";
import { localizeDocument, t } from "./i18n";
import { overlayRuntime } from "./overlay-runtime";
import { sweepEase } from "./sweep-ease";

declare global {
  interface Window {
    __bcmRect?: (el: Element) => { top: number; left: number; width: number; height: number };
    __bcmOverlay?: {
      attach: (options: Record<string, unknown>) => void;
      focus: (el: Element, state: OverlayState) => void;
      showDrag: (source: Element, drop: Element) => void;
      beginSwipe: () => number;
      showRegions: (list: { el: Element; label: string; level: number }[]) => void;
      showResult: (text: string, label: string, isError: boolean) => boolean;
      rest: () => void;
      detach: () => void;
    };
  }
}

window.__bcmRect = (el) => {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
};

overlayRuntime();

const SAMPLE_SCRIPT =
  'const rows=[...document.querySelectorAll("section")];return rows.map(function(row){var h=row.querySelector("h2");return h?h.textContent:null;});';
const SAMPLE_RESULT = `[
  "Region A",
  "Region B"
]`;
const SAMPLE_ERROR = "TypeError: row.querySelector is not a function";

async function attach(state: OverlayState, status: string, extra: Record<string, unknown> = {}): Promise<void> {
  const colors = await getOverlayColors();
  const timings = await getOverlayTimings();
  window.__bcmOverlay?.attach({
    status,
    state,
    detail: "",
    markTab: true,
    showAurora: true,
    showBadge: true,
    idleStatus: t("overlayIdle"),
    resetAfterMs: timings.statusResetMs,
    sweepMs: timings.sweepMs,
    accents: colors.accents,
    aurora: colors.aurora,
    resting: false,
    swipe: null,
    ...extra,
  });
}

function glide(x1: number, y1: number, ms: number): void {
  const x0 = window.scrollX;
  const y0 = window.scrollY;
  let started: number | null = null;
  const frame = (now: number) => {
    if (started === null) started = now;
    const p = Math.min(1, (now - started) / ms);
    const e = sweepEase(p);
    window.scrollTo(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e);
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function scroll(direction: string): Promise<void> {
  await attach("read", t("overlayScroll"), { swipe: direction });
  const doc = document.scrollingElement ?? document.documentElement;
  const maxY = Math.max(0, doc.scrollHeight - window.innerHeight);
  const maxX = Math.max(0, doc.scrollWidth - window.innerWidth);
  const step = Math.round(window.innerHeight * 0.85);
  let x = window.scrollX;
  let y = window.scrollY;
  if (direction === "top") y = 0;
  else if (direction === "bottom") y = maxY;
  else if (direction === "up") y -= step;
  else if (direction === "down") y += step;
  else if (direction === "left") x -= step;
  else x += step;
  const ms = window.__bcmOverlay?.beginSwipe() || 600;
  glide(Math.max(0, Math.min(maxX, x)), Math.max(0, Math.min(maxY, y)), ms);
}

const el = (id: string): Element => document.getElementById(id) as Element;

const actions: Record<string, (button: HTMLButtonElement) => Promise<void> | void> = {
  scroll: (button) => scroll(button.dataset.direction ?? "down"),
  drag: async () => {
    await attach("click", t("overlayDrag"));
    window.__bcmOverlay?.focus(el("drag-source"), "click");
    window.__bcmOverlay?.showDrag(el("drag-source"), el("drop-target"));
  },
  click: async () => {
    await attach("click", t("overlayClick"));
    window.__bcmOverlay?.focus(el("click-target"), "click");
  },
  type: async () => {
    await attach("type", t("overlayType"));
    window.__bcmOverlay?.focus(el("type-target"), "type");
  },
  read: () => attach("read", t("overlayReadingContent"), { resetAfterMs: 0 }),
  exec: async () => {
    await attach("exec", t("overlayExecuteJs"), {
      detail: formatScript(SAMPLE_SCRIPT),
      scriptLabel: t("overlayScriptLabel"),
      resetAfterMs: 0,
    });
    window.__bcmOverlay?.showResult(SAMPLE_RESULT, t("overlayResultLabel"), false);
  },
  execError: async () => {
    await attach("exec", t("overlayExecuteJs"), {
      detail: formatScript(SAMPLE_SCRIPT),
      scriptLabel: t("overlayScriptLabel"),
      resetAfterMs: 0,
    });
    window.__bcmOverlay?.showResult(SAMPLE_ERROR, t("overlayErrorLabel"), true);
  },
  regions: async () => {
    await attach("read", t("overlayReadingContent"), { resetAfterMs: 0 });
    window.__bcmOverlay?.showRegions([
      { el: el("region-a"), label: t("previewRegionA"), level: 1 },
      { el: el("region-b"), label: t("previewRegionB"), level: 0 },
    ]);
  },
  rest: async () => {
    await attach("idle", t("overlayIdle"));
    window.__bcmOverlay?.rest();
  },
  wake: () => attach("idle", t("overlayIdle")),
  detach: () => window.__bcmOverlay?.detach(),
};

document.addEventListener("DOMContentLoaded", () => {
  localizeDocument();
  for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
    button.addEventListener("click", () => {
      void actions[button.dataset.action ?? ""]?.(button);
    });
  }
});
