import { definePass, cssEdit, type Finding } from '@sitemaxxing/core';
import { changed, copyColumnOf, heroOf, navOf, px, readSources, selFor } from './shared';

export const spacing = definePass({
  id: 'spacing',
  name: 'Spacing',
  kind: 'refine',
  order: 2,
  points: 5,
  ruleCards: ['refactoring-ui-spacing', 'utopia-fluid-space', 'every-layout-stack'],
  description: '8-point scale with fluid clamp() values: bigger gutters, hero padding, section rhythm',
  async detect(ctx) {
    const findings: Finding[] = [];
    const src = readSources(ctx);
    const values = cssEdit.spacingValues(src.styles);
    const distinct = new Set(values.map((v) => Math.round(v)));
    const offScale = [...distinct].filter((v) => v % 4 !== 0);
    if (distinct.size > 8) findings.push({ message: `${distinct.size} distinct spacing values (${offScale.length} off the 4-pt scale)`, severity: 'warn' });
    const hero = heroOf(ctx.dom);
    if (hero && px(hero.styles.paddingTop) < 48) findings.push({ message: `hero padding ${px(hero.styles.paddingTop)}px (under 48px)`, selector: hero.selector, severity: 'warn' });
    const sections = ctx.dom.byTag('section');
    for (let i = 1; i < sections.length; i++) {
      const gap = sections[i].box.y - (sections[i - 1].box.y + sections[i - 1].box.h);
      if (gap <= 0 && px(sections[i].styles.paddingTop) < 24) findings.push({ message: 'sections touch', selector: sections[i].selector });
    }
    const applies = findings.length > 0;
    return { applies, findings, reason: applies ? undefined : 'spacing already on a scale' };
  },
  async propose(ctx) {
    const src = readSources(ctx);
    const stylesPath = ctx.config.sources.styles;
    let css = src.styles;
    const nav = selFor(navOf(ctx.dom), 'header');
    const hero = selFor(heroOf(ctx.dom), 'main > section');
    const col = selFor(copyColumnOf(ctx.dom), `${hero} > div`);
    const gutter = 'clamp(20px, 5vw, 64px)';
    css = cssEdit.setDeclarations(css, nav, { padding: `clamp(16px, 2vw, 32px) ${gutter}` });
    css = cssEdit.setDeclarations(css, hero, { padding: `clamp(48px, 8vw, 112px) ${gutter} clamp(32px, 5vw, 64px)`, gap: 'clamp(24px, 4vw, 56px)' });
    css = cssEdit.setDeclarations(css, col, { gap: 'clamp(16px, 2vw, 28px)' });
    for (const extra of ['.features', '.spec', '.footer', 'footer']) {
      if (!cssEdit.hasRule(css, extra)) continue;
      if (extra === '.spec') css = cssEdit.setDeclarations(css, extra, { margin: `0 ${gutter}` });
      else if (extra === '.features') css = cssEdit.setDeclarations(css, extra, { padding: `clamp(16px, 2vw, 32px) ${gutter} clamp(40px, 6vw, 80px)`, gap: 'clamp(16px, 2vw, 24px)' });
      else css = cssEdit.setDeclarations(css, extra, { padding: `clamp(16px, 2vw, 24px) ${gutter}` });
    }
    return {
      summary: `Fluid 8-pt scale: gutters ${gutter}, hero padding up to 112px`,
      files: changed([{ path: stylesPath, before: src.styles, after: css }]),
    };
  },
  highlight(ctx) {
    return [selFor(heroOf(ctx.dom), 'main > section')];
  },
});
