export const TOP_FRAME_ID = 0;

export const MAX_DETACHED_FRAMES = 16;

export interface DetachedFrame {
  frameId: number;
  parentFrameId: number;
  url: string;
}

const REACHABILITY_PROBE = `(function () {
  var parentReachable = false;
  function answer(reachable) {
    return { reachable: reachable, parentReachable: parentReachable, url: location.href };
  }
  try {
    var win = window;
    while (win !== window.top) {
      var above = win.parent;
      if (!above || above === win) { return answer(false); }
      var held = true;
      try { void above.document.documentElement; } catch (err) { held = false; }
      if (win === window) { parentReachable = held; }
      if (!held) { return answer(false); }
      win = above;
    }
    parentReachable = true;
    return answer(true);
  } catch (err) {
    return answer(false);
  }
})();`;

export function isFrameRef(ref: string): boolean {
  return /^f\d+e/.test(ref);
}

export function stampFrameRef(ref: string, frameId: number): string {
  return frameId === TOP_FRAME_ID ? ref : `f${frameId}${ref}`;
}

export function parseFrameRef(ref: string): { frameId: number; ref: string } {
  const marked = /^f(\d+)(e\d+)$/.exec(ref);
  return marked
    ? { frameId: Number(marked[1]), ref: marked[2] }
    : { frameId: TOP_FRAME_ID, ref };
}

export async function listDetachedFrames(
  tabId: number,
  runProbe: (frameId: number, code: string) => Promise<any[]>
): Promise<DetachedFrame[]> {
  let frames:
    | { frameId: number; parentFrameId: number; url: string; errorOccurred?: boolean }[]
    | null;
  try {
    frames = await browser.webNavigation.getAllFrames({ tabId });
  } catch (error) {
    return [];
  }
  if (!frames) {
    return [];
  }

  const unreachable = new Map<number, DetachedFrame & { parentReachable: boolean }>();
  for (const frame of frames) {
    if (frame.frameId === TOP_FRAME_ID || frame.errorOccurred) {
      continue;
    }
    let probe:
      | { reachable: boolean; parentReachable?: boolean; url: string }
      | undefined;
    try {
      const results = await runProbe(frame.frameId, REACHABILITY_PROBE);
      probe = results?.[0];
    } catch (error) {
      continue;
    }
    if (!probe || probe.reachable) {
      continue;
    }
    unreachable.set(frame.frameId, {
      frameId: frame.frameId,
      parentFrameId: frame.parentFrameId,
      url: probe.url || frame.url,
      parentReachable: probe.parentReachable === true,
    });
  }

  // getAllFrames promises no parent-first order, so judging starts only after every probe is in.
  // A frame its own detached parent can walk into is read through that parent's injection.
  const detached: DetachedFrame[] = [];
  for (const frame of unreachable.values()) {
    if (frame.parentReachable && unreachable.has(frame.parentFrameId)) {
      continue;
    }
    if (detached.length >= MAX_DETACHED_FRAMES) {
      break;
    }
    detached.push({
      frameId: frame.frameId,
      parentFrameId: frame.parentFrameId,
      url: frame.url,
    });
  }
  return detached;
}
