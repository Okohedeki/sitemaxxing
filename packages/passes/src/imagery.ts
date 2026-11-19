import { definePass, cssEdit, type Finding, type SnapNode } from '@sitemaxxing/core';
import { EMOJI_RE } from '@sitemaxxing/rules';
import { changed, copyColumnOf, descendants, heroOf, px, readSources, selFor } from './shared';

export function artOf(ctx: { dom: import('@sitemaxxing/core').SnapshotDOM }): SnapNode | undefined {
  const hero = heroOf(ctx.dom);
  const col = copyColumnOf(ctx.dom);
  if (!hero) return undefined;
  const candidates = ctx.dom.childrenOf(hero).filter((n) => n !== col && n.box.w > 120 && n.box.h > 120);
  return candidates.find((n) => n.classes.some((c) => /art|media|image|img|visual|figure|blob/i.test(c))) ?? candidates[0];
}

export function artKind(ctx: { dom: import('@sitemaxxing/core').SnapshotDOM }, art: SnapNode | undefined): 'image' | 'blob' | 'none' {
  if (!art) return 'none';
  const inner = [art, ...descendants(ctx.dom, art)];
  if (inner.some((n) => ['img', 'svg', 'picture', 'video', 'canvas'].includes(n.tag))) return 'image';
  return 'blob';
}

export const imagery = definePass({
  id: 'imagery',
  name: 'Imagery',
  kind: 'refine',
  order: 7,
  serves: ['mood', 'character'],
  ruleCards: ['lindgaard-2006', 'refactoring-ui-images', 'vercel-accessibility'],
  description: 'One strong image or art element given real weight, without the card, border or shadow',
  async detect(ctx) {
    const findings: Finding[] = [];
    const art = artOf(ctx);
    if (!art) return { applies: false, findings, reason: 'no hero image to work with' };
    const inner = [art, ...descendants(ctx.dom, art)];
    const boxed = inner.find((n) => px(n.styles.borderRadius) >= 12 && ((n.styles.boxShadow ?? 'none') !== 'none' || px(n.styles.borderTopWidth) > 0));
    if (boxed) findings.push({ message: 'image boxed in a rounded card with border or shadow', selector: boxed.selector, severity: 'warn' });
    const blob = inner.find((n) => (n.styles.backgroundImage ?? '').includes('gradient') && (n.styles.borderRadius ?? '').includes('%'));
    if (blob) findings.push({ message: 'stock-style gradient blob', selector: blob.selector, severity: 'warn' });
    const emojiArt = inner.find((n) => EMOJI_RE.test(n.text) && px(n.styles.fontSize) > 40);
    if (emojiArt) findings.push({ message: 'emoji used as art', selector: emojiArt.selector, severity: 'warn' });
    const applies = findings.some((f) => f.severity === 'warn');
    return { applies, findings, reason: applies ? undefined : 'hero image already carries weight' };
  },
  async propose(ctx) {
    const src = readSources(ctx);
    let css = src.styles;
    const art = artOf(ctx);
    const hero = heroOf(ctx.dom);
    const heroSel = selFor(hero, 'main > section');
    const artSel = selFor(art, `${heroSel} > div:last-child`);
    const notes: string[] = [];
    let summary: string;
    if (artKind(ctx, art) === 'image') {
      // Unbox the picture: no card, border or shadow, and let it fill its part of the hero. Where
      // it sits (beside, behind, above the copy) is the Hero layout pass's call, made per brief.
      css = cssEdit.setDeclarations(css, artSel, { 'border-radius': 'var(--media-radius-soft, 2px)', border: '0', 'box-shadow': 'none', overflow: 'hidden', position: 'relative' });
      summary = 'Boxed card image → the picture unboxed, edge to edge in its place';
    } else {
      // Blob art: give it weight and drop the decoration.
      css = cssEdit.setDeclarations(css, artSel, { 'min-height': 'clamp(360px, 44vw, 560px)', position: 'relative' });
      const blob = art ? [art, ...descendants(ctx.dom, art)].find((n) => (n.styles.backgroundImage ?? '').includes('gradient') || EMOJI_RE.test(n.text)) : undefined;
      if (blob && blob !== art) css = cssEdit.setDeclarations(css, selFor(blob, `${artSel} > div`), { inset: '0', 'border-radius': '28px', 'box-shadow': 'none', 'font-size': '0', background: 'var(--line, #e8e8e8)' });
      summary = 'Gradient blob with emoji → one quiet art panel with real weight';
    }
    return { summary, files: changed([{ path: ctx.config.sources.styles, before: src.styles, after: css }]), notes };
  },
  highlight(ctx) {
    return [selFor(heroOf(ctx.dom), 'main > section')];
  },
});
