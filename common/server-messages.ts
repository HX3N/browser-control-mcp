export interface ServerMessageBase {
  cmd: string;
}

export interface OpenTabServerMessage extends ServerMessageBase {
  cmd: "open-tab";
  url: string;
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

export interface ReadPageServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "read-page";
  tabId: number;
  offset?: number;
  maxElements?: number;
  includeSelectors?: boolean;
  includeHrefs?: boolean;
  full?: boolean;
  controlsOnly?: boolean;
}

export interface FindHighlightServerMessage extends ServerMessageBase {
  cmd: "find-highlight";
  tabId: number;
  queryPhrase: string;
  maxMatches?: number;
  caseSensitive?: boolean;
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

export interface OriginGuarded {
  expectedOrigin?: string;
}

export interface ElementTarget {
  ref?: string;
  selector?: string;
  index?: number;
}

export type KeyModifier = "Control" | "Shift" | "Alt" | "Meta";

export interface ClickElementServerMessage
  extends ServerMessageBase,
    ElementTarget,
    OriginGuarded {
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
    ElementTarget,
    OriginGuarded {
  cmd: "drag-element";
  tabId: number;
  to: ElementTarget;
}

export interface UploadFile {
  name: string;
  mimeType: string;
  // The whole file when it fits in one chunk; otherwise the chunks were staged under uploadId
  base64?: string;
  uploadId?: string;
}

export interface UploadFilesServerMessage
  extends ServerMessageBase,
    ElementTarget,
    OriginGuarded {
  cmd: "upload-files";
  tabId: number;
  files: UploadFile[];
}

export interface UploadChunkServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "upload-chunk";
  tabId: number;
  uploadId: string;
  base64: string;
}

export interface DownloadFileServerMessage
  extends ServerMessageBase,
    ElementTarget {
  cmd: "download-file";
  tabId: number;
  url?: string;
  filename?: string;
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
    ElementTarget,
    OriginGuarded {
  cmd: "type-text";
  tabId: number;
  text: string;
  clearFirst?: boolean;
  submit?: boolean;
  clickAfter?: ElementTarget;
}

export interface ExecuteJsServerMessage
  extends ServerMessageBase,
    OriginGuarded {
  cmd: "execute-js";
  tabId: number;
  code: string;
  frameRef?: string;
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
    ElementTarget,
    OriginGuarded {
  cmd: "press-key";
  tabId: number;
  key: string;
  modifiers?: KeyModifier[];
  repeat?: number;
}

export interface SelectOptionServerMessage
  extends ServerMessageBase,
    ElementTarget,
    OriginGuarded {
  cmd: "select-option";
  tabId: number;
  values: string[];
}

export type ElementWaitState = "visible" | "hidden" | "attached" | "detached";

export interface WaitForPageServerMessage extends ServerMessageBase {
  cmd: "wait-for-page";
  tabId: number;
  selector?: string;
  state?: ElementWaitState;
  timeoutMs?: number;
  settleMs?: number;
  within?: ElementTarget;
}

export type ServerMessage =
  | OpenTabServerMessage
  | NavigateTabServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetBrowserRecentHistoryServerMessage
  | ReadPageServerMessage
  | FindHighlightServerMessage
  | CaptureScreenshotServerMessage
  | GetPageMediaServerMessage
  | FetchMediaServerMessage
  | ClickElementServerMessage
  | HoverElementServerMessage
  | DragElementServerMessage
  | UploadFilesServerMessage
  | UploadChunkServerMessage
  | DownloadFileServerMessage
  | ResizeWindowServerMessage
  | GetNetworkRequestsServerMessage
  | TypeTextServerMessage
  | ExecuteJsServerMessage
  | ScrollPageServerMessage
  | PressKeyServerMessage
  | SelectOptionServerMessage
  | WaitForPageServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
