/* Taste: what the owner's "why not?" answers teach the next roll.
   No Node imports: the control room shows the lean on each pass. */

import type { Mood, ReasonChip } from './types';

export interface Lean {
  mood: Partial<Mood>;
  /** Added to the brief's noise for this pass. */
  noise: number;
}

/** How each answer nudges the next options. "Off-brand" pulls back toward the brief itself. */
export const CHIP_LEAN: Record<ReasonChip, Lean> = {
  'too busy': { mood: { density: -0.4, energy: -0.25 }, noise: 0 },
  'too plain': { mood: { energy: 0.35, density: 0.2 }, noise: 0.15 },
  'off-brand': { mood: {}, noise: -0.25 },
  'too trendy': { mood: { classic: 0.4, energy: -0.15 }, noise: -0.1 },
};

/** A pass answered directly leans fully; the rest of the page leans a little the same way. */
export const SPILLOVER = 0.35;
const CAP = 0.6;

const AXES: Array<keyof Mood> = ['energy', 'warmth', 'formality', 'classic', 'density', 'dark'];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The lean for one pass, given the latest answer per pass (null = no answer).
 * Its own answer counts fully, every other pass's answer counts at SPILLOVER.
 */
export function leanFor(defId: string, answers: Record<string, ReasonChip | null>): Lean {
  const mood: Partial<Mood> = {};
  let noise = 0;
  for (const [id, chip] of Object.entries(answers)) {
    if (!chip || !CHIP_LEAN[chip]) continue;
    const w = id === defId ? 1 : SPILLOVER;
    const l = CHIP_LEAN[chip];
    for (const k of AXES) if (l.mood[k] !== undefined) mood[k] = (mood[k] ?? 0) + l.mood[k]! * w;
    noise += l.noise * w;
  }
  for (const k of AXES) if (mood[k] !== undefined) mood[k] = r2(clamp(mood[k]!, -CAP, CAP));
  return { mood, noise: r2(clamp(noise, -CAP, CAP)) };
}

export function isNeutral(lean: Lean): boolean {
  return Math.abs(lean.noise) < 0.05 && AXES.every((k) => Math.abs(lean.mood[k] ?? 0) < 0.05);
}

/** The brief's mood and noise with the lean applied, kept inside their ranges. */
export function applyLean(mood: Mood, noise: number, lean: Lean): { mood: Mood; noise: number } {
  const out = { ...mood };
  for (const k of AXES) out[k] = r2(clamp(mood[k] + (lean.mood[k] ?? 0), -1, 1));
  return { mood: out, noise: r2(clamp(noise + lean.noise, 0, 1)) };
}

/** Plain words for the control room: "calmer", "sparser", "closer to the brief". */
export function describeLean(lean: Lean): string[] {
  const out: string[] = [];
  const words: Array<[keyof Mood, string, string]> = [
    ['energy', 'calmer', 'bolder'],
    ['density', 'sparser', 'fuller'],
    ['classic', 'more contemporary', 'more classic'],
    ['warmth', 'cooler', 'warmer'],
    ['formality', 'looser', 'more formal'],
    ['dark', 'lighter', 'darker'],
  ];
  for (const [k, neg, pos] of words) {
    const v = lean.mood[k] ?? 0;
    if (v <= -0.1) out.push(neg);
    else if (v >= 0.1) out.push(pos);
  }
  if (lean.noise <= -0.1) out.push('closer to the brief');
  else if (lean.noise >= 0.1) out.push('further afield');
  return out;
}
