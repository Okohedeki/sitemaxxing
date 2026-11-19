import { describe, expect, it } from 'vitest';
import { contrast, moodOf, rng, type Mood } from '@sitemaxxing/core';
import { generateDirections, DIRECTION_REFS } from './directions';
import { selectFonts, FONT_PAIRINGS } from './fonts';
import { COMPONENTS, selectComponents } from './registry';
import { HERO_LAYOUTS, heroLayoutCss, selectHeroLayouts } from './hero-layouts';
import postcss from 'postcss';

const mood = (feeling: string[], story = 'A shop.'): Mood => moodOf({ story, audience: '', feeling, avoid: [] });

describe('reference library', () => {
  it('has enough references to avoid one house style', () => {
    expect(DIRECTION_REFS.length).toBeGreaterThanOrEqual(10);
    expect(FONT_PAIRINGS.length).toBeGreaterThanOrEqual(10);
    for (const slot of ['hero-art', 'nav', 'preloader', 'reveal', 'proof', 'features', 'cta']) expect(COMPONENTS.filter((c) => c.slot === slot).length).toBeGreaterThanOrEqual(3);
    // Section slots need more than three references, or a re-roll can only reshuffle the same cards.
    for (const slot of ['proof', 'features', 'cta']) expect(COMPONENTS.filter((c) => c.slot === slot).length).toBeGreaterThanOrEqual(4);
  });

  it('picks different directions for different stories', () => {
    const calm = generateDirections({ mood: mood(['calm', 'warm'], 'A sleep clinic.'), goal: 'bookings', noise: 0, rng: rng(1) });
    const loud = generateDirections({ mood: mood(['bold', 'dark'], 'A music club.'), goal: 'awareness', noise: 0, rng: rng(1) });
    expect(calm[0].refId).not.toBe(loud[0].refId);
    expect(calm.map((d) => d.slot)).toEqual(['fit', 'stretch', 'wildcard']);
  });

  it('is reproducible for a seed and varies across seeds', () => {
    const m = mood(['precise']);
    const a = generateDirections({ mood: m, goal: 'signups', noise: 0.6, rng: rng(42) });
    const b = generateDirections({ mood: m, goal: 'signups', noise: 0.6, rng: rng(42) });
    expect(a).toEqual(b);
    const tokens = new Set(Array.from({ length: 12 }, (_, i) => generateDirections({ mood: m, goal: 'signups', noise: 0.6, rng: rng(100 + i) })[0].tokens['--acc']));
    expect(tokens.size).toBeGreaterThan(6);
  });

  it('keeps the Fit faithful to the brief at low noise', () => {
    const m = mood(['warm', 'quiet', 'rugged'], 'An expedition company.');
    for (let i = 0; i < 20; i++) expect(generateDirections({ mood: m, goal: 'bookings', noise: 0.35, rng: rng(i) })[0].refId).toBe('terracotta');
  });

  it('noise pushes the wildcard further from the brief', () => {
    const m = mood(['calm', 'classic']);
    const avg = (noise: number) => {
      let sum = 0;
      for (let i = 0; i < 40; i++) {
        const picks = selectComponents('hero-art', { mood: m, goal: 'credibility', noise, rng: rng(i) });
        sum += Number(picks[2].attributes.distance);
      }
      return sum / 40;
    };
    expect(avg(1)).toBeGreaterThan(avg(0));
  });

  it('keeps every generated palette readable', () => {
    for (let i = 0; i < 60; i++) {
      const dirs = generateDirections({ mood: mood([['bold'], ['calm'], ['dark'], ['warm']][i % 4]), goal: 'sales', noise: 1, rng: rng(i) });
      for (const d of dirs) {
        expect(contrast(d.tokens['--ink'], d.tokens['--bg'])).toBeGreaterThanOrEqual(7);
        expect(contrast(d.tokens['--soft'], d.tokens['--bg'])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(d.tokens['--acc'], d.tokens['--bg'])).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('respects avoid and installed fonts', () => {
    const dirs = generateDirections({ mood: mood(['dark']), goal: 'sales', noise: 1, rng: rng(3), avoidDark: true });
    expect(dirs.every((d) => d.attributes.dark === 0)).toBe(true);
    const fonts = selectFonts({ mood: mood(['classic']), goal: 'credibility', noise: 0.5, rng: rng(5), avoidSerif: true });
    expect(fonts.every((f) => !f.pairing.serif)).toBe(true);
  });

  it('only proposes sections whose content exists', () => {
    const none = selectComponents('proof', { mood: mood([]), goal: 'sales', noise: 0, rng: rng(1), has: () => false });
    expect(none).toEqual([]);
    const facts = selectComponents('proof', { mood: mood([]), goal: 'sales', noise: 0, rng: rng(1), has: (k) => k === 'facts' });
    expect(facts.every((p) => p.spec.requires?.includes('facts'))).toBe(true);
  });
  it('composes the hero differently for different stories', () => {
    expect(HERO_LAYOUTS.length).toBeGreaterThanOrEqual(6);
    const quiet = selectHeroLayouts({ mood: mood(['classic', 'calm', 'formal'], 'A law firm.'), goal: 'credibility', noise: 0, rng: rng(1), hasMedia: true });
    const loud = selectHeroLayouts({ mood: mood(['bold', 'loud', 'playful'], 'A music festival.'), goal: 'awareness', noise: 0, rng: rng(1), hasMedia: true });
    expect(quiet[0].ref.id).not.toBe(loud[0].ref.id);
    expect(quiet.map((l) => l.slot)).toEqual(['fit', 'stretch', 'wildcard']);
    // Across a spread of stories the Fit is not always the template split.
    const fits = new Set(
      [['calm'], ['bold'], ['warm'], ['formal'], ['playful'], ['classic'], ['dense'], ['dark']].map((f) => selectHeroLayouts({ mood: mood(f), goal: 'awareness', noise: 0.3, rng: rng(9), hasMedia: true })[0].ref.id),
    );
    expect(fits.size).toBeGreaterThanOrEqual(3);
  });

  it('never puts a picture layout on a text-only hero, and writes valid CSS', () => {
    const parts = { hero: '.hero', copy: '.copy', headline: '.copy > .h1', media: '.media' };
    for (let i = 0; i < 30; i++) {
      const textOnly = selectHeroLayouts({ mood: mood([['bold'], ['calm'], ['warm']][i % 3]), goal: 'signups', noise: 1, rng: rng(i), hasMedia: false });
      expect(textOnly.every((l) => !l.ref.needsMedia)).toBe(true);
      for (const l of selectHeroLayouts({ mood: mood([['bold'], ['calm'], ['warm']][i % 3]), goal: 'signups', noise: 1, rng: rng(i), hasMedia: true })) {
        const css = heroLayoutCss(l, parts);
        expect(() => postcss.parse(css)).not.toThrow();
        expect(css).toContain('@media (max-width: 760px)');
        expect(css).not.toMatch(/gradient/);
      }
    }
  });
});
