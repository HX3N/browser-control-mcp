import type {
  ConsoleCaptureLevel,
  PermissionMode,
  ToolSettings,
  UrlScope,
} from "./extension-config";

export interface ConnectionStatus {
  port: number;
  role: "fixed" | "spare";
  connected: boolean;
  disabled: boolean;
  lastConnectedAt: number | null;
}

export interface ActiveTabStatus {
  id: number | null;
  title: string;
  url: string;
  origin: string | null;
  authorized: boolean;
  originAllowed: boolean;
  denied: boolean;
  scriptable: boolean;
  cookieStoreId: string | null;
}

export interface PopupStatus {
  connections: ConnectionStatus[];
  basePort: number | null;
  permissionMode: PermissionMode;
  urlScope: UrlScope;
  toolSettings: ToolSettings;
  auroraEnabled: boolean;
  focusEnabled: boolean;
  markEnabled: boolean;
  badgeEnabled: boolean;
  domainDenyList: string[];
  allowedOrigins: string[];
  inheritContainer: boolean;
  backgroundMode: boolean;
  includeHidden: boolean;
  consoleCapture: boolean;
  consoleLevel: ConsoleCaptureLevel;
  allUrlsGranted: boolean;
  activeTab: ActiveTabStatus;
}

export type PopupRequest =
  | { kind: "get-status" }
  | { kind: "set-tool"; toolId: string; enabled: boolean }
  | { kind: "set-permission-mode"; mode: PermissionMode }
  | { kind: "set-url-scope"; scope: UrlScope }
  | { kind: "set-aurora"; enabled: boolean }
  | { kind: "set-focus"; enabled: boolean }
  | { kind: "set-mark"; enabled: boolean }
  | { kind: "set-badge"; enabled: boolean }
  | { kind: "set-base-port"; port: number }
  | { kind: "set-port-enabled"; port: number; enabled: boolean }
  | { kind: "set-all-ports-enabled"; enabled: boolean }
  | { kind: "set-inherit-container"; enabled: boolean }
  | { kind: "set-background-mode"; enabled: boolean }
  | { kind: "set-include-hidden"; enabled: boolean }
  | { kind: "set-console-capture"; enabled: boolean }
  | { kind: "set-console-level"; level: ConsoleCaptureLevel }
  | { kind: "set-domain-deny-list"; domains: string[] }
  | { kind: "set-allowed-origins"; origins: string[] }
  | { kind: "authorize-tab"; tabId: number }
  | { kind: "revoke-tab"; tabId: number };
