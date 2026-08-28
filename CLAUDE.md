# CLAUDE.md

Fork of eyalzh/browser-control-mcp. The upstream reads the browser only; this fork adds page
interaction, a permission model, and an on-page overlay.

## Commands

```bash
npm install                            # npm, not pnpm: package-lock.json is committed
npm run build                          # nx: tsc (mcp-server), esbuild (firefox-extension)
npm run package                        # build + web-ext build → firefox-extension/web-ext-artifacts/*.zip
cd firefox-extension && npm test       # jest, extension only
cd mcp-server && npm start
cd mcp-server && npm run pack-dxt      # Claude Desktop only
```

## Structure

`mcp-server` (MCP over stdio, WebSocket to the extension) · `firefox-extension` (MV2, runs every
action) · `common` (shared message types). Frames are HMAC-signed; each session's server takes
the next free port and the extension keeps one spare slot.

| File | Role |
| --- | --- |
| `common/server-messages.ts`, `common/extension-messages.ts` | Command and response types |
| `mcp-server/server.ts`, `mcp-server/browser-api.ts` | Tool definitions, round trip |
| `firefox-extension/background.ts` | Entry, WebSocket clients, popup channel, storage watchers |
| `firefox-extension/message-handler.ts` | Executes every command; both permission gates |
| `firefox-extension/extension-config.ts` | Tool registry, permission mode, overlay settings, storage |
| `firefox-extension/tab-access.ts`, `tab-authorization.ts` | Permission mode, per-tab grants |
| `firefox-extension/injected-common.ts` | Shared injected source: root walk, ref resolution, read scan, sweep easing |
| `firefox-extension/sweep-ease.ts` | Sweep easing as a real function (scroll script, preview page) |
| `firefox-extension/page-snapshot.ts` | Snapshot that stamps `data-bcm-ref` |
| `firefox-extension/interaction-scripts.ts` | Click, type, key, scroll, select, execute, wait |
| `firefox-extension/overlay-runtime.ts` | The overlay, a real function whose `toString()` is injected |
| `firefox-extension/format-script.ts` | Re-indents a script for the overlay panel |
| `firefox-extension/highlight-overlay.ts` | Builders that inject and drive the runtime |
| `firefox-extension/overlay-test.html`, `overlay-test.ts` | Preview page: every effect without a server |
| `firefox-extension/dialog-guard.ts`, `page-events.ts` | Dialog/console guard and its per-tab reports |
| `firefox-extension/popup.*`, `popup-messages.ts`, `options.*` | Popup, its contract, options page |

## Invariants

**Permissions**
- Two gates in `message-handler.ts`: tool switches (`COMMAND_TO_TOOL_ID`, `isCommandAllowed`,
  `DISABLED_BY_DEFAULT_TOOL_IDS`) and permission mode (`ensureTabAccess` on `PAGE_ACCESS_COMMANDS`).
- A tool id is a storage key, not the MCP name; renaming a tool keeps its id.
- `getConfig` fills `toolSettings` from defaults so popup, options and gate agree on a new tool.
- `<all_urls>` is the literal required host permission (`captureVisibleTab` compares it verbatim).
  The browser is no backstop; defaults stay locked.

**Pages and refs**
- Every injection goes through `runScript`, never `browser.tabs.executeScript` directly: a frozen
  page never settles, so the stall timer is the only way out.
- `openUrl` and `navigateTab` settle alike: `waitForCommit` then `awaitDomQuiet`. `complete` fires
  on subresources, not on render, so refs taken then die; no commit means no quiet. `verifyGuard`
  runs after it, since the guard's report lands after the commit that released the command.
- `navigateTab` hands a same-origin address to the page first (`routeWithinPage`); `tabs.update`
  only when the page did nothing. A commit, not the tab's `loading` status, says the hand-over
  started a load: the tab reads loading while the document being left finishes too.
- Quiet probes inject `runAt: "document_start"`; the default waits for a load event that a page
  holding an unfinished subresource never fires.
- Refs die on re-render; `window.__bcmRefs` is trusted over the attribute because markup copies
  carry the attribute.
- Roots are walked with `__bcmRoots()`, never `document` alone; cross-origin frames are reported
  by `__bcmUnreachableFrames`.
- Hidden elements are listed only with the popup switch on, after the visible ones, marked
  hidden and untrusted. Off-document boxes count as hidden (`__bcmWithinPage`).
- `password` and `hidden` inputs report length, never value.
- An unscoped read past the popup's outline thresholds returns an outline; `full: true` or
  `offset > 0` reads whole. Region refs number above `__bcmHighestRef()`.
- A read reports collapsed content by label and size only, never its text.
- Scroll positions are reported against `scrollMax`, not `scrollHeight`.
- A synthetic Enter submits in a single-line field and inserts a line break in a multiline one
  (`__bcmMultiline`).
- `wait-for-page-text-change` carries its baseline in `textBaselines` per tab and scope; the
  answer is a common-prefix/suffix diff (`text-diff.ts`); a navigation drops the baseline. The
  wait lives in the background, not in a script, because it can outlast `runScript`.

**Overlay**
- `overlay-runtime.ts` is injected as `overlayRuntime.toString()`, so it cannot reference module
  scope: every value it needs arrives through `attach` options or is defined inside it. The
  preview page calls it directly and shims `__bcmRect`.
- Attach applies the palette and timings every call; `background.ts` reapplies on storage change.
- The host lands in the page, so the quiet wait skips records that only add or remove it; counting
  our own drawing as page activity restarts the wait on every redraw.
- Holding and acting are separate clocks: `holdReleaseMs` (popup) vs `statusResetMs`. A read
  and an `execute-js` are sent with `resetAfterMs: 0`.
- `attendedTabId` is the tab being worked in; the tab a command leaves is drawn `resting`.
- Favicon mark: a link is read only when inserted, so reclaiming re-inserts it; `onTabUpdated`
  re-injects when `favIconUrl` is not ours, throttled by `MARK_RECLAIM_GAP_MS`.
- The scroll script asks `window.__bcmOverlay.beginSwipe()` for the sweep length and glides the
  page with `__bcmSweepEase` for exactly that long; the sweep plays once. `sweepMs` is an
  overlay timing. The easing exists twice on purpose (`sweep-ease.ts`, runtime `sweepEase`).
- `execute-js` draws the panel twice: the script, re-indented by `format-script.ts`, before it
  runs, and the result or the error after. A result lands only on a panel a script already
  opened, and the error draw is not awaited — a frozen page must still fail.
- Overlay failures are swallowed; they never break an interaction.

**Dialogs**
- The guard is registered for the target origin before the tab moves (`contentScripts.register`
  at `document_start`), re-injected on `webNavigation.onCommitted`, and checked by `verifyGuard`.
- Guard reports are queued and flushed on a microtask; unanswered ones survive `pagehide` through
  `sessionStorage` under the same id.
- Dialogs and console messages ride every response, and ride the thrown `ExtensionError` when a
  command fails.

## Adding a tool

`common/server-messages.ts` → `common/extension-messages.ts` → `extension-config.ts`
(`COMMAND_TO_TOOL_ID`, `PAGE_ACCESS_COMMANDS`) → `message-handler.ts` → `mcp-server/browser-api.ts`
→ `mcp-server/server.ts` → `mcp-server/manifest.json`.

Injected scripts are strings in template literals: escape backslashes (`\\s`), embed values
through `jsValue()`. Add a case to `__tests__/injected-parse.test.ts` when a builder gains an
option.

## Language

- UI strings: `_locales/{en,ko}/messages.json`, both files, `default_locale` en. Popup strings
  are written in Korean first, in the style of the existing entries.
- Docs: `README.md` (default) and `README.ko.md`.
- Tool names, descriptions, parameters and errors are English: they are prompts for a model.
- Code and comments are English.

## Notes

- Target is Zen Browser (Gecko). Compact mode hides the toolbar (`Alt+Shift+B` opens the popup);
  split view puts both tabs in `captureVisibleTab`.
- `default_popup` means `browserAction.onClicked` never fires.
- `setup.ps1` asks everything before the secret key, then runs to the end; it closes Claude
  Desktop before writing its config, resolving the MSIX path first.
