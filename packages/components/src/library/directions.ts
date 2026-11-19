/* Curated reference directions. Each is an original palette placed on the mood axes. The Direction
   pass picks three for the brief and perturbs them with seeded noise, so two sites with the same
   brief rarely end up with the same colours. */

import { contrast, ensureContrast, hexToOklch, hueDistance, hueName, oklchToHex, type Goal, type Mood, type Oklch, type Rng } from '@sitemaxxing/core';
import { selectReferences, SLOT_LABEL, type Reference, type Slot } from './select';

export interface DirectionRef extends Reference {
  paper: Oklch;
  ink: Oklch;
  accent: Oklch;
  /** Dot/art colour: the accent or the ink. */
  dot: 'accent' | 'ink';
}

const o = (l: number, c: number, h: number): Oklch => ({ l, c, h });

export const DIRECTION_REFS: DirectionRef[] = [
  { id: 'lab', label: 'Lab', mood: { energy: 0.3, formality: 0.3, classic: -0.4, warmth: -0.1 }, goals: ['signups', 'sales'], paper: o(0.94, 0.006, 95), ink: o(0.18, 0, 0), accent: o(0.66, 0.2, 35), dot: 'ink', attributes: { tone: 'neutral', contrast: 'high' } },
  { id: 'editorial', label: 'Editorial', mood: { classic: 0.7, warmth: 0.5, energy: -0.3 }, goals: ['credibility', 'awareness'], paper: o(0.955, 0.016, 80), ink: o(0.2, 0.01, 60), accent: o(0.4, 0.07, 145), dot: 'accent', attributes: { tone: 'warm', contrast: 'medium' } },
  { id: 'signal', label: 'Signal', mood: { dark: 0.8, energy: 0.5, classic: -0.5 }, goals: ['awareness', 'signups'], paper: o(0.17, 0.04, 265), ink: o(0.95, 0.01, 265), accent: o(0.82, 0.16, 75), dot: 'accent', attributes: { tone: 'dark', contrast: 'high' } },
  { id: 'glacier', label: 'Glacier', mood: { warmth: -0.7, energy: -0.3, formality: 0.3 }, goals: ['credibility', 'leads'], paper: o(0.97, 0.01, 230), ink: o(0.22, 0.03, 250), accent: o(0.55, 0.13, 240), dot: 'accent', attributes: { tone: 'cool', contrast: 'medium' } },
  { id: 'terracotta', label: 'Terracotta', mood: { warmth: 0.8, classic: 0.3 }, goals: ['bookings', 'sales'], paper: o(0.95, 0.025, 60), ink: o(0.25, 0.03, 40), accent: o(0.58, 0.14, 40), dot: 'accent', attributes: { tone: 'warm', contrast: 'medium' } },
  { id: 'ink-gold', label: 'Ink and gold', mood: { dark: 0.7, classic: 0.7, formality: 0.6, energy: -0.3 }, goals: ['sales', 'credibility'], paper: o(0.16, 0.005, 80), ink: o(0.93, 0.02, 85), accent: o(0.78, 0.11, 85), dot: 'accent', attributes: { tone: 'dark', contrast: 'high' } },
  { id: 'risograph', label: 'Risograph', mood: { formality: -0.7, energy: 0.6, warmth: 0.3 }, goals: ['awareness', 'signups'], paper: o(0.96, 0.02, 100), ink: o(0.25, 0.05, 280), accent: o(0.65, 0.22, 350), dot: 'accent', attributes: { tone: 'playful', contrast: 'medium' } },
  { id: 'field', label: 'Field', mood: { warmth: 0.3, energy: 0.3, classic: 0.2, formality: -0.2 }, goals: ['bookings', 'awareness'], paper: o(0.93, 0.02, 110), ink: o(0.24, 0.03, 140), accent: o(0.62, 0.15, 55), dot: 'ink', attributes: { tone: 'earthy', contrast: 'medium' } },
  { id: 'clinic', label: 'Clinic', mood: { energy: -0.6, warmth: 0.2, density: -0.5 }, goals: ['bookings', 'leads'], paper: o(0.98, 0.008, 170), ink: o(0.27, 0.02, 200), accent: o(0.6, 0.1, 175), dot: 'accent', attributes: { tone: 'calm', contrast: 'medium' } },
  { id: 'newsprint', label: 'Newsprint', mood: { density: 0.6, formality: 0.5, classic: 0.4 }, goals: ['credibility', 'awareness'], paper: o(0.93, 0.004, 90), ink: o(0.15, 0, 0), accent: o(0.5, 0.19, 25), dot: 'ink', attributes: { tone: 'neutral', contrast: 'high' } },
  { id: 'midnight', label: 'Midnight lab', mood: { dark: 0.8, warmth: -0.5, classic: -0.6 }, goals: ['signups', 'leads'], paper: o(0.14, 0.01, 250), ink: o(0.92, 0.01, 250), accent: o(0.75, 0.17, 150), dot: 'accent', attributes: { tone: 'dark', contrast: 'high' } },
  { id: 'pastel', label: 'Pastel studio', mood: { formality: -0.3, energy: -0.1, density: -0.4, warmth: 0.1 }, goals: ['awareness', 'bookings'], paper: o(0.97, 0.015, 300), ink: o(0.25, 0.02, 300), accent: o(0.62, 0.14, 300), dot: 'accent', attributes: { tone: 'soft', contrast: 'medium' } },
];

export interface GeneratedDirection {
  id: string;
  label: string;
  slot: Slot;
  refId: string;
  tokens: Record<string, string>;
  thumbnail: string;
  attributes: Record<string, string | number>;
}

export interface DirectionOptions {
  mood: Mood;
  goal: Goal;
  noise: number;
  rng: Rng;
  /** Keep this accent colour (from the site's current tokens) and vary everything around it. */
  keepAccent?: string;
  avoidDark?: boolean;
  avoidBright?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Builds the token set from a reference, perturbed by noise. All text pairs meet WCAG AA. */
function realize(ref: DirectionRef, slot: Slot, opts: DirectionOptions): GeneratedDirection {
  const { rng, noise } = opts;
  // Wildcards wander further than fits.
  const spread = noise * (slot === 'fit' ? 0.5 : slot === 'stretch' ? 0.85 : 1.3);
  const dark = ref.paper.l < 0.5;
  const paper = o(clamp(ref.paper.l + rng.gauss() * 0.012 * spread, dark ? 0.1 : 0.9, dark ? 0.24 : 0.99), clamp(ref.paper.c + rng.gauss() * 0.008 * spread, 0, 0.04), (ref.paper.h + rng.gauss() * 25 * spread + 360) % 360);
  let accent: Oklch = opts.keepAccent
    ? hexToOklch(opts.keepAccent)
    : o(ref.accent.l, clamp(ref.accent.c + rng.gauss() * 0.04 * spread, 0.03, opts.avoidBright ? 0.13 : 0.26), (ref.accent.h + rng.gauss() * 38 * spread + 360) % 360);
  const bg = oklchToHex(paper);
  const ink = oklchToHex(ensureContrast(o(ref.ink.l, ref.ink.c, (ref.ink.h + rng.gauss() * 20 * spread + 360) % 360), bg, 12));
  const soft = oklchToHex(ensureContrast(o(dark ? 0.72 : 0.45, ref.ink.c + 0.005, ref.ink.h), bg, 4.8));
  const line = oklchToHex(o(dark ? paper.l + 0.09 : paper.l - 0.085, paper.c + 0.004, paper.h));
  // Accent is used for large headline words and the logo mark, so 3:1 is the floor; push to 4.5.
  accent = ensureContrast(accent, bg, 4.5);
  const acc = oklchToHex(accent);
  const tokens: Record<string, string> = { '--bg': bg, '--ink': ink, '--soft': soft, '--line': line, '--acc': acc, '--dot': ref.dot === 'accent' ? acc : ink };
  const hue = hueName(accent.h, accent.c);
  return {
    id: `${slot}-${ref.id}`,
    label: `${SLOT_LABEL[slot]} · ${ref.label}, ${hue}`,
    slot,
    refId: ref.id,
    tokens,
    thumbnail: thumb(tokens),
    attributes: {
      ...ref.attributes,
      slot,
      reference: ref.id,
      accentHue: Math.round(accent.h),
      accentChroma: Math.round(accent.c * 1000) / 1000,
      paperLightness: Math.round(paper.l * 100) / 100,
      dark: dark ? 1 : 0,
      inkContrast: Math.round(contrast(ink, bg) * 10) / 10,
      spread: Math.round(spread * 100) / 100,
    },
  };
}

function thumb(t: Record<string, string>): string {
  return `<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="${t['--bg']}"/><rect x="5" y="8" width="22" height="4" fill="${t['--ink']}"/><rect x="5" y="15" width="15" height="3" fill="${t['--soft']}"/><rect x="5" y="22" width="9" height="3" rx="1.5" fill="${t['--ink']}"/><circle cx="37" cy="15" r="7" fill="${t['--acc']}"/><circle cx="37" cy="15" r="3" fill="${t['--bg']}" opacity=".5"/></svg>`;
}

export function generateDirections(opts: DirectionOptions): GeneratedDirection[] {
  let refs = DIRECTION_REFS;
  if (opts.avoidDark) refs = refs.filter((r) => r.paper.l > 0.5);
  if (opts.keepAccent) {
    // Prefer references whose accent family is near the kept colour.
    const h = hexToOklch(opts.keepAccent).h;
    refs = [...refs].sort((a, b) => hueDistance(a.accent.h, h) - hueDistance(b.accent.h, h)).slice(0, 8);
  }
  return selectReferences(refs, opts).map((p) => realize(p.item, p.slot, opts));
}
