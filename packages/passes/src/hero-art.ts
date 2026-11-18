import { defineComponent, cssEdit, jsxEdit, type Finding, type PatchFile, type Variant } from '@sitemaxxing/core';
import { COMPONENT_DIR, DOT_FIELD_CSS, DOT_FIELD_THUMBS, DOT_FIELD_TSX } from '@sitemaxxing/components';
import { artKind, artOf } from './imagery';
import { descendants, heroOf, importPath, jsxFor, readSources, selFor } from './shared';

export const heroArt = defineComponent({
  id: 'hero-art',
  name: 'Hero art: dot field',
  order: 11,
  points: 12,
  dependsOn: ['imagery'],
  ruleCards: ['hekkert-2003-maya', 'rauno-feedback', 'vercel-motion'],
  description: 'Replace the hero art with a live, pointer-reactive dot field in the direction’s dot colour',
  async detect(ctx) {
    const findings: Finding[] = [];
    const src = readSources(ctx);
    if (/<DotField\b/.test(src.app)) return { applies: false, findings, reason: 'already uses the dot field' };
    const art = artOf(ctx);
    if (!art) return { applies: false, findings, reason: 'no hero art element to replace' };
    findings.push({ message: artKind(ctx, art) === 'image' ? 'static illustration in the hero' : 'gradient blob in the hero', selector: art.selector });
    return { applies: true, findings };
  },
  async variants() {
    const labels: Record<string, string> = { morph: 'Morphing shapes', globe: 'Dot globe', wave: 'Field wave' };
    return (['morph', 'globe', 'wave'] as const).map((id): Variant => ({ id, label: labels[id], thumbnail: DOT_FIELD_THUMBS[id], attributes: { motion: id === 'morph' ? 'morph 2.6s' : id === 'globe' ? 'rotate' : 'sine', density: 520, reactive: 'pointer' }, source: 'library' }));
  },
  async propose(ctx, variantId = 'morph') {
    const v = ['morph', 'globe', 'wave'].includes(variantId) ? variantId : 'morph';
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    const path = `${COMPONENT_DIR}/DotField.tsx`;
    files.push({ path, before: ctx.files.exists(path) ? ctx.files.read(path) : '', after: DOT_FIELD_TSX });
    const { file } = jsxEdit.parseTsx(src.app);
    const art = artOf(ctx);
    const artEl = jsxFor(file, art);
    if (!artEl) throw new Error('could not find the hero art element in the app file');
    const inner = [art!, ...descendants(ctx.dom, art!)];
    const target = inner.find((n) => n !== art && (n.tag === 'svg' || n.tag === 'img' || (n.styles.backgroundImage ?? '').includes('gradient')));
    const targetEl = (target && jsxFor(file, target)) ?? jsxEdit.find(file, (e) => artEl.containsRange(e.getStart(), e.getEnd()) && e !== artEl && /^[A-Z]/.test(jsxEdit.tagName(e)));
    const caption = (ctx.content?.data as any)?.artCaption ? `<div className="art-caption"><b aria-hidden="true" />{content.artCaption}</div>` : '';
    if (targetEl) targetEl.replaceWithText(`<DotField variant="${v}" />${caption}`);
    else {
      const open = (artEl as any).getOpeningElement?.();
      if (open) file.insertText(open.getEnd(), `<DotField variant="${v}" />${caption}`);
    }
    jsxEdit.addImport(file, 'DotField', importPath(ctx, COMPONENT_DIR, 'DotField'));
    files.push({ path: ctx.config.sources.app, before: src.app, after: jsxEdit.tidy(file.getFullText()) });
    const artSel = selFor(art, '.art');
    let css = cssEdit.setDeclarations(src.styles, artSel, { position: artKind(ctx, art) === 'image' ? 'absolute' : 'relative', overflow: 'hidden' });
    css = cssEdit.appendCss(
      css,
      `${DOT_FIELD_CSS}
.art-caption { position: absolute; left: 0; bottom: 0; font: 400 13px var(--label, inherit); color: var(--soft, inherit); letter-spacing: .04em; text-transform: uppercase; }
.art-caption b { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--acc, currentColor); margin-right: 8px; vertical-align: 1px; }`,
      'sitemaxxing: dot field',
    );
    files.push({ path: ctx.config.sources.styles, before: src.styles, after: css });
    const names: Record<string, string> = { morph: 'Disc → drop → leaf → rows every 2.6s, pushed away by the cursor', globe: 'A rotating Fibonacci sphere, size and opacity by depth', wave: 'A sine-displaced grid that flexes away from the cursor' };
    return { summary: names[v], files: files.filter((f) => f.before !== f.after) };
  },
  highlight(ctx) {
    return [selFor(artOf(ctx), selFor(heroOf(ctx.dom), 'main > section'))];
  },
});
