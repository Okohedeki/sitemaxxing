import { definePass, cssEdit, type Finding, type PatchFile, type Variant } from '@sitemaxxing/core';
import { FONT_PAIRS } from '@sitemaxxing/components';
import { changed, h1Of, navOf, readSources, selFor } from './shared';

const GENERIC = /^(poppins|inter|arial|helvetica|system-ui|-apple-system|segoe ui|roboto|sans-serif|times new roman|times)$/i;

export const font = definePass({
  id: 'font',
  name: 'Font',
  kind: 'refine',
  order: 5,
  points: 6,
  dependsOn: ['direction'],
  ruleCards: ['butterick-fonts', 'laws-of-ux-aesthetic-usability'],
  description: 'One characterful display face plus a neutral text face, chosen to fit the direction',
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
  async variants() {
    return Object.entries(FONT_PAIRS).map(([id, p]): Variant => ({ id, label: p.label, thumbnail: p.thumb, attributes: { display: p.display.split(',')[0].replace(/"/g, ''), body: p.body.split(',')[0].replace(/"/g, '') }, source: 'library' }));
  },
  async propose(ctx, variantId = 'grotesk-mono') {
    const pair = FONT_PAIRS[variantId] ?? FONT_PAIRS['grotesk-mono'];
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    const notes: string[] = [];
    const tokensPath = ctx.tokens.file ?? ctx.config.sources.tokens;
    const tokensBefore = ctx.files.exists(tokensPath) ? ctx.files.read(tokensPath) : '';
    const vars: Record<string, string> = { '--display': pair.display, '--body': pair.body, '--label': pair.label_ };
    if ('--em-face' in ctx.tokens.vars) Object.assign(vars, { '--em-face': 'inherit', '--em-style': 'normal', '--em-ink': 'inherit' });
    let tokensAfter = cssEdit.setRootVars(tokensBefore, vars);
    const usesTokens = /var\(--display\)|var\(--body\)/.test(src.styles) || /var\(--display\)|var\(--body\)/.test(tokensBefore);
    if (!usesTokens) {
      const block = `body { font-family: var(--body); }\nh1, h2, h3 { font-family: var(--display); }`;
      if (tokensPath === ctx.config.sources.styles) tokensAfter = cssEdit.appendCss(tokensAfter, block, 'sitemaxxing: font');
      else files.push({ path: ctx.config.sources.styles, before: src.styles, after: cssEdit.appendCss(src.styles, block, 'sitemaxxing: font') });
    }
    files.push({ path: tokensPath, before: tokensBefore, after: tokensAfter });
    // Self-hosted font imports.
    const fontsPath = ctx.config.sources.fonts;
    let fonts = src.fonts;
    const missing: string[] = [];
    for (const imp of pair.imports) {
      const pkg = imp.split('/').slice(0, 2).join('/');
      if (!ctx.files.exists(`node_modules/${pkg}`)) {
        missing.push(pkg);
        continue;
      }
      const line = `import '${imp}';`;
      if (!fonts.includes(line)) fonts += (fonts.endsWith('\n') || fonts === '' ? '' : '\n') + line + '\n';
    }
    if (missing.length) notes.push(`Install the fonts to self-host them: npm i ${[...new Set(missing)].join(' ')}`);
    if (fonts !== src.fonts) files.push({ path: fontsPath, before: src.fonts, after: fonts });
    return { summary: `${pair.label}: ${pair.display.split(',')[0].replace(/"/g, '')} for display, ${pair.body.split(',')[0].replace(/"/g, '')} for text`, files: changed(files), notes };
  },
  highlight(ctx) {
    return ['h1', selFor(navOf(ctx.dom), 'header')];
  },
});
