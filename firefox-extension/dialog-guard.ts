import { jsValue } from "./injected-common";

export type ConsoleLevel = "off" | "error" | "warn" | "log";

const CONSOLE_METHODS: Record<Exclude<ConsoleLevel, "off">, string[]> = {
  error: ["error"],
  warn: ["error", "warn"],
  log: ["error", "warn", "info", "log"],
};

function consoleMethods(level: ConsoleLevel): string[] {
  return level === "off" ? [] : CONSOLE_METHODS[level];
}

// Reports are queued rather than sent where they happen: the dialog and console hooks run with
// page code on the stack, and the extension APIs are silently out of reach until it unwinds.
export function buildDialogGuardCode(level: ConsoleLevel = "off"): string {
  return `(function () {
  if (window.__bcmDialogGuard) { return true; }

  var page = window.wrappedJSObject;
  if (!page || typeof exportFunction !== 'function') { return false; }

  window.__bcmDialogGuard = true;

  var RELAY_KEY = '__bcmPageEvents';
  var RELAY_LIMIT = 40;

  var token = 'g' + Math.random().toString(36).slice(2, 10);
  var seq = 0;
  var pending = [];
  var inFlight = [];
  var flushQueued = false;
  var reportBroken = false;

  function relay() {
    try { return window.sessionStorage; } catch (err) { return null; }
  }

  function settle(message) {
    var index = inFlight.indexOf(message);
    if (index !== -1) { inFlight.splice(index, 1); }
  }

  function send(message) {
    inFlight.push(message);
    try {
      var answer = browser.runtime.sendMessage(message);
      if (answer && typeof answer.then === 'function') {
        answer.then(function () { settle(message); }, function () {});
      } else {
        settle(message);
      }
    } catch (err) {
      if (!reportBroken) {
        reportBroken = true;
        console.error('Browser Control MCP could not report a page event', err);
      }
    }
  }

  function flush() {
    flushQueued = false;
    var batch = pending;
    pending = [];
    for (var i = 0; i < batch.length; i++) { send(batch[i]); }
  }

  function queue(message) {
    if (!message.id) { message.id = token + ':' + (++seq); }
    pending.push(message);
    if (!flushQueued) {
      flushQueued = true;
      Promise.resolve().then(flush);
    }
  }

  // A report travels on the document's own channel, and a page that navigates away right after
  // raising a dialog tears that channel down before the parent process reads it.
  function stash() {
    var left = pending.concat(inFlight);
    if (left.length === 0) { return; }
    var box = relay();
    if (!box) { return; }
    var kept = [];
    try {
      var stored = JSON.parse(box.getItem(RELAY_KEY) || '[]');
      if (stored && typeof stored.length === 'number') { kept = stored; }
    } catch (err) { kept = []; }
    kept = kept.concat(left);
    if (kept.length > RELAY_LIMIT) { kept = kept.slice(kept.length - RELAY_LIMIT); }
    try { box.setItem(RELAY_KEY, JSON.stringify(kept)); } catch (err) {}
  }

  function collect() {
    var box = relay();
    if (!box) { return; }
    var stored = null;
    try { stored = box.getItem(RELAY_KEY); } catch (err) { return; }
    if (!stored) { return; }
    try { box.removeItem(RELAY_KEY); } catch (err) {}
    var kept = null;
    try { kept = JSON.parse(stored); } catch (err) { return; }
    if (!kept || typeof kept.length !== 'number') { return; }
    for (var i = 0; i < kept.length; i++) {
      if (kept[i] && kept[i].kind === 'page-event') { queue(kept[i]); }
    }
  }

  function report(channel, kind, text) {
    var line = text === undefined || text === null ? '' : String(text);
    line = line.replace(/\\s+/g, ' ').trim();
    if (line.length > 300) { line = line.slice(0, 300) + '...'; }
    queue({
      kind: 'page-event',
      channel: channel,
      text: kind + (line ? ': ' + line : '')
    });
  }

  collect();
  window.addEventListener('DOMContentLoaded', collect, true);

  // Only the top frame announces itself: the background matches these against the documents it
  // saw commit, and a subframe is never one of those.
  if (window.top === window) {
    queue({ kind: 'page-event', channel: 'guard', text: location.href });
  }

  page.alert = exportFunction(function (message) {
    report('dialog', 'alert', message);
  }, page);

  page.confirm = exportFunction(function (message) {
    report('dialog', 'confirm (answered OK)', message);
    return true;
  }, page);

  page.prompt = exportFunction(function (message, fallback) {
    report('dialog', 'prompt (answered with its default)', message);
    return fallback === undefined || fallback === null ? '' : String(fallback);
  }, page);

  page.print = exportFunction(function () {
    report('dialog', 'print (suppressed)', '');
  }, page);

  // Nothing can withdraw another handler's returnValue, so the page's own must not run at all.
  window.addEventListener('beforeunload', function (event) {
    var announced = !!page.onbeforeunload;
    event.stopImmediatePropagation();
    if (announced) {
      report('dialog', 'beforeunload (leave confirmation suppressed)', '');
    }
  }, true);

  window.addEventListener('pagehide', function () {
    flush();
    stash();
  }, true);

  window.addEventListener('error', function (event) {
    if (event.target && event.target !== window && event.target.tagName) {
      var url = event.target.src || event.target.href || '';
      report('console', 'failed to load <' + event.target.tagName.toLowerCase() + '>', url);
      return;
    }
    report('console', 'uncaught', event.message || String(event.error || ''));
  }, true);

  window.addEventListener('unhandledrejection', function (event) {
    report('console', 'unhandled rejection', String(event.reason));
  });

  var hooked = ${jsValue(consoleMethods(level))};
  for (var i = 0; i < hooked.length; i++) {
    (function (name) {
      var original = page.console[name];
      page.console[name] = exportFunction(function () {
        var parts = [];
        for (var a = 0; a < arguments.length; a++) {
          try { parts.push(String(arguments[a])); } catch (err) { parts.push('[unprintable]'); }
        }
        report('console', 'console.' + name, parts.join(' '));
        try { original.apply(page.console, arguments); } catch (err) {}
      }, page);
    })(hooked[i]);
  }

  return true;
})();`;
}

export type RegisteredDialogGuard =
  browser.contentScripts.RegisteredContentScript;

function guardMatchPattern(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return `${parsed.protocol}//${parsed.hostname}/*`;
  } catch (error) {
    return null;
  }
}

export async function registerDialogGuard(
  url: string,
  code: string,
  cookieStoreId?: string
): Promise<RegisteredDialogGuard | null> {
  const match = guardMatchPattern(url);
  if (!match) {
    return null;
  }

  try {
    return await browser.contentScripts.register({
      matches: [match],
      ...(cookieStoreId ? { cookieStoreId } : {}),
      js: [{ code }],
      runAt: "document_start",
      allFrames: true,
    });
  } catch (error) {
    console.error("Could not register the dialog guard for", match, error);
    return null;
  }
}

export async function unregisterDialogGuard(
  registration: RegisteredDialogGuard | null
): Promise<void> {
  if (!registration) {
    return;
  }
  try {
    await registration.unregister();
  } catch (error) {
    console.error("Could not unregister the dialog guard", error);
  }
}
