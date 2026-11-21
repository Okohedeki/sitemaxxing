/* Turns a reading of a project's design system into something a person or a coding agent can work
   from: every colour named with what it is for, the scales stated, the rules the page already
   follows written down, and the whole thing exported as a DESIGN.md, CSS variables, a Tailwind
   theme and a tokens file. Pure: everything here is derived from the reading. */

import { contrast, hexToOklch, hueName } from './color';
import type { ColorRole, SystemFinding, SystemReading } from './system';

export interface NamedColor {
  /** A plain name, such as "Deep teal". */
  name: string;
  /** The name it exports under, without dashes in front: `accent`, `text-soft`. */
  token: string;
  hex: string;
  role: ColorRole;
  group: 'main' | 'neutral' | 'other';
  purpose: string;
}

export interface TypeStep {
  token: string;
  px: number;
  weight?: number;
  lineHeight?: number;
  family?: string;
  /** Share of the page's text set at this size, 0 to 1. */
  share: number;
}

export interface SystemDescription {
  /** One line on how the page reads. */
  character: string;
  summary: string;
  theme: 'light' | 'dark';
  colors: NamedColor[];
  type: {
    /** The scale in words: "Major third (×1.25) from 16px". */
    scale: string;
    steady: boolean;
    steps: TypeStep[];
    /** Sizes in use that are too rare to be part of the scale. */
    left: number;
    families: Array<{ token: string; family: string; stack: string; use: string }>;
  };
  space: {
    unit: number;
    density: 'compact' | 'comfortable' | 'roomy';
    steps: Array<{ token: string; px: number }>;
    /** Values in use that are off the grid or too rare to be part of the scale. */
    left: number;
    /** Typical ranges in px, or null when the page gives no evidence. */
    elementGap: [number, number] | null;
    cardPadding: [number, number] | null;
    sectionGap: [number, number] | null;
  };
  shape: {
    radii: Array<{ token: string; label: string; px: number }>;
    shadows: Array<{ token: string; value: string; count: number }>;
  };
  rules: { do: string[]; dont: string[] };
}

export interface SystemExports {
  designMd: string;
  css: string;
  tailwind: string;
  tokens: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const span = (xs: number[]): [number, number] | null =>
  xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
const range = (r: [number, number] | null) =>
  !r ? '' : r[0] === r[1] ? `${r[0]}px` : `${r[0]} to ${r[1]}px`;
const rem = (px: number) => `${Math.round((px / 16) * 10000) / 10000}rem`;
const radius = (px: number) => (px >= 999 ? '999px' : `${px}px`);

// ---------- colour ----------

function colorName(hex: string): string {
  const { l, c, h } = hexToOklch(hex);
  if (c < 0.03) {
    const base =
      l >= 0.985
        ? 'white'
        : l >= 0.93
          ? 'paper'
          : l >= 0.82
            ? 'mist'
            : l >= 0.65
              ? 'silver'
              : l >= 0.45
                ? 'slate'
                : l >= 0.28
                  ? 'graphite'
                  : l >= 0.12
                    ? 'charcoal'
                    : 'black';
    if (c < 0.008 || base === 'white' || base === 'black') return cap(base);
    return `${h > 20 && h < 115 ? 'Warm' : h >= 115 && h < 300 ? 'Cool' : 'Soft'} ${base}`;
  }
  const tone = l > 0.88 ? 'pale ' : l > 0.72 ? 'light ' : l > 0.5 ? '' : l > 0.32 ? 'deep ' : 'dark ';
  return cap(`${tone}${hueName(h, c)}`);
}

const ROLE_TOKEN: Record<ColorRole, string> = {
  background: 'background',
  surface: 'surface',
  ink: 'text',
  soft: 'text-soft',
  inverse: 'text-on-fill',
  accent: 'accent',
  other: '',
  border: 'line',
};
/** How many colours of a role are worth naming; the rest are stragglers. */
const ROLE_LIMIT: Record<ColorRole, number> = {
  background: 1,
  surface: 4,
  ink: 1,
  soft: 3,
  inverse: 2,
  accent: 1,
  other: 5,
  border: 3,
};

function nameColors(r: SystemReading): NamedColor[] {
  const bg = r.colors.find((c) => c.role === 'background')?.hex ?? '#ffffff';
  const names = new Set<string>();
  const tokens = new Set<string>();
  const unique = (set: Set<string>, base: string, join: string) => {
    let out = base;
    for (let i = 2; set.has(out); i++) out = `${base}${join}${i}`;
    set.add(out);
    return out;
  };
  const seen: Partial<Record<ColorRole, number>> = {};
  const out: NamedColor[] = [];
  for (const c of r.colors) {
    const n = (seen[c.role] = (seen[c.role] ?? 0) + 1);
    if (n > ROLE_LIMIT[c.role]) continue;
    const name = unique(names, colorName(c.hex), ' ');
    const token = unique(tokens, ROLE_TOKEN[c.role] || slug(name), '-');
    const on = `${contrast(c.hex, bg).toFixed(1)}:1 on the background`;
    const els = (k: number) => `${k} ${k === 1 ? 'element' : 'elements'}`;
    const purpose: Record<ColorRole, () => string> = {
      background: () => `The page background. Covers ${pct(c.fill)} of the page.`,
      surface: () =>
        `Fills panels, cards and bands (${pct(c.fill)} of the page).${c.text > 0 ? ' Also the text on dark fills.' : ''}`,
      ink: () => `The main text. Carries ${pct(c.text)} of the words, at ${on}.`,
      soft: () => `Quieter text for secondary lines (${pct(c.text)} of the words), at ${on}.`,
      inverse: () => 'Text that sits on filled boxes, such as the label on a solid button.',
      accent: () => `The accent. Marks actions and highlights on ${els(c.uses)}.`,
      other: () =>
        c.fill > 0
          ? `A further strong colour, used as a fill on ${els(c.uses)}.`
          : c.text > 0
            ? `A further strong colour, used for text on ${els(c.uses)}.`
            : `A further strong colour, used for lines on ${els(c.borders)}.`,
      border: () => `Lines and outlines on ${els(c.borders)}.`,
    };
    out.push({
      name,
      token,
      hex: c.hex,
      role: c.role,
      group:
        c.role === 'background' || c.role === 'ink' || c.role === 'accent'
          ? 'main'
          : c.role === 'other'
            ? 'other'
            : 'neutral',
      purpose: purpose[c.role](),
    });
  }
  return out;
}

// ---------- type ----------

const RATIOS: Array<[number, string]> = [
  [1.067, 'Minor second'],
  [1.125, 'Major second'],
  [1.2, 'Minor third'],
  [1.25, 'Major third'],
  [1.333, 'Perfect fourth'],
  [1.414, 'Augmented fourth'],
  [1.5, 'Perfect fifth'],
  [1.618, 'Golden ratio'],
];

function stack(family: string): string {
  const f = family.toLowerCase();
  const generic = /mono|code|courier/.test(f)
    ? 'ui-monospace, monospace'
    : /serif|garamond|times|georgia|playfair|merriweather/.test(f) && !/sans/.test(f)
      ? 'Georgia, serif'
      : 'system-ui, sans-serif';
  return `"${family}", ${generic}`;
}

function describeType(r: SystemReading): SystemDescription['type'] {
  const t = r.type;
  // The scale is the sizes that are really used; one-offs are counted, not named.
  const MAX = 9;
  const largest = t.sizes.at(-1)?.px;
  const keep = new Set(
    [...t.sizes]
      .filter((s) => s.count >= 2 || s.share >= 0.01 || s.px === t.base || s.px === largest)
      .sort(
        (a, b) =>
          Number(b.px === t.base || b.px === largest) - Number(a.px === t.base || a.px === largest) ||
          b.share - a.share,
      )
      .slice(0, MAX)
      .map((s) => s.px),
  );
  const kept = t.sizes.filter((s) => keep.has(s.px));
  const above = kept.filter((s) => s.px > t.base).sort((a, b) => b.px - a.px);
  const below = kept.filter((s) => s.px < t.base).sort((a, b) => b.px - a.px);
  const SMALL = ['small', 'caption', 'micro'];
  const tokenOf = new Map<number, string>();
  above.forEach((s, i) =>
    tokenOf.set(
      s.px,
      above.length === 1 ? 'heading' : i === 0 ? 'display' : `heading-${i}`,
    ),
  );
  below.forEach((s, i) => tokenOf.set(s.px, SMALL[i] ?? `micro-${i - SMALL.length + 2}`));
  tokenOf.set(t.base, 'body');
  const steps: TypeStep[] = [...kept]
    .sort((a, b) => b.px - a.px)
    .map((s) => ({
      token: tokenOf.get(s.px)!,
      px: s.px,
      weight: s.weight,
      lineHeight: s.lineHeight,
      family: s.family,
      share: s.share,
    }));

  const ratios = kept.slice(1).map((s, i) => s.px / kept[i].px);
  const steady = ratios.length >= 2 && Math.max(...ratios) / Math.min(...ratios) <= 1.35;
  const mid = ratios.length
    ? [...ratios].sort((a, b) => a - b)[Math.floor(ratios.length / 2)]
    : null;
  const named = mid ? RATIOS.find(([x]) => Math.abs(x - mid) <= 0.025) : undefined;
  const scale = !mid
    ? `One size, ${t.base}px`
    : steady
      ? `${named ? `${named[1]} (×${named[0]})` : `Steps of about ×${mid.toFixed(2)}`} from ${t.base}px`
      : `No steady ratio; the usual step is about ×${mid.toFixed(2)}, from ${t.base}px`;

  const families = t.families
    .filter((f) => f.role !== 'other' || f.share >= 0.02)
    .slice(0, 3)
    .map((f, i, all) => ({
      token: f.role === 'body' ? 'body' : f.role === 'display' ? 'display' : `extra${i > 2 ? i : ''}`,
      family: f.family,
      stack: stack(f.family),
      use:
        f.role === 'body'
          ? all.some((x) => x.role === 'display')
            ? `Reading text and the interface (${pct(f.share)} of the words).`
            : `Everything: headings, reading text and the interface.`
          : f.role === 'display'
            ? `Headings and the largest lines (${pct(f.share)} of the words).`
            : `A supporting face (${pct(f.share)} of the words).`,
    }));
  return { scale, steady, steps, left: t.sizes.length - kept.length, families };
}

// ---------- space and shape ----------

function describeSpace(r: SystemReading): SystemDescription['space'] {
  const { unit, steps } = r.space;
  const top = (list: typeof steps, n: number) =>
    [...list]
      .sort((a, b) => b.count - a.count)
      .slice(0, n)
      .map((s) => s.px);
  const total = steps.reduce((s, x) => s + x.count, 0) || 1;
  const scale = steps
    .filter((s) => s.px % unit === 0 && (s.count >= 2 || s.count / total >= 0.01))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .sort((a, b) => a.px - b.px);
  const small = steps.filter((s) => s.px >= 4 && s.px <= 32);
  const weight = small.reduce((s, x) => s + x.count, 0) || 1;
  const mean = small.reduce((s, x) => s + x.px * x.count, 0) / weight;
  const cards = r.components.find((g) => g.kind === 'card');
  const pads = (cards?.variants ?? [])
    .slice(0, 3)
    .map((v) => parseFloat(v.look.padding))
    .filter((v) => v > 0);
  return {
    unit,
    density: !small.length ? 'comfortable' : mean < 10 ? 'compact' : mean < 16 ? 'comfortable' : 'roomy',
    steps: scale.map((s, i) => ({ token: `space-${i + 1}`, px: s.px })),
    left: steps.length - scale.length,
    elementGap: span(top(steps.filter((s) => s.px >= 4 && s.px <= 24), 2)),
    cardPadding: span(pads),
    sectionGap: span(top(steps.filter((s) => s.px >= 48), 2)),
  };
}

function describeShape(r: SystemReading): SystemDescription['shape'] {
  const radii: SystemDescription['shape']['radii'] = [];
  const LABEL = { button: 'Buttons', field: 'Fields', card: 'Cards' } as const;
  for (const kind of ['button', 'field', 'card'] as const) {
    const v = r.components.find((g) => g.kind === kind)?.variants[0];
    const px = v ? parseFloat(v.look.radius) : NaN;
    if (Number.isFinite(px)) radii.push({ token: `radius-${kind}`, label: LABEL[kind], px });
  }
  const usual = [...r.shape.radii].sort((a, b) => b.count - a.count)[0];
  if (usual && !radii.some((x) => x.px === usual.px))
    radii.push({ token: 'radius', label: 'Most other boxes', px: usual.px });
  return {
    radii,
    shadows: r.shape.shadows
      .slice(0, 3)
      .map((s, i) => ({ token: `shadow-${i + 1}`, value: s.value, count: s.count })),
  };
}

// ---------- rules, and the page in words ----------

function corners(shape: SystemDescription['shape']): string {
  const px = shape.radii[0]?.px ?? 0;
  return px >= 100 ? 'pill-shaped' : px > 12 ? 'round' : px >= 3 ? 'soft' : 'square';
}

function rulesOf(r: SystemReading, d: Omit<SystemDescription, 'rules' | 'character' | 'summary'>) {
  const yes: string[] = [];
  const no: string[] = [];
  const by = (role: ColorRole) => d.colors.find((c) => c.role === role);
  const bg = by('background');
  const ink = by('ink');
  const accent = by('accent');
  const soft = by('soft');
  const strong = r.colors.filter((c) => c.role === 'accent' || c.role === 'other').length;

  if (bg && ink)
    yes.push(
      `Set text in ${ink.name} (${ink.hex}) on ${bg.name} (${bg.hex}); that pair has a contrast of ${contrast(ink.hex, bg.hex).toFixed(1)}:1.`,
    );
  if (soft && bg)
    yes.push(
      `Use ${soft.name} (${soft.hex}) for secondary lines only: labels, captions, helper text.`,
    );
  if (accent) {
    yes.push(
      `Keep ${accent.name} (${accent.hex}) for the main action and the few things that must stand out.`,
    );
    if (strong <= 2)
      no.push(
        `Do not bring in another strong colour. ${accent.name} is ${strong === 1 ? 'the only one' : 'one of two'} on the page, which is why it draws the eye.`,
      );
    else
      no.push(
        `Do not add to the ${strong} strong colours already in use; pick from them or from ${accent.name}.`,
      );
    no.push(`Do not use ${accent.name} for large fills or body text; it stops marking what matters.`);
  }

  const body = d.type.steps.find((s) => s.token === 'body');
  const top = d.type.steps[0];
  const bodyFace = d.type.families.find((f) => f.token === 'body');
  const displayFace = d.type.families.find((f) => f.token === 'display');
  if (body && bodyFace)
    yes.push(
      `Set reading text at ${body.px}px in ${bodyFace.family}${body.weight ? `, weight ${body.weight}` : ''}${body.lineHeight ? `, line height ${body.lineHeight}` : ''}.`,
    );
  if (top && top.px > (body?.px ?? 0))
    yes.push(
      `Set the largest headline at ${top.px}px${displayFace ? ` in ${displayFace.family}` : ''}${top.weight ? `, weight ${top.weight}` : ''}${top.lineHeight ? `, line height ${top.lineHeight}` : ''}.`,
    );
  if (d.type.steps.length > 1)
    no.push(
      `Do not set text at a size outside the scale (${d.type.steps.map((s) => s.px).join(', ')}px).`,
    );
  const smallest = d.type.steps.at(-1);
  if (smallest) no.push(`Do not set text smaller than ${smallest.px}px.`);
  if (r.type.weights.length && r.type.weights.length <= 4)
    no.push(`Do not use font weights other than ${r.type.weights.join(', ')}.`);

  const set = d.space.steps.map((s) => s.px).join(', ');
  if (r.space.onGrid >= 0.6 && set)
    yes.push(`Space things in multiples of ${d.space.unit}px, from this set: ${set}.`);
  else
    yes.push(
      `Spacing does not sit on a grid yet. For new work, use multiples of ${d.space.unit}px${set ? `, starting from the values already on it: ${set}` : ''}.`,
    );
  if (d.space.sectionGap && d.space.elementGap)
    yes.push(
      `Leave ${range(d.space.sectionGap)} between sections and ${range(d.space.elementGap)} between items inside one, so groups read as groups.`,
    );
  if (d.space.cardPadding) yes.push(`Pad cards by ${range(d.space.cardPadding)}.`);

  if (d.shape.radii.length) {
    yes.push(
      `Round corners by element: ${d.shape.radii.map((x) => `${x.label.toLowerCase()} ${x.px >= 999 ? 'fully round' : `${x.px}px`}`).join(', ')}.`,
    );
    no.push('Do not mix other corner radii in; one radius per kind of element keeps shapes related.');
  } else if (!r.shape.radii.length) no.push('Do not round corners; every box on the page is square.');
  if (!r.shape.shadows.length)
    no.push('Do not add shadows. Nothing on the page casts one; boxes are set apart by fill or a line.');
  else
    no.push(
      `Do not invent new shadows; ${r.shape.shadows.length === 1 ? 'one is' : `${Math.min(r.shape.shadows.length, 3)} are`} in use and ${r.shape.shadows.length === 1 ? 'it marks' : 'they mark'} what is raised.`,
    );
  const speeds = r.motion.durations;
  if (speeds.length)
    yes.push(
      `Time transitions at ${[...speeds]
        .sort((a, b) => b.count - a.count)
        .slice(0, 2)
        .map((s) => `${s.ms} ms`)
        .join(' or ')}, the speeds already in use.`,
    );
  return { do: yes, dont: no };
}

function inWords(r: SystemReading, d: Omit<SystemDescription, 'character' | 'summary'>) {
  const by = (role: ColorRole) => d.colors.find((c) => c.role === role);
  const bg = by('background');
  const ink = by('ink');
  const accent = by('accent');
  const { c, h } = hexToOklch(bg?.hex ?? '#ffffff');
  const temper = c < 0.006 ? 'neutral' : h > 20 && h < 115 ? 'warm' : h >= 115 && h < 300 ? 'cool' : 'tinted';
  const face = d.type.families.find((f) => f.token === 'display') ?? d.type.families[0];
  const character = [
    `${cap(d.theme)}, ${temper} page`,
    accent ? `with ${accent.name.toLowerCase()} as the accent` : 'with no accent colour',
    face ? `, set in ${face.family}` : '',
    `, ${d.space.density} spacing and ${corners(d.shape)} corners.`,
  ]
    .join(' ')
    .replace(/ ,/g, ',');

  const lines: string[] = [];
  if (bg && ink)
    lines.push(
      `The page is ${ink.name.toLowerCase()} text on a ${bg.name.toLowerCase()} background.`,
    );
  const strong = r.colors.filter((x) => x.role === 'accent' || x.role === 'other').length;
  if (accent)
    lines.push(
      strong === 1
        ? `${accent.name} is the only strong colour, so whatever carries it is read first.`
        : `${accent.name} leads ${strong} strong colours.`,
    );
  const top = d.type.steps[0];
  const body = d.type.steps.find((s) => s.token === 'body');
  if (top && body)
    lines.push(
      top.px > body.px
        ? `Type runs from ${body.px}px reading text up to a ${top.px}px headline, ${Math.round((top.px / body.px) * 10) / 10} times larger.`
        : `All text is close to ${body.px}px, so weight and colour carry the hierarchy.`,
    );
  lines.push(
    `Spacing is ${d.space.density}, with ${pct(r.space.onGrid)} of values on a ${d.space.unit}px grid.`,
  );
  lines.push(
    r.shape.shadows.length
      ? `Corners are ${corners(d.shape)} and raised boxes cast a shadow.`
      : `Corners are ${corners(d.shape)} and nothing casts a shadow: depth comes from fill and lines.`,
  );
  return { character, summary: lines.join(' ') };
}

/** Names the parts of a reading and writes down the rules the page already follows. */
export function describeSystem(r: SystemReading): SystemDescription {
  const bg = r.colors.find((c) => c.role === 'background')?.hex ?? '#ffffff';
  const base = {
    theme: (hexToOklch(bg).l < 0.5 ? 'dark' : 'light') as 'light' | 'dark',
    colors: nameColors(r),
    type: describeType(r),
    space: describeSpace(r),
    shape: describeShape(r),
  };
  const withRules = { ...base, rules: rulesOf(r, base) };
  return { ...inWords(r, withRules), ...withRules };
}

// ---------- exports ----------

function variables(d: SystemDescription, forTailwind: boolean): string[] {
  const out: string[] = [];
  for (const c of d.colors) out.push(`--color-${c.token}: ${c.hex};`);
  out.push('');
  for (const f of d.type.families) out.push(`--font-${f.token}: ${f.stack};`);
  for (const s of d.type.steps) {
    out.push(`--text-${s.token}: ${rem(s.px)};`);
    if (forTailwind && s.lineHeight) out.push(`--text-${s.token}--line-height: ${s.lineHeight};`);
    if (forTailwind && s.weight) out.push(`--text-${s.token}--font-weight: ${s.weight};`);
  }
  out.push('');
  if (forTailwind) out.push('--spacing: 0.25rem;');
  else for (const s of d.space.steps) out.push(`--${s.token}: ${rem(s.px)};`);
  for (const x of d.shape.radii) out.push(`--${x.token}: ${radius(x.px)};`);
  for (const s of d.shape.shadows) out.push(`--${s.token}: ${s.value};`);
  return out;
}

const block = (open: string, lines: string[]) =>
  `${open} {\n${lines.map((l) => (l ? `  ${l}` : '')).join('\n')}\n}\n`;

function tokensFile(d: SystemDescription): string {
  const dim = (px: number) => ({ $type: 'dimension', $value: `${px >= 999 ? 999 : px}px` });
  return (
    JSON.stringify(
      {
        color: Object.fromEntries(
          d.colors.map((c) => [c.token, { $type: 'color', $value: c.hex, $description: c.purpose }]),
        ),
        font: {
          family: Object.fromEntries(
            d.type.families.map((f) => [
              f.token,
              { $type: 'fontFamily', $value: f.family, $description: f.use },
            ]),
          ),
          size: Object.fromEntries(d.type.steps.map((s) => [s.token, dim(s.px)])),
          weight: Object.fromEntries(
            d.type.steps
              .filter((s) => s.weight)
              .map((s) => [s.token, { $type: 'fontWeight', $value: s.weight }]),
          ),
          lineHeight: Object.fromEntries(
            d.type.steps
              .filter((s) => s.lineHeight)
              .map((s) => [s.token, { $type: 'number', $value: s.lineHeight }]),
          ),
        },
        space: Object.fromEntries(d.space.steps.map((s) => [s.token.replace('space-', ''), dim(s.px)])),
        radius: Object.fromEntries(
          d.shape.radii.map((x) => [x.token.replace(/^radius-?/, '') || 'default', dim(x.px)]),
        ),
      },
      null,
      2,
    ) + '\n'
  );
}

function designMd(
  name: string,
  r: SystemReading,
  d: SystemDescription,
  findings: SystemFinding[],
): string {
  const table = (head: string[], rows: string[][]) =>
    [
      `| ${head.join(' | ')} |`,
      `| ${head.map(() => '---').join(' | ')} |`,
      ...rows.map((row) => `| ${row.join(' | ')} |`),
    ].join('\n');
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n');
  const parts: string[] = [
    `# ${name}: design system`,
    `> ${d.character}`,
    d.summary,
    'The values below were measured on the running page. The names, roles and rules are derived from those measurements, so check them against intent before treating them as final.',
    '## Colour',
    table(
      ['Name', 'Value', 'Variable', 'Used for'],
      d.colors.map((c) => [c.name, `\`${c.hex}\``, `\`--color-${c.token}\``, c.purpose]),
    ),
    '## Type',
    `Scale: ${d.type.scale}.${d.type.left ? ` ${d.type.left} more ${d.type.left === 1 ? 'size is' : 'sizes are'} in use but too rare to belong to the scale.` : ''}`,
    table(
      ['Step', 'Size', 'Weight', 'Line height', 'Family'],
      d.type.steps.map((s) => [
        `\`--text-${s.token}\``,
        `${s.px}px`,
        s.weight ? String(s.weight) : '',
        s.lineHeight ? String(s.lineHeight) : '',
        s.family ?? '',
      ]),
    ),
    list(d.type.families.map((f) => `**${f.family}** (\`--font-${f.token}\`): ${f.use}`)),
    '## Spacing',
    list(
      [
        `Grid: ${d.space.unit}px. Density: ${d.space.density}.`,
        d.space.steps.length
          ? `Scale: ${d.space.steps.map((s) => `${s.px}`).join(', ')} px.`
          : '',
        d.space.elementGap ? `Between items: ${range(d.space.elementGap)}.` : '',
        d.space.cardPadding ? `Inside cards: ${range(d.space.cardPadding)}.` : '',
        d.space.sectionGap ? `Between sections: ${range(d.space.sectionGap)}.` : '',
      ].filter(Boolean),
    ),
    '## Corners and shadows',
    list([
      ...(d.shape.radii.length
        ? d.shape.radii.map(
            (x) => `${x.label}: ${x.px >= 999 ? 'fully round' : `${x.px}px`} (\`--${x.token}\`)`,
          )
        : ['No rounded corners.']),
      ...(d.shape.shadows.length
        ? d.shape.shadows.map((s) => `Shadow \`--${s.token}\`: \`${s.value}\``)
        : ['No shadows.']),
    ]),
  ];
  if (r.components.length) {
    const LABEL = { button: 'Buttons', field: 'Fields', card: 'Cards' } as const;
    parts.push(
      '## Components',
      list(
        r.components.map((g) => {
          const look = Object.entries(g.variants[0].look)
            .filter(([, v]) => v && v !== 'none')
            .map(([k, v]) => `${k} ${v}`)
            .join(', ');
          return `**${LABEL[g.kind]}** (${g.count} on the page, ${g.variants.length} ${g.variants.length === 1 ? 'look' : 'looks'}). The usual one: ${look}.`;
        }),
      ),
    );
  }
  parts.push('## Rules', '### Do', list(d.rules.do), "### Don't", list(d.rules.dont));
  if (findings.length)
    parts.push(
      '## Where the page strays',
      'These are places the page does not yet follow one system. New work should follow the rules above, not these.',
      list(findings.map((f) => f.message)),
    );
  return parts.join('\n\n') + '\n';
}

/** The description in the four forms other tools read. */
export function exportSystem(
  name: string,
  r: SystemReading,
  d: SystemDescription = describeSystem(r),
): SystemExports {
  return {
    designMd: designMd(name, r, d, r.findings),
    css: block(':root', variables(d, false)),
    tailwind: `@import "tailwindcss";\n\n${block('@theme', variables(d, true))}`,
    tokens: tokensFile(d),
  };
}
