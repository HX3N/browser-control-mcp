export interface ExtensionMessageBase {
  resource: string;
  correlationId: string;
  dialogs?: string[];
  consoleMessages?: string[];
}

export interface PageExtensionMessage extends ExtensionMessageBase {
  resource: "page";
  tabId: number;
  url: string;
  title: string;
  text: string;
  isTruncated: boolean;
  totalLength: number;
  totalElements: number;
  listedElements: number;
  hiddenElements: number;
  hiddenListed: boolean;
  elementsTruncated: boolean;
  scrollY: number;
  scrollHeight: number;
  scrollMax: number;
  collapsed?: CollapsedSection[];
  unreachableFrames?: UnreachableFrame[];
  scope?: ScopeElement;
  outline?: PageRegion[];
}

export interface PageRegion {
  ref: string;
  tag: string;
  role?: string;
  id?: string;
  name: string;
  depth: number;
  chars: number;
  controls: number;
}

export interface ScopeElement {
  role: string;
  tag: string;
  name: string;
}

export interface UnreachableFrame {
  src: string;
  name?: string;
  width: number;
  height: number;
  hidden?: boolean;
}

export interface CollapsedSection {
  label: string;
  kind: "details" | "expandable" | "tab";
  chars?: number;
}

export interface BrowserTab {
  id?: number;
  url?: string;
  title?: string;
  lastAccessed?: number;
  cookieStoreId?: string;
  held?: boolean;
}

export interface WindowResizedExtensionMessage extends ExtensionMessageBase {
  resource: "window-resized";
  tabId: number;
  width: number;
  height: number;
}

export interface NetworkRequestRecord {
  method: string;
  url: string;
  type: string;
  status?: number;
  error?: string;
  fromCache?: boolean;
  startedAt: number;
  durationMs?: number;
}

export interface NetworkRequestsExtensionMessage extends ExtensionMessageBase {
  resource: "network-requests";
  tabId: number;
  requests: NetworkRequestRecord[];
  total: number;
}

export interface TabsExtensionMessage extends ExtensionMessageBase {
  resource: "tabs";
  tabs: BrowserTab[];
}

export interface OpenedTabIdExtensionMessage extends ExtensionMessageBase {
  resource: "opened-tab-id";
  tabId: number | undefined;
}

export interface TabNavigatedExtensionMessage extends ExtensionMessageBase {
  resource: "tab-navigated";
  tabId: number;
  url: string;
  title: string;
  settled: boolean;
}

export interface BrowserHistoryItem {
  url?: string;
  title?: string;
  lastVisitTime?: number;
}

export interface BrowserHistoryExtensionMessage extends ExtensionMessageBase {
  resource: "history";

  historyItems: BrowserHistoryItem[];
}

export interface ReorderedTabsExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-reordered";
  tabOrder: number[];
}

export interface FindMatch {
  ref: string;
  tag: string;
  context: string;
  frame?: string;
  hidden?: boolean;
  controls?: FindControl[];
  moreControls?: number;
}

export interface FindControl {
  ref: string;
  label: string;
  hidden?: boolean;
}

export interface FindHighlightExtensionMessage extends ExtensionMessageBase {
  resource: "find-highlight-result";
  noOfResults: number;
  matches: FindMatch[];
  hiddenListed: boolean;
}

export interface TabsClosedExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-closed";
}

export interface TabGroupCreatedExtensionMessage extends ExtensionMessageBase {
  resource: "new-tab-group";
  groupId: number;
}

export interface ScreenshotExtensionMessage extends ExtensionMessageBase {
  resource: "screenshot";
  tabId: number;
  // Base64-encoded image, without the data-URL prefix
  imageData: string;
  mimeType: string;
  imageWidth?: number;
  imageHeight?: number;
  // Decoded size of every image in this message combined
  imageBytes?: number;
  // Further slices of an element too tall for one image, top to bottom after imageData
  extraSlices?: string[];
  captured?: CapturedElement;
}

export interface CapturedElement {
  label: string;
  width: number;
  height: number;
  elementWidth: number;
  elementHeight: number;
  clipped: boolean;
  slices?: number;
  scrollY: number;
  scrollHeight: number;
  scrollMax: number;
}

export interface MediaItem {
  url: string;
  kind: "image" | "video" | "audio";
  naturalWidth?: number;
  naturalHeight?: number;
  alt?: string;
  frame?: string;
  hidden?: boolean;
}

export interface PageMediaExtensionMessage extends ExtensionMessageBase {
  resource: "page-media";
  tabId: number;
  items: MediaItem[];
  totalItems: number;
  hiddenItems: number;
  hiddenListed: boolean;
  isTruncated: boolean;
  unreachableFrames: number;
}

export interface MediaContentExtensionMessage extends ExtensionMessageBase {
  resource: "media-content";
  tabId: number;
  // Base64-encoded image, without the data-URL prefix
  imageData: string;
  mimeType: string;
  byteLength: number;
  imageWidth?: number;
  imageHeight?: number;
}

export interface InteractionResultExtensionMessage extends ExtensionMessageBase {
  resource: "interaction-result";
  tabId: number;
  action:
    | "click"
    | "hover"
    | "drag"
    | "type"
    | "upload"
    | "scroll"
    | "press-key"
    | "select-option";
  target: string;
  detail: string;
  url: string;
  scrollY: number;
  scrollHeight: number;
  scrollMax: number;
}

export interface ScriptResultExtensionMessage extends ExtensionMessageBase {
  resource: "script-result";
  tabId: number;
  result: string;
  isTruncated: boolean;
}

export interface PageWaitExtensionMessage extends ExtensionMessageBase {
  resource: "page-wait-result";
  tabId: number;
  mode: "element" | "text";
  elapsedMs: number;
  navigated: boolean;
  found?: boolean;
  matchCount?: number;
  changed?: boolean;
  // No wait was held for this scope before, so this call had nothing to compare against
  fresh?: boolean;
  addedText?: string;
  // Text that was there before is gone rather than merely added to, so addedText is the part that
  // differs instead of only what arrived during the wait
  rewritten?: boolean;
  removedChars?: number;
}

export interface TabsReleasedExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-released";
  releasedTabIds: number[];
}

export interface LimitsExtensionMessage extends ExtensionMessageBase {
  resource: "limits";
  uploadBytes: number;
}

export type ExtensionMessage =
  | PageExtensionMessage
  | TabsExtensionMessage
  | OpenedTabIdExtensionMessage
  | TabNavigatedExtensionMessage
  | BrowserHistoryExtensionMessage
  | ReorderedTabsExtensionMessage
  | FindHighlightExtensionMessage
  | TabsClosedExtensionMessage
  | TabGroupCreatedExtensionMessage
  | ScreenshotExtensionMessage
  | PageMediaExtensionMessage
  | MediaContentExtensionMessage
  | InteractionResultExtensionMessage
  | ScriptResultExtensionMessage
  | PageWaitExtensionMessage
  | WindowResizedExtensionMessage
  | NetworkRequestsExtensionMessage
  | TabsReleasedExtensionMessage
  | LimitsExtensionMessage;

export interface ExtensionError {
  correlationId: string;
  errorMessage: string;
  dialogs?: string[];
  consoleMessages?: string[];
}
