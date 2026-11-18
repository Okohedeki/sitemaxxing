import type { PassContext, PatchFile, SnapNode, SnapshotDOM } from '@sitemaxxing/core';
import { jsxEdit } from '@sitemaxxing/core';
import type { SourceFile } from 'ts-morph';

export const px = (v: string | undefined): number => parseFloat(v ?? '') || 0;

export function selFor(n: SnapNode | undefined, fallback = 'body'): string {
  if (!n) return fallback;
  if (n.id) return `#${n.id}`;
  const cls = n.classes.find((c) => !c.startsWith('sm-') && !c.startsWith('is-'));
  if (cls) return `.${cls}`;
  return n.selector || n.tag || fallback;
}

export function navOf(dom: SnapshotDOM): SnapNode | undefined {
  return dom.first('header') ?? dom.first('nav') ?? dom.query('.nav')[0];
}

export function h1Of(dom: SnapshotDOM): SnapNode | undefined {
  return dom.first('h1');
}

/** The section-level ancestor of the h1. */
export function heroOf(dom: SnapshotDOM): SnapNode | undefined {
  let n = h1Of(dom);
  if (!n) return dom.first('section') ?? dom.first('main');
  let best: SnapNode | undefined;
  while (n) {
    if (['section', 'main', 'article'].includes(n.tag) || n.classes.some((c) => /hero/i.test(c))) {
      best = n;
      break;
    }
    n = dom.parentOf(n);
  }
  if (best) return best;
  n = h1Of(dom);
  while (n && n.box.w < dom.viewport.width * 0.7) n = dom.parentOf(n);
  return n;
}

/** The copy column: the h1's parent block. */
export function copyColumnOf(dom: SnapshotDOM): SnapNode | undefined {
  const h1 = h1Of(dom);
  if (!h1) return undefined;
  let n = dom.parentOf(h1);
  while (n && dom.childrenOf(n).length < 2 && dom.parentOf(n)) n = dom.parentOf(n);
  return n;
}

export function isButtonLike(n: SnapNode): boolean {
  if (n.tag === 'button') return true;
  if (n.tag !== 'a' && n.attrs.role !== 'button') return false;
  const bg = n.styles.backgroundColor ?? '';
  const img = n.styles.backgroundImage ?? 'none';
  const border = px(n.styles.borderTopWidth);
  const padded = px(n.styles.paddingLeft) >= 10;
  return padded && ((bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || img !== 'none' || border > 0);
}

export function buttonsIn(dom: SnapshotDOM, root: SnapNode | undefined): SnapNode[] {
  if (!root) return [];
  const out: SnapNode[] = [];
  const walk = (n: SnapNode) => {
    if (isButtonLike(n)) out.push(n);
    for (const c of dom.childrenOf(n)) walk(c);
  };
  walk(root);
  return out;
}

export function descendants(dom: SnapshotDOM, root: SnapNode | undefined): SnapNode[] {
  if (!root) return [];
  const out: SnapNode[] = [];
  const walk = (n: SnapNode) => {
    for (const c of dom.childrenOf(n)) {
      out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

export function ctaOf(dom: SnapshotDOM): SnapNode | undefined {
  const col = copyColumnOf(dom) ?? heroOf(dom);
  const btns = buttonsIn(dom, col);
  return btns[0] ?? buttonsIn(dom, heroOf(dom))[0];
}

export function navLinks(dom: SnapshotDOM): SnapNode[] {
  const nav = navOf(dom);
  if (!nav) return [];
  const lis = descendants(dom, nav).filter((n) => n.tag === 'li');
  if (lis.length) return lis;
  return descendants(dom, nav).filter((n) => n.tag === 'a' && !isButtonLike(n) && n.text.length < 30 && !n.classes.some((c) => /logo|brand/i.test(c)));
}

export function cleanText(t: string): string {
  return t.replace(/[→←↑↓▸▾▶]/g, '').replace(/\s+/g, ' ').trim();
}

export interface Sources {
  app: string;
  styles: string;
  tokens: string;
  fonts: string;
}

export function readSources(ctx: PassContext): Sources {
  const s = ctx.config.sources;
  const read = (p: string) => (ctx.files.exists(p) ? ctx.files.read(p) : '');
  return { app: read(s.app), styles: read(s.styles), tokens: read(s.tokens), fonts: read(s.fonts) };
}

export function filePatch(ctx: PassContext, path: string, before: string, after: string): PatchFile {
  return { path, before, after };
}

export function changed(files: PatchFile[]): PatchFile[] {
  return files.filter((f) => f.before !== f.after);
}

/** Finds the JSX element matching a snapshot node by its classes (or tag + id). */
export function jsxFor(file: SourceFile, n: SnapNode | undefined) {
  if (!n) return undefined;
  if (n.id) {
    const byId = jsxEdit.find(file, (el) => jsxEdit.attr(el, 'id') === n.id);
    if (byId) return byId;
  }
  for (const c of n.classes) {
    if (c.startsWith('sm-') || c.startsWith('is-')) continue;
    const el = jsxEdit.find(file, (e) => jsxEdit.hasClass(e, c) && jsxEdit.tagName(e).toLowerCase() === n.tag);
    if (el) return el;
  }
  for (const c of n.classes) {
    const el = jsxEdit.byClass(file, c);
    if (el) return el;
  }
  return undefined;
}

export function wordCount(t: string): number {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

export function literalLinks(nodes: SnapNode[], dom: SnapshotDOM): Array<{ label: string; href: string }> {
  return nodes
    .map((n) => {
      const a = n.tag === 'a' ? n : descendants(dom, n).find((d) => d.tag === 'a');
      return { label: cleanText(n.text.split('\n')[0]).slice(0, 40), href: a?.attrs.href ?? '#' };
    })
    .filter((l) => l.label);
}

export function toJsxArray(links: Array<{ label: string; href: string; blurb?: string }>): string {
  return '[' + links.map((l) => `{ label: ${JSON.stringify(l.label)}, href: ${JSON.stringify(l.href)}${l.blurb ? `, blurb: ${JSON.stringify(l.blurb)}` : ''} }`).join(', ') + ']';
}

/** Relative import path from the app file to the component dir. */
export function importPath(ctx: PassContext, componentDir: string, name: string): string {
  const appDir = ctx.config.sources.app.split('/').slice(0, -1).join('/');
  const rel = componentDir.startsWith(appDir + '/') ? './' + componentDir.slice(appDir.length + 1) : '../' + componentDir;
  return `${rel}/${name}`;
}

export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const lum = (c: [number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const a = lum(fg) + 0.05;
  const b = lum(bg) + 0.05;
  return a > b ? a / b : b / a;
}
