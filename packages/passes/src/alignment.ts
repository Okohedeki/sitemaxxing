import { definePass, cssEdit, type Finding } from '@sitemaxxing/core';
import { changed, copyColumnOf, descendants, h1Of, navOf, readSources, selFor } from './shared';

const TEXT_TAGS = ['h1', 'h2', 'h3', 'p', 'li', 'span', 'a', 'small', 'b'];

export function leftEdges(ctx: Parameters<typeof alignment.detect>[0]): number[] {
  const fold = ctx.dom.aboveFold().filter((n) => TEXT_TAGS.includes(n.tag) && n.text.length > 2 && n.box.w > 40);
  const edges = new Set<number>();
  for (const n of fold) edges.add(Math.round(n.box.x / 8) * 8);
  return [...edges];
}

export const alignment = definePass({
  id: 'alignment',
  name: 'Alignment',
  kind: 'refine',
  order: 4,
  points: 4,
  dependsOn: ['declutter'],
  ruleCards: ['every-layout', 'refactoring-ui-alignment', 'butterick-line-length'],
  description: 'One grid and one left edge: left-aligned copy column, nav links moved to the right',
  async detect(ctx) {
    const findings: Finding[] = [];
    const col = copyColumnOf(ctx.dom);
    const edges = leftEdges(ctx);
    if (edges.length > 2) findings.push({ message: `${edges.length} distinct left edges above the fold`, severity: 'warn' });
    if (col && (col.styles.textAlign === 'center' || col.styles.alignItems === 'center')) findings.push({ message: 'centered copy column', selector: col.selector, severity: 'warn' });
    const nav = navOf(ctx.dom);
    const ul = descendants(ctx.dom, nav).find((n) => n.tag === 'ul');
    if (nav && ul) {
      const center = ul.box.x + ul.box.w / 2;
      const navCenter = nav.box.x + nav.box.w / 2;
      if (Math.abs(center - navCenter) < nav.box.w * 0.12 && ul.box.w < nav.box.w * 0.6) findings.push({ message: 'nav links centered between logo and buttons', selector: ul.selector, severity: 'warn' });
    }
    const applies = findings.some((f) => f.severity === 'warn');
    return { applies, findings, reason: applies ? undefined : 'already on one left edge' };
  },
  async propose(ctx) {
    const src = readSources(ctx);
    let css = src.styles;
    const col = copyColumnOf(ctx.dom);
    const colSel = selFor(col, 'h1');
    css = cssEdit.setDeclarations(css, colSel, { 'text-align': 'left', 'align-items': 'flex-start' });
    const h1 = h1Of(ctx.dom);
    const sub = col ? ctx.dom.childrenOf(col).find((n) => n.tag === 'p' && h1 && n.box.y > h1.box.y) : undefined;
    if (sub) css = cssEdit.setDeclarations(css, selFor(sub, 'p'), { 'margin-left': '0', 'margin-right': 'auto' });
    const ul = descendants(ctx.dom, navOf(ctx.dom)).find((n) => n.tag === 'ul');
    if (ul) css = cssEdit.setDeclarations(css, selFor(ul, 'nav ul'), { margin: '0 0 0 auto' });
    return {
      summary: 'Copy column on one left edge; nav links pushed right',
      files: changed([{ path: ctx.config.sources.styles, before: src.styles, after: css }]),
    };
  },
  highlight(ctx) {
    return [selFor(copyColumnOf(ctx.dom), 'h1')];
  },
});
