/**
 * Per-tab authorization, granted from the popup.
 *
 * In allowlist mode a tab whose site is not on the list can still be worked in once the user
 * presses the authorize button while that tab is in front. What the browser hands over there is
 * "activeTab", which it revokes as soon as the tab navigates or closes, so the map below mirrors
 * that lifetime rather than owning it: the url is recorded with the grant and compared on every
 * read. The browser stays the enforcer -- this is a prediction of what it will allow, kept so a
 * command can fail with an actionable message instead of a raw permission error.
 *
 * This gates every command that touches a page, screenshots included; it is not a screenshot
 * setting. Whether a screenshot may be taken at all is the popup's tool switch.
 */

const GRANTED_BADGE_TEXT = "✓";
const REQUEST_BADGE_TEXT = "!";
const GRANTED_BADGE_COLOR = "#2b8a3e";
const REQUEST_BADGE_COLOR = "#e8590c";
const GRANTED_BADGE_TIMEOUT_MS = 2500;

interface TabAuthorization {
  // URL at the time of the grant. activeTab does not survive navigation, so a change here
  // means the grant is gone even if we never saw the tabs.onUpdated event.
  url?: string;
  grantedAt: number;
}

const authorizationByTabId = new Map<number, TabAuthorization>();

export function grantTabAuthorization(tabId: number, url?: string): void {
  authorizationByTabId.set(tabId, { url, grantedAt: Date.now() });
}

export function revokeTabAuthorization(tabId: number): void {
  authorizationByTabId.delete(tabId);
}

export function hasTabAuthorization(tabId: number, currentUrl?: string): boolean {
  const consent = authorizationByTabId.get(tabId);
  if (!consent) {
    return false;
  }
  if (currentUrl && consent.url && currentUrl !== consent.url) {
    authorizationByTabId.delete(tabId);
    return false;
  }
  return true;
}

/**
 * Marks the toolbar button on a specific tab so the user can see which tab is waiting
 * for authorization. Badge state is per-tab and disappears with the tab.
 */
export async function markTabAsAwaitingAuthorization(tabId: number): Promise<void> {
  await setBadge(tabId, REQUEST_BADGE_TEXT, REQUEST_BADGE_COLOR);
}

/**
 * Confirms to the user that their click registered, then clears the badge.
 */
export async function showAuthorizationGrantedFeedback(tabId: number): Promise<void> {
  await setBadge(tabId, GRANTED_BADGE_TEXT, GRANTED_BADGE_COLOR);
  setTimeout(() => {
    void clearBadge(tabId);
  }, GRANTED_BADGE_TIMEOUT_MS);
}

async function setBadge(
  tabId: number,
  text: string,
  color: string
): Promise<void> {
  try {
    await browser.browserAction.setBadgeText({ text, tabId });
    await browser.browserAction.setBadgeBackgroundColor({ color, tabId });
  } catch (error) {
    // The tab may have closed in the meantime - badge state is cosmetic, so don't fail
    // the capture over it.
    console.error("Failed to set browser action badge:", error);
  }
}

async function clearBadge(tabId: number): Promise<void> {
  try {
    await browser.browserAction.setBadgeText({ text: "", tabId });
  } catch (error) {
    console.error("Failed to clear browser action badge:", error);
  }
}
