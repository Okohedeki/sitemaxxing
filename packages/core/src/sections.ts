import type { Section, SnapshotDOM, SnapNode } from './types';

/**
 * Splits a page into sections. Landmarks first (header, nav, main sections, footer), then
 * large direct children of body as a fallback.
 */
export function detectSections(dom: SnapshotDOM, projectId: string): Section[] {
  const out: Section[] = [];
  const push = (kind: string, n: SnapNode) => {
    if (out.some((s) => s.selector === n.selector)) return;
    out.push({ id: `${projectId}:${kind}:${out.length}`, projectId, kind, selector: n.selector, order: out.length });
  };
  const header = dom.first('header') ?? dom.first('nav');
  if (header) push('nav', header);
  const h1 = dom.first('h1');
  if (h1) {
    let hero: SnapNode | undefined = h1;
    while (hero && !['section', 'main', 'div', 'article'].includes(hero.tag)) hero = dom.parentOf(hero);
    // climb until the box is wide enough to be a section
    while (hero && hero.box.w < dom.viewport.width * 0.6 && dom.parentOf(hero)) hero = dom.parentOf(hero);
    if (hero) push('hero', hero);
  }
  for (const n of dom.byTag('section')) if (n.box.h > 80) push('section', n);
  const footer = dom.first('footer');
  if (footer) push('footer', footer);
  if (out.length === 0) {
    const body = dom.nodes[0];
    if (body) for (const c of dom.childrenOf(body)) if (c.box.h > 120) push('block', c);
  }
  return out;
}
