const DIALOG_GUARD_SOURCE = `
(function () {
  if (window.__bcmDialogGuard) { return true; }

  var page = window.wrappedJSObject;
  if (!page || typeof exportFunction !== 'function') { return false; }

  window.__bcmDialogGuard = true;
  window.__bcmDialogs = [];

  function record(kind, message) {
    var text = message === undefined || message === null ? '' : String(message);
    if (text.length > 500) { text = text.slice(0, 500) + '...'; }
    window.__bcmDialogs.push(kind + (text ? ': ' + text : ''));
    if (window.__bcmDialogs.length > 20) { window.__bcmDialogs.shift(); }
  }

  page.alert = exportFunction(function (message) {
    record('alert', message);
  }, page);

  page.confirm = exportFunction(function (message) {
    record('confirm (answered OK)', message);
    return true;
  }, page);

  page.prompt = exportFunction(function (message, fallback) {
    record('prompt (answered with its default)', message);
    return fallback === undefined || fallback === null ? '' : String(fallback);
  }, page);

  return true;
})();`;

export function buildDialogGuardCode(): string {
  return DIALOG_GUARD_SOURCE;
}

export function buildDrainDialogsCode(): string {
  return `(function () {
  var seen = window.__bcmDialogs || [];
  window.__bcmDialogs = [];
  return seen;
})();`;
}
