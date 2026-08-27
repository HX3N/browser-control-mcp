import {
  DEFAULT_IMAGE_LIMIT_BYTES,
  IMAGE_LIMIT_MB_RANGE,
  getImageLimitBytes,
  getStoredImageLimitMb,
  setImageLimitMb,
} from "../extension-config";

describe("image limit", () => {
  let stored: { config?: Record<string, unknown> };

  beforeEach(() => {
    stored = { config: { secret: "s" } };
    (browser.storage.local.get as jest.Mock).mockImplementation(async () => stored);
    (browser.storage.local.set as jest.Mock).mockImplementation(async (value) => {
      stored = value;
    });
  });

  it("reports nothing stored and falls back to the default", async () => {
    expect(await getStoredImageLimitMb()).toBeNull();
    expect(await getImageLimitBytes()).toBe(DEFAULT_IMAGE_LIMIT_BYTES);
  });

  it("keeps what was stored", async () => {
    await setImageLimitMb(20);
    expect(await getImageLimitBytes()).toBe(20 * 1024 * 1024);
  });

  it("clamps into range and clears back to the default on null", async () => {
    await setImageLimitMb(100000);
    expect(await getStoredImageLimitMb()).toBe(IMAGE_LIMIT_MB_RANGE.max);
    await setImageLimitMb(null);
    expect(await getStoredImageLimitMb()).toBeNull();
    expect(await getImageLimitBytes()).toBe(DEFAULT_IMAGE_LIMIT_BYTES);
  });
});
