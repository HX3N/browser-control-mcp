export interface ExtensionMessageBase {
  resource: string;
  correlationId: string;
  dialogs?: string[];
  consoleMessages?: string[];
}

export interface TabContentExtensionMessage extends ExtensionMessageBase {
  resource: "tab-content";
  tabId: number;
  fullText: string;
  isTruncated: boolean;
  totalLength: number;
  links: { url: string; text: string }[];
  collapsed?: CollapsedSection[];
  fields?: FormField[];
  unreachableFrames?: UnreachableFrame[];
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

export interface FormField {
  label: string;
  kind: "input" | "textarea" | "select";
  value: string;
  options?: number;
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

export interface FindHighlightExtensionMessage extends ExtensionMessageBase {
  resource: "find-highlight-result";
  noOfResults: number;
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
}

export interface PageMediaExtensionMessage extends ExtensionMessageBase {
  resource: "page-media";
  tabId: number;
  items: MediaItem[];
  totalItems: number;
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

export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  tag: string;
  selector: string;
  value?: string;
  placeholder?: string;
  href?: string;
  hidden?: boolean;
  frame?: string;
  disabled?: boolean;
  checked?: boolean;
  expanded?: boolean;
  options?: string[];
}

export interface PageSnapshotExtensionMessage extends ExtensionMessageBase {
  resource: "page-snapshot";
  tabId: number;
  url: string;
  title: string;
  elements: SnapshotElement[];
  totalElements: number;
  hiddenElements: number;
  isTruncated: boolean;
  scrollY: number;
  scrollHeight: number;
  scrollMax: number;
  unreachableFrames?: UnreachableFrame[];
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

export interface ElementWaitExtensionMessage extends ExtensionMessageBase {
  resource: "element-wait-result";
  tabId: number;
  found: boolean;
  elapsedMs: number;
  matchCount: number;
}

export interface TextChangeWaitExtensionMessage extends ExtensionMessageBase {
  resource: "text-change-wait-result";
  tabId: number;
  changed: boolean;
  navigated: boolean;
  // No wait was held for this scope before, so this call had nothing to compare against
  fresh: boolean;
  addedText: string;
  // Text that was there before is gone rather than merely added to, so addedText is the part that
  // differs instead of only what arrived during the wait
  rewritten: boolean;
  removedChars: number;
  elapsedMs: number;
}

export interface TabsReleasedExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-released";
  releasedTabIds: number[];
}

export type ExtensionMessage =
  | TabContentExtensionMessage
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
  | PageSnapshotExtensionMessage
  | InteractionResultExtensionMessage
  | ScriptResultExtensionMessage
  | ElementWaitExtensionMessage
  | TextChangeWaitExtensionMessage
  | WindowResizedExtensionMessage
  | NetworkRequestsExtensionMessage
  | TabsReleasedExtensionMessage;

export interface ExtensionError {
  correlationId: string;
  errorMessage: string;
  dialogs?: string[];
  consoleMessages?: string[];
}
