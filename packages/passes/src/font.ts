import { definePass, cssEdit, rngFor, avoidOf, type Finding, type PassContext, type PatchFile, type Variant } from '@sitemaxxing/core';
import { selectFonts, pkgOf, type SelectedPairing } from '@sitemaxxing/components';
import { changed, h1Of, navOf, readSources, selFor } from './shared';

const GENERIC = /^(poppins|inter|arial|helvetica|system-ui|-apple-system|segoe ui|roboto|sans-serif|times new roman|times)$/i;

function pairings(ctx: PassContext): SelectedPairing[] {
  return selectFonts({
    mood: ctx.mood,
    goal: ctx.brief.goal,
    noise: ctx.brief.noise,
    rng: rngFor(ctx, 'font'),
    installed: (pkg) => ctx.files.exists(`node_modules/${pkg}`),
    avoidSerif: avoidOf(ctx.brief).serif,
  });
}

export const font = definePass({
  id: 'font',
  name: 'Font',
  kind: 'refine',
  order: 5,
  serves: ['character', 'mood'],
  dependsOn: ['direction'],
  ruleCards: ['butterick-fonts', 'laws-of-ux-aesthetic-usability'],
  description: 'A display face and a text face chosen for this story, self-hosted',
  async detect(ctx) {
    const findings: Finding[] = [];
    const fonts = ctx.dom.fonts.filter(Boolean);
    const generic = fonts.filter((f) => GENERIC.test(f));
    if (fonts.length && generic.length === fonts.length) findings.push({ message: `only ${fonts.join(', ')} in use`, severity: 'warn' });
    if (fonts.length === 1) findings.push({ message: 'one typeface for everything', severity: 'warn' });
    const h1 = h1Of(ctx.dom);
    const em = h1 ? ctx.dom.childrenOf(h1).find((n) => n.styles.fontStyle === 'italic' && /georgia|times|serif/i.test(n.styles.fontFamily)) : undefined;
    if (em) findings.push({ message: 'faux-italic serif accent in the headline', selector: em.selector, severity: 'warn' });
    const applies = findings.some((f) => f.severity === 'warn');
    return { applies, findings, reason: applies ? undefined : 'already a considered pairing' };
  },
  async variants(ctx) {
    return pairings(ctx).map((p): Variant => ({ id: p.id, label: p.label, thumbnail: p.thumbnail, attributes: p.attributes, source: 'library' }));
  },
  async propose(ctx, variantId) {
    const all = pairings(ctx);
    const pick = all.find((p) => p.id === variantId) ?? all[0];
    const pair = pick.pairing;
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    const notes: string[] = [];
    const tokensPath = ctx.tokens.file ?? ctx.config.sources.tokens;
    const tokensBefore = ctx.files.exists(tokensPath) ? ctx.files.read(tokensPath) : '';
    // Weight and tracking travel with the face; the Font size pass reads them.
    const vars: Record<string, string> = { '--display': pair.display, '--body': pair.body, '--label': pair.label_, '--display-weight': String(pair.displayWeight), '--display-tracking': pair.tracking };
    if ('--em-face' in ctx.tokens.vars) Object.assign(vars, { '--em-face': 'inherit', '--em-style': 'normal', '--em-ink': 'inherit' });
    let tokensAfter = cssEdit.setRootVars(tokensBefore, vars);
    const usesTokens = /var\(--display\)|var\(--body\)/.test(src.styles) || /var\(--display\)|var\(--body\)/.test(tokensBefore);
    if (!usesTokens) {
      const block = `body { font-family: var(--body); }\nh1, h2, h3 { font-family: var(--display); font-weight: var(--display-weight); }`;
      if (tokensPath === ctx.config.sources.styles) tokensAfter = cssEdit.appendCss(tokensAfter, block, 'sitemaxxing: font');
      else files.push({ path: ctx.config.sources.styles, before: src.styles, after: cssEdit.appendCss(src.styles, block, 'sitemaxxing: font') });
    }
    files.push({ path: tokensPath, before: tokensBefore, after: tokensAfter });
    const fontsPath = ctx.config.sources.fonts;
    let fonts = src.fonts;
    const missing: string[] = [];
    for (const imp of pair.imports) {
      const pkg = pkgOf(imp);
      if (!ctx.files.exists(`node_modules/${pkg}`)) {
        missing.push(pkg);
        continue;
      }
      const line = `import '${imp}';`;
      if (!fonts.includes(line)) fonts += (fonts.endsWith('\n') || fonts === '' ? '' : '\n') + line + '\n';
    }
    if (missing.length) notes.push(`Install the fonts to self-host them: npm i ${[...new Set(missing)].join(' ')}`);
    if (fonts !== src.fonts) files.push({ path: fontsPath, before: src.fonts, after: fonts });
    const name = (f: string) => f.split(',')[0].replace(/"/g, '').replace(/ Variable$/, '');
    return { summary: `${pick.label}: ${name(pair.display)} for display, ${name(pair.body)} for text`, files: changed(files), notes };
  },
  highlight(ctx) {
    return ['h1', selFor(navOf(ctx.dom), 'header')];
  },
});
