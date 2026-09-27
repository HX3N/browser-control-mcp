// A copy of common/limits.ts: the server resolves common only at compile time, so a value import
// would fail at runtime. limits-mirror.test.ts fails when the two differ.
export const IMAGE_LIMIT_MB_RANGE = { min: 1, max: 256 };
export const FIND_MATCHES = { default: 10, max: 50 };
export const CLICK_COUNT = { default: 1, max: 3 };
export const KEY_REPEAT = { default: 1, max: 100 };
export const CAPTURE = { quality: 70, scale: 1, slices: 3, maxSlices: 8, sliceHeightPx: 2000 };
export const READ_ELEMENTS_DEFAULT = 500;
export const WAIT_TIMEOUT_MS = { selector: 5_000, text: 30_000, max: 180_000 };
export const TEXT_SETTLE_MS = { default: 800, max: 5_000 };
export const NETWORK_REQUESTS = { default: 100, max: 300 };
