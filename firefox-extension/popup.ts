import type {
  ConsoleCaptureLevel,
  ContainerPolicy,
  PermissionMode,
  UrlScope,
} from "./extension-config";
import {
  OUTLINE_BOX_DEPTH_RANGE,
  OUTLINE_CHAR_THRESHOLD_RANGE,
  OUTLINE_ELEMENT_THRESHOLD_RANGE,
  OVERLAY_TIMING_LIMITS,
  clampImageLimitMb,
} from "./extension-config";
import { localizeDocument, t } from "./i18n";
import type {
  ConnectionStatus,
  PopupRequest,
  PopupStatus,
} from "./popup-messages";

interface ConnectionRow {
  row: HTMLDivElement;
  dot: HTMLSpanElement;
  state: HTMLSpanElement;
  toggle: HTMLButtonElement;
  disabled: boolean;
}

const connectionRows = new Map<number, ConnectionRow>();

const statusSummary = document.getElementById(
  "status-summary"
) as HTMLSpanElement;
const connectionStatus = document.getElementById(
  "connection-status"
) as HTMLDivElement;
const disconnectAllButton = document.getElementById(
  "disconnect-all-ports"
) as HTMLButtonElement;
const reconnectAllButton = document.getElementById(
  "reconnect-all-ports"
) as HTMLButtonElement;
const activeTabTitle = document.getElementById(
  "active-tab-title"
) as HTMLDivElement;
const activeTabOrigin = document.getElementById(
  "active-tab-origin"
) as HTMLDivElement;
const activeTabBadge = document.getElementById(
  "active-tab-badge"
) as HTMLSpanElement;
const authorizeTabButton = document.getElementById(
  "authorize-tab"
) as HTMLButtonElement;
const requestAllUrlsButton = document.getElementById(
  "request-all-urls"
) as HTMLButtonElement;
const permissionWarning = document.getElementById(
  "permission-warning"
) as HTMLDivElement;
const permissionModeGroup = document.getElementById(
  "permission-mode"
) as HTMLDivElement;
const permissionModeHint = document.getElementById(
  "permission-mode-hint"
) as HTMLDivElement;
const urlScopeHint = document.getElementById(
  "url-scope-hint"
) as HTMLDivElement;
const auroraToggle = document.getElementById(
  "toggle-aurora"
) as HTMLInputElement;
const focusToggle = document.getElementById(
  "toggle-focus"
) as HTMLInputElement;
const siteListToggle = document.getElementById(
  "site-list-toggle"
) as HTMLButtonElement;
const siteListSummary = document.getElementById(
  "site-list-summary"
) as HTMLSpanElement;
const siteListBody = document.getElementById("site-list-body") as HTMLDivElement;
const siteList = document.getElementById("site-list") as HTMLTextAreaElement;
const addCurrentSiteButton = document.getElementById(
  "add-current-site"
) as HTMLButtonElement;
const markToggle = document.getElementById("toggle-mark") as HTMLInputElement;
const badgeToggle = document.getElementById("toggle-badge") as HTMLInputElement;
const basePortInput = document.getElementById("base-port") as HTMLInputElement;
const saveBasePortButton = document.getElementById(
  "save-base-port"
) as HTMLButtonElement;
const imageLimitInput = document.getElementById(
  "image-limit"
) as HTMLInputElement;
const outlineDepthInput = document.getElementById(
  "outline-depth"
) as HTMLInputElement;
const outlineCharsInput = document.getElementById(
  "outline-chars"
) as HTMLInputElement;
const outlineElementsInput = document.getElementById(
  "outline-elements"
) as HTMLInputElement;
const holdSecondsInput = document.getElementById(
  "hold-seconds"
) as HTMLInputElement;
const backgroundModeToggle = document.getElementById(
  "toggle-background-mode"
) as HTMLInputElement;
const containerPolicyRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>("input[name='container-policy']")
);
const containerFixedSelect = document.getElementById(
  "container-fixed-id"
) as HTMLSelectElement;
const containerPolicyHint = document.getElementById(
  "container-policy-hint"
) as HTMLDivElement;
const includeHiddenToggle = document.getElementById(
  "toggle-include-hidden"
) as HTMLInputElement;
const activeTabContainer = document.getElementById(
  "active-tab-container"
) as HTMLSpanElement;
const openOptionsButton = document.getElementById(
  "open-options"
) as HTMLButtonElement;
const feedback = document.getElementById("feedback") as HTMLSpanElement;

const toolToggles = Array.from(
  document.querySelectorAll<HTMLInputElement>("input[data-tool-id]")
);
const modeRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>("input[name='permission-mode']")
);
const consoleCaptureToggle = document.getElementById(
  "toggle-console-capture"
) as HTMLInputElement;
const consoleLevelGroup = document.getElementById(
  "console-level"
) as HTMLDivElement;
const consoleLevelHint = document.getElementById(
  "console-level-hint"
) as HTMLDivElement;
const consoleLevelRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>("input[name='console-level']")
);
const urlScopeRadios = Array.from(
  document.querySelectorAll<HTMLInputElement>("input[name='url-scope']")
);

localizeDocument();

let current: PopupStatus | null = null;
let lastConnections = "";

const CONNECTION_POLL_MS = 1000;
const SITE_LIST_SAVE_DELAY_MS = 900;

function connectionsKey(status: PopupStatus): string {
  return status.connections
    .map((c) => `${c.port}|${c.role}|${c.connected}|${c.disabled}`)
    .join(",");
}
let siteListSaveTimer: number | undefined;

async function send(request: PopupRequest): Promise<PopupStatus> {
  return (await browser.runtime.sendMessage(request)) as PopupStatus;
}

function showFeedback(message: string): void {
  feedback.textContent = message;
  if (!message) {
    return;
  }
  window.setTimeout(() => {
    if (feedback.textContent === message) {
      feedback.textContent = "";
    }
  }, 2400);
}

function buildConnectionRow(port: number): ConnectionRow {
  const row = document.createElement("div");
  row.className = "conn-row";

  const dot = document.createElement("span");

  const label = document.createElement("span");
  label.className = "conn-label";
  label.textContent = t("popupConnPort", String(port));

  const state = document.createElement("span");
  state.className = "conn-state";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "conn-toggle";

  const entry: ConnectionRow = { row, dot, state, toggle, disabled: false };

  // Reading the state off the entry rather than off a captured value: a row repainted between
  // this listener being attached and the click would otherwise send the inverse command.
  toggle.addEventListener("click", async () => {
    const wasDisabled = entry.disabled;
    await refresh({ kind: "set-port-enabled", port, enabled: wasDisabled });
    showFeedback(
      wasDisabled ? t("popupFeedbackPortOn") : t("popupFeedbackPortOff")
    );
  });

  row.appendChild(dot);
  row.appendChild(label);
  row.appendChild(state);
  row.appendChild(toggle);
  return entry;
}

function paintConnectionRow(
  entry: ConnectionRow,
  connection: ConnectionStatus
): void {
  entry.disabled = connection.disabled;

  // A spare that has not connected yet is a probe for the next session, not a failure.
  const isWaitingSpare =
    connection.role === "spare" && !connection.connected && !connection.disabled;

  entry.dot.className = connection.connected
    ? "dot is-on"
    : isWaitingSpare || connection.disabled
    ? "dot is-idle"
    : "dot";
  entry.state.textContent = connection.disabled
    ? t("popupConnOff")
    : connection.connected
    ? t("popupConnConnected")
    : isWaitingSpare
    ? t("popupConnWaitingSpare")
    : t("popupConnDisconnected");
  entry.toggle.textContent = connection.disabled
    ? t("popupConnTurnOn")
    : t("popupConnTurnOff");
  entry.row.classList.toggle("is-off", connection.disabled);
}

function renderConnections(status: PopupStatus): void {
  if (status.connections.length === 0) {
    connectionRows.clear();
    connectionStatus.textContent = "";
    const empty = document.createElement("div");
    empty.className = "conn-state";
    empty.textContent = t("popupConnNone");
    connectionStatus.appendChild(empty);
    statusSummary.textContent = t("popupSummaryNoPorts");
    return;
  }

  // Rows are rebuilt only when the set of ports changes: tearing them down on every repaint
  // would detach a button between the user's mousedown and mouseup and swallow the click.
  const ports = status.connections.map((connection) => connection.port);
  const sameRows =
    connectionRows.size === ports.length &&
    ports.every((port) => connectionRows.has(port));

  if (!sameRows) {
    connectionRows.clear();
    connectionStatus.textContent = "";
    for (const port of ports) {
      const entry = buildConnectionRow(port);
      connectionRows.set(port, entry);
      connectionStatus.appendChild(entry.row);
    }
  }

  for (const connection of status.connections) {
    const entry = connectionRows.get(connection.port);
    if (entry) {
      paintConnectionRow(entry, connection);
    }
  }

  const connected = status.connections.filter((c) => c.connected).length;
  if (status.connections.every((c) => c.disabled)) {
    statusSummary.textContent = t("popupSummaryAllOff");
  } else if (connected === 0) {
    statusSummary.textContent = t("popupSummaryWaiting");
  } else if (connected === 1) {
    statusSummary.textContent = t("popupSummaryConnected");
  } else {
    statusSummary.textContent = t("popupSummarySessions", String(connected));
  }
}

// Firefox exposes containers only by id unless the extension asks for contextualIdentities,
// which is a permission this fork does not want just to print a nicer label.
function describeContainer(cookieStoreId: string | null): string {
  if (!cookieStoreId || cookieStoreId === "firefox-default") {
    return t("popupContainerDefault");
  }
  if (cookieStoreId === "firefox-private") {
    return t("popupContainerPrivate");
  }
  const numbered = /^firefox-container-(\d+)$/.exec(cookieStoreId);
  return numbered ? t("popupContainerNumbered", numbered[1]) : cookieStoreId;
}

function renderContainerPolicy(status: PopupStatus): void {
  const { policy, cookieStoreId } = status.container;
  for (const radio of containerPolicyRadios) {
    radio.checked = radio.value === policy;
    if (radio.value === "fixed") {
      radio.disabled = status.containers.length === 0;
    }
  }

  containerFixedSelect.replaceChildren(
    ...status.containers.map((id) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = describeContainer(id);
      return option;
    })
  );
  const target =
    cookieStoreId && status.containers.includes(cookieStoreId)
      ? cookieStoreId
      : status.containers[0];
  if (target) {
    containerFixedSelect.value = target;
  }
  containerFixedSelect.classList.toggle("hidden", policy !== "fixed");

  containerPolicyHint.textContent =
    policy === "fixed"
      ? target
        ? t("popupContainerHintFixed", describeContainer(target))
        : t("popupContainerHintNone")
      : policy === "default"
      ? t("popupContainerHintDefault")
      : t(
          "popupContainerHintInherit",
          describeContainer(status.activeTab.cookieStoreId)
        );
}

async function applyContainerPolicy(policy: ContainerPolicy): Promise<void> {
  const fixed = policy === "fixed" ? containerFixedSelect.value : "";
  await refresh({
    kind: "set-container-policy",
    policy,
    cookieStoreId: fixed || undefined,
  });
  showFeedback(
    policy === "fixed"
      ? fixed
        ? t("popupFeedbackContainerFixed", describeContainer(fixed))
        : t("popupContainerHintNone")
      : policy === "inherit"
      ? t("popupFeedbackContainerInherit")
      : t("popupFeedbackContainerDefault")
  );
}

function renderActiveTab(status: PopupStatus): void {
  const tab = status.activeTab;
  activeTabTitle.textContent = tab.title || tab.url || t("popupTabUnknown");
  activeTabOrigin.textContent = tab.origin ?? tab.url;

  activeTabContainer.textContent = `🍪 ${describeContainer(tab.cookieStoreId)}`;
  activeTabContainer.classList.toggle("hidden", tab.id === null);

  const allowlistMode = status.permissionMode === "allowlist";
  const canAuthorize =
    allowlistMode &&
    tab.scriptable &&
    tab.id !== null &&
    !tab.originAllowed &&
    !tab.denied;
  authorizeTabButton.classList.toggle("hidden", !canAuthorize);
  authorizeTabButton.disabled = tab.authorized;
  authorizeTabButton.textContent = tab.authorized
    ? t("popupButtonAuthorizeTabDone")
    : t("popupButtonAuthorizeTab");

  if (!tab.scriptable) {
    activeTabBadge.className = "badge is-warn";
    activeTabBadge.textContent = t("popupBadgeNotScriptable");
    return;
  }

  // The block list wins in both scopes, so it has to be read before the scope is.
  if (tab.denied) {
    activeTabBadge.className = "badge is-danger";
    activeTabBadge.textContent = t("popupBadgeDenied");
    return;
  }

  if (!allowlistMode) {
    activeTabBadge.className = "badge is-ok";
    activeTabBadge.textContent = t("popupBadgeDenylistAllowed");
    return;
  }

  if (tab.originAllowed) {
    activeTabBadge.className = "badge is-ok";
    activeTabBadge.textContent = t("popupBadgeOriginAllowed");
  } else if (tab.authorized) {
    activeTabBadge.className = "badge is-ok";
    activeTabBadge.textContent = t("popupBadgeTabAllowed");
  } else {
    activeTabBadge.className = "badge is-warn";
    activeTabBadge.textContent = t("popupBadgeNotAllowed");
  }
}

function currentEntry(status: PopupStatus): string | null {
  const tab = status.activeTab;
  if (!tab.origin) {
    return null;
  }
  if (status.permissionMode === "allowlist") {
    return tab.origin;
  }
  try {
    return new URL(tab.origin).hostname;
  } catch (error) {
    return null;
  }
}

// The two lists hold different shapes: the allowlist matches a full origin, the deny list
// matches a hostname and its subdomains.
function normalizeEntry(raw: string, mode: PermissionMode): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const withScheme = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return mode === "allowlist" ? url.origin : url.hostname;
  } catch (error) {
    return null;
  }
}

async function saveList(status: PopupStatus, entries: string[]): Promise<void> {
  if (status.permissionMode === "denylist") {
    await refresh({ kind: "set-domain-deny-list", domains: entries });
    return;
  }
  await refresh({ kind: "set-allowed-origins", origins: entries });
}

function renderSiteList(status: PopupStatus): void {
  const allowlistMode = status.permissionMode === "allowlist";
  const entries = allowlistMode
    ? status.allowedOrigins
    : status.domainDenyList;

  siteListSummary.textContent = t(
    allowlistMode ? "popupListAllowSummary" : "popupListDenySummary",
    String(entries.length)
  );

  const entry = currentEntry(status);
  addCurrentSiteButton.disabled = entry === null || entries.includes(entry);

  siteList.placeholder = t("popupListPlaceholder");
  siteList.setAttribute(
    "aria-label",
    t(allowlistMode ? "popupListAriaAllow" : "popupListAriaDeny")
  );

  // Saving re-renders, and the save fires while the user is still typing, so writing the
  // normalized entries back here would rewrite the line under the caret.
  if (document.activeElement !== siteList) {
    siteList.value = entries.join("\n");
  }
}

function render(status: PopupStatus): void {
  current = status;
  lastConnections = connectionsKey(status);

  renderConnections(status);
  renderActiveTab(status);

  for (const radio of modeRadios) {
    radio.checked = radio.value === status.permissionMode;
  }
  permissionModeHint.textContent = t(
    status.permissionMode === "allowlist"
      ? "popupModeAllowlistHint"
      : "popupModeDenylistHint"
  );

  for (const radio of urlScopeRadios) {
    radio.checked = radio.value === status.urlScope;
  }
  consoleCaptureToggle.checked = status.consoleCapture;
  consoleLevelGroup.classList.toggle("hidden", !status.consoleCapture);
  for (const radio of consoleLevelRadios) {
    radio.checked = radio.value === status.consoleLevel;
  }
  consoleLevelHint.textContent = status.consoleCapture
    ? t(
        status.consoleLevel === "warn"
          ? "popupConsoleLevelWarnHint"
          : status.consoleLevel === "log"
          ? "popupConsoleLevelLogHint"
          : "popupConsoleLevelErrorHint"
      )
    : "";
  urlScopeHint.textContent = t(
    status.urlScope === "loopback"
      ? "popupUrlScopeLoopbackHint"
      : status.urlScope === "any"
      ? "popupUrlScopeAnyHint"
      : "popupUrlScopeHttpsHint"
  );

  for (const toggle of toolToggles) {
    const toolId = toggle.dataset.toolId;
    toggle.checked = toolId ? status.toolSettings[toolId] !== false : false;
  }

  auroraToggle.checked = status.auroraEnabled;
  focusToggle.checked = status.focusEnabled;
  markToggle.checked = status.markEnabled;
  badgeToggle.checked = status.badgeEnabled;
  renderContainerPolicy(status);
  backgroundModeToggle.checked = status.backgroundMode;
  includeHiddenToggle.checked = status.includeHidden;

  renderSiteList(status);

  if (document.activeElement !== basePortInput) {
    basePortInput.value = status.basePort === null ? "" : String(status.basePort);
  }
  if (document.activeElement !== imageLimitInput) {
    imageLimitInput.value = status.imageLimitMb === null ? "" : String(status.imageLimitMb);
  }
  if (document.activeElement !== outlineDepthInput) {
    outlineDepthInput.value = String(status.outlineBoxDepth);
  }
  if (document.activeElement !== outlineCharsInput) {
    outlineCharsInput.value = String(status.outlineCharThreshold);
  }
  if (document.activeElement !== outlineElementsInput) {
    outlineElementsInput.value = String(status.outlineElementThreshold);
  }
  if (document.activeElement !== holdSecondsInput) {
    holdSecondsInput.value = String(status.holdSeconds);
  }

  // Without the blanket host permission nothing can run, so the mode picker would only be
  // offering choices between things that all fail.
  requestAllUrlsButton.classList.toggle("hidden", status.allUrlsGranted);
  permissionWarning.classList.toggle("hidden", status.allUrlsGranted);
  for (const radio of modeRadios) {
    radio.disabled = !status.allUrlsGranted;
  }
  permissionModeGroup.classList.toggle("is-locked", !status.allUrlsGranted);
  for (const toggle of toolToggles) {
    toggle.disabled = !status.allUrlsGranted;
  }
}

async function refresh(request: PopupRequest): Promise<void> {
  try {
    render(await send(request));
  } catch (error) {
    statusSummary.textContent = t("popupSummaryNoBackground");
    console.error("Popup request failed:", error);
  }
}

for (const toggle of toolToggles) {
  toggle.addEventListener("change", async () => {
    const toolId = toggle.dataset.toolId;
    if (!toolId) {
      return;
    }
    await refresh({ kind: "set-tool", toolId, enabled: toggle.checked });
    showFeedback(t("popupFeedbackSaved"));
  });
}

for (const radio of modeRadios) {
  radio.addEventListener("change", async () => {
    if (!radio.checked) {
      return;
    }
    await refresh({
      kind: "set-permission-mode",
      mode: radio.value as PermissionMode,
    });
    showFeedback(t("popupFeedbackModeChanged"));
  });
}

for (const radio of urlScopeRadios) {
  radio.addEventListener("change", async () => {
    if (!radio.checked) {
      return;
    }
    await refresh({
      kind: "set-url-scope",
      scope: radio.value as UrlScope,
    });
    showFeedback(t("popupFeedbackUrlScopeChanged"));
  });
}

auroraToggle.addEventListener("change", async () => {
  await refresh({ kind: "set-aurora", enabled: auroraToggle.checked });
  showFeedback(
    auroraToggle.checked
      ? t("popupFeedbackAuroraOn")
      : t("popupFeedbackAuroraOff")
  );
});

focusToggle.addEventListener("change", async () => {
  await refresh({ kind: "set-focus", enabled: focusToggle.checked });
  showFeedback(
    focusToggle.checked ? t("popupFeedbackFocusOn") : t("popupFeedbackFocusOff")
  );
});

markToggle.addEventListener("change", async () => {
  await refresh({ kind: "set-mark", enabled: markToggle.checked });
  showFeedback(
    markToggle.checked ? t("popupFeedbackMarkOn") : t("popupFeedbackMarkOff")
  );
});

badgeToggle.addEventListener("change", async () => {
  await refresh({ kind: "set-badge", enabled: badgeToggle.checked });
  showFeedback(
    badgeToggle.checked ? t("popupFeedbackBadgeOn") : t("popupFeedbackBadgeOff")
  );
});

consoleCaptureToggle.addEventListener("change", async () => {
  await refresh({
    kind: "set-console-capture",
    enabled: consoleCaptureToggle.checked,
  });
  showFeedback(t("popupFeedbackSaved"));
});

for (const radio of consoleLevelRadios) {
  radio.addEventListener("change", async () => {
    if (!radio.checked) {
      return;
    }
    await refresh({
      kind: "set-console-level",
      level: radio.value as ConsoleCaptureLevel,
    });
    showFeedback(t("popupFeedbackSaved"));
  });
}

disconnectAllButton.addEventListener("click", async () => {
  await refresh({ kind: "set-all-ports-enabled", enabled: false });
  showFeedback(t("popupFeedbackAllOff"));
});

reconnectAllButton.addEventListener("click", async () => {
  await refresh({ kind: "set-all-ports-enabled", enabled: true });
  showFeedback(t("popupFeedbackAllOn"));
});

saveBasePortButton.addEventListener("click", async () => {
  const port = Number(basePortInput.value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    showFeedback(t("popupFeedbackPortInvalid"));
    return;
  }
  await refresh({ kind: "set-base-port", port });
  showFeedback(t("popupFeedbackSaved"));
});

imageLimitInput.addEventListener("change", async () => {
  let megabytes: number | null = null;
  if (imageLimitInput.value.trim()) {
    const entered = Number(imageLimitInput.value);
    if (!Number.isFinite(entered)) {
      await refresh({ kind: "get-status" });
      return;
    }
    megabytes = clampImageLimitMb(entered);
    if (String(megabytes) !== imageLimitInput.value) {
      imageLimitInput.value = String(megabytes);
    }
  }
  await refresh({ kind: "set-image-limit", megabytes });
  showFeedback(t("popupFeedbackSaved"));
});

outlineDepthInput.addEventListener("change", async () => {
  if (!outlineDepthInput.value.trim()) {
    return;
  }
  const depth = Math.min(
    OUTLINE_BOX_DEPTH_RANGE.max,
    Math.max(OUTLINE_BOX_DEPTH_RANGE.min, Math.round(Number(outlineDepthInput.value)))
  );
  if (!Number.isFinite(depth)) {
    return;
  }
  if (String(depth) !== outlineDepthInput.value) {
    outlineDepthInput.value = String(depth);
  }
  await refresh({ kind: "set-outline-depth", depth });
  showFeedback(t("popupFeedbackSaved"));
});

holdSecondsInput.addEventListener("change", async () => {
  if (!holdSecondsInput.value.trim()) {
    return;
  }
  const limits = OVERLAY_TIMING_LIMITS.holdReleaseMs;
  const seconds = Math.min(
    limits.max / 1000,
    Math.max(limits.min / 1000, Math.round(Number(holdSecondsInput.value)))
  );
  if (!Number.isFinite(seconds)) {
    return;
  }
  if (String(seconds) !== holdSecondsInput.value) {
    holdSecondsInput.value = String(seconds);
  }
  await refresh({ kind: "set-hold-seconds", seconds });
  showFeedback(t("popupFeedbackSaved"));
});

outlineCharsInput.addEventListener("change", async () => {
  if (!outlineCharsInput.value.trim()) {
    return;
  }
  const chars = Math.min(
    OUTLINE_CHAR_THRESHOLD_RANGE.max,
    Math.max(OUTLINE_CHAR_THRESHOLD_RANGE.min, Math.round(Number(outlineCharsInput.value)))
  );
  if (!Number.isFinite(chars)) {
    return;
  }
  if (String(chars) !== outlineCharsInput.value) {
    outlineCharsInput.value = String(chars);
  }
  await refresh({ kind: "set-outline-chars", chars });
  showFeedback(t("popupFeedbackSaved"));
});

outlineElementsInput.addEventListener("change", async () => {
  if (!outlineElementsInput.value.trim()) {
    return;
  }
  const elements = Math.min(
    OUTLINE_ELEMENT_THRESHOLD_RANGE.max,
    Math.max(
      OUTLINE_ELEMENT_THRESHOLD_RANGE.min,
      Math.round(Number(outlineElementsInput.value))
    )
  );
  if (!Number.isFinite(elements)) {
    return;
  }
  if (String(elements) !== outlineElementsInput.value) {
    outlineElementsInput.value = String(elements);
  }
  await refresh({ kind: "set-outline-elements", elements });
  showFeedback(t("popupFeedbackSaved"));
});

outlineDepthInput.addEventListener("blur", async () => {
  if (!outlineDepthInput.value.trim()) {
    await refresh({ kind: "get-status" });
  }
});

outlineCharsInput.addEventListener("blur", async () => {
  if (!outlineCharsInput.value.trim()) {
    await refresh({ kind: "get-status" });
  }
});

outlineElementsInput.addEventListener("blur", async () => {
  if (!outlineElementsInput.value.trim()) {
    await refresh({ kind: "get-status" });
  }
});

for (const radio of containerPolicyRadios) {
  radio.addEventListener("change", async () => {
    if (!radio.checked) {
      return;
    }
    await applyContainerPolicy(radio.value as ContainerPolicy);
  });
}

containerFixedSelect.addEventListener("change", async () => {
  await applyContainerPolicy("fixed");
});

backgroundModeToggle.addEventListener("change", async () => {
  await refresh({
    kind: "set-background-mode",
    enabled: backgroundModeToggle.checked,
  });
  showFeedback(
    backgroundModeToggle.checked
      ? t("popupFeedbackBackgroundOn")
      : t("popupFeedbackBackgroundOff")
  );
});

includeHiddenToggle.addEventListener("change", async () => {
  await refresh({
    kind: "set-include-hidden",
    enabled: includeHiddenToggle.checked,
  });
  showFeedback(
    includeHiddenToggle.checked
      ? t("popupFeedbackHiddenOn")
      : t("popupFeedbackHiddenOff")
  );
});

siteListToggle.addEventListener("click", () => {
  const hidden = siteListBody.classList.toggle("hidden");
  siteListToggle.setAttribute("aria-expanded", hidden ? "false" : "true");
});

addCurrentSiteButton.addEventListener("click", async () => {
  const status = current;
  if (!status) {
    return;
  }
  const entry = currentEntry(status);
  if (!entry) {
    showFeedback(t("popupFeedbackOriginUnsupported"));
    return;
  }
  const entries =
    status.permissionMode === "allowlist"
      ? status.allowedOrigins
      : status.domainDenyList;
  await saveList(status, [...entries, entry]);
  showFeedback(t("popupFeedbackListAdded"));
});

async function commitSiteList(): Promise<void> {
  const status = current;
  if (!status) {
    return;
  }
  const entries: string[] = [];
  let skipped = 0;
  for (const line of siteList.value.split("\n")) {
    if (!line.trim()) {
      continue;
    }
    const entry = normalizeEntry(line, status.permissionMode);
    if (!entry) {
      skipped++;
      continue;
    }
    if (!entries.includes(entry)) {
      entries.push(entry);
    }
  }

  const stored =
    status.permissionMode === "allowlist"
      ? status.allowedOrigins
      : status.domainDenyList;
  if (entries.join("\n") === stored.join("\n")) {
    return;
  }

  await saveList(status, entries);
  showFeedback(
    skipped > 0
      ? t("popupFeedbackListSkipped", String(skipped))
      : t("popupFeedbackListSaved")
  );
}

siteList.addEventListener("input", () => {
  window.clearTimeout(siteListSaveTimer);
  siteListSaveTimer = window.setTimeout(() => {
    void commitSiteList();
  }, SITE_LIST_SAVE_DELAY_MS);
});

siteList.addEventListener("blur", () => {
  window.clearTimeout(siteListSaveTimer);
  void commitSiteList();
});

authorizeTabButton.addEventListener("click", async () => {
  const tabId = current?.activeTab.id;
  if (tabId === null || tabId === undefined) {
    return;
  }
  await refresh({ kind: "authorize-tab", tabId });
  showFeedback(t("popupFeedbackTabAllowed"));
});

// permissions.request has to run inside the click handler itself: Firefox only shows the
// grant prompt while the user gesture is still on the stack.
requestAllUrlsButton.addEventListener("click", async () => {
  try {
    const granted = await browser.permissions.request({
      origins: ["<all_urls>"],
    });
    await refresh({ kind: "get-status" });
    showFeedback(
      granted
        ? t("popupFeedbackPermissionGranted")
        : t("popupFeedbackPermissionDenied")
    );
  } catch (error) {
    console.error("Could not request the broad host permission:", error);
    showFeedback(t("popupFeedbackPermissionFailed"));
  }
});

openOptionsButton.addEventListener("click", async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});

void refresh({ kind: "get-status" });

// A socket reaches OPEN a moment after the click that opened it and nothing pushes that to the
// popup, so a row would otherwise keep the label it had at click time until the next request.
// Only the connection rows are repainted here: re-rendering the rest would write a stale answer
// back over a switch the user had just flipped.
window.setInterval(async () => {
  let status: PopupStatus;
  try {
    status = await send({ kind: "get-status" });
  } catch (error) {
    return;
  }
  const key = connectionsKey(status);
  if (key === lastConnections) {
    return;
  }
  lastConnections = key;
  current = status;
  renderConnections(status);
}, CONNECTION_POLL_MS);
