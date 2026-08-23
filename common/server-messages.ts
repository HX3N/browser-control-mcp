export interface ServerMessageBase {
  cmd: string;
}

export interface OpenTabServerMessage extends ServerMessageBase {
  cmd: "open-tab";
  url: string;
  cookieStoreId?: string;
}

export interface CloseTabsServerMessage extends ServerMessageBase {
  cmd: "close-tabs";
  tabIds: number[];
}

export interface GetTabListServerMessage extends ServerMessageBase {
  cmd: "get-tab-list";
}

export interface GetBrowserRecentHistoryServerMessage extends ServerMessageBase {
  cmd: "get-browser-recent-history";
  searchQuery?: string;
}

export interface GetTabContentServerMessage extends ServerMessageBase {
  cmd: "get-tab-content";
  tabId: number;
  offset?: number;
}

export interface ReorderTabsServerMessage extends ServerMessageBase {
  cmd: "reorder-tabs";
  tabOrder: number[];
}

export interface FindHighlightServerMessage extends ServerMessageBase {
  cmd: "find-highlight";
  tabId: number;
  queryPhrase: string;
}

export interface GroupTabsServerMessage extends ServerMessageBase {
  cmd: "group-tabs";
  tabIds: number[];
  isCollapsed: boolean;
  groupColor: string;
  groupTitle: string;
}

export interface CaptureScreenshotServerMessage extends ServerMessageBase {
  cmd: "capture-screenshot";
  tabId: number;
  format?: "jpeg" | "png";
  quality?: number;
  scale?: number;
}

export interface ElementTarget {
  ref?: string;
  selector?: string;
  index?: number;
}

export interface PageSnapshotServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "page-snapshot";
  tabId: number;
  maxElements?: number;
  interactiveOnly?: boolean;
}

export interface ClickElementServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "click-element";
  tabId: number;
  button?: "left" | "middle" | "right";
  clickCount?: number;
}

export interface TypeTextServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "type-text";
  tabId: number;
  text: string;
  clearFirst?: boolean;
  submit?: boolean;
}

export interface ExecuteJsServerMessage extends ServerMessageBase {
  cmd: "execute-js";
  tabId: number;
  code: string;
}

export interface ScrollPageServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "scroll-page";
  tabId: number;
  direction: "up" | "down" | "top" | "bottom" | "element";
  amount?: number;
}

export interface PressKeyServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "press-key";
  tabId: number;
  key: string;
  modifiers?: ("Control" | "Shift" | "Alt" | "Meta")[];
}

export interface SelectOptionServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "select-option";
  tabId: number;
  values: string[];
}

export interface WaitForElementServerMessage extends ServerMessageBase {
  cmd: "wait-for-element";
  tabId: number;
  selector: string;
  state?: "visible" | "hidden" | "attached" | "detached";
  timeoutMs?: number;
}

export interface ReleaseTabsServerMessage extends ServerMessageBase {
  cmd: "release-tabs";
  tabIds?: number[];
}

export type ServerMessage =
  | OpenTabServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetBrowserRecentHistoryServerMessage
  | GetTabContentServerMessage
  | ReorderTabsServerMessage
  | FindHighlightServerMessage
  | GroupTabsServerMessage
  | CaptureScreenshotServerMessage
  | PageSnapshotServerMessage
  | ClickElementServerMessage
  | TypeTextServerMessage
  | ExecuteJsServerMessage
  | ScrollPageServerMessage
  | PressKeyServerMessage
  | SelectOptionServerMessage
  | WaitForElementServerMessage
  | ReleaseTabsServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
