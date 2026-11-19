import { describe, expect, it } from 'vitest';
import { slopHits } from '@sitemaxxing/rules';
import { ruleBasedRewrite } from './copy';

describe('rule-based copy rewrite (offline fallback)', () => {
  it('removes slop and emoji and builds claims from facts', () => {
    const out = ruleBasedRewrite(
      { headline: 'Unlock the Power of Effortless Growth', subhead: 'Leverage cutting-edge tools to revolutionize your workflow and drive unprecedented results for teams everywhere.', cta: 'Get Started Free 🚀', pill: '✨ Smart Tooling' },
      [
        { value: '40 ms', label: 'Median latency' },
        { value: '3', label: 'Regions' },
      ],
    );
    expect(slopHits(out.headline)).toEqual([]);
    expect(slopHits(out.subhead)).toEqual([]);
    expect(slopHits(out.cta)).toEqual([]);
    expect(out.headline.split(' ').length).toBeLessThanOrEqual(8);
    expect(out.subhead.split(' ').length).toBeLessThanOrEqual(25);
    expect(out.headline).toContain('40 ms');
    expect(out.subhead).toContain('3 regions');
    expect(out.pill).not.toContain('✨');
  });

  it('builds the headline from the story when one is given', () => {
    const out = ruleBasedRewrite(
      { headline: 'Unlock Effortless Growth', subhead: 'Leverage seamless tools.', cta: 'Get Started Free 🚀' },
      [{ value: '3', label: 'Regions' }],
      { story: 'Pebble tracks parcels across three regions, so shops answer where is my order in one click.', cta: 'Create an account' },
    );
    expect(out.headline).toBe('Pebble tracks parcels across three regions.');
    expect(out.subhead).toContain('Shops answer where is my order in one click.');
    expect(out.cta).toBe('Create an account');
  });

  it('keeps a clean headline when there is nothing to fix', () => {
    const out = ruleBasedRewrite({ headline: 'Maps for every field.', subhead: 'Daily soil maps.', cta: 'See a map' }, []);
    expect(out.headline).toBe('Maps for every field.');
    expect(out.cta).toBe('See a map');
  });
});
