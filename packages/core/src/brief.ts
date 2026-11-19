/* The brief: story, audience, goal, feeling. Everything Sitemaxxing proposes starts here. */

import type { Brief, Goal, Mood } from './types';
import { newSeed } from './random';

export const GOALS: Record<Goal, { label: string; verb: string; cta: string[]; serves: Record<string, number> }> = {
  signups: { label: 'Sign-ups', verb: 'sign up', cta: ['Create an account', 'Start your first project', 'Make an account'], serves: { action: 1, clarity: 0.9, trust: 0.6, character: 0.45, mood: 0.3, polish: 0.4 } },
  sales: { label: 'Sales', verb: 'buy', cta: ['See pricing', 'Choose a plan', 'Order now'], serves: { action: 1, trust: 0.85, clarity: 0.8, character: 0.45, mood: 0.35, polish: 0.4 } },
  bookings: { label: 'Bookings', verb: 'book', cta: ['Check dates', 'Book a date', 'See availability'], serves: { action: 1, mood: 0.75, trust: 0.7, clarity: 0.7, character: 0.55, polish: 0.4 } },
  leads: { label: 'Leads', verb: 'get in touch', cta: ['Talk to us', 'Book a call', 'Ask a question'], serves: { action: 1, trust: 0.9, clarity: 0.8, character: 0.35, mood: 0.25, polish: 0.45 } },
  credibility: { label: 'Credibility', verb: 'trust you', cta: ['See the work', 'Read how it works', 'See the results'], serves: { trust: 1, clarity: 0.9, polish: 0.7, character: 0.5, action: 0.45, mood: 0.35 } },
  awareness: { label: 'Awareness', verb: 'remember you', cta: ['See how it works', 'Take a look', 'Explore'], serves: { character: 1, mood: 0.95, clarity: 0.7, polish: 0.55, trust: 0.4, action: 0.35 } },
};

export const GOAL_IDS = Object.keys(GOALS) as Goal[];

const AXES: Array<keyof Mood> = ['energy', 'warmth', 'formality', 'classic', 'density', 'dark'];

/** Feeling words and story keywords mapped to mood deltas. Synonyms share entries. */
const LEXICON: Array<[RegExp, Partial<Mood>]> = [
  [/\b(calm|quiet|serene|gentle|soft|still|restful|peaceful)\b/, { energy: -0.7, density: -0.3 }],
  [/\b(bold|loud|confident|punchy|striking|vivid|energetic|fierce)\b/, { energy: 0.75 }],
  [/\b(playful|fun|friendly|cheeky|quirky|whimsical|joyful)\b/, { formality: -0.7, energy: 0.3, warmth: 0.3 }],
  [/\b(serious|professional|formal|corporate|institutional|sober)\b/, { formality: 0.7, energy: -0.2 }],
  [/\b(precise|technical|exact|engineered|scientific|data|analytical|clinical)\b/, { formality: 0.5, warmth: -0.45, classic: -0.3 }],
  [/\b(warm|cozy|cosy|human|welcoming|homely|earthy|organic)\b/, { warmth: 0.75 }],
  [/\b(cool|crisp|icy|clean|fresh|arctic|polar)\b/, { warmth: -0.6 }],
  [/\b(luxurious|luxury|premium|exclusive|elegant|refined|sophisticated)\b/, { classic: 0.55, formality: 0.5, energy: -0.3, density: -0.4 }],
  [/\b(classic|timeless|heritage|traditional|vintage|editorial|literary)\b/, { classic: 0.75 }],
  [/\b(modern|contemporary|futuristic|cutting|digital|new)\b/, { classic: -0.6 }],
  [/\b(rugged|raw|wild|outdoor|adventurous|adventure|expedition|tough|honest)\b/, { warmth: 0.1, formality: -0.2, energy: 0.35, classic: 0.2 }],
  [/\b(minimal|simple|spare|sparse|airy|spacious|light)\b/, { density: -0.7, energy: -0.2 }],
  [/\b(dense|rich|detailed|packed|layered|maximal|maximalist)\b/, { density: 0.7, energy: 0.3 }],
  [/\b(dark|moody|night|nocturnal|cinematic|dramatic|mysterious)\b/, { dark: 0.8, energy: 0.2 }],
  [/\b(bright|sunny|airy|daylight|optimistic|cheerful)\b/, { dark: -0.6, warmth: 0.3, energy: 0.2 }],
  [/\b(trustworthy|reliable|safe|secure|steady|dependable)\b/, { formality: 0.45, energy: -0.3, classic: 0.2 }],
  [/\b(artisan|craft|crafted|handmade|small-batch|independent)\b/, { warmth: 0.55, classic: 0.45 }],
  [/\b(kids|children|family|school)\b/, { formality: -0.55, warmth: 0.45, energy: 0.35 }],
  [/\b(finance|bank|legal|law|insurance|accounting)\b/, { formality: 0.7, classic: 0.3, energy: -0.3 }],
  [/\b(software|saas|api|developer|cloud|ai|platform|startup)\b/, { classic: -0.4, warmth: -0.2 }],
  [/\b(food|coffee|bakery|restaurant|kitchen|wine|farm)\b/, { warmth: 0.6, classic: 0.25 }],
  [/\b(music|nightlife|club|festival|gaming|game)\b/, { energy: 0.6, dark: 0.45, formality: -0.4 }],
  [/\b(health|wellness|care|clinic|therapy|yoga|sleep)\b/, { energy: -0.5, warmth: 0.35, density: -0.35 }],
  [/\b(fashion|beauty|design|studio|gallery|art)\b/, { classic: 0.15, density: -0.25, energy: 0.2 }],
];

/** "no dark mode", "nothing that moves" → hard limits the planner and generators respect. */
export interface Avoid {
  dark: boolean;
  motion: boolean;
  serif: boolean;
  bright: boolean;
}

export function avoidOf(brief: Pick<Brief, 'avoid'>): Avoid {
  const text = (brief.avoid ?? []).join(' ').toLowerCase();
  return {
    dark: /\bdark\b|black background/.test(text),
    motion: /motion|animat|moves|moving|preloader|loader/.test(text),
    serif: /\bserif/.test(text) && !/sans/.test(text),
    bright: /bright|neon|loud colou?r|saturated/.test(text),
  };
}

const clamp = (v: number) => Math.max(-1, Math.min(1, v));

/** Reads the story and the feeling words into a mood. Feeling words count twice as much. */
export function moodOf(brief: Pick<Brief, 'story' | 'audience' | 'feeling' | 'avoid'>): Mood {
  const mood: Mood = { energy: 0, warmth: 0, formality: 0, classic: 0, density: 0, dark: 0 };
  const apply = (text: string, weight: number) => {
    const t = text.toLowerCase();
    for (const [re, delta] of LEXICON) {
      if (!re.test(t)) continue;
      for (const k of AXES) if (delta[k] !== undefined) mood[k] += delta[k]! * weight;
    }
  };
  apply(`${brief.story} ${brief.audience}`, 0.5);
  for (const f of brief.feeling) apply(f, 1);
  const avoid = avoidOf(brief);
  if (avoid.dark) mood.dark = Math.min(mood.dark, -0.6);
  if (avoid.motion) mood.energy = Math.min(mood.energy, 0);
  for (const k of AXES) mood[k] = Math.round(clamp(mood[k]) * 100) / 100;
  return mood;
}

/** Distance between two moods, 0 (identical) to ~1 (opposite). Missing axes count as neutral. */
export function moodDistance(a: Partial<Mood>, b: Partial<Mood>): number {
  let sum = 0;
  for (const k of AXES) sum += ((a[k] ?? 0) - (b[k] ?? 0)) ** 2;
  return Math.sqrt(sum / AXES.length) / 2;
}

/** How well something tagged with `bias` suits `mood`, from 0.5 (fights it) to 1.5 (fits it). */
export function moodFit(bias: Partial<Mood> | undefined, mood: Mood): number {
  if (!bias) return 1;
  let dot = 0;
  let n = 0;
  for (const k of AXES) {
    if (bias[k] === undefined) continue;
    dot += bias[k]! * mood[k];
    n += Math.abs(bias[k]!);
  }
  return n ? 1 + 0.5 * Math.max(-1, Math.min(1, dot / n)) : 1;
}

export function describeMood(mood: Mood): string[] {
  const out: string[] = [];
  const word = (v: number, neg: string, pos: string) => (v <= -0.25 ? neg : v >= 0.25 ? pos : null);
  for (const w of [
    word(mood.energy, 'calm', 'bold'),
    word(mood.warmth, 'cool', 'warm'),
    word(mood.formality, 'playful', 'serious'),
    word(mood.classic, 'contemporary', 'classic'),
    word(mood.density, 'airy', 'dense'),
    word(mood.dark, 'light', 'dark'),
  ])
    if (w) out.push(w);
  return out.length ? out : ['neutral'];
}

export const DEFAULT_NOISE = 0.35;

/** Fills defaults and validates. Throws with a plain message when the story is missing. */
export function normalizeBrief(input: Partial<Brief>, opts: { requireStory?: boolean } = {}): Brief {
  const story = (input.story ?? '').trim();
  if (opts.requireStory !== false && story.length < 12) throw new Error('Tell the story first: one or two sentences on what this is and why it exists.');
  const goal = (GOAL_IDS.includes(input.goal as Goal) ? input.goal : 'signups') as Goal;
  const feeling = (input.feeling ?? [])
    .flatMap((f) => String(f).split(/[,;]/))
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  const noise = Math.max(0, Math.min(1, Number.isFinite(input.noise) ? Number(input.noise) : DEFAULT_NOISE));
  return {
    story,
    audience: (input.audience ?? '').trim(),
    goal,
    feeling,
    keep: { colors: !!input.keep?.colors, fonts: !!input.keep?.fonts, copy: !!input.keep?.copy },
    avoid: (input.avoid ?? []).map((a) => String(a).trim()).filter(Boolean),
    noise,
    seed: Number.isFinite(input.seed) ? Number(input.seed) >>> 0 : newSeed(),
  };
}
