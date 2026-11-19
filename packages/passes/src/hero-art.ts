import { defineComponent, cssEdit, jsxEdit, rngFor, hashSeed, type Finding, type PassContext, type PatchFile, type Variant } from '@sitemaxxing/core';
import { COMPONENT_DIR, selectComponents, type SelectedComponent } from '@sitemaxxing/components';
import { artKind, artOf } from './imagery';
import { descendants, heroOf, importPath, jsxFor, readSources, selFor } from './shared';

function picks(ctx: PassContext): SelectedComponent[] {
  return selectComponents('hero-art', { mood: ctx.mood, goal: ctx.brief.goal, noise: ctx.brief.noise, rng: rngFor(ctx, 'hero-art') });
}

export const heroArt = defineComponent({
  id: 'hero-art',
  name: 'Hero art',
  order: 11,
  serves: ['character', 'mood'],
  moodBias: { energy: 0.3, formality: -0.2 },
  dependsOn: ['imagery'],
  ruleCards: ['hekkert-2003-maya', 'rauno-feedback', 'vercel-motion'],
  description: 'Replace the hero art with a live field drawn in the direction’s colour',
  async detect(ctx) {
    const findings: Finding[] = [];
    const src = readSources(ctx);
    if (/<HeroField\b/.test(src.app)) return { applies: false, findings, reason: 'already uses a hero field' };
    const art = artOf(ctx);
    if (!art) return { applies: false, findings, reason: 'no hero art element to replace' };
    findings.push({ message: artKind(ctx, art) === 'image' ? 'static illustration in the hero' : 'gradient blob in the hero', selector: art.selector, severity: artKind(ctx, art) === 'image' ? 'info' : 'warn' });
    return { applies: true, findings };
  },
  async variants(ctx) {
    return picks(ctx).map((p): Variant => ({ id: p.id, label: p.label, thumbnail: p.spec.thumb, attributes: p.attributes, source: 'library' }));
  },
  async propose(ctx, variantId) {
    const all = picks(ctx);
    const pick = all.find((p) => p.id === variantId) ?? all[0];
    const spec = pick.spec;
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    for (const f of spec.files ?? []) {
      const path = `${COMPONENT_DIR}/${f.name}`;
      files.push({ path, before: ctx.files.exists(path) ? ctx.files.read(path) : '', after: f.code });
    }
    const { file } = jsxEdit.parseTsx(src.app);
    const art = artOf(ctx);
    const artEl = jsxFor(file, art);
    if (!artEl) throw new Error('could not find the hero art element in the app file');
    const inner = [art!, ...descendants(ctx.dom, art!)];
    const target = inner.find((n) => n !== art && (n.tag === 'svg' || n.tag === 'img' || (n.styles.backgroundImage ?? '').includes('gradient')));
    const targetEl = (target && jsxFor(file, target)) ?? jsxEdit.find(file, (e) => artEl.containsRange(e.getStart(), e.getEnd()) && e !== artEl && /^[A-Z]/.test(jsxEdit.tagName(e)));
    const caption = (ctx.content?.data as any)?.artCaption ? `<div className="art-caption"><b aria-hidden="true" />{content.artCaption}</div>` : '';
    const usage = spec.usage!({ content: 'content', params: pick.params, seed: hashSeed(ctx.seeds['hero-art'] ?? 0, spec.id) % 100000, title: '' });
    if (targetEl) targetEl.replaceWithText(`${usage}${caption}`);
    else {
      const open = (artEl as any).getOpeningElement?.();
      if (open) file.insertText(open.getEnd(), `${usage}${caption}`);
    }
    jsxEdit.addImport(file, 'HeroField', importPath(ctx, COMPONENT_DIR, 'HeroField'));
    files.push({ path: ctx.config.sources.app, before: src.app, after: jsxEdit.tidy(file.getFullText()) });
    const artSel = selFor(art, '.art');
    let css = cssEdit.setDeclarations(src.styles, artSel, { position: 'relative', overflow: 'hidden' });
    css = cssEdit.appendCss(
      css,
      `${spec.css ?? ''}
.art-caption { position: absolute; left: 0; bottom: 0; font: 400 13px var(--label, inherit); color: var(--soft, inherit); letter-spacing: .04em; text-transform: uppercase; }
.art-caption b { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--acc, currentColor); margin-right: 8px; vertical-align: 1px; }`,
      'sitemaxxing: hero field',
    );
    files.push({ path: ctx.config.sources.styles, before: src.styles, after: css });
    const p = pick.params;
    return { summary: `${spec.description} (density ${p.density}, speed ${p.speed})`, files: files.filter((f) => f.before !== f.after) };
  },
  highlight(ctx) {
    return [selFor(artOf(ctx), selFor(heroOf(ctx.dom), 'main > section'))];
  },
});
