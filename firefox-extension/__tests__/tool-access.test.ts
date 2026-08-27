import {
  DISABLED_BY_DEFAULT_TOOL_IDS,
  INTERACTION_TOOL_IDS,
  getAllToolSettings,
  isToolEnabled,
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

describe("stored tool settings", () => {
  let stored: { config?: Record<string, unknown> };

  beforeEach(() => {
    (browser.storage.local.get as jest.Mock).mockImplementation(async () => stored);
  });

  it("shows a switch saved before the tool existed the way the gate reads it", async () => {
    stored = { config: { secret: "s", toolSettings: { "open-browser-tab": true } } };

    const settings = await getAllToolSettings();
    expect(settings["upload-files"]).toBe(false);
    expect(settings["download-file"]).toBe(false);
    expect(settings["open-browser-tab"]).toBe(true);
    expect(await isToolEnabled("upload-files")).toBe(false);
  });

  it("keeps a switch the user turned on", async () => {
    stored = { config: { secret: "s", toolSettings: { "upload-files": true } } };

    expect((await getAllToolSettings())["upload-files"]).toBe(true);
    expect(await isToolEnabled("upload-files")).toBe(true);
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
