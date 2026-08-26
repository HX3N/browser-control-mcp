import { WebsocketClient } from "./client";
import { MessageHandler } from "./message-handler";
import type { PageEventError } from "./message-handler";
import type { ExtensionConfig } from "./extension-config";
import {
  generateSecret,
  getAllToolSettings,
  getConfig,
  getAllowedOrigins,
  getDisabledPorts,
  getDomainDenyList,
  getPermissionMode,
  getPorts,
  isAuroraEnabled,
  isBadgeEnabled,
  isBackgroundMode,
  isContainerInherited,
  isClipboardReadAllowed,
  isHiddenElementsIncluded,
  getUrlScope,
  isFocusEnabled,
  isMarkEnabled,
  isDomainInDenyList,
  isOriginAllowed,
  setAuroraEnabled,
  setBadgeEnabled,
  setBackgroundMode,
  setContainerInherited,
  setClipboardReadAllowed,
  setHiddenElementsIncluded,
  setUrlScope,
  setAllowedOrigins,
  setDomainDenyList,
  setFocusEnabled,
  setMarkEnabled,
  setPermissionMode,
  setPortEnabled,
  setPorts,
  setToolEnabled,
  isConsoleCaptureEnabled,
  getConsoleCaptureLevel,
  setConsoleCapture,
  setConsoleCaptureLevel,
} from "./extension-config";
import {
  grantTabAuthorization,
  hasTabAuthorization,
  revokeTabAuthorization,
  showAuthorizationGrantedFeedback,
} from "./tab-authorization";
import { hasAllUrlsPermission } from "./tab-access";
import { isPageEventMessage, recordPageEvent } from "./page-events";
import { startNetworkLog } from "./network-log";
import type { PageEventMessage } from "./page-events";
import type {
  ActiveTabStatus,
  PopupRequest,
  PopupStatus,
} from "./popup-messages";

const UNSCRIPTABLE_SCHEME = /^(about|moz-extension|chrome|resource|view-source|data|file):/i;

const SLOT_SYNC_INTERVAL_MS = 2000;
const MAX_SPARE_SLOTS = 15;

startNetworkLog();

interface ConnectionSlot {
  port: number;
  role: "fixed" | "spare";
  client: WebsocketClient;
  handler: MessageHandler;
}

const slots: ConnectionSlot[] = [];

let activeSecret = "";

// An overlay is injected DOM: it does not read storage again on its own, so a look the user
// just changed would otherwise stay stale until the next command arrives.
let overlayLook = "";

function overlayLookOf(config: ExtensionConfig | undefined): string {
  if (!config) {
    return "";
  }
  return JSON.stringify([
    config.highlightEnabled,
    config.auroraEnabled,
    config.focusEnabled,
    config.markEnabled,
    config.badgeEnabled,
    config.overlayColors,
    config.overlayTimings,
  ]);
}

async function refreshOverlays(): Promise<void> {
  for (const slot of slots) {
    await slot.handler.refreshOverlays();
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.config) {
    return;
  }
  const look = overlayLookOf(changes.config.newValue as ExtensionConfig);
  if (look === overlayLook) {
    return;
  }
  overlayLook = look;
  refreshOverlays().catch((error) => {
    console.error("Could not apply the new overlay look:", error);
  });
});

function openSlot(port: number, role: ConnectionSlot["role"], secret: string) {
  const wsClient = new WebsocketClient(port, secret);
  const messageHandler = new MessageHandler(wsClient);

  slots.push({ port, role, client: wsClient, handler: messageHandler });
  wsClient.connect();

  wsClient.addCloseListener(() => {
    messageHandler.releaseAllTabs().catch((error) => {
      console.error("Failed to release tabs after the session ended:", error);
    });
  });

  wsClient.addMessageListener(async (message) => {
    console.log("Message from server:", message);

    try {
      await messageHandler.handleDecodedMessage(message);
    } catch (error) {
      console.error("Error handling message:", error);
      if (error instanceof Error) {
        await wsClient.sendErrorToServer(
          message.correlationId,
          error.message,
          error as PageEventError
        );
      }
    }
  });
}

// Nothing tells the extension how many sessions exist, so keeping exactly one idle slot above
// the highest taken port is what makes the range grow and shrink with them.
function syncSlots(
  fixedPorts: number[],
  disabledPorts: number[],
  secret: string
) {
  const isDisabled = (port: number) => disabledPorts.includes(port);

  for (const port of fixedPorts) {
    if (!isDisabled(port) && !slots.some((slot) => slot.port === port)) {
      openSlot(port, "fixed", secret);
    }
  }

  const spareBase = Math.max(...fixedPorts) + 1;
  const cap = spareBase + MAX_SPARE_SLOTS - 1;
  const connectedPorts = slots
    .filter((slot) => slot.client.isConnected())
    .map((slot) => slot.port);
  const highestConnected = connectedPorts.length
    ? Math.max(...connectedPorts)
    : spareBase - 1;
  const highestWanted = Math.min(
    cap,
    Math.max(spareBase, highestConnected + 1)
  );
  // Only sessions grow the range, but a port the user switched off still holds its place in it:
  // counting it only here keeps switching one off from retiring the idle slot above it, without
  // opening a new probe above a port the user just switched off.
  const highestKept = Math.min(
    cap,
    Math.max(highestWanted, ...disabledPorts.map((port) => port + 1))
  );

  for (let port = spareBase; port <= highestWanted; port++) {
    if (!isDisabled(port) && !slots.some((slot) => slot.port === port)) {
      openSlot(port, "spare", secret);
    }
  }

  for (const slot of [...slots]) {
    // A socket mid-handshake is not a failure: a slot the user just reopened sits outside
    // the window until it connects, and retiring it here would close it before it can.
    const isRetired =
      slot.role === "spare" &&
      slot.port > highestKept &&
      !slot.client.isConnected() &&
      !slot.client.isConnecting();
    // A port switched off in the popup is dropped even while a session holds it: that is the
    // point of the button.
    if (isRetired || isDisabled(slot.port)) {
      slot.client.disconnect();
      slot.handler.dispose();
      slots.splice(slots.indexOf(slot), 1);
    }
  }
}

async function syncSlotsFromConfig(secret: string) {
  syncSlots(await getPorts(), await getDisabledPorts(), secret);
}

// syncSlots grows the spare window off already-connected slots, so a port not yet finished
// handshaking can make later ports miss that window; a port the user just turned on is opened directly instead.
async function enablePorts(ports: number[], secret: string) {
  const fixedPorts = await getPorts();
  for (const port of ports) {
    await setPortEnabled(port, true);
  }
  for (const port of ports) {
    if (!slots.some((slot) => slot.port === port)) {
      openSlot(port, fixedPorts.includes(port) ? "fixed" : "spare", secret);
    }
  }
}

// Firefox drops the activeTab grant as soon as the tab navigates or closes, so the tracked
// consent has to follow it.
function initTabAuthorizationTracking() {
  browser.tabs.onUpdated.addListener(
    (tabId) => {
      revokeTabAuthorization(tabId);
    },
    { properties: ["url"] }
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    revokeTabAuthorization(tabId);
  });
}

function describeMissingTab(): ActiveTabStatus {
  return {
    id: null,
    title: "",
    url: "",
    origin: null,
    authorized: false,
    originAllowed: false,
    denied: false,
    scriptable: false,
    cookieStoreId: null,
  };
}

async function describeActiveTab(): Promise<ActiveTabStatus> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) {
    return describeMissingTab();
  }

  const url = tab.url ?? "";
  let origin: string | null = null;
  try {
    const parsed = new URL(url).origin;
    origin = parsed === "null" ? null : parsed;
  } catch (error) {
    origin = null;
  }

  return {
    id: tab.id,
    title: tab.title ?? "",
    url,
    origin,
    authorized: hasTabAuthorization(tab.id, tab.url),
    originAllowed: await isOriginAllowed(url),
    denied: url.length > 0 && (await isDomainInDenyList(url)),
    scriptable: url.length > 0 && !UNSCRIPTABLE_SCHEME.test(url),
    cookieStoreId: tab.cookieStoreId ?? null,
  };
}

async function buildStatus(): Promise<PopupStatus> {
  const disabledPorts = await getDisabledPorts();
  const ports = await getPorts();
  const live = [...slots].map((slot) => ({
    port: slot.port,
    role: slot.role,
    connected: slot.client.isConnected(),
    disabled: false,
    lastConnectedAt: slot.client.getLastConnectedAt(),
  }));
  // A switched-off port has no slot behind it, so the popup would lose the row it needs to
  // switch it back on.
  const off = disabledPorts
    .filter((port) => !slots.some((slot) => slot.port === port))
    .map((port) => ({
      port,
      role: ports.includes(port) ? ("fixed" as const) : ("spare" as const),
      connected: false,
      disabled: true,
      lastConnectedAt: null,
    }));

  return {
    connections: [...live, ...off].sort((a, b) => a.port - b.port),
    basePort: ports[0] ?? null,
    permissionMode: await getPermissionMode(),
    toolSettings: await getAllToolSettings(),
    auroraEnabled: await isAuroraEnabled(),
    focusEnabled: await isFocusEnabled(),
    markEnabled: await isMarkEnabled(),
    badgeEnabled: await isBadgeEnabled(),
    domainDenyList: await getDomainDenyList(),
    allowedOrigins: await getAllowedOrigins(),
    inheritContainer: await isContainerInherited(),
    backgroundMode: await isBackgroundMode(),
    includeHidden: await isHiddenElementsIncluded(),
    clipboardRead: await isClipboardReadAllowed(),
    consoleCapture: await isConsoleCaptureEnabled(),
    consoleLevel: await getConsoleCaptureLevel(),
    urlScope: await getUrlScope(),
    allUrlsGranted: await hasAllUrlsPermission(),
    activeTab: await describeActiveTab(),
  };
}

async function handlePopupRequest(request: PopupRequest): Promise<PopupStatus> {
  switch (request.kind) {
    case "get-status":
      break;
    case "set-tool":
      await setToolEnabled(request.toolId, request.enabled);
      break;
    case "set-permission-mode":
      await setPermissionMode(request.mode);
      break;
    case "set-aurora":
      await setAuroraEnabled(request.enabled);
      break;
    case "set-focus":
      await setFocusEnabled(request.enabled);
      break;
    case "set-mark":
      await setMarkEnabled(request.enabled);
      break;
    case "set-badge":
      await setBadgeEnabled(request.enabled);
      break;
    case "set-base-port":
      await setPorts([request.port]);
      await syncSlotsFromConfig(activeSecret);
      break;
    case "set-port-enabled":
      if (request.enabled) {
        await enablePorts([request.port], activeSecret);
      } else {
        await setPortEnabled(request.port, false);
      }
      await syncSlotsFromConfig(activeSecret);
      break;
    case "set-all-ports-enabled":
      if (request.enabled) {
        await enablePorts(await getDisabledPorts(), activeSecret);
      } else {
        const ports = new Set([
          ...(await getPorts()),
          ...slots.map((slot) => slot.port),
        ]);
        for (const port of ports) {
          await setPortEnabled(port, false);
        }
      }
      await syncSlotsFromConfig(activeSecret);
      break;
    case "set-inherit-container":
      await setContainerInherited(request.enabled);
      break;
    case "set-background-mode":
      await setBackgroundMode(request.enabled);
      break;
    case "set-url-scope":
      await setUrlScope(request.scope);
      break;
    case "set-clipboard-read":
      await setClipboardReadAllowed(request.enabled);
      break;
    case "set-include-hidden":
      await setHiddenElementsIncluded(request.enabled);
      break;
    case "set-console-capture":
      await setConsoleCapture(request.enabled);
      break;
    case "set-console-level":
      await setConsoleCaptureLevel(request.level);
      break;
    case "set-domain-deny-list":
      await setDomainDenyList(request.domains);
      break;
    case "set-allowed-origins":
      await setAllowedOrigins(request.origins);
      break;
    case "authorize-tab": {
      const tab = await browser.tabs.get(request.tabId);
      grantTabAuthorization(request.tabId, tab.url);
      await showAuthorizationGrantedFeedback(request.tabId);
      break;
    }
    case "revoke-tab":
      revokeTabAuthorization(request.tabId);
      break;
    default: {
      const exhaustiveCheck: never = request;
      console.error("Unknown popup request:", exhaustiveCheck);
    }
  }

  return buildStatus();
}

function initPopupChannel() {
  browser.runtime.onMessage.addListener(
    (message: PopupRequest | PageEventMessage, sender) => {
      if (isPageEventMessage(message)) {
        if (sender.tab?.id !== undefined) {
          recordPageEvent(
            sender.tab.id,
            message.channel,
            message.text,
            message.id
          );
        }
        // The answer is the guard's only proof that the report survived its document.
        return Promise.resolve(true);
      }
      return handlePopupRequest(message);
    }
  );
}

async function initExtension() {
  let config = await getConfig();
  if (!config.secret) {
    console.log("No secret found, generating new one");
    await generateSecret();
    // Open the options page to allow the user to view the config:
    await browser.runtime.openOptionsPage();
    config = await getConfig();
  }
  return config;
}

initExtension()
  .then((config) => {
    const secret = config.secret;

    if (!secret) {
      console.error("Secret not found in storage - reinstall extension");
      return;
    }
    if (config.ports.length === 0) {
      console.error("No ports configured in extension config");
      return;
    }
    activeSecret = secret;
    void syncSlotsFromConfig(secret);
    setInterval(() => {
      void syncSlotsFromConfig(secret);
    }, SLOT_SYNC_INTERVAL_MS);

    initTabAuthorizationTracking();
    initPopupChannel();
    console.log("Browser extension initialized");
  })
  .catch((error) => {
    console.error("Error initializing extension:", error);
  });
