/* Picks three references for a brief: the closest fit, a stretch that is still on-brief but
   different from the fit, and a wildcard whose distance from the brief grows with noise. */

import { moodDistance, type Goal, type Mood, type Rng } from '@sitemaxxing/core';

export type Slot = 'fit' | 'stretch' | 'wildcard';

export const SLOT_LABEL: Record<Slot, string> = { fit: 'Fit', stretch: 'Stretch', wildcard: 'Wildcard' };

export interface Reference {
  id: string;
  label: string;
  mood: Partial<Mood>;
  goals?: Goal[];
  /** Readable attributes for the decision log and the Phase 2 taste engine. */
  attributes?: Record<string, string | number>;
}

export interface Pick<T> {
  item: T;
  slot: Slot;
  /** 0 = exactly the brief's mood, 1 = opposite. */
  distance: number;
}

export interface SelectOptions {
  mood: Mood;
  goal: Goal;
  /** 0..1 */
  noise: number;
  rng: Rng;
  count?: number;
}

const goalBonus = (r: Reference, goal: Goal) => (r.goals?.includes(goal) ? 0.12 : 0);

/** Distance between two references, so the stretch is not a near-copy of the fit. */
function between(a: Reference, b: Reference): number {
  return moodDistance(a.mood, b.mood);
}

export function selectReferences<T extends Reference>(items: readonly T[], opts: SelectOptions): Array<Pick<T>> {
  const count = Math.min(opts.count ?? 3, items.length);
  if (!count) return [];
  const { mood, goal, noise, rng } = opts;
  // Noise jitters the scores. It grows with noise squared so the Fit stays faithful at low and
  // moderate noise (variety then comes from Stretch, Wildcard and parameter perturbation), and only
  // a wild brief lets a re-roll swap the Fit itself.
  const scored = items.map((item) => {
    const distance = moodDistance(item.mood, mood);
    const score = 1 - distance + goalBonus(item, goal) + rng.gauss() * (0.008 + 0.09 * noise * noise);
    return { item, distance, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const out: Array<Pick<T>> = [{ item: scored[0].item, slot: 'fit', distance: scored[0].distance }];
  const taken = new Set([scored[0].item.id]);

  if (count >= 2) {
    // Stretch: still a good fit, but as far from the fit as possible.
    const pool = scored.filter((s) => !taken.has(s.item.id)).slice(0, Math.max(3, Math.ceil(items.length / 2)));
    const best = pool.map((s) => ({ s, v: s.score * 0.55 + between(s.item, out[0].item) * 0.45 + rng.next() * 0.05 })).sort((a, b) => b.v - a.v)[0].s;
    out.push({ item: best.item, slot: 'stretch', distance: best.distance });
    taken.add(best.item.id);
  }

  if (count >= 3) {
    // Wildcard: with low noise it is the next-best fit; with high noise it reaches for the far
    // half of the library, weighted toward the most surprising entries.
    const rest = scored.filter((s) => !taken.has(s.item.id));
    const reach = Math.min(1, 0.15 + noise);
    const weights = rest.map((s) => Math.pow(s.distance + 0.05, reach * 3) * Math.pow(Math.max(0.05, s.score), 3 * (1 - reach)));
    const w = rest[rng.weighted(weights)];
    out.push({ item: w.item, slot: 'wildcard', distance: w.distance });
    taken.add(w.item.id);
  }

  for (const s of scored) {
    if (out.length >= count) break;
    if (!taken.has(s.item.id)) out.push({ item: s.item, slot: 'stretch', distance: s.distance });
  }
  return out;
}
