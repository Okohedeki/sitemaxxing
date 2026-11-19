import { describe, expect, it } from 'vitest';
import { moodOf, normalizeBrief, moodFit, avoidOf } from './brief';
import { plan, type Detection } from './planner';
import { rng, hashSeed } from './random';
import { contrast, oklchToHex, hexToOklch } from './color';
import type { PassDefinition } from './types';

const def = (id: string, kind: PassDefinition['kind'], serves: PassDefinition['serves'], extra: Partial<PassDefinition> = {}): PassDefinition => ({
  id,
  name: id,
  kind,
  order: 0,
  serves,
  ruleCards: [],
  description: id,
  detect: async () => ({ applies: true, findings: [] }),
  propose: async () => ({ summary: '', files: [] }),
  highlight: () => [],
  ...extra,
});

describe('brief and mood', () => {
  it('requires a story', () => {
    expect(() => normalizeBrief({ goal: 'sales' })).toThrow(/story/i);
    const b = normalizeBrief({ story: 'A bakery that bakes overnight for the morning crowd.', goal: 'sales', feeling: ['warm, calm'] });
    expect(b.feeling).toEqual(['warm', 'calm']);
    expect(b.noise).toBeGreaterThan(0);
    expect(Number.isInteger(b.seed)).toBe(true);
  });

  it('reads feeling words and story keywords into the mood axes', () => {
    const calm = moodOf({ story: 'A sleep clinic.', audience: '', feeling: ['calm', 'warm'], avoid: [] });
    const loud = moodOf({ story: 'A music festival.', audience: '', feeling: ['bold', 'playful'], avoid: [] });
    expect(calm.energy).toBeLessThan(0);
    expect(calm.warmth).toBeGreaterThan(0);
    expect(loud.energy).toBeGreaterThan(0.5);
    expect(loud.formality).toBeLessThan(0);
    expect(moodFit({ energy: 0.6 }, loud)).toBeGreaterThan(moodFit({ energy: 0.6 }, calm));
  });

  it('honours avoid', () => {
    const b = { story: 'x', audience: '', feeling: ['dark', 'bold'], avoid: ['no dark mode', 'nothing that moves'] };
    const a = avoidOf(b);
    expect(a.dark && a.motion).toBe(true);
    const m = moodOf(b);
    expect(m.dark).toBeLessThan(0);
    expect(m.energy).toBeLessThanOrEqual(0);
  });
});

describe('seeded randomness', () => {
  it('is reproducible and seed-sensitive', () => {
    const a = rng(hashSeed(7, 'direction'));
    const b = rng(hashSeed(7, 'direction'));
    const c = rng(hashSeed(8, 'direction'));
    const seqA = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(seqA);
    expect([c.next(), c.next(), c.next()]).not.toEqual(seqA);
  });
});

describe('colour', () => {
  it('round-trips through OKLCH and measures contrast', () => {
    const hex = '#2c4a2e';
    expect(oklchToHex(hexToOklch(hex))).toBe(hex);
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});

describe('planner', () => {
  const defs = [
    def('direction', 'direction', ['character', 'mood']),
    def('copy', 'refine', ['clarity', 'action', 'trust']),
    def('preloader', 'component', ['mood'], { moodBias: { energy: 0.6 } }),
    def('proof', 'component', ['trust']),
    def('font-size', 'refine', ['clarity'], { dependsOn: ['copy'] }),
  ];
  const det = (sev: 'warn' | 'info', n = 2): Detection => ({ applies: true, findings: Array.from({ length: n }, () => ({ message: 'x', severity: sev })) });
  const detections = new Map<string, Detection>([
    ['direction', det('info', 1)],
    ['copy', det('warn', 3)],
    ['preloader', det('info', 1)],
    ['proof', det('warn', 1)],
    ['font-size', det('warn', 2)],
  ]);
  const brief = (goal: any, feeling: string[]) => normalizeBrief({ story: 'A small studio that makes things for people.', goal, feeling, noise: 0, seed: 1 });

  it('changes the plan with the goal and the feeling', () => {
    const signups = brief('signups', ['calm', 'precise']);
    const awareness = brief('awareness', ['bold', 'playful']);
    const p1 = plan(defs, detections, signups, moodOf(signups));
    const p2 = plan(defs, detections, awareness, moodOf(awareness));
    const pre1 = p1.find((p) => p.defId === 'preloader')!;
    const pre2 = p2.find((p) => p.defId === 'preloader')!;
    expect(pre1.include).toBe(false);
    expect(pre1.skipReason).toMatch(/low impact for sign-ups/);
    expect(pre2.impact).toBeGreaterThan(pre1.impact);
    const credibility = brief('credibility', ['serious']);
    const p3 = plan(defs, detections, credibility, moodOf(credibility));
    expect(p3.find((p) => p.defId === 'proof')!.impact).toBeGreaterThan(p1.find((p) => p.defId === 'proof')!.impact - 1);
    expect(p1.every((p) => !p.include || p.rationale.startsWith('For sign-ups'))).toBe(true);
  });

  it('always keeps direction first and dependencies before dependents', () => {
    const b = brief('sales', []);
    const p = plan(defs, detections, b, moodOf(b));
    expect(p[0].defId).toBe('direction');
    const idx = (id: string) => p.findIndex((x) => x.defId === id);
    expect(idx('copy')).toBeLessThan(idx('font-size'));
  });

  it('respects keep', () => {
    const b = normalizeBrief({ story: 'A small studio that makes things for people.', goal: 'sales', keep: { copy: true } });
    const p = plan(defs, detections, b, moodOf(b));
    expect(p.find((x) => x.defId === 'copy')!.skipReason).toMatch(/keep your copy/);
  });
});
