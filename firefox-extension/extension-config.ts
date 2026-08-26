/**
 * Configuration management for Browser Control MCP extension
 */

import { ServerMessageRequest } from "@browser-control-mcp/common/server-messages";
import { t } from "./i18n";

const DEFAULT_WS_PORT = 8089;
const AUDIT_LOG_SIZE_LIMIT = 100; // Maximum number of audit log entries to keep

// Define all available tools with their IDs and descriptions
export interface ToolInfo {
  id: string;
  nameKey: string;
  descriptionKey: string;
}

export const AVAILABLE_TOOLS: ToolInfo[] = [
  {
    id: "open-browser-tab",
    nameKey: "toolOpenBrowserTabName",
    descriptionKey: "toolOpenBrowserTabDescription"
  },
  {
    id: "close-browser-tabs",
    nameKey: "toolCloseBrowserTabsName",
    descriptionKey: "toolCloseBrowserTabsDescription"
  },
  {
    id: "get-list-of-open-tabs",
    nameKey: "toolGetListOfOpenTabsName",
    descriptionKey: "toolGetListOfOpenTabsDescription"
  },
  {
    id: "get-recent-browser-history",
    nameKey: "toolGetRecentBrowserHistoryName",
    descriptionKey: "toolGetRecentBrowserHistoryDescription"
  },
  {
    id: "get-tab-web-content",
    nameKey: "toolGetTabWebContentName",
    descriptionKey: "toolGetTabWebContentDescription"
  },
  {
    id: "reorder-browser-tabs",
    nameKey: "toolReorderBrowserTabsName",
    descriptionKey: "toolReorderBrowserTabsDescription"
  },
  {
    id: "find-highlight-in-browser-tab",
    nameKey: "toolFindHighlightInBrowserTabName",
    descriptionKey: "toolFindHighlightInBrowserTabDescription"
  },
  {
    id: "capture-tab-screenshot",
    nameKey: "toolCaptureTabScreenshotName",
    descriptionKey: "toolCaptureTabScreenshotDescription"
  },
  {
    id: "interact-click",
    nameKey: "toolInteractMouseName",
    descriptionKey: "toolInteractMouseDescription"
  },
  {
    id: "interact-type",
    nameKey: "toolInteractKeyboardName",
    descriptionKey: "toolInteractKeyboardDescription"
  },
  {
    id: "execute-javascript",
    nameKey: "toolExecuteJavascriptName",
    descriptionKey: "toolExecuteJavascriptDescription"
  },
  {
    id: "get-media-content",
    nameKey: "toolGetMediaContentName",
    descriptionKey: "toolGetMediaContentDescription"
  },
  {
    id: "upload-files",
    nameKey: "toolUploadFilesName",
    descriptionKey: "toolUploadFilesDescription"
  },
  {
    id: "get-network-requests",
    nameKey: "toolGetNetworkRequestsName",
    descriptionKey: "toolGetNetworkRequestsDescription"
  }
];

export const INTERACTION_TOOL_IDS = [
  "capture-tab-screenshot",
  "interact-click",
  "interact-type",
  "execute-javascript",
  "get-media-content",
  "upload-files",
] as const;

// The extension holds a blanket host permission, so the browser no longer stands between the
// server and a page. Arbitrary scripting is the one tool that has to be switched on by hand.
export const DISABLED_BY_DEFAULT_TOOL_IDS: readonly string[] = [
  "execute-javascript",
  "get-media-content",
  "upload-files",
];

// Map command names to tool IDs
export const COMMAND_TO_TOOL_ID: Record<ServerMessageRequest["cmd"], string> = {
  "open-tab": "open-browser-tab",
  "navigate-tab": "open-browser-tab",
  "close-tabs": "close-browser-tabs",
  "get-tab-list": "get-list-of-open-tabs",
  "get-browser-recent-history": "get-recent-browser-history",
  "get-tab-content": "get-tab-web-content",
  "reorder-tabs": "reorder-browser-tabs",
  "find-highlight": "find-highlight-in-browser-tab",
  "group-tabs": "reorder-browser-tabs",
  "capture-screenshot": "capture-tab-screenshot",
  "get-media": "get-tab-web-content",
  "fetch-media": "get-media-content",
  "page-snapshot": "get-tab-web-content",
  "wait-for-element": "get-tab-web-content",
  "wait-for-text-change": "get-tab-web-content",
  "click-element": "interact-click",
  "hover-element": "interact-click",
  "drag-element": "interact-click",
  "select-option": "interact-click",
  "scroll-page": "interact-click",
  "type-text": "interact-type",
  "press-key": "interact-type",
  "upload-files": "upload-files",
  "get-network-requests": "get-network-requests",
  "resize-window": "reorder-browser-tabs",
  "execute-js": "execute-javascript",
  // Deliberately not one of AVAILABLE_TOOLS: releasing only removes this extension's own
  // overlay, so a disabled switch must never be able to strand it on the page.
  "release-tabs": "release-tab-overlay",
};

export const PAGE_ACCESS_COMMANDS: ReadonlySet<ServerMessageRequest["cmd"]> =
  new Set([
    "navigate-tab",
    "get-tab-content",
    "find-highlight",
    "capture-screenshot",
    "get-media",
    "fetch-media",
    "page-snapshot",
    "wait-for-element",
    "wait-for-text-change",
    "click-element",
    "hover-element",
    "drag-element",
    "select-option",
    "scroll-page",
    "type-text",
    "press-key",
    "upload-files",
    "get-network-requests",
    "execute-js",
  ]);

export type PermissionMode = "denylist" | "allowlist";

export const DEFAULT_PERMISSION_MODE: PermissionMode = "allowlist";

// Older installs may still hold the retired "full" mode, which was denylist with the list
// ignored. Reading it as denylist keeps the stored deny list meaningful instead of dropping it.
function normalizePermissionMode(stored: string | undefined): PermissionMode {
  return stored === "denylist" || stored === "allowlist"
    ? stored
    : stored === "full"
    ? "denylist"
    : DEFAULT_PERMISSION_MODE;
}

export type UrlScope = "https" | "loopback" | "any" | "files";

export type ConsoleCaptureLevel = "error" | "warn" | "log";

export const DEFAULT_CONSOLE_LEVEL: ConsoleCaptureLevel = "error";

function normalizeConsoleLevel(
  stored: string | undefined
): ConsoleCaptureLevel {
  return stored === "error" || stored === "warn" || stored === "log"
    ? stored
    : DEFAULT_CONSOLE_LEVEL;
}

export const DEFAULT_URL_SCOPE: UrlScope = "loopback";

function normalizeUrlScope(stored: string | undefined): UrlScope {
  return stored === "https" ||
    stored === "loopback" ||
    stored === "any" ||
    stored === "files"
    ? stored
    : DEFAULT_URL_SCOPE;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost");
}

// Storage schema for tool settings
export interface ToolSettings {
  [toolId: string]: boolean;
}

// Audit log entry interface
export interface AuditLogEntry {
  toolId: string;
  command: string;
  timestamp: number;
  url?: string;
}

// Extended config interface
export interface ExtensionConfig {
  secret: string;
  toolSettings?: ToolSettings;
  domainDenyList?: string[];
  ports: number[];
  auditLog?: AuditLogEntry[];
  permissionMode?: PermissionMode;
  allowedOrigins?: string[];
  highlightEnabled?: boolean;
  auroraEnabled?: boolean;
  focusEnabled?: boolean;
  markEnabled?: boolean;
  badgeEnabled?: boolean;
  disabledPorts?: number[];
  inheritContainer?: boolean;
  backgroundMode?: boolean;
  includeHiddenElements?: boolean;
  allowClipboardRead?: boolean;
  urlScope?: UrlScope;
  consoleCapture?: boolean;
  consoleLevel?: ConsoleCaptureLevel;
  overlayTimings?: Partial<OverlayTimings>;
  overlayColors?: StoredOverlayColors;
}

export interface OverlayTimings {
  statusResetMs: number;
  holdReleaseMs: number;
  leadMs: number;
}

export const DEFAULT_OVERLAY_TIMINGS: OverlayTimings = {
  statusResetMs: 5000,
  holdReleaseMs: 90_000,
  leadMs: 1000,
};

export const OVERLAY_TIMING_LIMITS: Record<
  keyof OverlayTimings,
  { min: number; max: number }
> = {
  statusResetMs: { min: 1000, max: 120_000 },
  holdReleaseMs: { min: 10_000, max: 3_600_000 },
  leadMs: { min: 0, max: 5_000 },
};

export type OverlayAccentKey = "idle" | "read" | "click" | "type" | "exec";

export const OVERLAY_ACCENT_KEYS: readonly OverlayAccentKey[] = [
  "idle",
  "read",
  "click",
  "type",
  "exec",
];

export interface OverlayColors {
  accents: Record<OverlayAccentKey, string>;
  aurora: string[];
}

interface StoredOverlayColors {
  accents?: Partial<Record<OverlayAccentKey, string>>;
  aurora?: string[];
}

export const DEFAULT_OVERLAY_COLORS: OverlayColors = {
  accents: {
    idle: "#d97757",
    read: "#00dfd8",
    click: "#ff007f",
    type: "#a855f7",
    exec: "#ffac1c",
  },
  aurora: ["#ff007f", "#7928ca", "#00dfd8", "#ffac1c"],
};

export const AURORA_COLOR_COUNT = DEFAULT_OVERLAY_COLORS.aurora.length;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : fallback;
}

function readTiming(
  value: unknown,
  key: keyof OverlayTimings
): number {
  const limits = OVERLAY_TIMING_LIMITS[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_OVERLAY_TIMINGS[key];
  }
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

export async function getOverlayTimings(): Promise<OverlayTimings> {
  const stored = (await getConfig()).overlayTimings ?? {};
  return {
    statusResetMs: readTiming(stored.statusResetMs, "statusResetMs"),
    holdReleaseMs: readTiming(stored.holdReleaseMs, "holdReleaseMs"),
    leadMs: readTiming(stored.leadMs, "leadMs"),
  };
}

export async function setOverlayTimings(
  patch: Partial<OverlayTimings>
): Promise<void> {
  const config = await getConfig();
  const current = await getOverlayTimings();
  config.overlayTimings = { ...current, ...patch };
  await saveConfig(config);
}

export async function getOverlayColors(): Promise<OverlayColors> {
  const stored = (await getConfig()).overlayColors ?? {};
  const accents = {} as Record<OverlayAccentKey, string>;
  for (const key of OVERLAY_ACCENT_KEYS) {
    accents[key] = readColor(
      stored.accents?.[key],
      DEFAULT_OVERLAY_COLORS.accents[key]
    );
  }
  const aurora = DEFAULT_OVERLAY_COLORS.aurora.map((fallback, position) =>
    readColor(stored.aurora?.[position], fallback)
  );
  return { accents, aurora };
}

export async function setOverlayColors(patch: {
  accents?: Partial<Record<OverlayAccentKey, string>>;
  aurora?: string[];
}): Promise<void> {
  const config = await getConfig();
  const current = await getOverlayColors();
  config.overlayColors = {
    accents: { ...current.accents, ...patch.accents },
    aurora: patch.aurora ?? current.aurora,
  };
  await saveConfig(config);
}

export async function resetOverlayColors(): Promise<void> {
  const config = await getConfig();
  delete config.overlayColors;
  await saveConfig(config);
}

export async function resetOverlayTimings(): Promise<void> {
  const config = await getConfig();
  delete config.overlayTimings;
  await saveConfig(config);
}

/**
 * Gets the default tool settings (all enabled)
 */
export function getDefaultToolSettings(): ToolSettings {
  const settings: ToolSettings = {};
  AVAILABLE_TOOLS.forEach(tool => {
    settings[tool.id] = !DISABLED_BY_DEFAULT_TOOL_IDS.includes(tool.id);
  });
  return settings;
}

/**
 * Gets the extension configuration from storage
 * @returns A Promise that resolves with the extension configuration
 */
export async function getConfig(): Promise<ExtensionConfig> {
  const configObj = await browser.storage.local.get("config");
  const config: ExtensionConfig = configObj.config || { secret: "" };
  
  // Initialize toolSettings if it doesn't exist
  if (!config.toolSettings) {
    config.toolSettings = getDefaultToolSettings();
  }

  if (!config.ports) {
    config.ports = [DEFAULT_WS_PORT];
  }
  
  return config;
}

/**
 * Saves the extension configuration to storage
 * @param config The configuration to save
 * @returns A Promise that resolves when the configuration is saved
 */
export async function saveConfig(config: ExtensionConfig): Promise<void> {
  await browser.storage.local.set({ config });
}

/**
 * Gets the secret from storage
 * @returns A Promise that resolves with the secret
 */
export async function getSecret(): Promise<string> {
  const config = await getConfig();
  return config.secret;
}

/**
 * Generates a new secret and saves it to storage
 * @returns A Promise that resolves with the new secret
 */
export async function generateSecret(): Promise<string> {
  const config = await getConfig();
  config.secret = crypto.randomUUID();
  await saveConfig(config);
  return config.secret;
}

/**
 * Checks if a tool is enabled
 * @param toolId The ID of the tool to check
 * @returns A Promise that resolves with true if the tool is enabled, false otherwise
 */
export async function isToolEnabled(toolId: string): Promise<boolean> {
  const config = await getConfig();
  const stored = config.toolSettings?.[toolId];
  if (stored === undefined) {
    return !DISABLED_BY_DEFAULT_TOOL_IDS.includes(toolId);
  }
  return stored !== false;
}

/**
 * Checks if a command is allowed based on the tool permissions
 * @param command The command to check
 * @returns A Promise that resolves with true if the command is allowed, false otherwise
 */
export async function isCommandAllowed(command: ServerMessageRequest["cmd"]): Promise<boolean> {
  const toolId = COMMAND_TO_TOOL_ID[command];
  if (!toolId) {
    console.error(`Unknown command: ${command}`);
    return false;
  }
  return isToolEnabled(toolId);
}

/**
 * Sets the enabled status of a tool
 * @param toolId The ID of the tool to update
 * @param enabled Whether the tool should be enabled
 * @returns A Promise that resolves when the setting is saved
 */
export async function setToolEnabled(toolId: string, enabled: boolean): Promise<void> {
  const config = await getConfig();
  
  // Update the setting
  if (!config.toolSettings) {
    config.toolSettings = getDefaultToolSettings();
  }
  config.toolSettings[toolId] = enabled;
  
  // Save back to storage
  await saveConfig(config);
}

/**
 * Gets all tool settings
 * @returns A Promise that resolves with the current tool settings
 */
export async function getAllToolSettings(): Promise<ToolSettings> {
  const config = await getConfig();
  return config.toolSettings || getDefaultToolSettings();
}

export async function getPermissionMode(): Promise<PermissionMode> {
  const config = await getConfig();
  return normalizePermissionMode(config.permissionMode);
}

export async function setPermissionMode(mode: PermissionMode): Promise<void> {
  const config = await getConfig();
  config.permissionMode = mode;
  await saveConfig(config);
}

// A single highlightEnabled switch predates the split, so a stored false still has to turn
// every part of the overlay off.
function readOverlayFlag(
  value: boolean | undefined,
  legacy: boolean | undefined
): boolean {
  if (value !== undefined) {
    return value;
  }
  return legacy !== false;
}

export async function isAuroraEnabled(): Promise<boolean> {
  const config = await getConfig();
  return readOverlayFlag(config.auroraEnabled, config.highlightEnabled);
}

export async function setAuroraEnabled(enabled: boolean): Promise<void> {
  const config = await getConfig();
  config.auroraEnabled = enabled;
  await saveConfig(config);
}

export async function isFocusEnabled(): Promise<boolean> {
  const config = await getConfig();
  return readOverlayFlag(config.focusEnabled, config.highlightEnabled);
}

export async function setFocusEnabled(enabled: boolean): Promise<void> {
  const config = await getConfig();
  config.focusEnabled = enabled;
  await saveConfig(config);
}

export async function isMarkEnabled(): Promise<boolean> {
  const config = await getConfig();
  return readOverlayFlag(config.markEnabled, config.highlightEnabled);
}

export async function setMarkEnabled(enabled: boolean): Promise<void> {
  const config = await getConfig();
  config.markEnabled = enabled;
  await saveConfig(config);
}

export async function isBadgeEnabled(): Promise<boolean> {
  const config = await getConfig();
  return readOverlayFlag(config.badgeEnabled, config.highlightEnabled);
}

export async function setBadgeEnabled(enabled: boolean): Promise<void> {
  const config = await getConfig();
  config.badgeEnabled = enabled;
  await saveConfig(config);
}

export async function getDisabledPorts(): Promise<number[]> {
  const config = await getConfig();
  return config.disabledPorts || [];
}

export async function setPortEnabled(
  port: number,
  enabled: boolean
): Promise<void> {
  const config = await getConfig();
  const disabled = new Set(config.disabledPorts || []);
  if (enabled) {
    disabled.delete(port);
  } else {
    disabled.add(port);
  }
  config.disabledPorts = [...disabled].sort((a, b) => a - b);
  await saveConfig(config);
}

export async function isContainerInherited(): Promise<boolean> {
  const config = await getConfig();
  return config.inheritContainer !== false;
}

export async function setContainerInherited(inherit: boolean): Promise<void> {
  const config = await getConfig();
  config.inheritContainer = inherit;
  await saveConfig(config);
}

export async function isBackgroundMode(): Promise<boolean> {
  const config = await getConfig();
  return config.backgroundMode !== false;
}

export async function setBackgroundMode(enabled: boolean): Promise<void> {
  const config = await getConfig();
  config.backgroundMode = enabled;
  await saveConfig(config);
}

export async function isHiddenElementsIncluded(): Promise<boolean> {
  const config = await getConfig();
  return config.includeHiddenElements === true;
}

export async function setHiddenElementsIncluded(
  include: boolean
): Promise<void> {
  const config = await getConfig();
  config.includeHiddenElements = include;
  await saveConfig(config);
}

export async function isClipboardReadAllowed(): Promise<boolean> {
  const config = await getConfig();
  return config.allowClipboardRead === true;
}

export async function setClipboardReadAllowed(allow: boolean): Promise<void> {
  const config = await getConfig();
  config.allowClipboardRead = allow;
  await saveConfig(config);
}

export async function isConsoleCaptureEnabled(): Promise<boolean> {
  const config = await getConfig();
  return config.consoleCapture !== false;
}

export async function setConsoleCapture(enabled: boolean): Promise<void> {
  const config = await getConfig();
  config.consoleCapture = enabled;
  await saveConfig(config);
}

export async function getConsoleCaptureLevel(): Promise<ConsoleCaptureLevel> {
  const config = await getConfig();
  return normalizeConsoleLevel(config.consoleLevel);
}

export async function setConsoleCaptureLevel(
  level: ConsoleCaptureLevel
): Promise<void> {
  const config = await getConfig();
  config.consoleLevel = level;
  await saveConfig(config);
}

export async function getUrlScope(): Promise<UrlScope> {
  const config = await getConfig();
  return normalizeUrlScope(config.urlScope);
}

export async function setUrlScope(scope: UrlScope): Promise<void> {
  const config = await getConfig();
  config.urlScope = scope;
  await saveConfig(config);
}

export function isUrlInScope(url: string, scope: UrlScope): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    return false;
  }
  if (parsed.protocol === "https:") {
    return true;
  }
  if (parsed.protocol === "file:" || parsed.protocol === "ftp:") {
    return scope === "files";
  }
  if (parsed.protocol !== "http:") {
    return false;
  }
  if (scope === "any" || scope === "files") {
    return true;
  }
  return scope === "loopback" && isLoopbackHost(parsed.hostname);
}

export function describeUrlScope(scope: UrlScope): string {
  switch (scope) {
    case "files":
      return "HTTP and HTTPS pages, plus file:// and ftp:// URLs";
    case "any":
      return "HTTP and HTTPS pages only";
    case "loopback":
      return "HTTPS pages and http:// on localhost only";
    default:
      return "HTTPS pages only";
  }
}

export async function getAllowedOrigins(): Promise<string[]> {
  const config = await getConfig();
  return config.allowedOrigins || [];
}


export async function setAllowedOrigins(origins: string[]): Promise<void> {
  const config = await getConfig();
  config.allowedOrigins = origins;
  await saveConfig(config);
}


export async function isOriginAllowed(url: string | undefined): Promise<boolean> {
  if (!url) {
    return false;
  }
  try {
    const origin = new URL(url).origin;
    const origins = await getAllowedOrigins();
    return origins.includes(origin);
  } catch (error) {
    console.error(`Error checking origin in allow list: ${error}`);
    return false;
  }
}

/**
 * Gets the domain deny list
 * @returns A Promise that resolves with the domain deny list
 */
export async function getDomainDenyList(): Promise<string[]> {
  const config = await getConfig();
  return config.domainDenyList || [];
}

/**
 * Sets the domain deny list
 * @param domains Array of domains to deny
 * @returns A Promise that resolves when the setting is saved
 */
export async function setDomainDenyList(domains: string[]): Promise<void> {
  const config = await getConfig();
  config.domainDenyList = domains;
  await saveConfig(config);
}

/**
 * Checks if a domain is in the deny list
 * @param url The URL to check
 * @returns A Promise that resolves with true if the domain is in the deny list, false otherwise
 */
export async function isDomainInDenyList(url: string): Promise<boolean> {
  try {
    // Extract the domain from the URL
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    
    // Get the deny list
    const denyList = await getDomainDenyList();
    
    // Check if the domain is in the deny list
    return denyList.some(deniedDomain => 
      domain.toLowerCase() === deniedDomain.toLowerCase() || 
      domain.toLowerCase().endsWith(`.${deniedDomain.toLowerCase()}`)
    );
  } catch (error) {
    console.error(`Error checking domain in deny list: ${error}`);
    // If there's an error parsing the URL, return false
    return false;
  }
}

/**
 * Gets the WebSocket ports list
 * @returns A Promise that resolves with the ports list
 */
export async function getPorts(): Promise<number[]> {
  const config = await getConfig();
  return config.ports || [DEFAULT_WS_PORT];
}

/**
 * Sets the WebSocket ports list
 * @param ports Array of port numbers
 * @returns A Promise that resolves when the setting is saved
 */
export async function setPorts(ports: number[]): Promise<void> {
  const config = await getConfig();
  config.ports = ports;
  await saveConfig(config);
}

/**
 * Adds an entry to the audit log
 * @param entry The audit log entry to add
 * @returns A Promise that resolves when the entry is saved
 */
export async function addAuditLogEntry(entry: AuditLogEntry): Promise<void> {
  const config = await getConfig();
  
  if (!config.auditLog) {
    config.auditLog = [];
  }
  
  // Add the new entry at the beginning
  config.auditLog.unshift(entry);
  
  // Keep only the last AUDIT_LOG_SIZE_LIMIT entries
  if (config.auditLog.length > AUDIT_LOG_SIZE_LIMIT) {
    config.auditLog = config.auditLog.slice(0, AUDIT_LOG_SIZE_LIMIT);
  }
  
  await saveConfig(config);
}

/**
 * Gets the audit log entries
 * @returns A Promise that resolves with the audit log entries
 */
export async function getAuditLog(): Promise<AuditLogEntry[]> {
  const config = await getConfig();
  return config.auditLog || [];
}

/**
 * Clears the audit log
 * @returns A Promise that resolves when the audit log is cleared
 */
export async function clearAuditLog(): Promise<void> {
  const config = await getConfig();
  config.auditLog = [];
  await saveConfig(config);
}

/**
 * Gets the tool name by tool ID
 * @param toolId The tool ID to look up
 * @returns The tool name or the tool ID if not found
 */
export function getToolNameById(toolId: string): string {
  const tool = AVAILABLE_TOOLS.find(t => t.id === toolId);
  return tool ? t(tool.nameKey) : toolId;
}
