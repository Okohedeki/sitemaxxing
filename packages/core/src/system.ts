/* Reads the design system a project already has, from its rendered page and its stylesheets:
   which colours play which role, the type sizes, the spacing steps, the repeated components, the
   motion, and how much of the styling comes from one shared set of values. Pure: no browser. */

import postcss from 'postcss';
import { contrast, hexToOklch, hexToRgb } from './color';
import type { SnapNode, SnapshotDOM } from './types';

/** `inverse` is text that only sits on filled boxes, such as the label on a solid button. */
export type ColorRole =
  | 'background'
  | 'surface'
  | 'ink'
  | 'soft'
  | 'inverse'
  | 'accent'
  | 'border'
  | 'other';

export interface ColorUse {
  hex: string;
  role: ColorRole;
  /** Share of all filled area on the page, 0 to 1. */
  fill: number;
  /** Share of all text on the page, 0 to 1. */
  text: number;
  /** Elements with a border in this colour. */
  borders: number;
  /** Elements using it at all. */
  uses: number;
}

export interface ComponentVariant {
  count: number;
  /** One element that looks like this. */
  selector: string;
  look: Record<string, string>;
}

export interface ComponentGroup {
  kind: 'button' | 'field' | 'card';
  count: number;
  variants: ComponentVariant[];
}

export interface Usage {
  color: number;
  size: number;
  space: number;
}

export interface SystemFinding {
  area: 'color' | 'type' | 'space' | 'shape' | 'components' | 'source';
  message: string;
}

export interface SystemReading {
  colors: ColorUse[];
  /** Colours that are almost, but not exactly, another colour on the page. */
  nearDuplicates: number;
  type: {
    families: Array<{ family: string; role: 'display' | 'body' | 'other'; share: number }>;
    /** `weight`, `lineHeight` (a multiple of the size) and `family` are the usual ones at that size. */
    sizes: Array<{
      px: number;
      count: number;
      share: number;
      weight?: number;
      lineHeight?: number;
      family?: string;
    }>;
    /** The size most of the text is set in. */
    base: number;
    /** The typical step between neighbouring sizes, or null when there are too few to tell. */
    ratio: number | null;
    weights: number[];
  };
  space: {
    /** The grid most values sit on: 8 or 4. */
    unit: number;
    /** Share of spacing values that sit on that grid, 0 to 1. */
    onGrid: number;
    steps: Array<{ px: number; count: number }>;
  };
  shape: {
    radii: Array<{ px: number; count: number }>;
    shadows: Array<{ value: string; count: number }>;
  };
  components: ComponentGroup[];
  motion: { animations: string[]; durations: Array<{ ms: number; count: number }> };
  source: {
    /** Custom properties declared on the root. */
    tokens: number;
    /** Values written in place, by kind. */
    literal: Usage;
    /** Values that read a custom property, by kind. */
    tokenised: Usage;
    /** Share of colour, size and spacing values that read a custom property; null with no styles. */
    coverage: number | null;
  };
  findings: SystemFinding[];
}

// ---------- colour parsing ----------

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses the colour forms a browser reports for computed styles. */
export function parseColor(value: string | undefined): Rgba | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const n = p.map((x) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x)));
    const ch = (i: number) => (p[i].endsWith('%') ? n[i] * 255 : n[i]);
    return { r: ch(0), g: ch(1), b: ch(2), a: p.length > 3 ? n[3] : 1 };
  }
  m = v.match(/^color\(srgb\s+([^)]+)\)$/);
  if (m) {
    const p = m[1]
      .split(/[\s/]+/)
      .filter(Boolean)
      .map(parseFloat);
    if (p.length < 3) return null;
    return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
  }
  m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const [r, g, b] = hexToRgb(v);
    return { r, g, b, a: 1 };
  }
  return null;
}

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
const toHex = (c: { r: number; g: number; b: number }) => `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;

function over(top: Rgba, under: string): string {
  const [r, g, b] = hexToRgb(under);
  return toHex({
    r: top.r * top.a + r * (1 - top.a),
    g: top.g * top.a + g * (1 - top.a),
    b: top.b * top.a + b * (1 - top.a),
  });
}

function labDistance(a: string, b: string): number {
  const x = hexToOklch(a);
  const y = hexToOklch(b);
  const ax = x.c * Math.cos((x.h * Math.PI) / 180);
  const ay = x.c * Math.sin((x.h * Math.PI) / 180);
  const bx = y.c * Math.cos((y.h * Math.PI) / 180);
  const by = y.c * Math.sin((y.h * Math.PI) / 180);
  return Math.hypot(x.l - y.l, ax - bx, ay - by);
}

// ---------- helpers ----------

const px = (v: string | undefined): number => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number, step = 1) => Math.round(n / step) * step;

function tally<K>(items: K[]): Array<{ key: K; count: number }> {
  const m = new Map<K, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

const INTERACTIVE = new Set(['a', 'button']);

// ---------- the page ----------

interface Tone {
  hex: string;
  fill: number;
  text: number;
  borders: number;
  uses: number;
  /** Uses on links and buttons. */
  acts: number;
}

function readPage(dom: SnapshotDOM) {
  const nodes = dom.nodes;
  const body = nodes[0];
  const pageBg = (() => {
    const c = parseColor(body?.styles.backgroundColor);
    return c && c.a > 0.5 ? toHex(c) : '#ffffff';
  })();

  // The colour actually behind each element.
  const behind: string[] = [];
  const ownFill: Array<string | null> = [];
  for (const n of nodes) {
    const parentBg = n.parent >= 0 ? behind[n.parent] : pageBg;
    const c = parseColor(n.styles.backgroundColor);
    const own = c && c.a > 0.5 ? over(c, parentBg) : null;
    ownFill[n.index] = own;
    behind[n.index] = own ?? parentBg;
  }
  const acts = (n: SnapNode): boolean => {
    for (
      let cur: SnapNode | undefined = n, i = 0;
      cur && i < 4;
      cur = cur.parent >= 0 ? nodes[cur.parent] : undefined, i++
    )
      if (INTERACTIVE.has(cur.tag) || cur.attrs.role === 'button') return true;
    return false;
  };
  const hasText = (n: SnapNode) => n.text.length > 0;
  /** Elements that carry their own words, so nested text is counted once. */
  const textNodes = nodes.filter(
    (n) => hasText(n) && !n.children.some((c) => hasText(nodes[c])) && n.box.w > 0 && n.box.h > 0,
  );

  const tones = new Map<string, Tone>();
  const tone = (hex: string): Tone => {
    let t = tones.get(hex);
    if (!t) tones.set(hex, (t = { hex, fill: 0, text: 0, borders: 0, uses: 0, acts: 0 }));
    return t;
  };
  tone(pageBg).fill += dom.viewport.width * dom.viewport.height;
  for (const n of nodes) {
    const own = ownFill[n.index];
    if (own && n.index > 0) {
      const t = tone(own);
      t.fill += n.box.w * n.box.h;
      t.uses++;
      if (acts(n)) t.acts++;
    }
    if (px(n.styles.borderTopWidth) > 0) {
      const c = parseColor(n.styles.borderTopColor);
      if (c && c.a > 0.1) {
        const t = tone(over(c, behind[n.index]));
        t.borders++;
        t.uses++;
      }
    }
  }
  for (const n of textNodes) {
    const c = parseColor(n.styles.color);
    if (!c || c.a < 0.1) continue;
    const t = tone(over(c, behind[n.index]));
    t.text += n.text.length * px(n.styles.fontSize);
    t.uses++;
    if (acts(n)) t.acts++;
  }
  return { pageBg, tones: [...tones.values()], textNodes, ownFill, behind, acts };
}

function readColors(pageBg: string, raw: Tone[]): { colors: ColorUse[]; nearDuplicates: number } {
  // Fold colours nobody could tell apart into the heavier one, and count the ones folded.
  const sorted = [...raw].sort((a, b) => b.uses - a.uses);
  const kept: Tone[] = [];
  let nearDuplicates = 0;
  for (const t of sorted) {
    const twin = kept.find((k) => k.hex !== t.hex && labDistance(k.hex, t.hex) < 0.02);
    if (!twin) {
      kept.push({ ...t });
      continue;
    }
    nearDuplicates++;
    twin.fill += t.fill;
    twin.text += t.text;
    twin.borders += t.borders;
    twin.uses += t.uses;
    twin.acts += t.acts;
  }
  const fillTotal = kept.reduce((s, t) => s + t.fill, 0) || 1;
  const textTotal = kept.reduce((s, t) => s + t.text, 0) || 1;
  const bg = kept.find((t) => t.hex === pageBg) ?? [...kept].sort((a, b) => b.fill - a.fill)[0];
  // The ink is the strongest colour that carries a real share of the text, not simply the most used.
  const carries = kept.filter((t) => t.text / textTotal >= 0.1);
  const ink = (carries.length ? carries : kept.filter((t) => t.text > 0)).sort(
    (a, b) => contrast(b.hex, bg.hex) - contrast(a.hex, bg.hex),
  )[0];
  const chroma = (t: Tone) => hexToOklch(t.hex).c;
  const accent = kept
    .filter((t) => t !== ink && t !== bg && chroma(t) > 0.07)
    .map((t) => ({ t, score: chroma(t) * (1 + t.acts * 2) * Math.log(2 + t.uses) }))
    .sort((a, b) => b.score - a.score)[0]?.t;

  const roleOf = (t: Tone): ColorRole => {
    if (t === bg) return 'background';
    if (t === ink && t.text > 0) return 'ink';
    if (t === accent) return 'accent';
    if (t.fill === 0 && t.text === 0) return 'border';
    if (chroma(t) > 0.07) return 'other';
    // A neutral that fills boxes is a surface, even when it is also the text on a dark button.
    if (t.fill > 0 && t.text / textTotal < 0.15) return 'surface';
    return contrast(t.hex, bg.hex) < 1.6 ? 'inverse' : 'soft';
  };
  const order: ColorRole[] = [
    'background',
    'surface',
    'ink',
    'soft',
    'inverse',
    'accent',
    'other',
    'border',
  ];
  const colors = kept
    .map((t) => ({
      hex: t.hex,
      role: roleOf(t),
      fill: t.fill / fillTotal,
      text: t.text / textTotal,
      borders: t.borders,
      uses: t.uses,
    }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || b.uses - a.uses);
  return { colors, nearDuplicates };
}

function readType(dom: SnapshotDOM, textNodes: SnapNode[]): SystemReading['type'] {
  // Build tools rename fonts ("__Name_1a2b3c"); show the name the designer chose.
  const family = (n: SnapNode) =>
    (n.styles.fontFamily ?? '')
      .split(',')[0]
      .replace(/["']/g, '')
      .trim()
      .replace(/^__/, '')
      .replace(/_[0-9a-f]{6}$/i, '')
      .replace(/_/g, ' ');
  const weightOf = (n: SnapNode) => n.text.length;
  const total = textNodes.reduce((s, n) => s + weightOf(n), 0) || 1;

  const fam = new Map<string, number>();
  for (const n of textNodes) fam.set(family(n), (fam.get(family(n)) ?? 0) + weightOf(n));
  const biggest = [...textNodes].sort((a, b) => px(b.styles.fontSize) - px(a.styles.fontSize))[0];
  const bodyFamily = [...fam].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const displayFamily = biggest ? family(biggest) : bodyFamily;
  const families = [...fam]
    .filter(([f]) => f)
    .map(([f, w]) => ({
      family: f,
      role: (f === bodyFamily ? 'body' : f === displayFamily ? 'display' : 'other') as
        | 'display'
        | 'body'
        | 'other',
      share: w / total,
    }))
    .sort((a, b) => b.share - a.share);
  // One family doing both jobs is the display face too.
  if (families.length && displayFamily === bodyFamily) families[0].role = 'body';

  const bySize = new Map<number, { count: number; weight: number; nodes: SnapNode[] }>();
  for (const n of textNodes) {
    const s = round(px(n.styles.fontSize), 0.5);
    if (!s) continue;
    const e = bySize.get(s) ?? { count: 0, weight: 0, nodes: [] };
    e.count++;
    e.weight += weightOf(n);
    e.nodes.push(n);
    bySize.set(s, e);
  }
  const usual = <T>(xs: T[]): T | undefined => tally(xs)[0]?.key;
  const sizes = [...bySize]
    .map(([p, e]) => {
      const leading = usual(
        e.nodes.map((n) => px(n.styles.lineHeight)).filter((v) => v > 0),
      );
      return {
        px: p,
        count: e.count,
        share: e.weight / total,
        weight: usual(e.nodes.map((n) => parseInt(n.styles.fontWeight ?? '', 10)).filter(Boolean)),
        lineHeight: leading ? Math.round((leading / p) * 100) / 100 : undefined,
        family: usual(e.nodes.map(family).filter(Boolean)),
      };
    })
    .sort((a, b) => a.px - b.px);
  const base = [...sizes].sort((a, b) => b.share - a.share)[0]?.px ?? dom.bodyFontSize;
  const steps = sizes.slice(1).map((s, i) => s.px / sizes[i].px);
  const ratio = steps.length >= 2 ? Math.round(median(steps) * 1000) / 1000 : null;
  const weights = [
    ...new Set(textNodes.map((n) => parseInt(n.styles.fontWeight ?? '', 10)).filter(Boolean)),
  ].sort((a, b) => a - b);
  return { families, sizes, base, ratio, weights };
}

const SPACE_KEYS = [
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginBottom',
  'rowGap',
  'columnGap',
];

function readSpace(dom: SnapshotDOM): SystemReading['space'] {
  const values: number[] = [];
  for (const n of dom.nodes)
    for (const k of SPACE_KEYS) {
      const v = Math.abs(round(px(n.styles[k]), 0.5));
      if (v > 0 && v <= 400) values.push(v);
    }
  const share = (u: number) =>
    values.length ? values.filter((v) => v % u === 0).length / values.length : 1;
  const unit = share(8) >= 0.75 ? 8 : 4;
  const steps = tally(values)
    .map(({ key, count }) => ({ px: key, count }))
    .sort((a, b) => a.px - b.px);
  return { unit, onGrid: share(unit), steps };
}

function readShape(dom: SnapshotDOM): SystemReading['shape'] {
  const radii: number[] = [];
  const shadows: string[] = [];
  for (const n of dom.nodes) {
    const r = round(px(n.styles.borderRadius), 0.5);
    if (r > 0) radii.push(Math.min(r, 999));
    const s = n.styles.boxShadow;
    if (s && s !== 'none') shadows.push(s);
  }
  return {
    radii: tally(radii)
      .map(({ key, count }) => ({ px: key, count }))
      .sort((a, b) => a.px - b.px),
    shadows: tally(shadows).map(({ key, count }) => ({ value: key, count })),
  };
}

function readComponents(dom: SnapshotDOM, page: ReturnType<typeof readPage>): ComponentGroup[] {
  const nodes = dom.nodes;
  const edge = (n: SnapNode) => px(n.styles.borderTopWidth) > 0;
  const border = (n: SnapNode) => {
    if (!edge(n)) return 'none';
    const c = parseColor(n.styles.borderTopColor);
    return `${px(n.styles.borderTopWidth)}px ${c ? over(c, page.behind[n.index]) : ''}`.trim();
  };
  const textHex = (n: SnapNode) => {
    const c = parseColor(n.styles.color);
    return c ? over(c, page.behind[n.index]) : '';
  };
  const radius = (n: SnapNode) => `${Math.min(round(px(n.styles.borderRadius), 0.5), 999)}px`;
  const shadow = (n: SnapNode) =>
    n.styles.boxShadow && n.styles.boxShadow !== 'none' ? 'yes' : 'none';
  const pad = (n: SnapNode) =>
    `${round(px(n.styles.paddingTop))}px ${round(px(n.styles.paddingLeft))}px`;

  const isButton = (n: SnapNode) => {
    if (n.tag === 'input') return ['submit', 'button'].includes(n.attrs.type ?? '');
    if (n.tag === 'button' || n.attrs.role === 'button') return n.box.w > 0;
    return (
      n.tag === 'a' &&
      (page.ownFill[n.index] !== null || edge(n)) &&
      px(n.styles.paddingLeft) > 0 &&
      n.box.h < 120
    );
  };
  const isField = (n: SnapNode) =>
    (n.tag === 'input' &&
      !['hidden', 'checkbox', 'radio', 'submit', 'button', 'range', 'file'].includes(
        n.attrs.type ?? '',
      )) ||
    n.tag === 'textarea' ||
    n.tag === 'select';
  const isCard = (n: SnapNode) => {
    if (
      n.index === 0 ||
      !['div', 'article', 'li', 'section', 'a', 'figure', 'aside'].includes(n.tag)
    )
      return false;
    if (
      n.children.length < 2 ||
      n.box.h < 80 ||
      n.box.w < 120 ||
      n.box.w > dom.viewport.width * 0.9
    )
      return false;
    const parentBg = n.parent >= 0 ? page.behind[n.parent] : page.pageBg;
    const lifted =
      (page.ownFill[n.index] !== null && page.ownFill[n.index] !== parentBg) ||
      edge(n) ||
      shadow(n) === 'yes';
    return lifted && (px(n.styles.borderRadius) > 0 || edge(n) || shadow(n) === 'yes');
  };

  const group = (
    kind: ComponentGroup['kind'],
    list: SnapNode[],
    look: (n: SnapNode) => Record<string, string>,
  ): ComponentGroup | null => {
    if (!list.length) return null;
    const by = new Map<string, ComponentVariant>();
    for (const n of list) {
      const l = look(n);
      const key = JSON.stringify(l);
      const v = by.get(key);
      if (v) v.count++;
      else by.set(key, { count: 1, selector: n.selector, look: l });
    }
    return {
      kind,
      count: list.length,
      variants: [...by.values()].sort((a, b) => b.count - a.count),
    };
  };

  const buttons = nodes.filter(isButton);
  const fields = nodes.filter(isField);
  const taken = new Set(buttons.map((n) => n.index));
  const cards = nodes.filter((n) => !taken.has(n.index) && isCard(n));
  return [
    group('button', buttons, (n) => ({
      fill: page.ownFill[n.index] ?? 'none',
      text: textHex(n),
      border: border(n),
      radius: radius(n),
      size: `${round(px(n.styles.fontSize), 0.5)}px`,
      padding: pad(n),
    })),
    group('field', fields, (n) => ({
      fill: page.ownFill[n.index] ?? 'none',
      border: border(n),
      radius: radius(n),
      size: `${round(px(n.styles.fontSize), 0.5)}px`,
      padding: pad(n),
    })),
    group('card', cards, (n) => ({
      fill: page.ownFill[n.index] ?? 'none',
      border: border(n),
      radius: radius(n),
      shadow: shadow(n),
      padding: pad(n),
    })),
  ].filter((g): g is ComponentGroup => g !== null);
}

function readMotion(dom: SnapshotDOM): SystemReading['motion'] {
  const names = new Set<string>();
  const durations: number[] = [];
  for (const n of dom.nodes) {
    for (const a of (n.styles.animationName ?? '').split(',').map((s) => s.trim()))
      if (a && a !== 'none') names.add(a);
    for (const d of (n.styles.transitionDuration ?? '').split(',').map((s) => s.trim())) {
      const ms = d.endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000;
      if (ms > 0) durations.push(Math.round(ms));
    }
  }
  return {
    animations: [...names].sort(),
    durations: tally(durations)
      .map(({ key, count }) => ({ ms: key, count }))
      .sort((a, b) => a.ms - b.ms),
  };
}

// ---------- the stylesheets ----------

const COLOR_PROP =
  /^(color|background|background-color|border|border-(top|right|bottom|left|inline|block)(-(start|end))?(-color)?|border-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration|text-decoration-color)$/;
const SPACE_PROP =
  /^(padding|margin)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;
const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(\s*[\d.]|\b(oklch|oklab|lab|lch)\(\s*[\d.]/i;
const LENGTH_LITERAL = /(^|[\s(,-])\d*\.?\d+(px|rem|em)\b/;
const zeroOnly = (v: string) => !/[1-9]/.test(v);

/** Counts values written in place against values that read a custom property. */
export function readSource(sheets: string[]): SystemReading['source'] {
  const literal: Usage = { color: 0, size: 0, space: 0 };
  const tokenised: Usage = { color: 0, size: 0, space: 0 };
  const declared = new Set<string>();
  for (const css of sheets) {
    let root: postcss.Root;
    try {
      root = postcss.parse(css);
    } catch {
      continue;
    }
    root.walkDecls((d) => {
      const prop = d.prop.toLowerCase();
      if (prop.startsWith('--')) {
        const rule = d.parent as postcss.Rule | undefined;
        if (rule?.type === 'rule' && /(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selector))
          declared.add(prop);
        return;
      }
      const reads = d.value.includes('var(');
      if (COLOR_PROP.test(prop)) {
        // A colour spelled out with only its opacity read from a property is still written in place.
        if (COLOR_LITERAL.test(d.value)) literal.color++;
        else if (reads) tokenised.color++;
      } else if (prop === 'font-size') {
        if (reads) tokenised.size++;
        else if (LENGTH_LITERAL.test(d.value)) literal.size++;
      } else if (SPACE_PROP.test(prop)) {
        if (reads) tokenised.space++;
        else if (LENGTH_LITERAL.test(d.value) && !zeroOnly(d.value)) literal.space++;
      }
    });
  }
  const lit = literal.color + literal.size + literal.space;
  const tok = tokenised.color + tokenised.size + tokenised.space;
  return {
    tokens: declared.size,
    literal,
    tokenised,
    coverage: lit + tok ? tok / (lit + tok) : null,
  };
}

// ---------- findings ----------

const pct = (n: number) => `${Math.round(n * 100)}%`;

function findingsOf(r: Omit<SystemReading, 'findings'>): SystemFinding[] {
  const out: SystemFinding[] = [];
  const add = (area: SystemFinding['area'], message: string) => out.push({ area, message });
  const bg = r.colors.find((c) => c.role === 'background');
  const ink = r.colors.find((c) => c.role === 'ink');
  const hues = r.colors.filter((c) => c.role === 'accent' || c.role === 'other');

  if (r.nearDuplicates > 0)
    add(
      'color',
      `${r.nearDuplicates} ${r.nearDuplicates === 1 ? 'colour is' : 'colours are'} almost the same as another one on the page. Each pair can share one value.`,
    );
  if (hues.length > 3)
    add(
      'color',
      `${hues.length} strong colours are in use. One accent and its tints usually carry a page.`,
    );
  if (!hues.length)
    add('color', 'No accent colour stands out. Nothing marks the main action apart from the text.');
  if (bg && ink && contrast(bg.hex, ink.hex) < 4.5)
    add(
      'color',
      `The main text has a contrast of ${contrast(bg.hex, ink.hex).toFixed(1)} against the background. Body text needs 4.5.`,
    );

  if (r.type.sizes.length > 8)
    add(
      'type',
      `Text is set in ${r.type.sizes.length} sizes. A scale of six to eight steps covers most pages.`,
    );
  if (r.type.sizes.length >= 4) {
    const steps = r.type.sizes.slice(1).map((s, i) => s.px / r.type.sizes[i].px);
    if (Math.max(...steps) / Math.min(...steps) > 1.35)
      add(
        'type',
        'The sizes do not follow a steady ratio: some steps are much larger than others.',
      );
  }
  if (r.type.families.length > 2)
    add('type', `${r.type.families.length} font families are in use. Two is usually enough.`);
  if (r.type.base && r.type.base < 15)
    add('type', `Most of the text is ${r.type.base}px. Reading text is easier at 16px or more.`);

  if (r.space.steps.length && r.space.onGrid < 0.8)
    add(
      'space',
      `${pct(1 - r.space.onGrid)} of the spacing values sit off a ${r.space.unit}px grid.`,
    );
  if (r.space.steps.length > 14)
    add(
      'space',
      `${r.space.steps.length} different spacing values are in use. A scale of eight to ten covers most layouts.`,
    );

  if (r.shape.radii.length > 4)
    add(
      'shape',
      `Corners use ${r.shape.radii.length} different radii. Three or four keep shapes related.`,
    );
  if (r.shape.shadows.length > 3)
    add(
      'shape',
      `${r.shape.shadows.length} different shadows are in use. A short set tied to height reads as one light.`,
    );

  for (const g of r.components) {
    const limit = g.kind === 'button' ? 3 : 2;
    if (g.variants.length > limit)
      add(
        'components',
        `The ${g.count} ${g.kind}s come in ${g.variants.length} different looks. They are not yet one component.`,
      );
  }

  const s = r.source;
  if (s.coverage !== null && s.coverage < 0.5) {
    const where = [
      s.literal.color && `${s.literal.color} colours`,
      s.literal.size && `${s.literal.size} text sizes`,
      s.literal.space && `${s.literal.space} spacing values`,
    ]
      .filter(Boolean)
      .join(', ');
    add(
      'source',
      `${pct(s.coverage)} of the styling reads from shared values. Written in place: ${where}.`,
    );
  }
  return out;
}

/** Reads the design system from a snapshot of the rendered page and the project's stylesheets. */
export function readSystem(dom: SnapshotDOM, sheets: string[] = []): SystemReading {
  const page = readPage(dom);
  const { colors, nearDuplicates } = readColors(page.pageBg, page.tones);
  const reading = {
    colors,
    nearDuplicates,
    type: readType(dom, page.textNodes),
    space: readSpace(dom),
    shape: readShape(dom),
    components: readComponents(dom, page),
    motion: readMotion(dom),
    source: readSource(sheets),
  };
  return { ...reading, findings: findingsOf(reading) };
}
