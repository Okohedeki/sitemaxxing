import { definePass, readSource, readSystem, systemize, type Anchors, type PassContext, type SystemizeResult } from '@sitemaxxing/core';
import { changed } from './shared';

/** The stylesheets the pass may rewrite: the configured one and any other in `src`. */
function sheetsOf(ctx: PassContext): Array<{ path: string; css: string }> {
  const paths = [...new Set([ctx.config.sources.styles, ctx.config.sources.tokens, ...ctx.files.list('src', '.css')])];
  return paths.filter((p) => ctx.files.exists(p)).map((path) => ({ path, css: ctx.files.read(path) }));
}

/** The page's main colours as they render, so the rest can be named by family. */
export function anchorsOf(ctx: PassContext): Anchors | undefined {
  if (!ctx.dom.nodes.length) return undefined;
  const { colors } = readSystem(ctx.dom);
  const of = (role: string) => colors.find((c) => c.role === role)?.hex;
  const bg = of('background');
  const ink = of('ink');
  return bg && ink ? { bg, ink, acc: of('accent') } : undefined;
}

function run(ctx: PassContext): SystemizeResult {
  const sheets = sheetsOf(ctx);
  // Shared values live where the project already keeps them; a project with none gets them in
  // its stylesheet, which is certain to be loaded.
  const tokensPath = ctx.tokens.file ?? (ctx.files.exists(ctx.config.sources.tokens) ? ctx.config.sources.tokens : ctx.config.sources.styles);
  const tokensCss = sheets.find((s) => s.path === tokensPath)?.css ?? (ctx.files.exists(tokensPath) ? ctx.files.read(tokensPath) : '');
  return systemize({ sheets, tokensPath, tokensCss, anchors: anchorsOf(ctx) });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const sharedValues = definePass({
  id: 'shared-values',
  name: 'Shared values',
  kind: 'refine',
  order: 0,
  foundation: true,
  serves: ['polish', 'character'],
  ruleCards: ['refactoring-ui-color', 'utopia-type'],
  description: 'Every colour, text size and spacing value written in place moves to one named value. Nothing changes on screen',
  async detect(ctx) {
    const s = readSource(sheetsOf(ctx).map((x) => x.css));
    const written = s.literal.color + s.literal.size + s.literal.space;
    const findings = [
      { message: `${plural(s.literal.color, 'colour')}, ${plural(s.literal.size, 'text size')} and ${plural(s.literal.space, 'spacing value')} are written in place`, severity: written >= 5 ? ('warn' as const) : ('info' as const) },
      { message: `${s.coverage === null ? 0 : Math.round(s.coverage * 100)}% of the styling reads from shared values` },
    ];
    const applies = written >= 5;
    return { applies, findings, reason: applies ? undefined : 'the styles already read from shared values' };
  },
  async propose(ctx) {
    const r = run(ctx);
    const n = Object.keys(r.added).length;
    return {
      summary: `${plural(r.moved.color, 'colour')}, ${plural(r.moved.size, 'text size')} and ${plural(r.moved.space, 'spacing value')} now read from ${plural(n, 'shared value')}. The page looks the same`,
      files: changed(r.files),
    };
  },
  highlight() {
    // The whole page, since nothing on it should move.
    return ['body'];
  },
});
