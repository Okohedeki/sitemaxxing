/* Rewrites stylesheets so the colours, text sizes and spacing they spell out in place read from
   named shared values instead. Nothing changes on screen: every value keeps exactly what it was,
   it just has one home. Later changes then edit that home. */

import postcss from 'postcss';
import { fitColor, hexToOklch, hueName, type Anchors } from './color';
import { setRootVars } from './edit/css';
import type { PatchFile } from './types';

export interface SystemizeInput {
  /** The stylesheets to rewrite. */
  sheets: Array<{ path: string; css: string }>;
  /** The file whose `:root` holds the shared values. May be one of the sheets. */
  tokensPath: string;
  tokensCss: string;
  /** The page's main colours, used to name the others by family. */
  anchors?: Anchors;
}

export interface SystemizeResult {
  files: PatchFile[];
  /** Shared values added, in the order they are written. */
  added: Record<string, string>;
  moved: { color: number; size: number; space: number };
}

const SPACE_PROP = /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;
const HEX = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/gi;
const FN = /\b(rgba?|hsla?)\(((?:[^()]|\([^()]*\))*)\)/gi;
const LEN = /^(-?)(\d*\.?\d+)(px|rem)$/;
const ROOT = /(^|,)\s*(:root|html)\s*(,|$)/;

const h2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

interface Parsed {
  hex: string;
  /** A number from 0 to 1, or an expression such as `var(--x, 1)`. */
  alpha: number | string;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function parseHex(raw: string): Parsed {
  const h = raw.length <= 4 ? [...raw].map((x) => x + x).join('') : raw;
  return { hex: `#${h.slice(0, 6).toLowerCase()}`, alpha: h.length === 8 ? Math.round((parseInt(h.slice(6), 16) / 255) * 1000) / 1000 : 1 };
}

function parseFn(name: string, inner: string): Parsed | null {
  let body = inner;
  let alpha: string | undefined;
  const slash = inner.indexOf('/');
  if (slash >= 0) {
    body = inner.slice(0, slash);
    alpha = inner.slice(slash + 1).trim();
  }
  const parts = body.split(/[\s,]+/).filter(Boolean);
  if (slash < 0 && parts.length === 4) alpha = parts.pop();
  if (parts.length !== 3 || parts.some((p) => !/^-?\d*\.?\d+(%|deg)?$/.test(p))) return null;
  const n = parts.map(parseFloat);
  const rgb = name.toLowerCase().startsWith('hsl') ? hslToRgb(((n[0] % 360) + 360) % 360, n[1] / 100, n[2] / 100) : n.map((v, i) => (parts[i].endsWith('%') ? v * 2.55 : v));
  const hex = `#${h2(rgb[0])}${h2(rgb[1])}${h2(rgb[2])}`;
  if (alpha === undefined) return { hex, alpha: 1 };
  if (/^\d*\.?\d+%?$/.test(alpha)) return { hex, alpha: alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha) };
  return { hex, alpha };
}

/** The whole value is one opaque colour: such a root property already is a shared value. */
export function pureColor(value: string): string | null {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) return parseHex(m[1]).hex;
  m = v.match(/^(rgba?|hsla?)\(((?:[^()]|\([^()]*\))*)\)$/i);
  const p = m ? parseFn(m[1], m[2]) : null;
  return p && p.alpha === 1 ? p.hex : null;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', '_');

export function systemize(input: SystemizeInput): SystemizeResult {
  const roots = new Map<string, postcss.Root>();
  const parse = (path: string, css: string) => {
    try {
      roots.set(path, postcss.parse(css));
    } catch {
      /* a sheet that does not parse is left alone */
    }
  };
  for (const s of input.sheets) parse(s.path, s.css);
  const moved = { color: 0, size: 0, space: 0 };
  const added: Record<string, string> = {};

  // Shared colours the project already has: a literal equal to one of them reads from it.
  const byHex = new Map<string, string>();
  const taken = new Set<string>();
  let remRoot = true;
  const scan = (root: postcss.Root) =>
    root.walkDecls((d) => {
      const rule = d.parent as postcss.Rule | undefined;
      if (rule?.type !== 'rule' || !ROOT.test(rule.selector)) return;
      if (d.prop === 'font-size' && !/^(16px|100%|1rem|medium)$/.test(d.value.trim())) remRoot = false;
      if (!d.prop.startsWith('--')) return;
      taken.add(d.prop);
      const hex = pureColor(d.value);
      if (hex && (!byHex.has(hex) || d.prop.length < byHex.get(hex)!.length)) byHex.set(hex, d.prop);
    });
  for (const r of roots.values()) scan(r);
  if (!roots.has(input.tokensPath)) {
    try {
      scan(postcss.parse(input.tokensCss));
    } catch {
      /* no readable tokens file: every value gets a new name */
    }
  }

  const fresh = (base: string) => {
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base}-${i}`;
    taken.add(name);
    return name;
  };
  const colorToken = (hex: string): string => {
    const have = byHex.get(hex);
    if (have) return have;
    const { l, c, h } = hexToOklch(hex);
    const step = Math.max(50, Math.min(950, Math.round(((1 - l) * 1000) / 50) * 50));
    const fit = input.anchors ? fitColor(hex, input.anchors) : null;
    const family = fit ? (fit.family === 'neutral' ? 'neutral' : 'accent') : c < 0.03 ? 'neutral' : hueName(h, c);
    const name = fresh(`--${family}-${step}`);
    byHex.set(hex, name);
    added[name] = hex;
    return name;
  };
  const lengths = new Map<string, string>();
  const lengthToken = (kind: 'text' | 'space', n: number, unit: string): string | null => {
    if (unit === 'rem' && !remRoot) return null;
    const px = unit === 'rem' ? n * 16 : n;
    const key = `${kind}:${px}`;
    let name = lengths.get(key);
    if (!name) {
      name = fresh(`--${kind}-${fmt(px)}`);
      lengths.set(key, name);
      added[name] = `${n}${unit}`;
    }
    return name;
  };

  const mixed = (token: string, alpha: number | string): string | null => {
    if (alpha === 1) return `var(${token})`;
    if (alpha === 0) return null;
    const share = typeof alpha === 'number' ? `${Math.round(alpha * 10000) / 100}%` : `calc(${alpha} * 100%)`;
    return `color-mix(in srgb, var(${token}) ${share}, transparent)`;
  };
  const colors = (value: string): string => {
    const swap = (whole: string, parsed: Parsed | null) => {
      const out = parsed ? mixed(colorToken(parsed.hex), parsed.alpha) : null;
      if (out) moved.color++;
      return out ?? whole;
    };
    return value.replace(FN, (whole, name: string, inner: string) => swap(whole, parseFn(name, inner))).replace(HEX, (whole, raw: string) => swap(whole, parseHex(raw)));
  };
  const lengthsIn = (value: string, kind: 'text' | 'space'): string => {
    if (value.includes('(')) return value;
    return value
      .split(/\s+/)
      .map((part) => {
        const m = part.match(LEN);
        if (!m || parseFloat(m[2]) === 0) return part;
        const token = lengthToken(kind, parseFloat(m[2]), m[3]);
        if (!token) return part;
        moved[kind === 'text' ? 'size' : 'space']++;
        return m[1] ? `calc(var(${token}) * -1)` : `var(${token})`;
      })
      .join(' ');
  };

  for (const root of roots.values())
    root.walkDecls((d) => {
      const prop = d.prop.toLowerCase();
      const rule = d.parent as postcss.Rule | undefined;
      const onRoot = rule?.type === 'rule' && ROOT.test(rule.selector);
      if (prop.startsWith('--') && onRoot && pureColor(d.value)) return;
      if (/url\(/i.test(d.value)) return;
      let value = colors(d.value);
      if (prop === 'font-size') value = lengthsIn(value, 'text');
      else if (SPACE_PROP.test(prop)) value = lengthsIn(value, 'space');
      if (value !== d.value) d.value = value;
    });

  // Written in a readable order: neutrals light to dark, then the other colours, then the scales.
  const light = (name: string) => -hexToOklch(added[name]).l;
  const num = (name: string) => parseFloat(name.replace(/^--(text|space)-/, '').replace('_', '.'));
  const rank = (name: string) => (name.startsWith('--neutral') ? 0 : name.startsWith('--text-') ? 3 : name.startsWith('--space-') ? 4 : name.startsWith('--accent') ? 1 : 2);
  const ordered = Object.fromEntries(
    Object.keys(added)
      .sort((a, b) => rank(a) - rank(b) || (rank(a) >= 3 ? num(a) - num(b) : light(a) - light(b)))
      .map((k) => [k, added[k]]),
  );

  const out = new Map<string, string>();
  for (const s of input.sheets) out.set(s.path, roots.get(s.path)?.toString() ?? s.css);
  const before = new Map(input.sheets.map((s) => [s.path, s.css]));
  if (!before.has(input.tokensPath)) {
    before.set(input.tokensPath, input.tokensCss);
    out.set(input.tokensPath, input.tokensCss);
  }
  if (Object.keys(ordered).length) out.set(input.tokensPath, setRootVars(out.get(input.tokensPath) ?? '', ordered));
  const files = [...out].map(([path, after]) => ({ path, before: before.get(path) ?? '', after })).filter((f) => f.before !== f.after);
  return { files, added: ordered, moved };
}
