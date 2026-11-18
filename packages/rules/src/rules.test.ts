import { describe, expect, it } from 'vitest';
import { adjectiveRuns, loadRuleCards, searchRules, slopHits, stripEmoji } from './index';

describe('rule cards', () => {
  it('ships at least 30 valid cards with sources', () => {
    const cards = loadRuleCards();
    expect(cards.length).toBeGreaterThanOrEqual(30);
    for (const c of cards) {
      expect(c.source.url).toMatch(/^https?:\/\//);
      expect(c.principle.length).toBeGreaterThan(20);
      expect(c.passes.length).toBeGreaterThan(0);
    }
  });

  it('searches by keyword and pass id', () => {
    expect(searchRules('line length')[0].id).toBe('butterick-line-length');
    expect(searchRules('specific copy slop').some((c) => c.passes.includes('copy'))).toBe(true);
  });
});

describe('slop detection', () => {
  it('finds words, phrases and emoji', () => {
    const hits = slopHits('Unlock the power of seamless growth 🚀');
    expect(hits.map((h) => h.term)).toEqual(expect.arrayContaining(['unlock', 'seamless', 'the power of', '🚀']));
  });
  it('is quiet on plain copy', () => {
    expect(slopHits('Know every field, every morning.')).toEqual([]);
  });
  it('strips emoji and counts adjective runs', () => {
    expect(stripEmoji('Get Started Free 🚀')).toBe('Get Started Free');
    expect(adjectiveRuns('an extraordinary unforgettable breathtaking voyage')).toBeGreaterThan(0);
  });
});
