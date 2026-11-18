import { definePass, jsxEdit, jsonEdit, type Finding, type PatchFile } from '@sitemaxxing/core';
import { EMOJI_RE } from '@sitemaxxing/rules';
import { buttonsIn, copyColumnOf, descendants, fullText, h1Of, heroOf, jsxFor, navLinks, navOf, px, readSources, selFor } from './shared';

const LOGIN_RE = /^(log ?in|sign ?in|login|account)$/i;
const TRUST_RE = /(trusted by|rating|award|countries|customers|users|★|✓|\d[\d,]+\+)/i;

export const declutter = definePass({
  id: 'declutter',
  name: 'Declutter',
  kind: 'refine',
  order: 1,
  points: 8,
  ruleCards: ['tuch-2012', 'laws-of-ux-hicks', 'refactoring-ui-hierarchy'],
  description: 'One primary action per view: cut extra nav links, the sign-in button, the second CTA and the trust row',
  async detect(ctx) {
    const { dom } = ctx;
    const findings: Finding[] = [];
    const links = navLinks(dom);
    if (links.length > 5) findings.push({ message: `${links.length} navigation links (cap is 3 to 4)`, selector: selFor(navOf(dom)), severity: 'warn' });
    const navBtns = buttonsIn(dom, navOf(dom));
    const login = navBtns.find((b) => LOGIN_RE.test(b.text.trim()));
    if (login) findings.push({ message: 'Sign in sits next to the primary action', selector: login.selector });
    const col = copyColumnOf(dom);
    const ctas = buttonsIn(dom, col);
    if (ctas.length >= 2) findings.push({ message: `${ctas.length} equal-weight calls to action in the hero`, selector: ctas[1].selector, severity: 'warn' });
    const h1 = h1Of(dom);
    const pill = col && h1 ? dom.childrenOf(col).find((n) => n.box.y < h1.box.y && n.box.h < 48 && (px(n.styles.borderRadius) >= 20 || n.styles.textTransform === 'uppercase' || EMOJI_RE.test(n.text))) : undefined;
    if (pill) findings.push({ message: `eyebrow pill above the headline: "${pill.text.slice(0, 40)}"`, selector: pill.selector });
    const trust = col ? dom.childrenOf(col).find((n) => n.box.y > (ctas[0]?.box.y ?? 0) && TRUST_RE.test(fullText(dom, n)) && fullText(dom, n).length < 120) : undefined;
    if (trust) findings.push({ message: `trust or badge row: "${fullText(dom, trust).slice(0, 50)}"`, selector: trust.selector });
    const emojiIcons = descendants(dom, heroOf(dom)).filter((n) => n.text.length <= 4 && EMOJI_RE.test(n.text) && n.tag !== 'h1');
    if (emojiIcons.length >= 2) findings.push({ message: `${emojiIcons.length} emoji used as icons` });
    const applies = findings.some((f) => f.severity === 'warn') || findings.length >= 2;
    return { applies, findings, reason: applies ? undefined : 'already one action per view' };
  },
  async propose(ctx) {
    const { dom } = ctx;
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    const removed: string[] = [];
    const { file } = jsxEdit.parseTsx(src.app);
    const col = copyColumnOf(dom);
    const h1 = h1Of(dom);
    const toRemove: ReturnType<typeof jsxFor>[] = [];

    // Sign in next to the primary action
    for (const b of buttonsIn(dom, navOf(dom)).filter((x) => LOGIN_RE.test(x.text.trim()))) {
      const el = jsxEdit.find(file, (e) => jsxEdit.hasClass(e, 'ghost') && (jsxEdit.textOf(e).includes(b.text.trim()) || /login|signin|sign-in/i.test(e.getText())));
      if (el) {
        toRemove.push(el);
        removed.push(b.text.trim());
      }
    }
    // Second call to action
    const ctas = buttonsIn(dom, col);
    for (const b of ctas.slice(1)) {
      const el = jsxEdit.find(file, (e) => jsxEdit.hasClass(e, 'ghost') && jsxEdit.tagName(e) === 'a' && (jsxEdit.textOf(e).includes(b.text.trim()) || /secondary/i.test(e.getText())));
      if (el) {
        toRemove.push(el);
        removed.push(b.text.trim().replace(/\s*[▶→]\s*$/, ''));
      }
    }
    // Trust / badge row
    const trust = col ? dom.childrenOf(col).find((n) => n.box.y > (ctas[0]?.box.y ?? 0) && TRUST_RE.test(fullText(dom, n)) && fullText(dom, n).length < 120) : undefined;
    const trustEl = jsxFor(file, trust);
    if (trustEl) {
      toRemove.push(trustEl);
      removed.push('trust row');
    }
    // Decorative all-caps eyebrow pill
    const pill = col && h1 ? dom.childrenOf(col).find((n) => n.box.y < h1.box.y && n.box.h < 48 && (px(n.styles.borderRadius) >= 20 || n.styles.textTransform === 'uppercase')) : undefined;
    if (pill && (pill.styles.textTransform === 'uppercase' || pill.text === pill.text.toUpperCase())) {
      const el = jsxFor(file, pill);
      if (el) {
        toRemove.push(el);
        removed.push('eyebrow pill');
      }
    }
    // A second solid button in the nav competes with the hero action: demote it to a ghost.
    if (ctas.length) {
      const solidNav = buttonsIn(dom, navOf(dom)).find((x) => !LOGIN_RE.test(x.text.trim()) && (x.styles.backgroundColor ?? '') !== 'rgba(0, 0, 0, 0)');
      const el = solidNav ? jsxEdit.find(file, (e) => jsxEdit.hasClass(e, 'btn') && !jsxEdit.hasClass(e, 'ghost') && !toRemove.includes(e) && (jsxEdit.textOf(e).includes(solidNav.text.trim()) || /navCta|nav-cta/.test(e.getText()))) : undefined;
      if (el) {
        jsxEdit.addClass(el, 'ghost');
        removed.push(`demoted "${solidNav!.text.trim()}" to a quiet button`);
      }
    }
    jsxEdit.removeElements(toRemove.filter(Boolean) as any[]);
    const app = jsxEdit.tidy(file.getFullText());
    files.push({ path: ctx.config.sources.app, before: src.app, after: app });

    // Navigation cap
    const links = navLinks(dom);
    if (links.length > 4) {
      const keep = links.length > 5 ? 3 : 4;
      const nav = navOf(dom);
      const ul = jsxFor(file, descendants(dom, nav).find((n) => n.tag === 'ul'));
      const literalLis = ul ? jsxEdit.findAll(file, (e) => jsxEdit.tagName(e) === 'li' && ul.containsRange(e.getStart(), e.getEnd())) : [];
      if (literalLis.length > keep) {
        jsxEdit.removeElements(literalLis.slice(keep));
        files[0].after = jsxEdit.tidy(file.getFullText());
        removed.push(`${links.length - keep} nav links`);
      } else if (ctx.content && Array.isArray((ctx.content.data as any).nav) && (ctx.content.data as any).nav.length > keep) {
        const before = ctx.files.read(ctx.content.path);
        const after = jsonEdit.setJsonValues(before, { nav: (ctx.content.data as any).nav.slice(0, keep) });
        files.push({ path: ctx.content.path, before, after });
        removed.push(`${links.length - keep} nav links`);
      }
    }
    return { summary: `Cut ${removed.join(', ') || 'nothing'}`, files: files.filter((f) => f.before !== f.after) };
  },
  highlight(ctx) {
    return [selFor(navOf(ctx.dom), 'header'), selFor(copyColumnOf(ctx.dom), 'h1')];
  },
});
