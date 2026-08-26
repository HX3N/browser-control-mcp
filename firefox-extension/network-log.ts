import type { NetworkRequestRecord } from "@browser-control-mcp/common";

const MAX_REQUESTS_PER_TAB = 300;

interface OpenRequest {
  record: NetworkRequestRecord;
  tabId: number;
}

const byTabId = new Map<number, NetworkRequestRecord[]>();
const openByRequestId = new Map<string, OpenRequest>();

function remember(tabId: number, record: NetworkRequestRecord): void {
  const records = byTabId.get(tabId) ?? [];
  records.push(record);
  while (records.length > MAX_REQUESTS_PER_TAB) {
    records.shift();
  }
  byTabId.set(tabId, records);
}

function onBeforeRequest(details: browser.webRequest._OnBeforeRequestDetails): void {
  if (details.tabId < 0) {
    return;
  }
  if (details.type === "main_frame") {
    byTabId.delete(details.tabId);
  }
  const record: NetworkRequestRecord = {
    method: details.method,
    url: details.url,
    type: details.type,
    startedAt: details.timeStamp,
  };
  openByRequestId.set(details.requestId, { record, tabId: details.tabId });
  remember(details.tabId, record);
}

function settle(
  requestId: string,
  timeStamp: number,
  outcome: Partial<NetworkRequestRecord>
): void {
  const open = openByRequestId.get(requestId);
  if (!open) {
    return;
  }
  openByRequestId.delete(requestId);
  Object.assign(open.record, outcome, {
    durationMs: Math.round(timeStamp - open.record.startedAt),
  });
}

function onCompleted(details: browser.webRequest._OnCompletedDetails): void {
  settle(details.requestId, details.timeStamp, {
    status: details.statusCode,
    fromCache: details.fromCache,
  });
}

function onErrorOccurred(
  details: browser.webRequest._OnErrorOccurredDetails
): void {
  settle(details.requestId, details.timeStamp, { error: details.error });
}

export function startNetworkLog(): void {
  const filter = { urls: ["<all_urls>"] };
  browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, filter);
  browser.webRequest.onCompleted.addListener(onCompleted, filter);
  browser.webRequest.onErrorOccurred.addListener(onErrorOccurred, filter);
}

export function readNetworkLog(
  tabId: number,
  options: { urlPattern?: string; limit?: number; clear?: boolean }
): { requests: NetworkRequestRecord[]; total: number } {
  const all = byTabId.get(tabId) ?? [];
  const matching = options.urlPattern
    ? all.filter((record) => record.url.includes(options.urlPattern!))
    : all;
  const limit = Math.max(1, options.limit ?? 100);
  const requests = matching.slice(-limit).map((record) => ({ ...record }));
  if (options.clear) {
    if (options.urlPattern) {
      byTabId.set(
        tabId,
        all.filter((record) => !matching.includes(record))
      );
    } else {
      byTabId.delete(tabId);
    }
  }
  return { requests, total: matching.length };
}

export function forgetNetworkLog(tabId: number): void {
  byTabId.delete(tabId);
}
