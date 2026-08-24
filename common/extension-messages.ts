export interface ExtensionMessageBase {
  resource: string;
  correlationId: string;
  dialogs?: string[];
}

export interface TabContentExtensionMessage extends ExtensionMessageBase {
  resource: "tab-content";
  tabId: number;
  fullText: string;
  isTruncated: boolean;
  totalLength: number;
  links: { url: string; text: string }[];
}

export interface BrowserTab {
  id?: number;
  url?: string;
  title?: string;
  lastAccessed?: number;
  cookieStoreId?: string;
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
  captured?: CapturedElement;
}

export interface CapturedElement {
  label: string;
  width: number;
  height: number;
  elementWidth: number;
  elementHeight: number;
  clipped: boolean;
  scrollY: number;
  scrollHeight: number;
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
}

export interface InteractionResultExtensionMessage extends ExtensionMessageBase {
  resource: "interaction-result";
  tabId: number;
  action: "click" | "type" | "scroll" | "press-key" | "select-option";
  target: string;
  detail: string;
  url: string;
  scrollY: number;
  scrollHeight: number;
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
  | PageSnapshotExtensionMessage
  | InteractionResultExtensionMessage
  | ScriptResultExtensionMessage
  | ElementWaitExtensionMessage
  | TabsReleasedExtensionMessage;

export interface ExtensionError {
  correlationId: string;
  errorMessage: string;
}
