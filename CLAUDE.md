# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is a fork of eyalzh/browser-control-mcp. The upstream deliberately ships no page
interaction; this fork adds it, and pairs it with a permission model and an on-page overlay so
the user can see and stop what the model is doing.

## Commands

### Installation
```bash
npm install  # Install all dependencies (includes subproject dependencies)
```
Use npm, not pnpm: package-lock.json is the committed lockfile.

### Build
```bash
npm run build  # Build all projects using nx
```

### Individual project builds
```bash
cd mcp-server && npm run build          # tsc
cd firefox-extension && npm run build   # esbuild, three entry points
```

### Package the extension
```bash
npm run package  # build, then web-ext build → firefox-extension/web-ext-artifacts/*.zip
```
The exclude list lives in `firefox-extension/web-ext-config.cjs`. Zen installs that zip from
`about:addons` and keeps it across restarts; stock Firefox is untested.

### Test
```bash
cd firefox-extension && npm test
```

### Start MCP Server
```bash
cd mcp-server && npm start
```

### Package DXT
```bash
cd mcp-server && npm run pack-dxt   # Claude Desktop only, not needed for Claude Code
```

## Architecture

A monorepo with three components:

1. **mcp-server**: Node.js MCP server, talks to the client over stdio and to the extension over WebSocket
2. **firefox-extension**: MV2 extension that executes browser actions
3. **common**: Shared TypeScript interfaces for the messages between the two

### Communication flow
- MCP Server ↔ client: MCP protocol over stdio
- MCP Server ↔ extension: WebSocket, every frame HMAC-signed with a shared secret. Each
  session runs its own server, so a server claims the first free port from 8089 upward and
  the extension keeps one idle slot above the highest connected port
- Extension → page: `browser.tabs.executeScript` with generated source strings. No content
  scripts are registered permanently; the dialog guard is registered for the target origin just
  before an open or navigation and unregistered once the load settles.

### Key files

| File | Role |
| --- | --- |
| `common/server-messages.ts` | Commands the server sends to the extension |
| `common/extension-messages.ts` | Responses the extension sends back |
| `mcp-server/server.ts` | MCP tool definitions (28 tools) |
| `mcp-server/browser-api.ts` | Request/response round trip with the extension |
| `firefox-extension/background.ts` | Entry point, WebSocket clients, popup message channel |
| `firefox-extension/message-handler.ts` | Executes every command |
| `firefox-extension/extension-config.ts` | Tool registry, command mapping, permission mode, storage |
| `firefox-extension/tab-access.ts` | Permission mode enforcement |
| `firefox-extension/tab-authorization.ts` | Per-tab activeTab authorization granted from the popup |
| `firefox-extension/injected-common.ts` | Shared injected source: root walk across frames and shadow roots, element resolution, labels, and the collapse / frame / form-field scan a read reports |
| `firefox-extension/page-snapshot.ts` | Snapshot script that stamps `data-bcm-ref` |
| `firefox-extension/interaction-scripts.ts` | Click, type, key, scroll, select, execute, wait, element box |
| `firefox-extension/highlight-overlay.ts` | Element glow and viewport aurora, in a shadow root |
| `firefox-extension/dialog-guard.ts` | Guard source (answers dialogs, hooks the console, queues reports) and its registration helpers |
| `firefox-extension/page-events.ts` | Per-tab store for what the guard reports and the documents it announced |
| `firefox-extension/popup.html` / `popup.ts` | Toolbar popup |
| `firefox-extension/popup-messages.ts` | Popup ↔ background message contract |
| `firefox-extension/options.html` / `options.ts` | Options page |

### Permission model

Two independent gates, both enforced in `message-handler.ts` before anything touches a page.

1. **Tool switches** — `COMMAND_TO_TOOL_ID` maps every command to a tool id; `isCommandAllowed`
   rejects disabled ones. The popup exposes `capture-tab-screenshot`, `interact-click`,
   `interact-type`, `execute-javascript` and `get-media-content`; the options page exposes the
   rest. `execute-javascript` and `get-media-content` are listed in
   `DISABLED_BY_DEFAULT_TOOL_IDS`, so they start off and have to be switched on by hand.
   A tool id is not the MCP tool name: ids are storage keys for the user's switches, so a
   renamed tool keeps its old id rather than resetting what the user turned on.
   The popup also carries a `Read hidden elements` switch, which is not a tool id but a snapshot
   setting: it is off by default because hidden text is text the user cannot see.
2. **Permission mode** — `allowlist` (default) or `denylist`, checked by `ensureTabAccess` for
   every command in `PAGE_ACCESS_COMMANDS`. In `allowlist` mode a tab must be authorized in the
   popup, which relies on `activeTab` and therefore expires when the tab navigates. The domain
   deny list applies in both modes. A stored `full` mode from an older build reads as `denylist`.

The extension declares `<all_urls>` as a **required** host permission — the literal string,
because `captureVisibleTab` compares it verbatim and an equivalent pattern such as `*://*/*` is
refused. Firefox grants it at load and never prompts per domain. That removes the browser as a
backstop: these two gates are the only thing between the server and a page. The defaults are
locked down to compensate.

### Containers

Zen ties workspaces to containers, and each container has its own cookie jar, so a tab created
without a `cookieStoreId` looks signed out. `open-browser-tab` resolves the container in three
layers: the tool's `auto` default follows the popup toggle, `inherit` forces the container of
the tab in front, and `default` or a literal `cookieStoreId` targets one directly.

### Element refs

`list-page-elements` writes `data-bcm-ref="eN"` onto each interactive element and clears the
previous stamps first. The walk crosses into same-origin frames and shadow roots, so both the
snapshot and the ref resolver in `injected-common.ts` iterate `__bcmRoots()` rather than querying
`document` alone; an element from one carries a `frame` label. A cross-origin frame throws on
`contentDocument` and stays out of reach.

`__bcmRoots(start)` takes the node to walk from, which is what makes a scoped read possible.

Elements the page hides are listed only when the user turns that on in the popup, and they are
appended after the visible ones so that `maxElements` truncates them first. Each is marked
`hidden`, and the snapshot header warns that their text is untrusted: text nobody can see is a
carrier for prompt injection. `display:none` and `visibility:hidden` are not the only way to hide
one - a box parked at `left:-9999px` renders normally and would otherwise have been listed as an
ordinary element, so `__bcmWithinPage` measures the rect in document coordinates and counts
anything outside the document as hidden too. Document coordinates rather than the viewport's,
because a rect goes negative for everything the page has merely scrolled past.

A `password` or `hidden` input has its length reported instead of its value. The text read has
always left these out; the snapshot used to hand the value over in full.

Refs die when the page re-renders, so a stale ref is an error that tells the caller to snapshot
again. The stamp is an attribute, so a page that copies markup copies the ref with it: the
snapshot also records the element itself in `window.__bcmRefs`, which a copy cannot inherit, and
resolution trusts that record over the attribute.

### Scoped reads

`list-page-elements` and `read-page-text` both take an `ElementTarget`. With a `ref` or a
`selector` they read that element's subtree alone, which is what a page whose interesting part is
one region costs the fewest tokens to read - the navigation, the sidebars and the footer never
enter the answer. Without one, both behave exactly as before.

A scoped snapshot clears only the stamps inside its own scope and then numbers from above the
highest `eN` still on the page, so refs from an earlier full snapshot keep working and the two can
be mixed. `querySelectorAll` reaches descendants only, so the scope element itself is matched
separately against the selector. Both scoped paths pass the target to `attachOverlay`, so a read
draws the same element outline that a click or a keystroke does, and the badge says which of the
two kinds of read is running through `overlaySnapshotElement` / `overlayReadingElement`.

`capture-tab-screenshot` takes the same target, captured through `captureTab` with a rect in
page coordinates: the tab is never brought to the front, and the part of the element outside the
viewport is still in the shot. The rect always starts at the element's top; only an element
taller than `MAX_CAPTURE_HEIGHT_PX` (2000) follows the scroll position instead, and the
`captured` block reports it through `clipped`, which the server turns into the sentence that
tells the model to scroll on and capture the rest. When `captureTab` is refused, the fallback
foregrounds the tab and uses `captureVisibleTab`. For the shot the overlay is hidden and
restored (`conceal`/`reveal`), never detached.

### Scroll position and key defaults

Every command's answer ends with the scroll position, and it is reported against the furthest the
page can scroll, not against `scrollHeight`: those differ by one viewport, so a page already at
the bottom used to report `2251 of 3310` and read as though a screenful were still below.
`__bcmScroll` returns `scrollMax` alongside, and a page that does not scroll says so.

A synthetic key event has no default action, so the extension performs the common ones itself.
Enter is the one that has to know where it is pressed: in a single-line field it submits the
owning form, but in a `textarea` or a contenteditable a real Enter inserts a line break, so
`__bcmMultiline` splits the two. `type-into-page-element`'s `submit` flag is unaffected - there
the caller asked for a submit.

### Waiting for a page to speak

A page that updates on its own - a chat, a feed, a job reporting progress - was reachable only by
reading it again on a timer, which spends a round trip per attempt and still misses whatever landed
between two of them. `wait-for-page-text-change` blocks instead: `buildTextWatchCode` reads the
scope's text as a baseline and installs a `MutationObserver`, and the first mutation that actually
changes the text reports through the same `runtime.sendMessage` channel the dialog guard uses, on
the `text-change` page-event channel. `page-events.ts` holds one waiter per tab and settles it on
that report, on the tab navigating, or on the timeout; the handler then reads the text once more
and returns the part that grew past the baseline. `MAX_TEXT_WAIT_TIMEOUT_MS` is 180 seconds, well
past `runScript`'s stall timer, which is why the wait cannot live inside an injected script.

The baseline is not re-read from the page on each call - `textBaselines` in the handler keeps
where the last wait stopped, per tab and per scope (a whole-page wait and a scoped one on the same
tab each keep their own), and hands it to the next watch. Without that, everything the page said
between one wait returning and the next one installing itself would be swallowed: on a chat that
window is exactly as long as the model spends composing, which is how the polling loop lost
messages in the first place. It also makes `timeoutMs: 0` meaningful - no observer is installed
and the page is diffed against the carried baseline on the spot - so a caller can check for new
text without waiting, which is what a reply should do before it is sent. The first call on a scope
has nothing to compare against and says so through `fresh`.

The watch ends on quiet, not on the first mutation: `settleMs` (800 by default) restarts on each
mutation so a burst of updates comes back as one answer, with a ceiling of four settle windows for
a page that never stops moving. The same window is waited out when the carried baseline already
differs at install time, or a burst still in flight would come back split in two. The observer
watches the scope's whole document rather than the scope element, and `compare` resolves the
target again: a framework that re-renders the container replaces the element, and an observer on
the old one would never fire again. It disconnects itself after the one report it sends, and the
next watch or the closing read disconnects a leftover through `window.__bcmTextWatch`. A report
carries the `correlationId` it was installed with, so a watcher a previous wait left behind cannot
settle the current one.

The answer is a common-prefix / common-suffix diff (`text-diff.ts`), not a `startsWith` check: on
almost every real page the part that changes sits above a composer, buttons and a footer, so a
prefix diff would have called every new line a rewrite and returned the whole page. What sits
between the two matches comes back as `addedText`; when the baseline had text there too, the
page dropped or replaced something, and `rewritten` with `removedChars` say how much. On a
navigation the wait ends empty, says so, and the carried baseline is dropped: every ref on the
old document is dead.

A wait longer than `holdReleaseMs` would otherwise outlive the hold on its own tab: the idle timer
fires, `releaseTab` forgets the tab, and `forgetPageEvents` settles the waiter as a timeout with
the page unread. The handler therefore stretches the hold to cover the wait before blocking and
puts it back afterwards.

Frames the walk cannot open are reported by `__bcmUnreachableFrames`, which lives in
`ROOT_WALKER_SOURCE` so the snapshot, the read and the media list all reach it. It returns each
frame's `src`, size and whether the page renders it, not a count: a page whose real content sits in
one large cross-origin frame carries almost nothing outside it, and the count alone left the model
reading the wrapper and believing that was the page.

### What a read leaves out

`read-page-text` reads `innerText`, which is rendered text alone: a closed `<details>`, the
panel behind an unselected tab and anything a control keeps collapsed are simply absent, and
`totalLength` gave no sign of it either. `PAGE_READ_SOURCE` reports what was left out rather than
smuggling it in - the toggle's label and the size of what sits behind it, never the text, because
text the user cannot see is the same injection carrier the snapshot's hidden elements are. That is
also why this is not tied to the popup's `Read hidden elements`: that switch is about elements a
condition has to reveal, while these toggles are already on screen.

A collapse is reported only when something proves it: `details:not([open])`, `aria-expanded="false"`,
`aria-selected="false"` on a `role=tab`, or a control whose `aria-controls` names a panel the page
does not show. A control with none of those says nothing. `line-clamp`, `text-overflow` and a
scrolled container are not collapses at all - that text is rendered and already in the answer.

The same read walks same-origin frames through `__bcmReadRoots` and appends each frame body under a
`[frame:name]` heading, because the snapshot crossed frames while the text read stopped at
`document.body`; frames it cannot open are counted and reported instead. Form values go out as
their own list - a value is not rendered text - with `type=password` and `type=hidden` left out.
Only frame documents are added to the roots: a shadow root's text already rides its host's
`innerText`. All three notices ride the `offset === 0` response only, as the links do.

### Overlay

`highlight-overlay.ts` mounts a shadow root on `documentElement` and leaves it there for as
long as the session holds the tab. The aurora is a port of a separable two-axis gradient mask and
is a rainbow of four colours by default, carried in `--bcm-flow-colors`; only the top-centre
status badge and the element outline take the action colour, through `--bcm-accent` and
`--bcm-focus-color`. Both are registered with `@property` because a custom property will not
transition otherwise. Every one of those colours is a setting: the options page writes
`overlayColors`, and `attach` applies the palette on each call, so a change lands on tabs that are
already held rather than waiting for the next command. The tab is also marked by
swapping its favicon, which is restored on release. Sites re-write their own icon link on route
changes and a later link wins, so a MutationObserver on `document.head` reclaims the mark for as
long as the session holds the tab.

Holding a tab and acting on it are separate clocks, and both lengths live in `overlayTimings`
(`statusResetMs`, `holdReleaseMs`, `leadMs`), defaulting to the values the extension shipped with.
The badge falls back to its resting label after `statusResetMs`, while the hold runs for
`holdReleaseMs` (ninety seconds by default): MCP has no notion of a turn ending, so a model that
thinks for minutes between two clicks must not lose the tab underneath it. A read is the one
action that never fades - it is sent with `resetAfterMs: 0`, so its mark stands until the next
command replaces it, because a read leaves nothing else on screen to show what happened. A hold
also ends with the `release-browser-tab` tool, with the tab closing, or with the socket closing.
Overlay failures are swallowed; they must never break an interaction.

An overlay is injected DOM and never re-reads storage, so `background.ts` watches
`browser.storage.onChanged` for a change to the overlay look and reapplies it to every held tab,
detaching instead when every part has been switched off.

The element outline is re-measured every animation frame while it shows, so it rides the element
through scrolling and the page's own movement; the geometry transition is dropped while tracking
(`is-tracking`) or the box would lag behind. Attaching with a target scrolls the page so the
element's top sits one third of the way down the screen, through `__bcmScrollToAnchor` in
`injected-common.ts` - the click and scroll-to-element scripts call the same helper, so an
interaction does not drag the element somewhere else after the overlay has placed it.

### Native dialogs and page events

`alert`, `confirm` and `prompt` freeze the page's own script, so `executeScript` would never
return, and no API can dismiss a dialog that is already open. The guard in `dialog-guard.ts`
replaces the three (and `print`) through `window.wrappedJSObject` and `exportFunction`, and stops
`beforeunload` handlers in the capture phase. It has to be in the page before its first line
runs: `open-browser-tab` parks the new tab on `about:blank`, registers the guard for the target
origin and container with `browser.contentScripts.register` at `document_start`, and only then
navigates — registration resolves in the parent process before the content processes have heard
of it, so creating the tab straight onto the URL can beat it. `navigate-browser-tab` registers
the same way before moving the tab, the `webNavigation.onCommitted` listener re-injects on every
navigation of a tab the session holds, and after the load settles `verifyGuard` compares the
documents that committed against the ones a guard announced itself in, naming any it missed -
probing the tab afterwards would only ever reach the last document of a redirect chain.

A dialog that still won the race leaves the page frozen, and `executeScript` on a frozen page
never settles: no timeout, no error, just a command that never answers. Every injection therefore
goes through `runScript`, which races the script against a timer — `SCRIPT_STALL_MS` (3s) for
interactions and the overlay, `LONG_SCRIPT_STALL_MS` (10s) for reads, snapshots and page-supplied
code, both under the server's own response budget — and turns a stall into an error naming the tab
and asking the user to close the dialog. **A new call site must use `runScript`, never
`browser.tabs.executeScript` directly.** The tab is not reloaded to clear it: that could only ever
fire for a tab this session neither opened nor navigated, where the dialog is already on screen
for the user to dismiss and a reload would take their page state and every ref on it with it.

What the guard sees is reported, not buffered in the page: the dialog and console hooks run with
page code on the stack, where the extension APIs are silently unreachable, so reports are queued
and flushed on a microtask through `runtime.sendMessage`. The background answers each one, which
is the guard's only proof the report survived its document: a page that navigates away right
after raising a dialog tears down the channel the report travels on, so anything still
unanswered at `pagehide` goes to `sessionStorage` and the next document's guard sends it again
under the same id, which the background uses to drop the repeat. The
background keeps them per tab in `page-events.ts`, and `sendResource` drains them into every
command's response as `dialogs` and `consoleMessages` — `open-browser-tab` and
`navigate-browser-tab` wait for the load to settle so a dialog raised during it rides their own
response. A command that fails never reaches `sendResource`, so `handleDecodedMessage` drains them
onto the thrown error instead and they ride the `ExtensionError` out: what the page said is worth
most when the command could not finish. Console capture (errors, uncaught exceptions, rejected promises, failed loads,
optionally warn and log) is a popup switch, on by default at the `error` level.

## Adding a tool

A new tool touches six places:

1. `common/server-messages.ts` — command interface, added to the `ServerMessage` union
2. `common/extension-messages.ts` — response interface, added to the `ExtensionMessage` union
3. `firefox-extension/extension-config.ts` — `COMMAND_TO_TOOL_ID`, and `PAGE_ACCESS_COMMANDS`
   if it reads or drives a page
4. `firefox-extension/message-handler.ts` — a case in the switch and a handler
5. `mcp-server/browser-api.ts` — a method that sends the command and awaits the response
6. `mcp-server/server.ts` — the MCP tool definition

Also list it in `mcp-server/manifest.json` so the DXT metadata stays accurate.

Injected scripts are built as strings inside TypeScript template literals. Escape backslashes:
`\\s` in the template produces `\s` in the emitted JavaScript, and a bare `\s` silently becomes
`s`. Embed every runtime value through `jsValue()`, never by raw interpolation.

## Language

- User-facing UI (popup, options page, overlay badges, and the tool labels in
  `extension-config.ts`) is localised through `_locales/{en,ko}/messages.json`, with
  `default_locale` set to `en`. HTML carries `data-i18n` / `data-i18n-html` attributes that
  `localizeDocument()` in `i18n.ts` resolves; code calls `t("key")`. A new string has to be added
  to both locale files
- The docs are `README.md` (English, the default) and `README.ko.md`
- MCP tool names, tool descriptions, parameter names and errors returned to the server are
  English: they are prompts read by a model, not by a person
- Code identifiers and comments are English

## Development notes

- esbuild bundles the extension: `background.ts`, `options.ts`, `popup.ts`
- Jest covers the extension only
- Nx runs the monorepo builds
- The target browser is Zen Browser (Gecko 154). Compact mode can hide the toolbar, so the
  popup also opens with `Alt+Shift+B`; split view makes `captureVisibleTab` include both tabs
- Setting `default_popup` means `browserAction.onClicked` never fires; tab authorization comes
  from the popup instead
- `setup.ps1` bootstraps the whole client side. Every question it asks comes before the Secret
  Key: it offers to `winget install` a missing Node, Claude Code CLI or Claude Desktop, then
  reports the state of both clients in one block and says what is about to happen - Desktop will
  be closed by force, and Claude Code sessions already open keep their old settings. After the key
  it runs to the end with nothing further to answer: dependencies, build, registration, the Desktop
  config, the DXT package and the extension zip (`npm run package`). It re-registers with a fresh
  secret because reloading the extension changes the key. The
  Store build of Claude Desktop is MSIX, which redirects `%APPDATA%`, so the config path is
  resolved from `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\` first and only falls
  back to `%APPDATA%\Claude\`. Desktop reads that file only at startup and rewrites it on exit, so
  the script closes it before writing: it says so, asks, then kills the Desktop processes and waits
  for them to go, and gives up rather than write into a live app. On an MSIX install it also backs
  up and deletes a leftover `%APPDATA%\Claude\claude_desktop_config.json`, which the package copy
  shadows and the app never reads. `EXTENSION_PORT` is not passed: the server falls back to
  8089 on its own
- `__tests__/injected-parse.test.ts` parses the output of every injected script builder with
  `new Function`; add a case there when a builder gains an option
