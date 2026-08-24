import {
  getPermissionMode,
  isDomainInDenyList,
  isOriginAllowed,
  PermissionMode,
} from "./extension-config";
import { hasTabAuthorization, markTabAsAwaitingAuthorization } from "./tab-authorization";

export interface TabAccessGrant {
  mode: PermissionMode;
  // True when the grant came from an explicit per-tab authorization, which carries activeTab
  // and therefore already covers scripting and capture without a host permission.
  viaTabAuthorization: boolean;
}

export async function ensureTabAccess(
  tab: browser.tabs.Tab
): Promise<TabAccessGrant> {
  const mode = await getPermissionMode();
  const url = tab.url;

  if (url && (await isDomainInDenyList(url))) {
    throw new Error(`Domain in tab URL is in the deny list`);
  }

  if (mode === "denylist") {
    return { mode, viaTabAuthorization: false };
  }

  if (await isOriginAllowed(url)) {
    return { mode, viaTabAuthorization: false };
  }

  if (tab.id !== undefined && hasTabAuthorization(tab.id, url)) {
    return { mode, viaTabAuthorization: true };
  }

  if (tab.id !== undefined) {
    await markTabAsAwaitingAuthorization(tab.id);
  }
  throw new Error(
    `The extension is in allowlist mode and tab ${tab.id} ("${
      tab.title ?? url
    }") has not been authorized. The extension's toolbar button is now marked with a "!" badge on that tab. ` +
      `Ask the user to open the Browser Control MCP popup while that tab is in front and press the authorize button, then try again. ` +
      `The authorization covers only that tab and ends when the tab navigates or closes, unless the user chooses to always allow the site.`
  );
}

export async function hasAllUrlsPermission(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: ["<all_urls>"] });
  } catch (error) {
    console.error("Failed to read the broad host permission:", error);
    return false;
  }
}
