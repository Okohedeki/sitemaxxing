/* Hero compositions. The layout of the first screen does more to make sites look alike than any
   colour, so it is a reference slot like the rest: each composition sits on the mood axes, and noise
   moves its proportions. Layouts are CSS only; they rearrange the hero's own copy and media. */

import type { Goal, Mood, Rng } from '@sitemaxxing/core';
import { selectReferences, SLOT_LABEL, type Reference, type Slot } from './select';
import type { ComponentParam } from './registry';

/** Selectors for the parts of the hero, resolved from the page by the pass. */
export interface HeroParts {
  hero: string;
  copy: string;
  /** The art or picture beside the copy; absent when the hero is text only. */
  media?: string;
  /** The headline as a child of the copy column, e.g. `.copy > :nth-child(2)`. */
  headline: string;
}

export interface HeroLayoutRef extends Reference {
  description: string;
  /** Needs a picture or art element next to the copy. */
  needsMedia: boolean;
  params: ComponentParam[];
  thumb: string;
  css(parts: HeroParts, p: Record<string, number>): string;
}

const svg = (body: string) =>
  `<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f3f2ee"/>${body}</svg>`;
const ink = '#141414';
const soft = '#9a978f';
const art = '#d9d4c7';
const acc = '#c2412d';

const lines = (x: number, y: number, w: number, n = 2, h = 3) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<rect x="${x}" y="${y + i * (h + 1.5)}" width="${i === n - 1 ? w * 0.7 : w}" height="${h}" fill="${ink}"/>`,
  ).join('');
const btn = (x: number, y: number) =>
  `<rect x="${x}" y="${y}" width="9" height="3.4" rx="1" fill="${acc}"/>`;

/** Shared reset so every layout starts from the same footing, whatever the original CSS did. */
const base = (p: HeroParts) => `${p.hero} { display: grid; align-items: center; }
${p.copy} { min-width: 0; }
${p.copy} > div { flex-wrap: wrap; max-width: 100%; }`;

const mobile = (p: HeroParts, extra = '') => `@media (max-width: 760px) {
  ${p.hero} { grid-template-columns: 1fr; min-height: 0; }
  ${p.hero} > * { grid-column: 1 / -1; grid-row: auto; transform: none; }
  ${p.copy} { grid-template-columns: 1fr; }
  ${p.copy} > * { grid-column: 1 / -1; grid-row: auto; }
  ${p.headline} { grid-column: 1 / -1; grid-row: auto; align-self: auto; }
${extra}}`;

const leftCopy = (p: HeroParts) => `${p.copy} { text-align: left; align-items: flex-start; }`;

export const HERO_LAYOUTS: HeroLayoutRef[] = [
  {
    id: 'split',
    label: 'Split',
    description: 'Copy and picture side by side, the copy given the wider column',
    mood: { formality: 0.2, energy: 0.1 },
    goals: ['signups', 'sales', 'leads'],
    needsMedia: true,
    params: [
      { name: 'ratio', base: 1.25, spread: 0.25, min: 0.9, max: 1.8 },
      { name: 'height', base: 440, spread: 80, min: 320, max: 560 },
    ],
    thumb: svg(
      `${lines(4, 9, 18)}${btn(4, 20)}<rect x="27" y="5" width="17" height="20" rx="1.5" fill="${art}"/>`,
    ),
    css: (p, v) => `${base(p)}
${p.hero} { grid-template-columns: ${v.ratio}fr 1fr; }
${leftCopy(p)}
${p.media ? `${p.hero} > ${p.media} { height: ${v.height}px; }` : ''}
${mobile(p)}`,
    attributes: { family: 'hero-layout', columns: 2, media: 'beside' },
  },
  {
    id: 'picture-first',
    label: 'Picture first',
    description: 'The picture leads on the left; the copy answers it',
    mood: { warmth: 0.4, classic: 0.1, energy: -0.1 },
    goals: ['bookings', 'awareness', 'sales'],
    needsMedia: true,
    params: [
      { name: 'ratio', base: 1.2, spread: 0.25, min: 0.9, max: 1.7 },
      { name: 'height', base: 480, spread: 80, min: 340, max: 600 },
    ],
    thumb: svg(
      `<rect x="4" y="4" width="21" height="22" rx="1.5" fill="${art}"/>${lines(29, 10, 15)}${btn(29, 21)}`,
    ),
    css: (p, v) => `${base(p)}
${p.hero} { grid-template-columns: ${v.ratio}fr 1fr; }
${p.media ? `${p.hero} > ${p.media} { order: -1; height: ${v.height}px; }` : ''}
${leftCopy(p)}
${mobile(p)}`,
    attributes: { family: 'hero-layout', columns: 2, media: 'leads' },
  },
  {
    id: 'editorial',
    label: 'Editorial stack',
    description: 'One column: a wide headline, the story under it, the picture as a band below',
    mood: { classic: 0.6, formality: 0.4, energy: -0.3, density: -0.3 },
    goals: ['credibility', 'awareness', 'bookings'],
    needsMedia: false,
    params: [
      { name: 'measure', base: 18, spread: 3, min: 13, max: 24 },
      { name: 'band', base: 2.4, spread: 0.4, min: 1.8, max: 3.2 },
    ],
    thumb: svg(
      `${lines(4, 4, 34, 2, 3.4)}<rect x="4" y="14" width="20" height="1.6" fill="${soft}"/><rect x="4" y="18" width="40" height="9" fill="${art}"/>`,
    ),
    css: (p, v) => `${base(p)}
${p.hero} { grid-template-columns: 1fr; }
${leftCopy(p)}
${p.headline} { max-width: ${v.measure}ch; }
${p.media ? `${p.hero} > ${p.media} { width: 100%; height: auto; aspect-ratio: ${v.band} / 1; }` : ''}
${mobile(p)}`,
    attributes: { family: 'hero-layout', columns: 1, media: 'band below' },
  },
  {
    id: 'poster',
    label: 'Poster',
    description: 'The picture fills the hero and the copy sits on it, centred, behind a solid veil',
    mood: { energy: 0.6, dark: 0.3, classic: -0.2, density: -0.2 },
    goals: ['awareness', 'sales', 'bookings'],
    needsMedia: true,
    params: [
      { name: 'height', base: 78, spread: 8, min: 62, max: 92 },
      { name: 'veil', base: 68, spread: 8, min: 58, max: 80 },
      { name: 'measure', base: 16, spread: 3, min: 11, max: 22 },
    ],
    thumb: svg(
      `<rect width="48" height="30" fill="${art}"/><rect width="48" height="30" fill="#f3f2ee" opacity=".45"/>${lines(11, 9, 26)}${btn(19.5, 20)}`,
    ),
    css: (p, v) => `${base(p)}
${p.hero} { position: relative; grid-template-columns: 1fr; justify-items: center; min-height: ${v.height}vh; isolation: isolate; }
${p.copy} { position: relative; z-index: 2; text-align: center; align-items: center; }
${p.headline} { max-width: ${v.measure}ch; }
${
  p.media
    ? `${p.hero} > ${p.media} { position: absolute; inset: 0; z-index: 0; width: auto; height: auto; border-radius: 0; border: 0; box-shadow: none; }
${p.hero} > ${p.media}::after { content: ""; position: absolute; inset: 0; background: color-mix(in oklab, var(--bg, #fff) ${v.veil}%, transparent); pointer-events: none; }`
    : ''
}
${mobile(p, `  ${p.hero} { min-height: ${Math.round(v.height * 0.8)}vh; }\n`)}`,
    attributes: { family: 'hero-layout', columns: 1, media: 'behind' },
  },
  {
    id: 'offset',
    label: 'Offset overlap',
    description: 'Copy and picture on a twelve-column grid, overlapping, the picture dropped lower',
    mood: { energy: 0.4, classic: -0.4, formality: -0.3 },
    goals: ['signups', 'awareness'],
    needsMedia: true,
    params: [
      { name: 'span', base: 7, spread: 1, min: 6, max: 8 },
      { name: 'drop', base: 56, spread: 24, min: 16, max: 96 },
      { name: 'height', base: 460, spread: 70, min: 340, max: 580 },
    ],
    thumb: svg(
      `<rect x="20" y="9" width="24" height="18" rx="1.5" fill="${art}"/><rect x="3" y="5" width="25" height="15" fill="#f3f2ee"/>${lines(5, 7, 20)}${btn(5, 16)}`,
    ),
    css: (p, v) => {
      const span = Math.round(v.span);
      return `${base(p)}
${p.hero} { grid-template-columns: repeat(12, minmax(0, 1fr)); align-items: start; }
${p.copy} { grid-column: 1 / span ${span}; grid-row: 1; position: relative; z-index: 2; background: var(--bg, #fff); padding: 0 24px 24px 0; text-align: left; align-items: flex-start; }
${p.media ? `${p.hero} > ${p.media} { grid-column: ${span - 1} / -1; grid-row: 1; margin-top: ${Math.round(v.drop)}px; height: ${v.height}px; }` : ''}
${mobile(p, `  ${p.copy} { padding: 0; }\n  ${p.media ? `${p.hero} > ${p.media} { margin-top: 0; }` : ''}\n`)}`;
    },
    attributes: { family: 'hero-layout', columns: 12, media: 'overlapping' },
  },
  {
    id: 'index',
    label: 'Index columns',
    description: 'The label in a narrow margin column, the copy beside it, the picture kept small',
    mood: { formality: 0.6, density: 0.4, warmth: -0.3, classic: 0.2 },
    goals: ['leads', 'credibility', 'sales'],
    needsMedia: false,
    params: [
      { name: 'margin', base: 10, spread: 2, min: 7, max: 14 },
      { name: 'ratio', base: 1.7, spread: 0.3, min: 1.3, max: 2.3 },
    ],
    thumb: svg(
      `<rect x="4" y="6" width="7" height="1.6" fill="${acc}"/><path d="M4 4.5h40" stroke="${ink}" stroke-width=".5"/>${lines(14, 6, 18)}<rect x="14" y="17" width="14" height="1.6" fill="${soft}"/>${btn(14, 21)}<rect x="35" y="6" width="9" height="12" fill="${art}"/>`,
    ),
    css: (p, v) => `${base(p)}
${p.hero} { grid-template-columns: ${p.media ? `${v.ratio}fr 1fr` : '1fr'}; align-items: start; border-top: 1px solid var(--line, currentColor); }
${p.copy} { display: grid; grid-template-columns: ${v.margin}rem minmax(0, 1fr); grid-auto-flow: dense; column-gap: 24px; text-align: left; justify-items: start; align-items: start; }
${p.copy} > * { grid-column: 2; }
${p.copy} > :first-child:not(${p.headline.split(' ').pop()}) { grid-column: 1; grid-row: 1 / span 3; border: 0; border-top: 1px solid var(--line, currentColor); border-radius: 0; background: none; padding: 10px 0 0; width: 100%; line-height: 1.5; }
${p.media ? `${p.hero} > ${p.media} { height: auto; aspect-ratio: 4 / 5; }` : ''}
${mobile(p)}`,
    attributes: { family: 'hero-layout', columns: 3, media: 'small' },
  },
  {
    id: 'band',
    label: 'Picture band',
    description:
      'A wide, short picture across the top, then the headline and the rest side by side',
    mood: { warmth: 0.4, energy: -0.3, density: -0.2, classic: 0.2 },
    goals: ['bookings', 'awareness', 'credibility'],
    needsMedia: true,
    params: [
      { name: 'height', base: 40, spread: 6, min: 30, max: 52 },
      { name: 'ratio', base: 1.3, spread: 0.25, min: 1, max: 1.8 },
    ],
    thumb: svg(
      `<rect x="0" y="0" width="48" height="12" fill="${art}"/>${lines(4, 16, 18)}<rect x="27" y="16" width="16" height="1.6" fill="${soft}"/><rect x="27" y="19" width="12" height="1.6" fill="${soft}"/>${btn(27, 23)}`,
    ),
    css: (p, v) => `${base(p)}
${p.hero} { grid-template-columns: 1fr; align-items: start; }
${p.media ? `${p.hero} > ${p.media} { order: -1; width: 100%; height: ${v.height}vh; border-radius: 0; }` : ''}
${p.copy} { display: grid; grid-template-columns: ${v.ratio}fr 1fr; grid-auto-flow: dense; column-gap: clamp(24px, 4vw, 64px); text-align: left; justify-items: start; align-items: start; }
${p.copy} > * { grid-column: 2; }
${p.headline} { grid-column: 1; grid-row: 1 / span 5; align-self: end; }
${mobile(p)}`,
    attributes: { family: 'hero-layout', columns: 2, media: 'band above' },
  },
];

export interface SelectedLayout {
  id: string;
  label: string;
  slot: Slot;
  ref: HeroLayoutRef;
  params: Record<string, number>;
  attributes: Record<string, string | number>;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Three hero compositions for the brief, with their proportions perturbed by noise. */
export function selectHeroLayouts(opts: {
  mood: Mood;
  goal: Goal;
  noise: number;
  rng: Rng;
  hasMedia: boolean;
  exclude?: string[];
}): SelectedLayout[] {
  const pool = HERO_LAYOUTS.filter(
    (l) => (opts.hasMedia || !l.needsMedia) && !opts.exclude?.includes(l.id),
  );
  return selectReferences(pool, opts).map((pick) => {
    const params: Record<string, number> = {};
    for (const prm of pick.item.params)
      params[prm.name] = (
        prm.base >= 20 ? Math.round : prm.base >= 5 ? (x: number) => Math.round(x * 10) / 10 : round
      )(
        Math.min(
          prm.max,
          Math.max(prm.min, prm.base + opts.rng.gauss() * prm.spread * (0.3 + opts.noise)),
        ),
      );
    return {
      id: `${pick.slot}-${pick.item.id}`,
      label: `${SLOT_LABEL[pick.slot]} · ${pick.item.label}`,
      slot: pick.slot,
      ref: pick.item,
      params,
      attributes: {
        slot: pick.slot,
        ...(pick.item.attributes ?? {}),
        layout: pick.item.id,
        distance: round(pick.distance),
        ...params,
      },
    };
  });
}

export function heroLayoutCss(layout: SelectedLayout, parts: HeroParts): string {
  return layout.ref
    .css(parts, layout.params)
    .split('\n')
    .filter((l) => l.trim())
    .join('\n');
}
