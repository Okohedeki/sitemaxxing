import { describe, expect, it } from 'vitest';
import { pureColor, systemize } from './systemize';
import { readSource } from './system';
import { contrast, fitColor, remapColor } from './color';

const anchors = { bg: '#faf8f4', ink: '#14181f', acc: '#d64824' };

const run = (css: string, tokensCss = ':root {\n  --bg: #faf8f4;\n  --ink: #14181f;\n}\n') => {
  const r = systemize({ sheets: [{ path: 'src/styles.css', css }], tokensPath: 'src/tokens.css', tokensCss, anchors });
  const file = (p: string) => r.files.find((f) => f.path === p)?.after ?? '';
  return { ...r, styles: file('src/styles.css'), tokens: file('src/tokens.css') };
};

describe('systemize', () => {
  it('moves colours to shared values, reusing the ones the project has', () => {
    const r = run('.a { color: #14181f; background: #FAF8F4; border: 1px solid #d64824; }');
    expect(r.styles).toContain('color: var(--ink)');
    expect(r.styles).toContain('background: var(--bg)');
    expect(r.styles).toMatch(/border: 1px solid var\(--accent-\d+\)/);
    expect(Object.values(r.added)).toEqual(['#d64824']);
    expect(r.tokens).toMatch(/--accent-\d+: #d64824/);
    expect(r.moved.color).toBe(3);
  });

  it('keeps the opacity of a colour, whether a number or read from a property', () => {
    const r = run('.a { color: rgb(20 24 31 / var(--alpha, 1)); box-shadow: 0 2px 6px rgba(20, 24, 31, 0.12); background: #14181f80; outline-color: rgba(0,0,0,0); }');
    expect(r.styles).toContain('color: color-mix(in srgb, var(--ink) calc(var(--alpha, 1) * 100%), transparent)');
    expect(r.styles).toContain('0 2px 6px color-mix(in srgb, var(--ink) 12%, transparent)');
    expect(r.styles).toContain('background: color-mix(in srgb, var(--ink) 50.2%, transparent)');
    expect(r.styles).toContain('outline-color: rgba(0,0,0,0)');
  });

  it('names colours by family and lightness', () => {
    const r = run('.a { color: #626873; background: #f6d9d0; fill: #1f9d55; }');
    const names = Object.keys(r.added);
    expect(names.some((n) => n.startsWith('--neutral-'))).toBe(true);
    expect(names.some((n) => n.startsWith('--accent-'))).toBe(true);
    expect(names.some((n) => /^--(moss|jade|olive)-/.test(n))).toBe(true);
  });

  it('moves text sizes and spacing, one value per size', () => {
    const r = run('.a { font-size: 14px; padding: 12px 20px; margin: 0 auto -8px; gap: 0.75rem; }\n.b { font-size: 0.875rem; padding: calc(1rem + 2px); margin-top: 1.5em; }');
    expect(r.styles).toContain('font-size: var(--text-14)');
    expect(r.styles).toContain('padding: var(--space-12) var(--space-20)');
    expect(r.styles).toContain('margin: 0 auto calc(var(--space-8) * -1)');
    expect(r.styles).toContain('gap: var(--space-12)');
    expect(r.styles).toContain('padding: calc(1rem + 2px)');
    expect(r.styles).toContain('margin-top: 1.5em');
    expect(r.added['--text-14']).toBe('14px');
    expect(r.added['--space-12']).toBe('12px');
    expect(r.moved).toEqual({ color: 0, size: 2, space: 4 });
  });

  it('leaves rem alone when the root size is not the default', () => {
    const r = run('html { font-size: 62.5%; }\n.a { padding: 1.6rem; margin: 16px; }');
    expect(r.styles).toContain('padding: 1.6rem');
    expect(r.styles).toContain('margin: var(--space-16)');
  });

  it('leaves the shared values themselves and anything with a url alone', () => {
    const css = ':root { --brand: #d64824; }\n.a { background: url(a.svg#fff) #d64824; color: #d64824; }';
    const r = systemize({ sheets: [{ path: 'src/styles.css', css }], tokensPath: 'src/styles.css', tokensCss: css });
    const after = r.files[0].after;
    expect(after).toContain('--brand: #d64824');
    expect(after).toContain('background: url(a.svg#fff) #d64824');
    expect(after).toContain('color: var(--brand)');
    expect(r.added).toEqual({});
  });

  it('leaves nothing written in place that it knows how to move', () => {
    const r = run('.a { color: #333; font-size: 18px; padding: 4px 8px; }\n@media (min-width: 600px) { .a { padding: 24px; color: hsl(210 20% 30%); } }');
    const s = readSource([r.styles]);
    expect(s.literal).toEqual({ color: 0, size: 0, space: 0 });
    expect(s.coverage).toBe(1);
  });

  it('changes nothing when there is nothing to move', () => {
    expect(run('.a { color: var(--ink); display: flex; }').files).toEqual([]);
  });
});

describe('pureColor', () => {
  it('accepts one opaque colour and nothing else', () => {
    expect(pureColor('#FFF')).toBe('#ffffff');
    expect(pureColor('rgb(20, 24, 31)')).toBe('#14181f');
    expect(pureColor('rgba(20, 24, 31, 0.5)')).toBeNull();
    expect(pureColor('1px solid #fff')).toBeNull();
    expect(pureColor('var(--ink)')).toBeNull();
  });
});

describe('remapColor', () => {
  const to = { bg: '#101216', ink: '#f2efe9', acc: '#4fb3a5' };

  it('sends each anchor to its new value', () => {
    expect(remapColor(anchors.bg, anchors, to)).toBe(to.bg);
    expect(remapColor(anchors.ink, anchors, to)).toBe(to.ink);
    expect(remapColor(anchors.acc, anchors, to)).toBe(to.acc);
  });

  it('keeps a surface near the background and quiet text readable when the page flips to dark', () => {
    const surface = remapColor('#f0ede6', anchors, to);
    expect(contrast(surface, to.bg)).toBeLessThan(1.4);
    const soft = remapColor('#626873', anchors, to);
    expect(contrast(soft, to.bg)).toBeGreaterThan(3);
  });

  it('moves tints of the accent with it and leaves unrelated colours alone', () => {
    expect(fitColor('#f6d9d0', anchors)?.family).toBe('tint');
    expect(remapColor('#f6d9d0', anchors, to)).not.toBe('#f6d9d0');
    expect(remapColor('#1f9d55', anchors, to)).toBe('#1f9d55');
  });
});
