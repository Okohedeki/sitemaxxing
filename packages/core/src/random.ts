/* Seeded randomness. Every generation in Sitemaxxing is reproducible from (brief seed, pass,
   reroll count), so a pass can be re-proposed and yield the same change. */

import type { PassContext } from './types';

/** 32-bit string/number hash (FNV-1a). */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  /** Standard normal sample. */
  gauss(): number;
  shuffle<T>(items: readonly T[]): T[];
  /** Picks an index with probability proportional to its weight. */
  weighted(weights: readonly number[]): number;
}

/** Mulberry32: tiny, fast and good enough for design variation. */
export function rng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min) * next()),
    pick: (items) => items[Math.floor(next() * items.length)],
    gauss: () => {
      const u = Math.max(1e-9, next());
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted: (weights) => {
      const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
      if (total <= 0) return Math.floor(next() * weights.length);
      let x = next() * total;
      for (let i = 0; i < weights.length; i++) {
        x -= Math.max(0, weights[i]);
        if (x <= 0) return i;
      }
      return weights.length - 1;
    },
  };
  return r;
}

/** The generator for one pass: same brief, same seed, same pass → same sequence. */
export function rngFor(ctx: Pick<PassContext, 'seeds' | 'brief'>, passId: string, salt = ''): Rng {
  return rng(hashSeed(ctx.seeds[passId] ?? ctx.brief.seed, passId, salt));
}

export function newSeed(): number {
  return (Math.random() * 2 ** 32) >>> 0;
}
