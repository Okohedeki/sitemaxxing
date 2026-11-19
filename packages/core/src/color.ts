/* OKLCH colour helpers. Palettes are generated in OKLCH so lightness and chroma behave the way
   people perceive them, then converted to hex for the CSS tokens. */

export interface Oklch {
  l: number; // 0..1
  c: number; // 0..~0.37
  h: number; // degrees
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function oklchToLinearRgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  return [4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S, -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S, -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S];
}

const toSrgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const fromSrgb = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

function inGamut(rgb: [number, number, number]) {
  return rgb.every((v) => v >= -0.0005 && v <= 1.0005);
}

/** Converts to sRGB hex, reducing chroma until the colour fits the gamut. */
export function oklchToHex(color: Oklch): string {
  let c = color.c;
  let rgb = oklchToLinearRgb({ ...color, c });
  while (!inGamut(rgb) && c > 0) {
    c = Math.max(0, c - 0.004);
    rgb = oklchToLinearRgb({ ...color, c });
  }
  return '#' + rgb.map((v) => Math.round(clamp(toSrgb(clamp(v))) * 255).toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToRgb(hex).map((v) => fromSrgb(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  const H = ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  return { l: L, c: C, h: H };
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => fromSrgb(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const la = luminance(a) + 0.05;
  const lb = luminance(b) + 0.05;
  return la > lb ? la / lb : lb / la;
}

/** Moves the lightness of `fg` away from `bg` until the pair reaches `target` contrast. */
export function ensureContrast(fg: Oklch, bg: string, target: number): Oklch {
  const bgDark = luminance(bg) < 0.18;
  const out = { ...fg };
  for (let i = 0; i < 60 && contrast(oklchToHex(out), bg) < target; i++) out.l = clamp(out.l + (bgDark ? 0.012 : -0.012));
  return out;
}

export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** A plain-language name for a hue, used in variant labels. */
export function hueName(h: number, c: number): string {
  if (c < 0.03) return 'graphite';
  const names: Array<[number, string]> = [
    [15, 'rose'],
    [40, 'vermilion'],
    [60, 'rust'],
    [80, 'amber'],
    [100, 'ochre'],
    [125, 'olive'],
    [150, 'moss'],
    [175, 'jade'],
    [200, 'teal'],
    [230, 'ocean'],
    [260, 'cobalt'],
    [285, 'indigo'],
    [310, 'violet'],
    [335, 'plum'],
    [360, 'rose'],
  ];
  return (names.find(([max]) => h <= max) ?? names[0])[1];
}
