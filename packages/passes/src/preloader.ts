import { SyntaxKind } from 'ts-morph';
import { defineComponent, cssEdit, jsxEdit, rngFor, type Finding, type PassContext, type PatchFile, type Variant } from '@sitemaxxing/core';
import { COMPONENT_DIR, PRELOADER_CSS, PRELOADER_TSX, selectComponents, componentIdOf } from '@sitemaxxing/components';

const picks = (ctx: PassContext) => selectComponents('preloader', { mood: ctx.mood, goal: ctx.brief.goal, noise: ctx.brief.noise, rng: rngFor(ctx, 'preloader') });
import { importPath, readSources } from './shared';

export const preloader = defineComponent({
  id: 'preloader',
  name: 'Preloader',
  order: 12,
  serves: ['mood'],
  moodBias: { energy: 0.6, formality: -0.3 },
  ruleCards: ['emil-good-vs-great', 'vercel-motion'],
  description: 'A branded load-in that plays once: counter wipe, split curtain, or image stack',
  replay: true,
  async detect(ctx) {
    const findings: Finding[] = [];
    const src = readSources(ctx);
    if (/<Preloader\b/.test(src.app) || /preloader|loader/i.test(src.app)) return { applies: false, findings, reason: 'already has a preloader' };
    findings.push({ message: 'no load-in; the page simply appears' });
    return { applies: true, findings };
  },
  async variants(ctx) {
    return picks(ctx).map((p): Variant => ({ id: p.id, label: p.label, thumbnail: p.spec.thumb, attributes: { ...p.attributes, duration: 2100 }, source: 'library' }));
  },
  async propose(ctx, chosen) {
    const id = componentIdOf(chosen) ?? componentIdOf(picks(ctx)[0]?.id) ?? 'counter';
    const v = ['counter', 'curtain', 'stack'].includes(id) ? id : 'counter';
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    const path = `${COMPONENT_DIR}/Preloader.tsx`;
    files.push({ path, before: ctx.files.exists(path) ? ctx.files.read(path) : '', after: PRELOADER_TSX });
    const { file } = jsxEdit.parseTsx(src.app);
    const root = jsxEdit.allJsx(file).find((e) => e.getKind() === SyntaxKind.JsxElement && !jsxEdit.allJsx(file).some((o) => o !== e && o.containsRange(e.getStart(), e.getEnd())));
    if (!root) throw new Error('no root element in the app file');
    const brand = (ctx.content?.data as any)?.brand ? ' brand={content.brand}' : '';
    file.insertText((root as any).getOpeningElement().getEnd(), `\n      <Preloader variant="${v}"${brand} />`);
    jsxEdit.addImport(file, 'Preloader', importPath(ctx, COMPONENT_DIR, 'Preloader'));
    files.push({ path: ctx.config.sources.app, before: src.app, after: jsxEdit.tidy(file.getFullText()) });
    files.push({ path: ctx.config.sources.styles, before: src.styles, after: cssEdit.appendCss(src.styles, PRELOADER_CSS, 'sitemaxxing: preloader') });
    const names: Record<string, string> = { counter: '0 to 100 counts up, then the panel slides away', curtain: 'Two panels part from the centre', stack: 'Three cards land, then zoom through' };
    return { summary: names[v], files: files.filter((f) => f.before !== f.after) };
  },
  highlight() {
    return ['.preloader', '#root > *'];
  },
});
