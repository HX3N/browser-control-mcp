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
action) · `common` (shared message types and limits). Frames are HMAC-signed; each session's
server takes the next free port and the extension keeps one spare slot.

| File | Role |
| --- | --- |
| `common/server-messages.ts`, `common/extension-messages.ts` | Command and response types |
| `common/limits.ts`, `mcp-server/limits.ts` | Limits both sides apply, and the server's copy of them |
| `mcp-server/server.ts`, `mcp-server/browser-api.ts` | Tool definitions, round trip |
| `mcp-server/read-output.ts` | Text of read-page and find-text-in-page answers: header, outline, notices, find summary |
| `firefox-extension/background.ts` | Entry, WebSocket clients, popup channel, storage watchers |
| `firefox-extension/message-handler.ts` | Executes every command; both permission gates |
| `firefox-extension/extension-config.ts` | Tool registry, permission mode, overlay settings, storage |
| `firefox-extension/tab-access.ts`, `tab-authorization.ts` | Permission mode, per-tab grants |
| `firefox-extension/injected-common.ts` | Shared injected source: root walk, ref resolution, read scan, sweep easing |
| `firefox-extension/frames.ts` | A tab's frames, and which of them the top document cannot walk into |
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
- `getConfig` fills `toolSettings` from defaults so popup and gate agree on a new tool; every
  switch lives in the popup, none in the options page.
- `<all_urls>` is the literal required host permission (`captureVisibleTab` compares it verbatim).
  The browser is no backstop; defaults stay locked.
- A tab this session opens follows `containerPolicy`: `auto`, the default, takes the container
  `open-browser-tab` names and falls back to the tab in front when it names none; `inherit` always
  copies the tab in front; `fixed` pins `containerFixedId` (Zen hands a new tab the front tab's
  container when `tabs.create` names none). Only `auto` lets the tool argument choose — the other
  two ignore it and say so in the response. The popup lists the containers seen on open tabs, so
  `contextualIdentities` is never asked for.

**Limits**
- A bound the server's schema and the extension both apply lives in `common/limits.ts`. The
  server resolves `common` only at compile time, so `mcp-server/limits.ts` repeats it, and
  `limits-mirror.test.ts` fails when the two differ: change both.

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
- A ref outlives a read: `__bcmRefOf` maps element→ref, so a stamped element keeps its number and
  only unseen ones are minted. `window.__bcmRefSeq` climbs per document and never restarts, so a
  number `__bcmSweepRefs` frees is never reused — a stale ref dies instead of moving. Refs still
  die on re-render; `window.__bcmRefs` is trusted over the attribute because markup copies carry
  the attribute.
- `expectedOrigin` is checked once, in `dispatch`: a command carrying it fails when the tab has
  left that origin, since refs taken before the move no longer describe the page.
- Roots are walked with `__bcmRoots()`, never `document` alone. A frame that walk cannot enter is
  injected into on its own, `executeScript({frameId})` per frame from `frames.ts`; the frame itself
  decides that, by reaching for each ancestor's document, because a URL comparison misses a
  sandboxed frame and a frame that navigated on its own. A frame whose own detached parent can
  walk into it is left off the list — that parent's injection already reads it, and listing both
  would read the document twice. `__bcmUnreachableFrames` then names only what stayed out of reach.
- A ref carries its frame outside the extension (`f3e12` is `e12` in frame 3) and is split again in
  `routeFrames`, so the counter stays per document. A command acts in one document: two refs naming
  different frames are refused. A capture of an element in such a frame crops the frame element in
  the outermost document that can be walked, since nothing in the top viewport places that
  element's own box.
- Hidden elements are listed only with the popup switch on, after the visible ones, marked
  hidden and untrusted. Off-document boxes count as hidden (`__bcmWithinPage`). A shown label
  stands in for a hidden control only when clicking it operates the control (checkbox, radio,
  file), even one its own `display:none` or `hidden` takes out, but not one an ancestor hides:
  a text field parked off the page is a trap even when its label shows.
- `__bcmSensitive` decides what is masked: `password`/`hidden` inputs and the `autocomplete`
  tokens for passwords, one-time codes and card numbers. A masked field, checkbox and radio
  included, reports length, never value, lends no own text to its name, and a masked `<select>`
  lists no options.
- An unscoped read past the popup's outline thresholds returns an outline; `full: true` or
  `offset > 0` reads whole. Region refs number above `__bcmHighestRef()`. Of the controls, only
  popup triggers become regions (`aria-haspopup`, or `aria-expanded` with `aria-controls` or
  `aria-owns`): tabs naming their panels would use up the region limit. A region's control count
  takes in visible pointer-only controls. Slots go to shallow regions first and the list stays in
  document order, so triggers inside a region never push out a later top region; `outlineOmitted`
  counts what did not fit.
- A read follows what `aria-owns` or an expanded `aria-controls` points at wherever it is
  rendered, and the popups that popup opens in turn. The popup counts as hidden when an ancestor
  is `display:none`; ancestors' `visibility` is not judged, since a descendant can turn it back.
- `controlsOnly` drops text items in `pushItem`, not in `flush`: a heading never reaches `flush`.
  That mode builds no outline.
- `find-text-in-page` matches case-insensitively unless asked otherwise, and falls back to control
  names (`FIND_NAME_ATTRIBUTES`) only when the rendered text matched nothing in the top document
  and every detached frame: the text pass covers them all before the name pass starts. The script
  therefore runs even when `browser.find.find` counted zero. A frame past a full budget still
  runs with none left, so a match there reports that more exist. The summary keeps the browser's
  count when no match got a ref, and says "for more" only when a document reports a match left
  past `maxMatches` (`moreMatches`): raise it, or narrow the query once it is at
  `FIND_MATCHES.max`.
- A read reports collapsed content by label and size only, never its text.
- Scroll positions are reported against `scrollMax`, not `scrollHeight`.
- A synthetic Enter submits in a single-line field and inserts a line break in a multiline one
  (`__bcmMultiline`).
- `wait-for-page` keeps its text baseline in `textBaselines` per tab and scope; a navigation drops
  it. The wait lives in the background, not in a script, because it can outlast `runScript`.
- The watch samples the scope on uneven gaps (`settleMs`, then ×0.75 and ×1.25) and ends on a line
  absent from the baseline that has been there three samples running, never once missing. Even
  gaps let a spinner whose period divides them read the same every sample; a broken run is out for
  good, since three sightings in a row come up by chance when a spinner has four frames. Removals
  count only while nothing else is churning — a clock's first reading is missing from every sample
  too — so text taken away beside a ticking element goes unreported, and `timeoutMs: 0` answers off
  one sample and cannot apply the rule at all.

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
→ `mcp-server/server.ts` → `mcp-server/manifest.json`. A numeric bound both sides apply goes in
`common/limits.ts` and `mcp-server/limits.ts`.

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
- `setup.ps1` installs, builds and packages the zip, then stops: the secret key does not exist
  until the extension is installed. `sync-secret.ps1` takes that key and registers Claude Code,
  Codex and Claude Desktop, whichever are installed, closing Claude Desktop before writing its
  config, resolving the MSIX path first. Shared
  helpers, paths and strings live in `setup-common.ps1`, dot-sourced by both.
