import { definePass, cssEdit, type Finding, type Mood } from '@sitemaxxing/core';
import { changed, copyColumnOf, descendants, h1Of, navOf, px, readSources, selFor } from './shared';

function charsPerLine(n: { text: string; box: { h: number }; styles: Record<string, string> }): number {
  const lh = px(n.styles.lineHeight) || px(n.styles.fontSize) * 1.5 || 24;
  const lines = Math.max(1, Math.round(n.box.h / lh));
  return Math.round(n.text.length / lines);
}

/** Type scale for a mood. */
export function scaleFor(mood: Mood) {
  const maxRem = Math.round((4.4 + 1.4 * mood.energy - 0.9 * Math.max(0, mood.density) - 0.4 * Math.max(0, mood.formality)) * 8) / 8;
  const clampMax = Math.max(3.25, Math.min(6, maxRem));
  const minRem = Math.max(2.25, Math.min(3, clampMax * 0.62));
  return {
    maxRem: clampMax,
    minRem: Math.round(minRem * 8) / 8,
    vw: Math.round(clampMax * 0.82 * 10) / 10,
    leading: clampMax >= 5 ? 0.94 : clampMax >= 4.25 ? 0.98 : 1.04,
    measure: Math.round(44 + 12 * Math.max(0, mood.density) - 6 * Math.max(0, -mood.density)),
    label: clampMax >= 5 ? 'a loud scale' : clampMax <= 3.75 ? 'a quiet scale' : 'a confident scale',
  };
}

export const fontSize = definePass({
  id: 'font-size',
  name: 'Font size',
  kind: 'refine',
  order: 6,
  serves: ['clarity', 'character'],
  dependsOn: ['font'],
  ruleCards: ['butterick-size', 'butterick-line-length', 'butterick-tracking', 'utopia-type'],
  description: 'A real type scale: headline 2.5 to 4 times the body, tight display tracking, 16 to 20px body, mono labels',
  async detect(ctx) {
    const findings: Finding[] = [];
    const h1 = h1Of(ctx.dom);
    const body = ctx.dom.bodyFontSize || 16;
    if (h1) {
      const ratio = px(h1.styles.fontSize) / body;
      if (ratio < 2.5) findings.push({ message: `headline is ${ratio.toFixed(1)}x the body size (under 2.5x)`, selector: 'h1', severity: 'warn' });
      if (px(h1.styles.letterSpacing) >= 0) findings.push({ message: 'display tracking is zero or positive', selector: 'h1' });
    }
    if (body < 16) findings.push({ message: `body text ${body}px (under 16px)`, severity: 'warn' });
    const col = copyColumnOf(ctx.dom);
    const sub = col ? ctx.dom.childrenOf(col).find((n) => n.tag === 'p' && n.text.length > 40) : undefined;
    if (sub && charsPerLine(sub) > 90) findings.push({ message: `subhead runs ${charsPerLine(sub)} characters per line (over 90)`, selector: sub.selector, severity: 'warn' });
    const applies = findings.some((f) => f.severity === 'warn');
    return { applies, findings, reason: applies ? undefined : 'type scale already in range' };
  },
  async propose(ctx) {
    const src = readSources(ctx);
    let css = src.styles;
    const h1 = h1Of(ctx.dom);
    const h1Sel = selFor(h1, 'h1');
    // The scale follows the brief: bold stories get a louder headline, dense or formal ones a
    // gentler ratio and a wider measure. Weight and tracking come from the chosen typeface.
    const s = scaleFor(ctx.mood);
    css = cssEdit.setDeclarations(css, h1Sel, {
      'font-size': `clamp(${s.minRem}rem, ${(s.minRem * 0.58).toFixed(2)}rem + ${s.vw}vw, ${s.maxRem}rem)`,
      'line-height': String(s.leading),
      'letter-spacing': 'var(--display-tracking, -0.03em)',
      'font-weight': 'var(--display-weight, 500)',
    });
    css = cssEdit.setDeclarations(css, 'body', { 'font-size': '17px' });
    const col = copyColumnOf(ctx.dom);
    const sub = col ? ctx.dom.childrenOf(col).find((n) => n.tag === 'p' && n.text.length > 40) : undefined;
    if (sub) css = cssEdit.setDeclarations(css, selFor(sub, 'p'), { 'font-size': 'clamp(1.0625rem, 1rem + 0.35vw, 1.25rem)', 'max-width': `${s.measure}ch` });
    const pill = col && h1 ? ctx.dom.childrenOf(col).find((n) => n.box.y < h1.box.y && n.box.h < 48 && n.text.length > 0) : undefined;
    if (pill) css = cssEdit.setDeclarations(css, selFor(pill, '.pill'), { 'font-family': 'var(--label, ui-monospace, monospace)', 'font-size': '0.75rem', 'font-weight': '500', 'letter-spacing': '0.08em', 'text-transform': 'uppercase' });
    const ul = descendants(ctx.dom, navOf(ctx.dom)).find((n) => n.tag === 'ul');
    if (ul) css = cssEdit.setDeclarations(css, selFor(ul, 'nav ul'), { 'font-size': '15px', 'font-weight': '500', 'letter-spacing': '0', 'text-transform': 'none' });
    return {
      summary: `Headline ${Math.round(px(h1?.styles.fontSize) || 36)} → up to ${Math.round(s.maxRem * 16)}px (${s.label}), body 17px, ${s.measure}-character measure`,
      files: changed([{ path: ctx.config.sources.styles, before: src.styles, after: css }]),
    };
  },
  highlight() {
    return ['h1'];
  },
});
