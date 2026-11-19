/* The component library: every component is a reference point with a mood and the goals it
   serves. Passes ask for a slot and get three picks (fit, stretch, wildcard) for the brief. */

import type { Goal, Mood, Rng } from '@sitemaxxing/core';
import { selectReferences, SLOT_LABEL, type Reference, type Slot } from './select';
import { HERO_FIELD_CSS, HERO_FIELD_THUMBS, HERO_FIELD_TSX } from './hero-field';
import * as S from './sections';
import { NAV_THUMBS } from '../navigation';
import { PRELOADER_THUMBS } from '../preloader';
import { REVEAL_THUMBS } from '../reveal';

export type ComponentSlot = 'hero-art' | 'nav' | 'preloader' | 'reveal' | 'proof' | 'features' | 'cta';

export interface ComponentParam {
  name: string;
  base: number;
  /** How far noise may move it, in each direction. */
  spread: number;
  min: number;
  max: number;
}

export interface ComponentSpec extends Reference {
  slot: ComponentSlot;
  description: string;
  thumb: string;
  /** Content keys the component needs; it is never proposed without them. */
  requires?: string[];
  files?: Array<{ name: string; code: string }>;
  css?: string;
  /** JSX that renders it, given the expression for the content object and the realized params. */
  usage?: (a: { content: string; params: Record<string, number>; seed: number; title: string }) => string;
  params?: ComponentParam[];
}

const heroField = (id: string, label: string, mood: Partial<Mood>, goals: Goal[], description: string): ComponentSpec => ({
  id,
  label,
  slot: 'hero-art',
  mood,
  goals,
  description,
  thumb: HERO_FIELD_THUMBS[id],
  files: [{ name: 'HeroField.tsx', code: HERO_FIELD_TSX }],
  css: HERO_FIELD_CSS,
  params: [
    { name: 'density', base: 1, spread: 0.35, min: 0.55, max: 1.5 },
    { name: 'speed', base: 1, spread: 0.4, min: 0.4, max: 1.6 },
  ],
  usage: ({ params, seed }) => `<HeroField mode="${id}" density={${params.density}} speed={${params.speed}} seed={${seed}} />`,
  attributes: { family: 'hero-field', mode: id },
});

const section = (
  id: string,
  slot: ComponentSlot,
  label: string,
  mood: Partial<Mood>,
  goals: Goal[],
  description: string,
  file: string,
  code: string,
  css: string,
  requires: string[],
  usage: ComponentSpec['usage'],
): ComponentSpec => ({
  id,
  slot,
  label,
  mood,
  goals,
  description,
  thumb: S.SECTION_THUMBS[id],
  requires,
  files: [
    { name: 'section-types.ts', code: S.SECTION_TYPES_TSX },
    { name: file, code },
  ],
  css,
  usage,
  attributes: { family: slot, component: id },
});

export const COMPONENTS: ComponentSpec[] = [
  heroField('morph', 'Morphing shapes', { energy: 0.3, formality: -0.3, classic: -0.4 }, ['awareness', 'signups'], 'Dots that morph between shapes every few seconds'),
  heroField('globe', 'Dot globe', { formality: 0.3, classic: -0.5, warmth: -0.4 }, ['signups', 'leads', 'credibility'], 'A rotating sphere of dots, size and opacity by depth'),
  heroField('wave', 'Field wave', { energy: -0.2, warmth: -0.1, density: 0.2 }, ['signups', 'awareness'], 'A grid of dots on a slow sine wave that parts for the cursor'),
  heroField('contour', 'Contour lines', { warmth: 0.2, classic: 0.2, energy: -0.3, formality: 0.1 }, ['bookings', 'credibility', 'awareness'], 'Stacked elevation lines that bend around the cursor'),
  heroField('orbits', 'Orbits', { classic: -0.3, energy: 0.2, dark: 0.4, formality: 0.2 }, ['awareness', 'leads'], 'Tilted rings with bodies in motion; the cursor tilts the system'),

  { id: 'tiles', label: 'Preview tiles', slot: 'nav', mood: { density: 0.4, formality: 0.2 }, goals: ['bookings', 'sales'], description: 'Dropdown with an art tile and a line per destination', thumb: NAV_THUMBS.tiles },
  { id: 'fullscreen-circle', label: 'Fullscreen · circle', slot: 'nav', mood: { energy: 0.6, classic: -0.4 }, goals: ['awareness'], description: 'Menu that reveals from the corner in a circle', thumb: NAV_THUMBS['fullscreen-circle'] },
  { id: 'fullscreen-curtain', label: 'Fullscreen · curtain', slot: 'nav', mood: { energy: 0.3, classic: 0.3 }, goals: ['awareness', 'credibility'], description: 'Menu that drops like a curtain', thumb: NAV_THUMBS['fullscreen-curtain'] },
  { id: 'fullscreen-split', label: 'Fullscreen · split', slot: 'nav', mood: { energy: 0.5, formality: -0.2 }, goals: ['awareness', 'signups'], description: 'Menu that opens from the centre', thumb: NAV_THUMBS['fullscreen-split'] },
  { id: 'drawer', label: 'Side drawer', slot: 'nav', mood: { energy: -0.4, density: -0.3 }, goals: ['leads', 'bookings', 'signups'], description: 'A quiet drawer from the right edge', thumb: NAV_THUMBS.drawer },

  { id: 'counter', label: 'Counter wipe', slot: 'preloader', mood: { energy: 0.4, formality: 0.3, classic: -0.3 }, goals: ['awareness'], description: 'Counts to 100, then wipes up', thumb: PRELOADER_THUMBS.counter },
  { id: 'curtain', label: 'Split curtain', slot: 'preloader', mood: { classic: 0.5, energy: 0.1 }, goals: ['awareness', 'sales'], description: 'Two panels part from the centre', thumb: PRELOADER_THUMBS.curtain },
  { id: 'stack', label: 'Image stack', slot: 'preloader', mood: { warmth: 0.4, formality: -0.2 }, goals: ['awareness', 'bookings'], description: 'Cards land, then zoom through', thumb: PRELOADER_THUMBS.stack },

  { id: 'rise', label: 'Line rise', slot: 'reveal', mood: { energy: -0.1, classic: 0.2 }, goals: ['credibility', 'sales', 'leads'], description: 'Lines rise from a clip', thumb: REVEAL_THUMBS.rise },
  { id: 'words', label: 'Word stagger', slot: 'reveal', mood: { energy: 0.4, formality: -0.2 }, goals: ['awareness', 'signups'], description: 'Words arrive one after another', thumb: REVEAL_THUMBS.words },
  { id: 'blur', label: 'Blur in', slot: 'reveal', mood: { energy: -0.4, dark: 0.3, classic: -0.2 }, goals: ['awareness', 'bookings'], description: 'The headline sharpens from a blur', thumb: REVEAL_THUMBS.blur },

  section('metric-strip', 'proof', 'Metric strip', { formality: 0.4, warmth: -0.2 }, ['credibility', 'sales', 'signups', 'leads'], 'Your figures as big numbers in a row', 'MetricStrip.tsx', S.METRIC_STRIP_TSX, S.METRIC_STRIP_CSS, ['facts'], ({ content }) => `<MetricStrip items={${content}.facts} />`),
  section('pull-quote', 'proof', 'Pull quote', { warmth: 0.5, classic: 0.3 }, ['credibility', 'bookings', 'leads'], 'One customer voice with room around it', 'PullQuote.tsx', S.PULL_QUOTE_TSX, S.PULL_QUOTE_CSS, ['quote'], ({ content }) => `<PullQuote quote={${content}.quote} />`),
  section('fact-ticker', 'proof', 'Fact ticker', { energy: 0.6, formality: -0.3 }, ['awareness', 'signups'], 'Your figures as a slow running band', 'FactTicker.tsx', S.FACT_TICKER_TSX, S.FACT_TICKER_CSS, ['facts'], ({ content }) => `<FactTicker items={${content}.facts} />`),

  section('numbered-rows', 'features', 'Numbered rows', { energy: -0.3, classic: 0.3, density: -0.2 }, ['credibility', 'leads', 'bookings'], 'Features as numbered rows: number, title, sentence', 'NumberedRows.tsx', S.NUMBERED_ROWS_TSX, S.NUMBERED_ROWS_CSS, ['features'], ({ content }) => `<NumberedRows items={${content}.features} />`),
  section('bento-grid', 'features', 'Bento grid', { energy: 0.3, classic: -0.5, formality: -0.1 }, ['signups', 'awareness', 'sales'], 'Features as a grid where one leads', 'BentoGrid.tsx', S.BENTO_GRID_TSX, S.BENTO_GRID_CSS, ['features'], ({ content }) => `<BentoGrid items={${content}.features} />`),
  section('spec-list', 'features', 'Spec sheet', { density: 0.7, formality: 0.6, warmth: -0.3 }, ['sales', 'leads', 'credibility'], 'A dense two-column spec sheet', 'SpecList.tsx', S.SPEC_LIST_TSX, S.SPEC_LIST_CSS, ['features'], ({ content }) => `<SpecList items={${content}.features} facts={${content}.facts} />`),

  section('closing-band', 'cta', 'Closing band', { energy: 0.5 }, ['signups', 'sales', 'awareness'], 'A full-width band with one line and one button', 'ClosingBand.tsx', S.CLOSING_BAND_TSX, S.CLOSING_BAND_CSS, ['cta'], ({ content, title }) => `<ClosingBand title={${title}} cta={${content}.cta} />`),
  section('sticky-bar', 'cta', 'Sticky next step', { formality: 0.2 }, ['bookings', 'sales', 'leads'], 'A slim bar that keeps the next step in reach after the hero', 'StickyBar.tsx', S.STICKY_BAR_TSX, S.STICKY_BAR_CSS, ['cta'], ({ content, title }) => `<StickyBar title={${title}} cta={${content}.cta} />`),
  section('split-cta', 'cta', 'Split close', { classic: 0.3, energy: -0.2, formality: 0.3 }, ['leads', 'credibility', 'bookings'], 'The claim on the left, the step on the right', 'SplitCta.tsx', S.SPLIT_CTA_TSX, S.SPLIT_CTA_CSS, ['cta'], ({ content, title }) => `<SplitCta title={${title}} cta={${content}.cta} />`),
];

export interface SelectedComponent {
  id: string;
  label: string;
  slot: Slot;
  spec: ComponentSpec;
  params: Record<string, number>;
  attributes: Record<string, string | number>;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Picks three components for a slot, perturbing their numeric params with noise. */
export function selectComponents(
  slot: ComponentSlot,
  opts: { mood: Mood; goal: Goal; noise: number; rng: Rng; has?: (key: string) => boolean; filter?: (spec: ComponentSpec) => boolean },
): SelectedComponent[] {
  const pool = COMPONENTS.filter((c) => c.slot === slot && (c.requires ?? []).every((k) => !opts.has || opts.has(k)) && (!opts.filter || opts.filter(c)));
  return selectReferences(pool, opts).map((p) => {
    const params: Record<string, number> = {};
    for (const prm of p.item.params ?? []) params[prm.name] = round(Math.min(prm.max, Math.max(prm.min, prm.base + opts.rng.gauss() * prm.spread * (0.3 + opts.noise))));
    return {
      id: `${p.slot}-${p.item.id}`,
      label: `${SLOT_LABEL[p.slot]} · ${p.item.label}`,
      slot: p.slot,
      spec: p.item,
      params,
      attributes: { slot: p.slot, ...(p.item.attributes ?? {}), component: p.item.id, distance: round(p.distance), ...params },
    };
  });
}

export function componentById(slot: ComponentSlot, id: string): ComponentSpec | undefined {
  return COMPONENTS.find((c) => c.slot === slot && c.id === id);
}

/** Variant ids look like `fit-<component>`; this returns the component id. */
export function componentIdOf(variantId: string | undefined): string | undefined {
  return variantId?.replace(/^(fit|stretch|wildcard)-/, '');
}
