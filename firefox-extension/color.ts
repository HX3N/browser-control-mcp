export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function hexToHsv(hex: string): Hsv {
  if (!HEX_COLOR.test(hex)) {
    return { h: 0, s: 0, v: 0 };
  }

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;

  let h = 0;
  if (span !== 0) {
    if (max === r) {
      h = 60 * (((g - b) / span + 6) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / span + 2);
    } else {
      h = 60 * ((r - g) / span + 4);
    }
  }

  return { h, s: max === 0 ? 0 : span / max, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}
