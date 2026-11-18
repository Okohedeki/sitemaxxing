import { SyntaxKind } from 'ts-morph';
import { definePass, cssEdit, jsxEdit, type Finding, type PatchFile, type Variant } from '@sitemaxxing/core';
import { ARROW_BUTTON_CSS, ARROW_THUMBS } from '@sitemaxxing/components';
import { ctaOf, descendants, jsxFor, readSources, selFor } from './shared';

export const arrowButton = definePass({
  id: 'arrow-button',
  name: 'Arrow shift button',
  kind: 'refine',
  order: 9,
  points: 4,
  ruleCards: ['emil-great-animations', 'vercel-interactions', 'laws-of-ux-fitts'],
  description: 'Hover feedback on the primary action: the arrow nudges, or sits in a disc and turns',
  forceState: { selector: '[data-copy="cta"], .ctas .btn:first-child, .btn', state: 'hover' },
  async detect(ctx) {
    const findings: Finding[] = [];
    const cta = ctaOf(ctx.dom);
    if (!cta) return { applies: false, findings, reason: 'no call to action found' };
    const arrow = descendants(ctx.dom, cta).find((n) => n.classes.some((c) => /arrow|icon/.test(c)) || /[→›]/.test(n.text));
    const transition = arrow?.styles.transitionProperty ?? cta.styles.transitionProperty ?? 'all';
    const duration = arrow?.styles.transitionDuration ?? cta.styles.transitionDuration ?? '0s';
    if (!arrow) findings.push({ message: 'primary button has no arrow or icon', selector: cta.selector });
    if (duration === '0s' || transition === 'none') findings.push({ message: 'no hover feedback on the primary action', selector: cta.selector, severity: 'warn' });
    if (/scale/.test(cta.styles.transitionProperty ?? '')) findings.push({ message: 'generic scale-up on hover', selector: cta.selector, severity: 'warn' });
    const applies = findings.some((f) => f.severity === 'warn');
    return { applies, findings, reason: applies ? undefined : 'button already has feedback' };
  },
  async variants() {
    return (['nudge', 'disc'] as const).map((id): Variant => ({ id, label: id === 'nudge' ? 'Arrow nudge' : 'Disc rotate', thumbnail: ARROW_THUMBS[id], attributes: { motion: id, duration: id === 'nudge' ? 200 : 220 }, source: 'library' }));
  },
  async propose(ctx, variantId = 'nudge') {
    const v = variantId === 'disc' ? 'disc' : 'nudge';
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    const cta = ctaOf(ctx.dom);
    const btnSel = selFor(cta, '.btn');
    const { file } = jsxEdit.parseTsx(src.app);
    const el = jsxFor(file, cta) ?? jsxEdit.find(file, (e) => jsxEdit.hasClass(e, 'btn') && jsxEdit.attr(e, 'data-copy') === 'cta');
    let app = src.app;
    if (el && !/arrow/.test(el.getText()) && el.getKind() === SyntaxKind.JsxElement) {
      const closing = (el as any).getClosingElement();
      file.insertText(closing.getStart(), '<span className="arrow" aria-hidden="true">→</span>');
      app = jsxEdit.tidy(file.getFullText());
    }
    if (app !== src.app) files.push({ path: ctx.config.sources.app, before: src.app, after: app });
    const block = ARROW_BUTTON_CSS[v].split('.btn').join(btnSel);
    const css = cssEdit.appendCss(src.styles, block, `sitemaxxing: arrow ${v}`);
    files.push({ path: ctx.config.sources.styles, before: src.styles, after: css });
    return { summary: v === 'nudge' ? 'Arrow nudges 4px on hover, 200ms ease-out' : 'Arrow sits in a disc and rotates −45° on hover', files: files.filter((f) => f.before !== f.after) };
  },
  highlight(ctx) {
    const cta = ctaOf(ctx.dom);
    return [cta?.selector ?? '.btn'];
  },
});
