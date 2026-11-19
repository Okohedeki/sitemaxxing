import { definePass, cssEdit, jsxEdit, rngFor, type Finding, type PassContext, type PatchFile, type Variant } from '@sitemaxxing/core';
import { COMPONENT_DIR, selectComponents, componentIdOf, NAV_DRAWER_CSS, NAV_DRAWER_TSX, NAV_TILES_CSS, NAV_TILES_TSX, NAV_TYPES_TSX, REVEAL_NAV_CSS, REVEAL_NAV_TSX } from '@sitemaxxing/components';
import { descendants, importPath, jsxFor, literalLinks, navLinks, navOf, readSources, selFor, toJsxArray } from './shared';

const DROPDOWN_RE = /className=["'][^"']*\b(dd|dropdown|has-dd|submenu|menu-list)\b/;

function hasDropdown(app: string): boolean {
  return DROPDOWN_RE.test(app);
}

const VARIANTS: Array<{ id: string; label: string; attributes: Record<string, string> }> = [
  { id: 'tiles', label: 'Preview tiles', attributes: { shape: 'dropdown', motion: 'none' } },
  { id: 'fullscreen-circle', label: 'Fullscreen · circle', attributes: { shape: 'fullscreen', motion: 'circle' } },
  { id: 'fullscreen-curtain', label: 'Fullscreen · curtain', attributes: { shape: 'fullscreen', motion: 'curtain' } },
  { id: 'fullscreen-split', label: 'Fullscreen · split', attributes: { shape: 'fullscreen', motion: 'split' } },
  { id: 'drawer', label: 'Side drawer', attributes: { shape: 'drawer', motion: 'slide' } },
];

function navPicks(ctx: PassContext, app: string) {
  return selectComponents('nav', { mood: ctx.mood, goal: ctx.brief.goal, noise: ctx.brief.noise, rng: rngFor(ctx, 'nav-dropdown'), filter: (c) => c.id !== 'tiles' || hasDropdown(app) });
}

export const navDropdown = definePass({
  id: 'nav-dropdown',
  name: 'Navigation',
  kind: 'refine',
  order: 8,
  serves: ['clarity', 'polish'],
  ruleCards: ['rauno-interaction', 'laws-of-ux-jakob', 'laws-of-ux-hicks'],
  description: 'Replace the plain dropdown or overloaded nav: preview tiles, a fullscreen reveal, or a side drawer',
  forceState: { selector: '.reveal-nav, .nav-drawer, .nav-tiles', state: 'open' },
  async detect(ctx) {
    const findings: Finding[] = [];
    const src = readSources(ctx);
    if (hasDropdown(src.app)) findings.push({ message: 'plain text dropdown list', selector: selFor(navOf(ctx.dom), 'nav'), severity: 'warn' });
    const links = navLinks(ctx.dom);
    if (links.length > 4) findings.push({ message: `${links.length} top-level links plus buttons`, severity: 'warn' });
    if (/RevealNav|NavDrawer|NavTiles/.test(src.app)) return { applies: false, findings, reason: 'already uses a Sitemaxxing navigation' };
    const applies = findings.some((f) => f.severity === 'warn');
    return { applies, findings, reason: applies ? undefined : 'navigation already simple' };
  },
  async variants(ctx) {
    const src = readSources(ctx);
    return navPicks(ctx, src.app).map((p): Variant => ({ id: p.id, label: p.label, thumbnail: p.spec.thumb, attributes: { ...p.attributes, ...(VARIANTS.find((v) => v.id === p.spec.id)?.attributes ?? {}) }, source: 'library' }));
  },
  async propose(ctx, chosen) {
    const variantId = componentIdOf(chosen) ?? componentIdOf(navPicks(ctx, readSources(ctx).app)[0]?.id) ?? 'drawer';
    const src = readSources(ctx);
    const files: PatchFile[] = [];
    const { file } = jsxEdit.parseTsx(src.app);
    const nav = navOf(ctx.dom);
    const dom = ctx.dom;
    const addFile = (name: string, content: string) => files.push({ path: `${COMPONENT_DIR}/${name}`, before: ctx.files.exists(`${COMPONENT_DIR}/${name}`) ? ctx.files.read(`${COMPONENT_DIR}/${name}`) : '', after: content });
    addFile('nav-types.ts', NAV_TYPES_TSX + '\n');
    let css = src.styles;
    let summary = '';

    if (variantId === 'tiles') {
      addFile('NavTiles.tsx', NAV_TILES_TSX);
      css = cssEdit.appendCss(css, NAV_TILES_CSS, 'sitemaxxing: nav tiles');
      const li = jsxEdit.find(file, (e) => jsxEdit.tagName(e) === 'li' && DROPDOWN_RE.test(e.getText()));
      if (!li) throw new Error('no dropdown element found in the app file');
      const text = li.getText();
      const label = (text.match(/>\s*([A-Za-z][A-Za-z ]+?)\s*[▾▼]?\s*\n?\s*</)?.[1] ?? text.match(/\{item\.label\}/) ? 'Destinations' : 'Menu').trim();
      const arr = text.match(/content\.(\w+)\.map/);
      const items = arr ? `content.${arr[1]}` : toJsxArray(literalLinks(descendants(dom, nav).filter((n) => n.tag === 'a' && n.box.h === 0), dom));
      li.replaceWithText(`<NavTiles label=${JSON.stringify(label)} items={${items}} />`);
      jsxEdit.addImport(file, 'NavTiles', importPath(ctx, COMPONENT_DIR, 'NavTiles'));
      summary = 'Plain dropdown → preview tiles with art and a one-line blurb per destination';
    } else {
      const ul = jsxFor(file, descendants(dom, nav).find((n) => n.tag === 'ul')) ?? jsxEdit.find(file, (e) => jsxEdit.tagName(e) === 'ul');
      if (!ul) throw new Error('no navigation list found in the app file');
      const mapped = ul.getText().match(/content\.(\w+)\.map/);
      const links = mapped ? `content.${mapped[1]}` : toJsxArray(literalLinks(navLinks(dom), dom));
      const actions = jsxEdit.find(file, (e) => jsxEdit.classes(e).some((c) => /nav-actions|actions|nav-btns|navbtns/.test(c)));
      if (variantId === 'drawer') {
        addFile('NavDrawer.tsx', NAV_DRAWER_TSX);
        css = cssEdit.appendCss(css, NAV_DRAWER_CSS, 'sitemaxxing: nav drawer');
        ul.replaceWithText(`<NavDrawer links={${links}} />`);
        jsxEdit.addImport(file, 'NavDrawer', importPath(ctx, COMPONENT_DIR, 'NavDrawer'));
        summary = 'Links and buttons → one menu button that slides in a drawer';
      } else {
        const animation = variantId.split('-')[1] ?? 'circle';
        addFile('RevealNav.tsx', REVEAL_NAV_TSX);
        css = cssEdit.appendCss(css, REVEAL_NAV_CSS, 'sitemaxxing: reveal nav');
        const brand = (ctx.content?.data as any)?.brand;
        const aside = brand ? ` aside={<div>{content.brand}</div>}` : '';
        ul.replaceWithText(`<RevealNav links={${links}} animation="${animation}"${aside} />`);
        jsxEdit.addImport(file, 'RevealNav', importPath(ctx, COMPONENT_DIR, 'RevealNav'));
        summary = `Links and buttons → one menu that reveals the site (${animation})`;
      }
      if (actions) jsxEdit.removeElement(actions);
    }
    files.push({ path: ctx.config.sources.app, before: src.app, after: jsxEdit.tidy(file.getFullText()) });
    files.push({ path: ctx.config.sources.styles, before: src.styles, after: css });
    return { summary, files: files.filter((f) => f.before !== f.after) };
  },
  highlight(ctx, chosen) {
    const variantId = componentIdOf(chosen);
    if (variantId === 'tiles') return ['.nav-tiles'];
    if (variantId === 'drawer') return ['.nav-drawer'];
    return ['.reveal-nav'].concat(selFor(navOf(ctx.dom), 'nav'));
  },
});
