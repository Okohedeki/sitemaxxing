import { describe, expect, it } from 'vitest';
import { hydrate } from './snapshot';
import { parseColor, readSource, readSystem } from './system';
import type { SnapNode } from './types';

type Spec = {
  tag: string;
  text?: string;
  styles?: Record<string, string>;
  attrs?: Record<string, string>;
  box?: [number, number, number, number];
  kids?: Spec[];
};

const BASE = {
  backgroundColor: 'rgba(0, 0, 0, 0)',
  color: 'rgb(20, 24, 31)',
  fontFamily: '"Work Sans", sans-serif',
  fontSize: '16px',
  fontWeight: '400',
  borderTopWidth: '0px',
  borderTopColor: 'rgb(20, 24, 31)',
  borderRadius: '0px',
  boxShadow: 'none',
  animationName: 'none',
  transitionDuration: '0s',
};

function page(root: Spec) {
  const nodes: SnapNode[] = [];
  const walk = (s: Spec, parent: number, depth: number): number => {
    const index = nodes.length;
    const [x, y, w, h] = s.box ?? [0, 0, 300, 40];
    const node: SnapNode = {
      tag: s.tag,
      id: '',
      classes: [],
      text: s.text ?? '',
      selector: `${s.tag}:nth(${index})`,
      box: { x, y, w, h },
      styles: { ...BASE, ...s.styles },
      attrs: s.attrs ?? {},
      depth,
      index,
      parent,
      children: [],
    };
    nodes.push(node);
    for (const k of s.kids ?? []) node.children.push(walk(k, index, depth + 1));
    return index;
  };
  walk(root, -1, 0);
  return hydrate({
    nodes,
    bodyFontSize: 16,
    fonts: [],
    title: '',
    url: 'http://localhost/',
    viewport: { width: 1200, height: 800 },
  });
}

const button = (styles: Record<string, string> = {}): Spec => ({
  tag: 'button',
  text: 'Reserve a seat',
  styles: {
    backgroundColor: 'rgb(214, 72, 36)',
    color: 'rgb(255, 255, 255)',
    borderRadius: '8px',
    paddingTop: '12px',
    paddingLeft: '20px',
    paddingRight: '20px',
    paddingBottom: '12px',
    transitionDuration: '0.2s',
    ...styles,
  },
});

const sample = () =>
  page({
    tag: 'body',
    box: [0, 0, 1200, 2000],
    styles: { backgroundColor: 'rgb(250, 248, 244)' },
    kids: [
      {
        tag: 'h1',
        text: 'Evening pottery classes',
        styles: {
          fontFamily: 'Fraunces, serif',
          fontSize: '56px',
          fontWeight: '700',
          marginBottom: '24px',
        },
      },
      {
        tag: 'p',
        text: 'Six students at a wheel each, clay and glazes included, and your pieces fired by the weekend.',
        styles: { marginBottom: '16px' },
      },
      {
        tag: 'p',
        text: 'New groups start on the first Monday of the month.',
        styles: { color: 'rgb(98, 104, 115)', fontSize: '14px' },
      },
      button(),
      button(),
      button({ borderRadius: '999px' }),
      {
        tag: 'div',
        box: [0, 400, 360, 220],
        styles: {
          backgroundColor: 'rgb(255, 255, 255)',
          borderRadius: '12px',
          boxShadow: 'rgba(0, 0, 0, 0.1) 0px 2px 6px 0px',
          paddingTop: '24px',
          paddingLeft: '24px',
          rowGap: '13px',
        },
        kids: [
          { tag: 'h3', text: 'Beginners', styles: { fontSize: '24px', fontWeight: '700' } },
          {
            tag: 'p',
            text: 'Start at the wheel from the first evening.',
            styles: { color: 'rgb(21, 25, 32)' },
          },
        ],
      },
    ],
  });

describe('readSystem', () => {
  it('gives each colour its role', () => {
    const r = readSystem(sample());
    const role = (hex: string) => r.colors.find((c) => c.hex === hex)?.role;
    expect(role('#faf8f4')).toBe('background');
    expect(role('#14181f')).toBe('ink');
    expect(role('#d64824')).toBe('accent');
    expect(role('#626873')).toBe('soft');
    expect(r.colors.find((c) => c.hex === '#ffffff')?.role).toBe('surface');
  });

  it('folds colours nobody could tell apart and counts them', () => {
    const r = readSystem(sample());
    expect(r.nearDuplicates).toBe(1);
    expect(r.colors.some((c) => c.hex === '#151920')).toBe(false);
    expect(r.findings.some((f) => f.area === 'color' && /almost the same/.test(f.message))).toBe(
      true,
    );
  });

  it('reads the type sizes, the base size and the two families', () => {
    const { type } = readSystem(sample());
    expect(type.sizes.map((s) => s.px)).toEqual([14, 16, 24, 56]);
    expect(type.base).toBe(16);
    expect(type.families.find((f) => f.role === 'display')?.family).toBe('Fraunces');
    expect(type.families.find((f) => f.role === 'body')?.family).toBe('Work Sans');
    expect(type.weights).toEqual([400, 700]);
  });

  it('finds the spacing grid and what sits off it', () => {
    const { space } = readSystem(sample());
    expect(space.unit).toBe(4);
    expect(space.steps.some((s) => s.px === 13)).toBe(true);
    expect(space.onGrid).toBeLessThan(1);
  });

  it('groups repeated components by how they look', () => {
    const r = readSystem(sample());
    const buttons = r.components.find((c) => c.kind === 'button');
    expect(buttons?.count).toBe(3);
    expect(buttons?.variants.map((v) => v.count)).toEqual([2, 1]);
    expect(r.components.find((c) => c.kind === 'card')?.count).toBe(1);
    expect(r.motion.durations).toEqual([{ ms: 200, count: 3 }]);
  });

  it('returns an empty reading for an empty page', () => {
    const r = readSystem(page({ tag: 'body' }));
    expect(r.components).toEqual([]);
    expect(r.source.coverage).toBeNull();
  });
});

describe('readSource', () => {
  it('counts values written in place against values read from a property', () => {
    const s = readSource([
      ':root { --ink: #14181f; --gap: 1rem; }',
      `.a { color: var(--ink); padding: var(--gap); font-size: 18px; }
       .b { color: #d64824; margin: 0; gap: 12px; }
       .c { color: rgb(20 24 31 / var(--alpha, 1)); }`,
    ]);
    expect(s.tokens).toBe(2);
    expect(s.tokenised).toEqual({ color: 1, size: 0, space: 1 });
    expect(s.literal).toEqual({ color: 2, size: 1, space: 1 });
    expect(s.coverage).toBeCloseTo(2 / 6);
  });
});

describe('parseColor', () => {
  it('reads the forms a browser reports', () => {
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(10, 20, 30, 0.5)')?.a).toBe(0.5);
    expect(parseColor('color(srgb 1 0 0 / 0.25)')).toEqual({ r: 255, g: 0, b: 0, a: 0.25 });
    expect(parseColor('oklch(0.5 0.1 200)')).toBeNull();
  });
});
