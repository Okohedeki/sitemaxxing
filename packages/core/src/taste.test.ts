import { describe, expect, it } from 'vitest';
import { applyLean, describeLean, isNeutral, leanFor } from './taste';
import { moodOf } from './brief';

const mood = moodOf({ story: 'A small bakery that opens before dawn.', audience: 'neighbours', feeling: ['warm', 'calm'], avoid: [] });

describe('taste', () => {
  it('leans a pass the way its own answer points, and the rest of the page a little', () => {
    const answers = { features: 'too busy' as const };
    const own = leanFor('features', answers);
    const other = leanFor('proof', answers);
    expect(own.mood.density!).toBeLessThan(other.mood.density!);
    expect(other.mood.density!).toBeLessThan(0);
    expect(describeLean(own)).toEqual(expect.arrayContaining(['calmer', 'sparser']));
  });

  it('pulls an off-brand pass back toward the brief and a plain one further out', () => {
    expect(leanFor('font', { font: 'off-brand' }).noise).toBeLessThan(0);
    expect(describeLean(leanFor('font', { font: 'off-brand' }))).toContain('closer to the brief');
    const plain = applyLean(mood, 0.3, leanFor('font', { font: 'too plain' }));
    expect(plain.noise).toBeGreaterThan(0.3);
    expect(plain.mood.energy).toBeGreaterThan(mood.energy);
  });

  it('caps the lean and keeps mood and noise in range', () => {
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, 'too plain' as const]));
    const l = leanFor('p0', many);
    expect(l.mood.energy!).toBeLessThanOrEqual(0.6);
    const out = applyLean({ ...mood, energy: 0.9 }, 0.95, l);
    expect(out.mood.energy).toBeLessThanOrEqual(1);
    expect(out.noise).toBeLessThanOrEqual(1);
  });

  it('a cleared answer leaves no lean', () => {
    expect(isNeutral(leanFor('font', { font: null }))).toBe(true);
    expect(describeLean(leanFor('font', {}))).toEqual([]);
  });
});
