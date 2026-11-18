import { definePass, cssEdit, type Finding, type Variant } from '@sitemaxxing/core';
import { DIRECTIONS } from '@sitemaxxing/components';
import { buttonsIn, changed, heroOf, navOf, readSources, selFor } from './shared';

/** Semantic tokens the sloppy baseline may declare; the direction turns them solid and quiet. */
const SOLID_TOKENS: Record<string, string> = {
  '--btn-bg': 'var(--ink)',
  '--btn-ink': 'var(--bg)',
  '--btn-shadow': 'none',
  '--pill-bg': 'transparent',
  '--pill-ink': 'var(--soft)',
  '--pill-border': '1px solid var(--line)',
  '--grad-text': 'none',
  '--grad-ink': 'var(--acc)',
  '--art-bg': 'var(--line)',
  '--art-shadow': 'none',
  '--art-radius': '28px',
  '--card-shadow': 'none',
  '--logo-bg': 'var(--acc)',
  '--media-border': '0',
  '--media-shadow': 'none',
  '--em-ink': 'var(--acc)',
};

function saturatedHues(colors: string[]): number {
  const hues = new Set<number>();
  for (const c of colors) {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) continue;
    const [r, g, b] = [+m[1], +m[2], +m[3]].map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const s = max === 0 ? 0 : (max - min) / max;
    if (s < 0.35 || max < 0.2) continue;
    let h = 0;
    if (max === r) h = (g - b) / (max - min);
    else if (max === g) h = 2 + (b - r) / (max - min);
    else h = 4 + (r - g) / (max - min);
    hues.add(Math.round((((h * 60 + 360) % 360) / 30)));
  }
  return hues.size;
}

export const direction = definePass({
  id: 'direction',
  name: 'Visual direction',
  kind: 'direction',
  order: 0,
  points: 16,
  ruleCards: ['refactoring-ui-color', 'tuch-2012-prototypicality', 'reinecke-2013-colorfulness', 'emil-agents-with-taste'],
  description: 'Whole-page look: palette, accent and tone as design tokens; solid buttons, no gradients, hairline badges',
  async detect(ctx) {
    const findings: Finding[] = [];
    const fold = ctx.dom.aboveFold();
    const gradients = fold.filter((n) => (n.styles.backgroundImage ?? '').includes('gradient'));
    if (gradients.length) findings.push({ message: `${gradients.length} gradient fills above the fold`, selector: gradients[0].selector, severity: 'warn' });
    const hues = saturatedHues(fold.flatMap((n) => [n.styles.backgroundColor ?? '', n.styles.color ?? '']));
    if (hues > 2) findings.push({ message: `${hues} saturated hues competing above the fold`, severity: 'warn' });
    const shadowed = buttonsIn(ctx.dom, heroOf(ctx.dom)).filter((n) => (n.styles.boxShadow ?? 'none') !== 'none');
    if (shadowed.length) findings.push({ message: 'buttons carry drop shadows', selector: shadowed[0].selector });
    const tokenGradients = Object.values(ctx.tokens.vars).filter((v) => v.includes('gradient')).length;
    if (tokenGradients) findings.push({ message: `${tokenGradients} gradient tokens declared on :root` });
    const applies = findings.length > 0 || Object.keys(ctx.tokens.vars).length === 0;
    return { applies, findings, reason: applies ? undefined : 'palette already restrained' };
  },
  async variants() {
    return Object.entries(DIRECTIONS).map(([id, d]): Variant => ({ id, label: d.label, thumbnail: d.thumb, attributes: d.attributes, source: 'library' }));
  },
  async propose(ctx, variantId = 'lab') {
    const dir = DIRECTIONS[variantId] ?? DIRECTIONS.lab;
    const src = readSources(ctx);
    const tokensPath = ctx.tokens.file ?? ctx.config.sources.tokens;
    const before = ctx.files.exists(tokensPath) ? ctx.files.read(tokensPath) : '';
    const vars: Record<string, string> = { ...dir.tokens };
    for (const [k, v] of Object.entries(SOLID_TOKENS)) if (k in ctx.tokens.vars) vars[k] = v;
    let after = cssEdit.setRootVars(before, vars);
    const files = [{ path: tokensPath, before, after }];
    if (Object.keys(ctx.tokens.vars).length === 0) {
      // No token system yet: make the body and buttons follow the new tokens.
      const stylesPath = ctx.config.sources.styles;
      const block = `body { background: var(--bg); color: var(--ink); }
a.btn, button, .btn, [class*="button"] { background: var(--ink); color: var(--bg); background-image: none; box-shadow: none; }
h1 span, h1 strong { background: none; color: var(--acc); -webkit-text-fill-color: currentColor; }`;
      if (tokensPath === stylesPath) {
        after = cssEdit.appendCss(after, block, 'sitemaxxing: direction');
        files[0].after = after;
      } else files.push({ path: stylesPath, before: src.styles, after: cssEdit.appendCss(src.styles, block, 'sitemaxxing: direction') });
    }
    return {
      summary: `${dir.label}: paper ${dir.tokens['--bg']}, ink ${dir.tokens['--ink']}, accent ${dir.tokens['--acc']}; solid buttons, no gradients`,
      files: changed(files),
    };
  },
  highlight(ctx) {
    return [selFor(navOf(ctx.dom), 'header'), selFor(heroOf(ctx.dom), 'main')];
  },
});
