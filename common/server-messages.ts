export interface ServerMessageBase {
  cmd: string;
}

export interface OpenTabServerMessage extends ServerMessageBase {
  cmd: "open-tab";
  url: string;
  cookieStoreId?: string;
}

export interface NavigateTabServerMessage extends ServerMessageBase {
  cmd: "navigate-tab";
  tabId: number;
  url: string;
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

export interface GetTabContentServerMessage
  extends ServerMessageBase,
    ElementTarget {
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

export interface CaptureScreenshotServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "capture-screenshot";
  tabId: number;
  format?: "jpeg" | "png";
  quality?: number;
  scale?: number;
  maxSlices?: number;
  region?: ViewportRegion;
}

export interface ViewportRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GetPageMediaServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "get-media";
  tabId: number;
}

export interface FetchMediaServerMessage extends ServerMessageBase {
  cmd: "fetch-media";
  tabId: number;
  url: string;
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

export type KeyModifier = "Control" | "Shift" | "Alt" | "Meta";

export interface ClickElementServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "click-element";
  tabId: number;
  button?: "left" | "middle" | "right";
  clickCount?: number;
  modifiers?: KeyModifier[];
}

export interface HoverElementServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "hover-element";
  tabId: number;
}

export interface DragElementServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "drag-element";
  tabId: number;
  to: ElementTarget;
}

export interface UploadFile {
  name: string;
  mimeType: string;
  base64: string;
}

export interface UploadFilesServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "upload-files";
  tabId: number;
  files: UploadFile[];
}

export interface ResizeWindowServerMessage extends ServerMessageBase {
  cmd: "resize-window";
  tabId: number;
  width: number;
  height: number;
}

export interface GetNetworkRequestsServerMessage extends ServerMessageBase {
  cmd: "get-network-requests";
  tabId: number;
  urlPattern?: string;
  clear?: boolean;
  limit?: number;
}

export interface TypeTextServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "type-text";
  tabId: number;
  text: string;
  clearFirst?: boolean;
  submit?: boolean;
  clickAfter?: ElementTarget;
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
  direction: "up" | "down" | "left" | "right" | "top" | "bottom" | "element";
  amount?: number;
}

export interface PressKeyServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "press-key";
  tabId: number;
  key: string;
  modifiers?: KeyModifier[];
  repeat?: number;
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
  within?: ElementTarget;
}

export interface WaitForTextChangeServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "wait-for-text-change";
  tabId: number;
  timeoutMs?: number;
  settleMs?: number;
  minChars?: number;
}

export interface ReleaseTabsServerMessage extends ServerMessageBase {
  cmd: "release-tabs";
  tabIds?: number[];
}

export type ServerMessage =
  | OpenTabServerMessage
  | NavigateTabServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetBrowserRecentHistoryServerMessage
  | GetTabContentServerMessage
  | ReorderTabsServerMessage
  | FindHighlightServerMessage
  | GroupTabsServerMessage
  | CaptureScreenshotServerMessage
  | GetPageMediaServerMessage
  | FetchMediaServerMessage
  | PageSnapshotServerMessage
  | ClickElementServerMessage
  | HoverElementServerMessage
  | DragElementServerMessage
  | UploadFilesServerMessage
  | ResizeWindowServerMessage
  | GetNetworkRequestsServerMessage
  | TypeTextServerMessage
  | ExecuteJsServerMessage
  | ScrollPageServerMessage
  | PressKeyServerMessage
  | SelectOptionServerMessage
  | WaitForElementServerMessage
  | WaitForTextChangeServerMessage
  | ReleaseTabsServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
