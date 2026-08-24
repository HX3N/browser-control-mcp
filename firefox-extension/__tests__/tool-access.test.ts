import {
  DISABLED_BY_DEFAULT_TOOL_IDS,
  INTERACTION_TOOL_IDS,
} from "../extension-config";
import { hasAllUrlsPermission } from "../tab-access";

describe("popup tool switches", () => {
  it("exposes screenshots next to the other interaction switches", () => {
    expect(INTERACTION_TOOL_IDS).toContain("capture-tab-screenshot");
  });

  it("leaves screenshots on by default", () => {
    expect(DISABLED_BY_DEFAULT_TOOL_IDS).not.toContain("capture-tab-screenshot");
  });
});

describe("hasAllUrlsPermission", () => {
  afterEach(() => {
    (browser.permissions.contains as jest.Mock).mockReset();
  });

  it("asks for the literal permission captureVisibleTab requires", async () => {
    (browser.permissions.contains as jest.Mock).mockResolvedValue(true);

    await expect(hasAllUrlsPermission()).resolves.toBe(true);
    expect(browser.permissions.contains).toHaveBeenCalledWith({
      origins: ["<all_urls>"],
    });
  });

  it("reports false when the permission is missing", async () => {
    (browser.permissions.contains as jest.Mock).mockResolvedValue(false);

    await expect(hasAllUrlsPermission()).resolves.toBe(false);
  });
});
