<div align="center">

**English** | [한국어](./README.ko.md)

</div>

> [!IMPORTANT]
> This repository is a fork of [eyalzh/browser-control-mcp](https://github.com/eyalzh/browser-control-mcp).

# Browser Control MCP

An MCP server paired with a browser extension. An AI assistant can manage tabs, search history,
read pages, and click, type, drag and run scripts on them. Built and tested against
[Zen Browser](https://zen-browser.app/); the APIs are Firefox's.

## What changed from upstream

The upstream reads the browser but never drives it. This fork adds page interaction, a
permission model, and an on-page overlay that shows what the model is doing. Elements are
addressed by a `ref` from a page read or by a CSS selector.

## Tools

**Navigate and read**

- `open-browser-tab`, `close-browser-tabs`, `list-open-tabs`
- `navigate-browser-tab` — URL or history; a same-origin address is routed by the page itself
- `resize-browser-window`
- `read-network-requests`
- Tab groups, tab reordering, history search
- `read-page` — text and interactive elements with refs; a large page comes back as an outline
  of regions to read by ref
- `find-text-in-page`
- `capture-tab-screenshot` — screen or one element
- `list-page-media`
- `read-page-image` — original file with the page's cookies (off by default)

**Interact**

- `click-page-element` — buttons, modifiers, hover
- `drag-page-element`
- `type-into-page-element` — with submit or a follow-up click
- `press-key-in-tab`
- `scroll-browser-tab` — direction, top, bottom, or to an element
- `select-page-option`
- `download-file-from-page` (off by default)
- `upload-files-to-page-element` (off by default)
- `run-browser-actions` — several in one call
- `wait-for-page` — an element, or new text since the last call
- `execute-javascript-in-tab` (off by default)

## Popup

`Alt+Shift+B` or the toolbar icon.

- **Connection** — connected servers per port, each switchable
- **Permission** — access scope and its site list; `+ Current tab` adds the tab in front
- **New tabs** — inherit the container of the tab in front
- **Interaction permissions** — one switch per capability, hidden-content reads, background work
- **Display** — tab icon, aurora, action highlight, badge, region box size, tab hold time

| Scope                   | Behaviour                                                              |
| ----------------------- | ---------------------------------------------------------------------- |
| **Allowlist** (default) | Only listed sites and tabs granted one at a time; a grant ends on navigation |
| **Denylist**            | Everywhere except listed sites                                          |

**Allowed addresses** — `HTTPS` (default), `DEV` (adds `http://` on loopback), `HTTP`. Privileged
URLs are refused by Firefox regardless. The setting gates opening and navigating and filters the
URLs `list-page-media` and `read-network-requests` return.

## On-page effects

Drawn in a Shadow DOM, never touching the page's DOM or pointer events. Each part has a popup
switch.

- **Tab icon** — the favicon is swapped while the session holds the tab
- **Tab aurora** — light along the viewport edges
- **Action highlight** — outline on the element being acted on; a drag also boxes the drop
  target and sends a ring from source to target; a scroll sends the ring across the centre while
  the page glides for the same time
- **Status badge** — the current action at the top centre; a read and a script run keep it up
  until the next command, the script itself shown in a panel

A held tab that a command leaves fades to grey until a command returns. The hold outlives the
pauses between commands and ends with the tab, the socket, or the popup's hold time. Native
dialogs are answered before they open and reported with the result.

Colours and timings are on the options page, along with an **Overlay preview** button that plays
every effect without a server.

## Security

Less safe than the upstream, by design.

- Page interaction and script execution act as your signed-in self while switched on.
- `<all_urls>` is a required permission: the browser's per-origin prompt is gone, and the access
  scope plus the tool switches are the only gate.
- `execute-javascript-in-tab` runs in the content-script sandbox; page globals need
  `window.wrappedJSObject`.

Stay on **allowlist**, grant tabs one at a time, and switch the interaction tools off when in
doubt. Experimental; use at your own risk.

## Zen Browser

- Compact mode hides the toolbar: use `Alt+Shift+B`.
- Split view puts both tabs in a screenshot.
- Containers: a tab in the default container looks signed out, so new tabs inherit the current
  container by default; the `container` parameter overrides per call.

## Installation

Upstream releases carry none of this fork's tools; build from source.

```
npm install
npm run build
```

Load `firefox-extension/manifest.json` from `about:debugging` → "Load Temporary Add-on...", or
package and install from `about:addons`:

```
npm run package     # firefox-extension/web-ext-artifacts/browser_control_mcp-<version>.zip
```

The settings page shows the secret key the server needs.

### Connect the server

`setup.ps1` does everything: asks its questions before the secret key, then installs, builds,
registers with Claude Code and Claude Desktop, and packages the zip. It closes Claude Desktop
before writing its config.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
```

By hand, for Claude Code:

```
claude mcp add browser-control \
  --env EXTENSION_SECRET=<SECRET KEY> \
  -- node /path/to/repo/mcp-server/dist/server.js
```

For Claude Desktop, the same entry in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "browser-control": {
      "command": "node",
      "args": ["/path/to/repo/mcp-server/dist/server.js"],
      "env": { "EXTENSION_SECRET": "<SECRET KEY>" }
    }
  }
}
```

Several sessions can run at once: each server takes the next free port and the extension keeps
a spare slot. `cd mcp-server && npm run pack-dxt` builds the DXT package for Claude Desktop.

## Development

```
npm run build                        # nx
cd firefox-extension; npm test       # jest
npm run package                      # zip
```

UI strings live in `firefox-extension/_locales/{en,ko}/messages.json`. Structure:
[CLAUDE.md](./CLAUDE.md).
