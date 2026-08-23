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
- Extension → page: `browser.tabs.executeScript` with generated source strings. There are no
  registered content scripts; everything is injected on demand.

### Key files

| File | Role |
| --- | --- |
| `common/server-messages.ts` | Commands the server sends to the extension |
| `common/extension-messages.ts` | Responses the extension sends back |
| `mcp-server/server.ts` | MCP tool definitions (18 tools) |
| `mcp-server/browser-api.ts` | Request/response round trip with the extension |
| `firefox-extension/background.ts` | Entry point, WebSocket clients, popup message channel |
| `firefox-extension/message-handler.ts` | Executes every command |
| `firefox-extension/extension-config.ts` | Tool registry, command mapping, permission mode, storage |
| `firefox-extension/tab-access.ts` | Permission mode enforcement |
| `firefox-extension/capture-consent.ts` | Per-tab activeTab consent tracking |
| `firefox-extension/injected-common.ts` | Shared injected source: root walk across frames and shadow roots, element resolution, labels |
| `firefox-extension/page-snapshot.ts` | Snapshot script that stamps `data-bcm-ref` |
| `firefox-extension/interaction-scripts.ts` | Click, type, key, scroll, select, execute, wait |
| `firefox-extension/highlight-overlay.ts` | Element glow and viewport aurora, in a shadow root |
| `firefox-extension/dialog-guard.ts` | Replaces the page's `alert`, `confirm` and `prompt` while a tab is held |
| `firefox-extension/popup.html` / `popup.ts` | Toolbar popup |
| `firefox-extension/popup-messages.ts` | Popup ↔ background message contract |
| `firefox-extension/options.html` / `options.ts` | Options page |

### Permission model

Two independent gates, both enforced in `message-handler.ts` before anything touches a page.

1. **Tool switches** — `COMMAND_TO_TOOL_ID` maps every command to a tool id; `isCommandAllowed`
   rejects disabled ones. The popup exposes `interact-click`, `interact-type` and
   `execute-javascript`; the options page exposes the rest. `execute-javascript` is listed in
   `DISABLED_BY_DEFAULT_TOOL_IDS`, so it starts off and has to be switched on by hand.
   The popup also carries a `Read hidden elements` switch, which is not a tool id but a snapshot
   setting: it is off by default because hidden text is text the user cannot see.
2. **Permission mode** — `allowlist` (default) or `denylist`, checked by `ensureTabAccess` for
   every command in `PAGE_ACCESS_COMMANDS`. In `allowlist` mode a tab must be authorized in the
   popup, which relies on `activeTab` and therefore expires when the tab navigates. The domain
   deny list applies in both modes. A stored `full` mode from an older build reads as `denylist`.

The extension declares `*://*/*` as a **required** host permission, so Firefox grants it at load
and never prompts per domain. That removes the browser as a backstop: these two gates are the
only thing between the server and a page. The defaults are locked down to compensate.

### Containers

Zen ties workspaces to containers, and each container has its own cookie jar, so a tab created
without a `cookieStoreId` looks signed out. `open-browser-tab` resolves the container in three
layers: the tool's `auto` default follows the popup toggle, `inherit` forces the container of
the tab in front, and `default` or a literal `cookieStoreId` targets one directly.

### Element refs

`get-page-snapshot` writes `data-bcm-ref="eN"` onto each interactive element and clears the
previous stamps first. The walk crosses into same-origin frames and shadow roots, so both the
snapshot and the ref resolver in `injected-common.ts` iterate `__bcmRoots()` rather than querying
`document` alone; an element from one carries a `frame` label. A cross-origin frame throws on
`contentDocument` and stays out of reach.

Elements the page hides are listed only when the user turns that on in the popup, and they are
appended after the visible ones so that `maxElements` truncates them first. Each is marked
`hidden`, and the snapshot header warns that their text is untrusted: text nobody can see is a
carrier for prompt injection.

Refs die when the page re-renders, so a stale ref is an error that tells the caller to snapshot
again.

### Overlay

`highlight-overlay.ts` mounts a shadow root on `documentElement` and leaves it there for as
long as the session holds the tab. The aurora is a port of a separable two-axis gradient mask
and stays a fixed rainbow; only the top-centre status badge and the element outline take the
action colour, through `--bcm-accent` and `--bcm-focus-color`. Both are registered with
`@property` because a custom property will not transition otherwise. The tab is also marked by
swapping its favicon, which is restored on release. Sites re-write their own icon link on route
changes and a later link wins, so a MutationObserver on `document.head` reclaims the mark for as
long as the session holds the tab.

Holding a tab and acting on it are separate clocks. The badge falls back to its resting label
after `STATUS_RESET_MS`, while the hold runs for `HOLD_RELEASE_MS` (five minutes): MCP has no
notion of a turn ending, so a model that thinks for minutes between two clicks must not lose the
tab underneath it. A hold also ends with the `release-browser-tab` tool, with the tab closing, or
with the socket closing. Overlay failures are swallowed; they must never break an interaction.

### Native dialogs

`alert`, `confirm` and `prompt` freeze the page's own script, so `executeScript` would never
return and every later command would hang until it timed out. There is no API to dismiss a
dialog that is already open, so `dialog-guard.ts` replaces the three functions through
`window.wrappedJSObject` and `exportFunction` before one can be raised: `alert` is ignored,
`confirm` answers OK, `prompt` returns its own default. What the page tried to say is buffered
on the content-script side and drained by `sendResource`, which attaches it as `dialogs` to every
page command's response - reads included, not just interactions - and the server prints it after
the result.

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
- `setup.ps1` bootstraps the whole client side: it offers to `winget install` a missing Claude
  Code CLI or Claude Desktop, then registers the MCP server with both, re-registering with a fresh
  secret because reloading the extension changes the key. Nothing installs without a y/N. The
  Store build of Claude Desktop is MSIX, which redirects `%APPDATA%`, so the config path is
  resolved from `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\` first and only falls
  back to `%APPDATA%\Claude\`. Desktop reads that file only at startup and rewrites it on exit, so
  the script warns when it is running. `EXTENSION_PORT` is not passed: the server falls back to
  8089 on its own
- Injected script builders are covered by no unit test; verify them by parsing their output
  with `new Function` before trusting a change
