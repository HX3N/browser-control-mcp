<div align="center">

**English** | [한국어](./README.ko.md)

</div>

> [!IMPORTANT]
> This repository is a fork of [eyalzh/browser-control-mcp](https://github.com/eyalzh/browser-control-mcp).

# Browser Control MCP

[![Firefox Add-on](./.github/addon_badge.svg)](https://addons.mozilla.org/en-US/firefox/addon/browser-control-mcp/)

An MCP server paired with a browser extension. It lets an AI assistant manage tabs, search
browsing history, read web pages, and **click, type and run scripts on them directly**.

The browser it is built and tested against is **[Zen Browser](https://zen-browser.app/), which is
based on Firefox**. The extension APIs are Firefox's, so it runs on Firefox too.

## What changed from upstream

The upstream reads the browser but never drives it. This fork adds the driving half: clicking,
typing, pressing keys, picking options, scrolling, and running JavaScript in a page. Elements are
addressed by a `ref` taken from a page snapshot, or by a CSS selector.

## Features

The tools the MCP server exposes.

**Navigate and read**

- Open and close tabs
- `navigate-browser-tab` — send an open tab to another URL, so one tab is reused instead of piling up
- List open tabs
- Create tab groups with a name and a colour
- Reorder tabs
- Read and search browsing history
- Read page text and links, either the whole page or one element of it
- Find and highlight text inside a page
- Capture a screenshot of a tab, either the visible screen or one element of it
- `get-page-snapshot` — list the interactive elements, each stamped with a `ref`,
  for the whole page or inside one element

**Interact**

- `click-page-element` — click, including double, middle and right button
- `type-into-page-element` — enter text into a field, with an option to submit the form
- `press-key-in-tab` — press Enter, Tab, Escape, and the editing shortcuts: `Ctrl+A`, `Ctrl+C`,
  `Ctrl+X`, `Ctrl+Z`, `Ctrl+Y`, the caret keys, Backspace and Delete
- `scroll-browser-tab` — scroll up, down, to the top, to the bottom, or to an element
- `select-page-option` — pick an option in a `<select>`
- `wait-for-page-element` — wait for an element to appear or disappear
- `execute-javascript-in-tab` — run arbitrary JavaScript in the page

## Toolbar popup

Clicking the toolbar icon (or pressing `Alt+Shift+B`) opens the popup.

- **Connection** — whether an MCP server is connected, per port. Each port can be switched off
  here, a connected one included, and switched back on later. The base port is set here too, and
  has to match the server's `EXTENSION_PORT`.
- **Permission** — the current tab, the access scope, and the list that scope uses. In allowlist
  mode the list holds allowed sites; in denylist mode it holds blocked sites. `+ Current tab`
  puts the tab in front onto whichever list is showing, and the list itself is a text box, one
  entry per line, saved as you type. Allowlist mode also offers a one-off grant for the current
  tab that expires when it navigates.
- **New tabs** — whether a new tab inherits the container of the tab in front
- **Interaction permissions** — separate switches for screenshots, mouse, keyboard and JavaScript, plus
  whether a snapshot may read the elements the page keeps hidden, and whether work stays in the
  background. With that last one on (the default) a new tab opens behind the tab you are on and
  page search does not jump to it. A screenshot stays in the background too, and only falls back
  to bringing the tab forward when Firefox refuses to capture it where it sits.
- **Display** — four switches: tab icon, tab aurora, action highlight, status badge

### The two access scopes

| Mode                    | Behaviour                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Allowlist** (default) | Everything is blocked by default; the extension runs only in the sites on its list, plus tabs granted one at a time. A per-tab grant expires when the tab navigates or closes. |
| **Denylist**            | Runs in every page except the sites on its list.                                                                                                                               |

### Allowed addresses

The popup also decides which addresses the model may open or navigate to. `HTTPS` is the default
and refuses everything else; `+ Local` additionally allows `http://` on loopback hosts, which is
what a local dev server such as `http://localhost:5173/` needs; `+ HTTP` allows plain HTTP
anywhere. The setting gates `open-browser-tab` and `navigate-browser-tab`, and the link list
returned by `get-tab-web-content` follows it too. Pages you opened by hand are unaffected — they
go through the access scope above.

Allowlist being the default is deliberate. Rather than opening every page the moment the
extension loads, it makes you widen the scope **explicitly** in the popup.

The `JavaScript` tool is **off by default** for the same reason. It is the most powerful one,
so it has to be switched on by hand.

## On-page effects

An overlay is drawn over the page while an action happens. It lives inside a Shadow DOM so it
never touches the page's own DOM or CSS, and it does not intercept mouse events. Each part is
switched on its own in the popup, so the ones you find intrusive can stay off.

- **Tab aurora** — light bleeding inwards from the edges of the viewport. Two mask layers, one per
  axis, erase the middle and leave only the edges, so the page content stays readable.
- **Action highlight** — an outline and a halo around the element being clicked, typed into or
  scrolled to.
- **Tab icon** — the favicon is swapped, so a driven tab is recognisable from the tab strip.
  Sites re-write their own icon on route changes, so the mark is reclaimed for as long as the
  session holds the tab.
- **Status badge** — a small tag at the top centre naming the action in progress.

The overlay colour follows the kind of action in progress. Every colour, the aurora's four
included, can be changed on the options page, and so can how long the overlay lingers.
A change reaches the tabs the session is already holding right away.

The overlay is injected DOM, so a navigation wipes it; it is drawn again once the new page
finishes loading, for as long as the session still holds the tab.

Holding a tab and acting on it are separate clocks. The badge falls back to its resting label
moments after an action, while the hold survives the long pauses between commands: MCP has no
notion of a turn ending, so a model that thinks for minutes must not lose the tab underneath it.
A hold ends with the `release-browser-tab` tool, with the tab closing, with the socket closing,
or after ninety seconds without a command, a length the options page can change.

A read is the exception: its mark stays up until the next command replaces it. Everything else
leaves a trace on the page you can see afterwards, whereas a read changes nothing, so the mark
is all there is to tell you it happened.

While a tab is held, the page's own `alert`, `confirm` and `prompt` are replaced. A native dialog
freezes the page's script, which would leave every later command hanging until it timed out, so
the dialog is answered before it can open and its text is handed back with the action's result.

Animation stops where `prefers-reduced-motion` is set. The overlay is removed just before a
screenshot is taken, so the effects never end up in the resulting image.

A screenshot can also be cropped to one element by passing a `ref` or a `selector`. The tab is
not brought to the front and the page is not scrolled: the crop is taken in page coordinates, so
the part of the element below the fold is in the shot too, with a small margin around it. Only an
element taller than 2000 pixels comes back cropped, and it is the scroll position that decides
which slice - the result says so and reports the element's full size, which is enough to scroll on
and capture the rest.

## Example prompts

### Tab management

- _"Close every tab that has nothing to do with work."_
- _"Group the development tabs together under 'Development'."_
- _"Close every tab I have not looked at in 24 hours."_

### History search

- _"Find the posts about the Milford Track in New Zealand in my history."_
- _"Open up to 10 distinct AI articles I read last week."_

### Research and interaction

- _"Open Hacker News and read the top post and its comments. Do the comments agree with it?"_
- _"Find L-theanine papers from the last three years on Google Scholar, then open and summarise
  the three most cited."_
- _"Fill in my username on this login form and submit it."_
- _"Type 'aurora' into the search box and press Enter. When results appear, click the first one."_

## About security

This fork exists to open what the upstream keeps closed, so it is **less safe than the upstream**.

**Unchanged**

- The MCP server and the extension talk over a local connection, authenticated by signing every
  frame with a shared secret.
- No telemetry, no tracking.
- The extension has no runtime third-party dependencies.
- Every tool call is written to the extension's activity log, the new interaction tools included.
- Per-tool switches are still there, with the three interaction tools added to them.
- The block list applies **whatever** the access scope is.

**Changed — this is the part that matters**

- Page interaction and arbitrary script execution are possible. While they are on, the MCP server
  can click and type anything as your signed-in self.
- **The host permission `<all_urls>` is a required permission.** The upstream asked per domain; this
  fork is granted full web access when the extension loads. That means **the per-origin backstop
  the browser used to provide is gone.** The access scope and the tool switches — this
  extension's own code — are the only line left.
- `execute-javascript-in-tab` runs in the extension's content script sandbox. The whole DOM is
  visible, but the page's own JavaScript globals are reachable only through
  `window.wrappedJSObject`.

**Why it was done this way** — a grant prompt per domain made the thing unusable in practice. The
line was moved inside the extension instead, with the defaults locked down (allowlist, JavaScript
off) so that opening it up is an explicit act.

**Recommended setup** — stay on **allowlist** and allow only the tabs you need from the popup. If
a session gets busy, switch to denylist and switch back when you are done. If anything looks
wrong, the three interaction switches in the popup turn it off at once.

**Note**: Browser Control MCP is still experimental. As with any MCP server, watch the tool calls
as they happen. You use it at your own risk.

## About Zen Browser

- In **compact mode** the toolbar is hidden, so the icon may not be visible. Open the popup with
  `Alt+Shift+B` instead.
- In **split view**, `captureVisibleTab` captures the visible area of the whole window, so a
  screenshot contains both tabs.

- **Workspaces and containers** — Zen can tie a workspace to a container (userContext). Each
  container has its own cookie jar, so a new tab opened in the default container **looks signed
  out**. Because of that, `open-browser-tab` **inherits the container of the tab in front** by
  default, which is what opening a tab by hand would do.

  The **"New tabs → Keep the signed-in session" toggle in the popup** decides the usual behaviour
  (on by default). The popup's "Current tab" box also shows which container you are in.

  ```
  open-browser-tab(url, container="auto")     ← default; follows the popup toggle
  open-browser-tab(url, container="inherit")  ← forces the current container, toggle or not
  open-browser-tab(url, container="default")  ← the browser default container; usually signed out
  open-browser-tab(url, container="<cookieStoreId>")  ← a specific container
  ```

  So **the popup is the usual behaviour and a tool parameter is the exception for one call**.
  `get-list-of-open-tabs` reports `container=` per tab, so a specific container can be picked.

## Installation

> **Note**: the [build on addons.mozilla.org](https://addons.mozilla.org/en-US/firefox/addon/browser-control-mcp/)
> and the upstream releases (`.xpi`, `.dxt`) are the **upstream**. They carry none of this fork's
> interaction tools, popup or overlay, so **build from source** as below.

### 1. Build

Clone the repository and run this in the root; it builds both the MCP server and the extension.

```
npm install
npm run build
```

### 2. Load the extension

1. Type `about:debugging` in the address bar
2. Click "This Firefox"
3. Click "Load Temporary Add-on..."
4. Pick `manifest.json` in this project's `firefox-extension` folder
5. The settings page opens. Reveal the secret key and copy it — the MCP server config needs it.

The path is the same in Zen Browser. A temporary add-on is dropped when the browser restarts, so
it has to be loaded again each time.

If running this in your personal browser feels wrong, a separate Firefox instance such as
[Firefox Developer Edition](https://www.mozilla.org/en-US/firefox/developer/) works too.

#### Packaging it into a zip

Run this in the repository root:

```
npm run package
```

It writes `firefox-extension/web-ext-artifacts/browser_control_mcp-<version>.zip`. Open
`about:addons`, click the gear, pick "Install Add-on From File..." and choose that zip. It stays
installed across restarts, so step 2 above is not needed.

This works in Zen Browser. Whether stock Firefox accepts it has not been tested.

### 3. Connect the MCP server

#### The easy way: `setup.ps1`

Run this in the repository root. Every question it asks comes before the Secret Key: the language,
and whether to install anything it could not find. Then it shows both clients at once, says what is
about to happen, and asks for the key. After that it runs to the end without stopping - it installs
the dependencies, builds, registers, writes the Desktop config, and packages the extension zip.
Run it again whenever you issue a new Secret Key.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
```

```
Language / 언어  [1] English  [2] 한국어

  Looking for the clients

============================================================
  Current state
============================================================

  Build            ready
  Claude Code      the MCP server is registered, its Secret Key will be refreshed
                   running right now (2 process(es))
  Claude Desktop   the app is there but the MCP server is not registered, it will be added
                   config: C:\Users\me\AppData\Local\Packages\Claude_…\LocalCache\Roaming\Claude\claude_desktop_config.json

============================================================
  What happens after the Secret Key
============================================================

  Claude Desktop is not running, so it only has to be started again afterwards.
  Claude Code sessions that are already open keep their old settings. Open a new
  session once this is done.

  Nothing else is asked from here on: the build, the registration, the config file
  and the extension zip all run in one go.

Secret Key
```

Nothing is installed without a `y/N` answer. Claude Desktop reads its config only at startup and
rewrites it on exit, so the script closes it by force before writing - it says so above the key
prompt rather than asking again half way through.

What follows is for setting the commands up by hand.

#### Using it from Claude Code

Claude Code does not use DXT. One line is enough.

```
claude mcp add browser-control \
  --env EXTENSION_SECRET=<SECRET KEY> \
  -- node /path/to/repo/mcp-server/dist/server.js
```

To keep it per project, put the same thing in `.mcp.json` in the repository root.

```json
{
  "mcpServers": {
    "browser-control": {
      "command": "node",
      "args": ["/path/to/repo/mcp-server/dist/server.js"],
      "env": {
        "EXTENSION_SECRET": "<SECRET KEY>"
      }
    }
  }
}
```

#### Using it from Claude Desktop

Add the same `mcpServers` entry to `claude_desktop_config.json`.

Replace `/path/to/repo` with the real path, and put the value shown on the extension settings page
into `EXTENSION_SECRET`. That is the only variable you need: the base port defaults to 8089, and
`EXTENSION_PORT` only exists to move it somewhere else.

It can take a few seconds for the MCP server to reach the extension. The popup's connection
section shows when it has.

#### Several sessions at once are fine

Each Claude session starts its own MCP server process, and a TCP port can only be held by one of
them. So the server **walks up from the base port (8089) until it finds a free one**, and the
extension **always keeps one spare slot one above the highest connected port**.

```
session 1 → 8089 ┐
session 2 → 8090 ├→ extension (an independent handler per port)
session 3 → 8091 ┘
          8092  ← the spare slot waiting for the next session
```

More sessions means more ports, and slots are reclaimed as sessions end.

#### When you need the DXT package

DXT is the packaging format that lets Claude Desktop install an MCP server in one step. **Claude
Code does not need it.** Build one only if you want the one-click install into Claude Desktop.

```
cd mcp-server
npm run pack-dxt
```

`mcp-server/manifest.json` is the DXT manifest. The `.dxt` released by the upstream has no
interaction tools, so always use one you built.

## Development

```
npm install                          # installs the subproject dependencies as well
npm run build                        # builds everything through nx
cd firefox-extension; npm test       # extension tests
cd mcp-server; npm start             # run the MCP server
npm run package                      # zip the extension for installing
```

The UI strings live in `firefox-extension/_locales/{en,ko}/messages.json`. `default_locale` is
`en`, so anything a Korean-language browser does not find there falls back to English.

See [CLAUDE.md](./CLAUDE.md) for the structure.
