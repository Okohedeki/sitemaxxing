import { describe, expect, it } from 'vitest';
import { describeSystem, exportSystem } from './describe';
import type { SystemReading } from './system';

/** A small shop page: cream paper, near-black text, one orange accent, two faces. */
const reading: SystemReading = {
  colors: [
    { hex: '#faf6ee', role: 'background', fill: 0.7, text: 0, borders: 0, uses: 1 },
    { hex: '#ffffff', role: 'surface', fill: 0.2, text: 0.02, borders: 0, uses: 6 },
    { hex: '#16181d', role: 'ink', fill: 0.05, text: 0.7, borders: 0, uses: 40 },
    { hex: '#6b7078', role: 'soft', fill: 0, text: 0.25, borders: 0, uses: 18 },
    { hex: '#e2571c', role: 'accent', fill: 0.05, text: 0.03, borders: 0, uses: 5 },
    { hex: '#dcd6ca', role: 'border', fill: 0, text: 0, borders: 9, uses: 9 },
  ],
  nearDuplicates: 0,
  type: {
    families: [
      { family: 'Work Sans', role: 'body', share: 0.85 },
      { family: 'Fraunces', role: 'display', share: 0.15 },
    ],
    sizes: [
      { px: 11, count: 1, share: 0.001 },
      { px: 13, count: 6, share: 0.1, weight: 500, lineHeight: 1.4, family: 'Work Sans' },
      { px: 16, count: 20, share: 0.7, weight: 400, lineHeight: 1.6, family: 'Work Sans' },
      { px: 20, count: 4, share: 0.08, weight: 600, lineHeight: 1.3, family: 'Work Sans' },
      { px: 25, count: 3, share: 0.07, weight: 600, lineHeight: 1.2, family: 'Fraunces' },
      { px: 31, count: 2, share: 0.03, weight: 600, lineHeight: 1.15, family: 'Fraunces' },
      { px: 39, count: 1, share: 0.019, weight: 700, lineHeight: 1.05, family: 'Fraunces' },
    ],
    base: 16,
    ratio: 1.25,
    weights: [400, 500, 600, 700],
  },
  space: {
    unit: 8,
    onGrid: 0.9,
    steps: [
      { px: 8, count: 30 },
      { px: 13, count: 3 },
      { px: 16, count: 40 },
      { px: 24, count: 22 },
      { px: 32, count: 8 },
      { px: 64, count: 6 },
      { px: 96, count: 4 },
      { px: 200, count: 1 },
    ],
  },
  shape: {
    radii: [
      { px: 6, count: 12 },
      { px: 12, count: 5 },
    ],
    shadows: [],
  },
  components: [
    {
      kind: 'button',
      count: 5,
      variants: [
        {
          count: 4,
          selector: 'a.buy',
          look: { fill: '#e2571c', text: '#ffffff', border: 'none', radius: '6px', size: '16px', padding: '12px 20px' },
        },
      ],
    },
    {
      kind: 'card',
      count: 5,
      variants: [
        {
          count: 5,
          selector: 'li.item',
          look: { fill: '#ffffff', border: '1px #dcd6ca', radius: '12px', shadow: 'none', padding: '24px 24px' },
        },
      ],
    },
  ],
  motion: { animations: [], durations: [{ ms: 150, count: 9 }] },
  source: {
    tokens: 0,
    literal: { color: 10, size: 6, space: 20 },
    tokenised: { color: 0, size: 0, space: 0 },
    coverage: 0,
  },
  findings: [{ area: 'source', message: 'Nothing reads from shared values yet.' }],
};

describe('describeSystem', () => {
  const d = describeSystem(reading);

  it('names every colour once and gives it a role-based export name', () => {
    expect(d.colors.map((c) => c.token)).toEqual([
      'background',
      'surface',
      'text',
      'text-soft',
      'accent',
      'line',
    ]);
    expect(new Set(d.colors.map((c) => c.name)).size).toBe(d.colors.length);
    expect(d.colors.find((c) => c.role === 'accent')!.purpose).toContain('5 elements');
    expect(d.theme).toBe('light');
  });

  it('states the type scale and leaves one-off sizes out of it', () => {
    expect(d.type.scale).toBe('Major third (×1.25) from 16px');
    expect(d.type.steps.map((s) => s.token)).toEqual([
      'display',
      'heading-1',
      'heading-2',
      'heading-3',
      'body',
      'small',
    ]);
    expect(d.type.left).toBe(1);
    expect(d.type.families.map((f) => f.token)).toEqual(['body', 'display']);
  });

  it('keeps the spacing scale on the grid and reads the usual gaps', () => {
    expect(d.space.steps.map((s) => s.px)).toEqual([8, 16, 24, 32, 64, 96]);
    expect(d.space.elementGap).toEqual([8, 16]);
    expect(d.space.sectionGap).toEqual([64, 96]);
    expect(d.space.cardPadding).toEqual([24, 24]);
  });

  it('gives each kind of element its corner radius', () => {
    expect(d.shape.radii.map((x) => [x.token, x.px])).toEqual([
      ['radius-button', 6],
      ['radius-card', 12],
    ]);
  });

  it('writes rules that quote the measured values', () => {
    expect(d.rules.do.some((x) => x.includes('#e2571c'))).toBe(true);
    expect(d.rules.do.some((x) => x.includes('8, 16, 24, 32, 64, 96'))).toBe(true);
    expect(d.rules.dont.some((x) => x.includes('shadows'))).toBe(true);
    expect(d.rules.dont.some((x) => x.includes('the only one'))).toBe(true);
    expect(d.character).toMatch(/^Light, warm page with .* as the accent, set in Fraunces/);
  });
});

describe('exportSystem', () => {
  const out = exportSystem('Shop', reading);

  it('writes a DESIGN.md with the tables, the rules and the open issues', () => {
    expect(out.designMd.startsWith('# Shop: design system\n')).toBe(true);
    for (const h of ['## Colour', '## Type', '## Spacing', '## Rules', "### Don't", '## Where the page strays'])
      expect(out.designMd).toContain(h);
    expect(out.designMd).toContain('`--color-accent`');
  });

  it('writes the same names as CSS variables and as a Tailwind theme', () => {
    expect(out.css).toContain(':root {');
    expect(out.css).toContain('--color-text: #16181d;');
    expect(out.css).toContain('--text-body: 1rem;');
    expect(out.css).toContain('--space-2: 1rem;');
    expect(out.css).toContain('--radius-card: 12px;');
    expect(out.tailwind).toContain('@theme {');
    expect(out.tailwind).toContain('--text-display--line-height: 1.05;');
    expect(out.tailwind).toContain('--spacing: 0.25rem;');
  });

  it('writes a tokens file that parses, with typed values', () => {
    const t = JSON.parse(out.tokens);
    expect(t.color.accent).toMatchObject({ $type: 'color', $value: '#e2571c' });
    expect(t.font.size.body).toEqual({ $type: 'dimension', $value: '16px' });
    expect(t.radius.card.$value).toBe('12px');
  });
});
