import { clamp01, hexToHsv, hsvToHex } from "../color";
import { DEFAULT_OVERLAY_COLORS } from "../extension-config";

describe("colour conversion", () => {
  const shipped = [
    ...Object.values(DEFAULT_OVERLAY_COLORS.accents),
    ...DEFAULT_OVERLAY_COLORS.aurora,
  ];

  it("round-trips every colour the extension ships with", () => {
    for (const hex of shipped) {
      const hsv = hexToHsv(hex);
      expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(hex);
    }
  });

  it("round-trips the extremes", () => {
    for (const hex of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff"]) {
      const hsv = hexToHsv(hex);
      expect(hsvToHex(hsv.h, hsv.s, hsv.v)).toBe(hex);
    }
  });

  it("reads the hue of the primaries", () => {
    expect(Math.round(hexToHsv("#ff0000").h)).toBe(0);
    expect(Math.round(hexToHsv("#00ff00").h)).toBe(120);
    expect(Math.round(hexToHsv("#0000ff").h)).toBe(240);
  });

  it("treats greys as unsaturated", () => {
    expect(hexToHsv("#808080").s).toBe(0);
    expect(hexToHsv("#000000").s).toBe(0);
  });

  it("falls back to black on anything that is not a six-digit hex", () => {
    for (const bad of ["", "#fff", "rgb(1, 2, 3)", "#gggggg", "not a colour"]) {
      expect(hexToHsv(bad)).toEqual({ h: 0, s: 0, v: 0 });
    }
  });

  it("keeps a knob position inside the surface", () => {
    expect(clamp01(-0.4)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(0.42)).toBe(0.42);
  });
});
