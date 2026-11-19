import { SyntaxKind } from 'ts-morph';
import { definePass, cssEdit, jsxEdit, rngFor, type Finding, type PassContext, type PatchFile, type Variant } from '@sitemaxxing/core';
import { COMPONENT_DIR, REVEAL_CSS, REVEAL_TSX, selectComponents, componentIdOf } from '@sitemaxxing/components';

const picks = (ctx: PassContext) => selectComponents('reveal', { mood: ctx.mood, goal: ctx.brief.goal, noise: ctx.brief.noise, rng: rngFor(ctx, 'reveal-hero') });
import { copyColumnOf, h1Of, importPath, jsxFor, readSources, selFor } from './shared';

export const revealHero = definePass({
  id: 'reveal-hero',
  name: 'Reveal hero',
  kind: 'refine',
  order: 10,
  serves: ['mood', 'polish'],
  moodBias: { energy: 0.5 },
  ruleCards: ['emil-great-animations', 'vercel-motion', 'emil-good-vs-great'],
  description: 'One hero entrance on load and nothing else animating: line rise, word stagger, or blur in',
  replay: true,
  async detect(ctx) {
    const findings: Finding[] = [];
    const h1 = h1Of(ctx.dom);
    if (!h1) return { applies: false, findings, reason: 'no headline' };
    const src = readSources(ctx);
    if (/<Reveal\b/.test(src.app)) return { applies: false, findings, reason: 'already has a hero entrance' };
    const animated = ctx.dom.aboveFold().filter((n) => (n.styles.animationName ?? 'none') !== 'none');
    if (animated.length > 3) findings.push({ message: `${animated.length} blocks animate on entry`, severity: 'warn' });
    if ((h1.styles.animationName ?? 'none') === 'none') findings.push({ message: 'the hero has no entrance', selector: 'h1', severity: 'warn' });
    const applies = findings.some((f) => f.severity === 'warn');
    return { applies, findings, reason: applies ? undefined : 'already one entrance' };
  },
  async variants(ctx) {
    return picks(ctx).map((p): Variant => ({ id: p.id, label: p.label, thumbnail: p.spec.thumb, attributes: { ...p.attributes, duration: p.spec.id === 'blur' ? 1100 : 900 }, source: 'library' }));
  },
  async propose(ctx, chosen) {
    const id = componentIdOf(chosen) ?? componentIdOf(picks(ctx)[0]?.id) ?? 'rise';
    const v = ['rise', 'words', 'blur'].includes(id) ? id : 'rise';
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    const path = `${COMPONENT_DIR}/Reveal.tsx`;
    files.push({ path, before: ctx.files.exists(path) ? ctx.files.read(path) : '', after: REVEAL_TSX });
    const { file } = jsxEdit.parseTsx(src.app);
    const col = copyColumnOf(ctx.dom);
    const el = jsxFor(file, col);
    if (!el || el.getKind() !== SyntaxKind.JsxElement) throw new Error('could not find the copy column in the app file');
    const classes = jsxEdit.classes(el);
    const open = (el as any).getOpeningElement();
    const close = (el as any).getClosingElement();
    const attrs = open
      .getAttributes()
      .map((a: any) => a.getText())
      .filter((t: string) => !t.startsWith('className'))
      .join(' ');
    const inner = el.getText().slice(open.getText().length, el.getText().length - close.getText().length);
    el.replaceWithText(`<Reveal variant="${v}" className="${classes.join(' ')}"${attrs ? ' ' + attrs : ''}>${inner}</Reveal>`);
    jsxEdit.addImport(file, 'Reveal', importPath(ctx, COMPONENT_DIR, 'Reveal'));
    files.push({ path: ctx.config.sources.app, before: src.app, after: jsxEdit.tidy(file.getFullText()) });
    files.push({ path: ctx.config.sources.styles, before: src.styles, after: cssEdit.appendCss(src.styles, REVEAL_CSS, 'sitemaxxing: reveal') });
    const names: Record<string, string> = { rise: 'Lines rise from a clip, 900ms, staggered', words: 'Words stagger in 70ms apart', blur: 'Headline sharpens from a blur, 1.1s' };
    return { summary: names[v], files: files.filter((f) => f.before !== f.after) };
  },
  highlight(ctx) {
    return ['h1', selFor(copyColumnOf(ctx.dom), 'h1')];
  },
});
