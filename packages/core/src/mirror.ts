/* Mirror: reads a rendered page as it is (its own elements, class names, stylesheets and fonts)
   and writes that as JSX and CSS. Scripts are left behind, so anything a script was drawing is
   kept as the frame it showed when the page was read. */

import postcss from 'postcss';
import type { Page } from 'playwright';

/** Text, text that must keep its white space, or an element. */
export type MirrorNode =
  | string
  | { x: string }
  | {
      t: string;
      a: Record<string, string>;
      s?: Array<[string, string]>;
      c?: MirrorNode[];
      /** Inner markup of an inline SVG, kept as written. */
      h?: string;
    };

export interface MirrorSheet {
  text?: string;
  href?: string;
  media?: string;
  /** What relative addresses inside the text are relative to. */
  base?: string;
}

export interface Mirror {
  html: Record<string, string>;
  body: Record<string, string>;
  bodyStyle: Array<[string, string]>;
  htmlStyle: Array<[string, string]>;
  tree: MirrorNode[];
  sheets: MirrorSheet[];
  /** Font files the page actually downloaded. */
  fontUrls: string[];
  nodes: number;
}

/**
 * Runs in the page before it is scrolled through. Pages often show a section by adding a class or
 * a style to it as it scrolls into view; this remembers how each element looked while on screen.
 */
export const WATCH_JS = String.raw`(() => {
  if (window.__smSeen) return;
  const seen = window.__smSeen = new Map();
  const note = (m) => {
    const el = m.target;
    if (!el || el.nodeType !== 1) return;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= innerHeight || r.width < 1) return;
    const was = seen.get(el);
    // "before" is how the element looked before any script touched it on screen.
    const before = was ? was.before : (m.attributeName === 'class' ? m.oldValue || '' : el.getAttribute('class') || '');
    seen.set(el, { before, cls: el.getAttribute('class') || '', style: el.getAttribute('style') });
  };
  new MutationObserver((ms) => { for (const m of ms) note(m); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true, subtree: true });
})()`;

/** Marks, on the mirrored element, the classes to add when it scrolls into view. */
export const INVIEW_ATTR = 'data-sm-inview';

/** Runs in the page. Plain JavaScript in a string so bundlers cannot inject helpers into it. */
const MIRROR_JS = String.raw`(() => {
  const abs = (u, base) => { try { return new URL(u, base || location.href).href; } catch (e) { return u; } };
  const fixUrls = (text, base) => text.replace(/url\(\s*(["']?)(?!data:|#|blob:|about:)([^"')]+)\1\s*\)/g, (m, q, u) => 'url("' + abs(u.trim(), base) + '")');
  const SKIP = new Set(['SCRIPT', 'NOSCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'BASE', 'TITLE', 'HEAD', 'OBJECT', 'EMBED', 'NEXT-ROUTE-ANNOUNCER', 'VITE-ERROR-OVERLAY']);
  const decls = (text) => {
    const out = []; let depth = 0, quote = '', cur = '';
    for (const ch of text || '') {
      if (quote) { if (ch === quote) quote = ''; cur += ch; continue; }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === '(') depth++; if (ch === ')') depth--;
      if (ch === ';' && depth <= 0) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((d) => { const i = d.indexOf(':'); return i < 0 ? null : [d.slice(0, i).trim(), fixUrls(d.slice(i + 1).replace(/!important/i, '').trim())]; }).filter((d) => d && d[0] && d[1]);
  };
  const attrsOf = (el, keepCase) => {
    const o = {};
    for (const a of Array.from(el.attributes)) {
      const n = keepCase ? a.name : a.name.toLowerCase();
      if (/^on/i.test(n) || n === 'style' || n === 'srcset' || n === 'sizes' || n === 'integrity' || n === 'nonce' || n === 'srcdoc') continue;
      if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(n)) continue;
      o[n] = a.value;
    }
    return o;
  };
  let nodes = 0;
  const seen = window.__smSeen || new Map();
  // What the page's scripts did to an element while it was on screen, if that has since been undone.
  const pinned = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const onScreen = (el, a) => {
    const was = seen.get(el);
    // A bar that stays on screen changes with the scroll position, not on entering the screen.
    if (!was || pinned(el)) return null;
    const before = new Set(was.before.split(/\s+/));
    const added = was.cls.split(/\s+/).filter((c) => c && !before.has(c));
    if (added.length) {
      a['data-sm-inview'] = added.join(' ');
      const rest = (el.getAttribute('class') || '').split(/\s+/).filter((c) => c && added.indexOf(c) < 0).join(' ');
      if (rest) a.class = rest; else delete a.class;
    }
    return was.style !== el.getAttribute('style') ? was.style : null;
  };
  const walk = (node, pre) => {
    const out = [];
    for (const ch of Array.from(node.childNodes)) {
      if (ch.nodeType === 3) { const t = ch.nodeValue || ''; if (t) out.push(pre ? { x: t } : t); continue; }
      if (ch.nodeType !== 1) continue;
      const tag = ch.tagName.toUpperCase();
      if (SKIP.has(tag)) continue;
      const id = ch.id || '';
      if (id.indexOf('sm-') === 0 || (typeof ch.className === 'string' && /(^|\s)sm-(ring|tag|pill)/.test(ch.className))) continue;
      if (nodes++ > 12000) break;
      const cs = getComputedStyle(ch);
      if (ch.namespaceURI === 'http://www.w3.org/2000/svg') {
        if (tag !== 'SVG') continue;
        out.push({ t: 'svg', a: Object.assign(attrsOf(ch, true), { 'data-sm': 'e' + nodes }), s: decls(ch.getAttribute('style')), h: ch.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, '') });
        continue;
      }
      const a = attrsOf(ch, false);
      // A name of its own, so a change can be aimed at exactly this element.
      a['data-sm'] = 'e' + nodes;
      const shown = onScreen(ch, a);
      const s = decls(shown !== null ? shown : ch.getAttribute('style'));
      let t = ch.tagName.toLowerCase();
      if (tag === 'IMG') {
        const src = ch.currentSrc || ch.src || ch.getAttribute('data-src') || '';
        a.src = src.indexOf('data:') === 0 ? (src.length < 200000 ? src : '') : abs(src);
      } else if (tag === 'A') {
        const h = ch.getAttribute('href') || '';
        if (h && h[0] !== '#') { a.href = /^(mailto|tel):/i.test(h) ? h : abs(h); a.target = '_blank'; a.rel = 'noreferrer'; }
      } else if (tag === 'VIDEO' || tag === 'AUDIO' || tag === 'SOURCE' || tag === 'TRACK') {
        if (a.src) a.src = abs(a.src);
        if (tag === 'VIDEO' && !a.src && ch.currentSrc && ch.currentSrc.indexOf('blob:') !== 0) a.src = ch.currentSrc;
        if (a.poster) a.poster = abs(a.poster);
      } else if (tag === 'FORM') {
        delete a.action; delete a.method;
      } else if (tag === 'IFRAME' || tag === 'CANVAS') {
        // Nothing can draw into these once the scripts are gone; keep the space, and the picture if it can be read.
        const r = ch.getBoundingClientRect();
        let shot = '';
        if (tag === 'CANVAS') { try { shot = ch.toDataURL('image/png'); if (shot.length > 600000) shot = ''; } catch (e) { shot = ''; } }
        const keep = {}; if (a.class) keep.class = a.class; if (a.id) keep.id = a.id;
        if (shot) { keep.src = shot; keep.alt = ''; t = 'img'; }
        else { t = 'div'; s.push(['width', Math.round(r.width) + 'px'], ['height', Math.round(r.height) + 'px']); }
        out.push({ t, a: keep, s });
        continue;
      }
      const keepSpace = pre || tag === 'PRE' || tag === 'TEXTAREA' || /^(pre|break-spaces)/.test(cs.whiteSpace);
      out.push({ t, a, s, c: walk(ch, keepSpace) });
    }
    return out;
  };

  const sheets = [];
  // A sheet's own text is kept wherever it can be had: the browser's serialised rules drop
  // shorthands that hold variables. Rules are only read back for styles a script inserted.
  const read = (sheet, media) => {
    if (sheet.href) { sheets.push({ href: sheet.href, media }); return; }
    const node = sheet.ownerNode;
    const text = node && node.textContent ? node.textContent.trim() : '';
    if (text) { sheets.push({ text: fixUrls(text, location.href), media, base: location.href }); return; }
    let rules;
    try { rules = sheet.cssRules; } catch (e) { return; }
    let buf = '';
    for (const r of Array.from(rules)) buf += fixUrls(r.cssText, location.href) + '\n';
    if (buf) sheets.push({ text: buf, media, base: location.href });
  };
  const own = (s) => { const n = s.ownerNode; return n && n.nodeType === 1 && ((n.id || '').indexOf('sm-') === 0 || n.hasAttribute('data-sitemaxxing-overlay')); };
  for (const s of Array.from(document.styleSheets).concat(Array.from(document.adoptedStyleSheets || []))) {
    const media = (s.media && s.media.mediaText) || '';
    if (s.disabled || media === 'print' || own(s)) continue;
    read(s, media);
  }
  const fontUrls = Array.from(new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.(woff2?|ttf|otf)(\?|#|$)/i.test(n))));
  return {
    html: attrsOf(document.documentElement, false),
    body: attrsOf(document.body, false),
    htmlStyle: decls(document.documentElement.getAttribute('style')),
    bodyStyle: decls(document.body.getAttribute('style')),
    tree: walk(document.body, false),
    sheets, fontUrls, nodes,
  };
})()`;

/** Reads the open page. Call after the page has loaded and been scrolled through. */
export async function mirrorPage(page: Page): Promise<Mirror> {
  return (await page.evaluate(MIRROR_JS)) as Mirror;
}

// ---------- JSX ----------

const ATTR: Record<string, string | null> = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  autocomplete: 'autoComplete',
  autocapitalize: 'autoCapitalize',
  autocorrect: null,
  autofocus: null,
  crossorigin: 'crossOrigin',
  playsinline: 'playsInline',
  disablepictureinpicture: 'disablePictureInPicture',
  disableremoteplayback: 'disableRemotePlayback',
  autoplay: 'autoPlay',
  allowfullscreen: 'allowFullScreen',
  enctype: 'encType',
  novalidate: 'noValidate',
  datetime: 'dateTime',
  spellcheck: 'spellCheck',
  contenteditable: null,
  checked: 'defaultChecked',
  value: 'defaultValue',
  selected: null,
  inputmode: 'inputMode',
  fetchpriority: 'fetchPriority',
  referrerpolicy: 'referrerPolicy',
  enterkeyhint: 'enterKeyHint',
  frameborder: null,
  cellpadding: null,
  cellspacing: null,
  usemap: 'useMap',
  srclang: 'srcLang',
  formaction: null,
  popovertarget: null,
  ref: null,
  key: null,
  children: null,
  dangerouslysetinnerhtml: null,
};
const BOOL = new Set([
  'disabled',
  'hidden',
  'muted',
  'loop',
  'autoPlay',
  'playsInline',
  'controls',
  'open',
  'required',
  'multiple',
  'readOnly',
  'defaultChecked',
  'allowFullScreen',
  'noValidate',
  'inert',
]);
const VOID = new Set([
  'area',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'source',
  'track',
  'wbr',
]);
/** `value` only means a form value on these; elsewhere (li, button, data) it stays as written. */
const FORM_VALUE = new Set(['input', 'textarea', 'select']);

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function styleProp(p: string): string {
  if (p.startsWith('--')) return JSON.stringify(p);
  const c = camel(
    p
      .replace(/^-ms-/, 'ms-')
      .replace(/^-(webkit|moz|o)-/, (_, v: string) => v[0].toUpperCase() + v.slice(1) + '-'),
  );
  return /^[A-Za-z_$][\w$]*$/.test(c) ? c : JSON.stringify(c);
}

function styleAttr(s: Array<[string, string]> | undefined): string {
  if (!s?.length) return '';
  // Later declarations win, as they do in a style attribute.
  const seen = new Map<string, string>();
  for (const [p, v] of s) seen.set(styleProp(p), v);
  return ` style={{ ${[...seen].map(([p, v]) => `${p}: ${JSON.stringify(v)}`).join(', ')} }}`;
}

function attrText(tag: string, a: Record<string, string>, svg: boolean): string {
  let out = '';
  for (const [raw, value] of Object.entries(a)) {
    let name: string | null = raw;
    if (svg) {
      if (raw.includes(':') || raw === 'xmlns') continue;
      name = raw === 'class' ? 'className' : /^(data|aria)-/.test(raw) ? raw : camel(raw);
      if (raw === 'style') continue;
    } else if (raw in ATTR) {
      name = raw === 'value' && !FORM_VALUE.has(tag) ? raw : ATTR[raw];
    }
    if (!name) continue;
    if (BOOL.has(name) && (value === '' || value === raw || value === 'true')) out += ` ${name}`;
    else out += ` ${name}="${value}"`;
  }
  return out;
}

/** JSX attribute strings cannot hold a backslash escape or a line break; those go in braces. */
function safeAttrs(tag: string, a: Record<string, string>, svg: boolean): string {
  let out = '';
  for (const [k, v] of Object.entries(a)) {
    if (/[\\\n\r"{}<>]/.test(v)) {
      const one = attrText(tag, { [k]: 'x' }, svg);
      const name = one.trim().split('=')[0];
      if (name) out += ` ${name}={${JSON.stringify(v)}}`;
    } else out += attrText(tag, { [k]: v }, svg);
  }
  return out;
}

const PLAIN = /^[^{}<>&\\]+$/;

function textJsx(raw: string, pad: string): string[] {
  if (!raw.trim()) return [`${pad}{' '}`];
  const lines: string[] = [];
  if (/^\s/.test(raw)) lines.push(`${pad}{' '}`);
  const core = raw.replace(/\s+/g, ' ').trim();
  lines.push(pad + (PLAIN.test(core) ? core : `{${JSON.stringify(core)}}`));
  if (/\s$/.test(raw)) lines.push(`${pad}{' '}`);
  return lines;
}

export interface MirrorApp {
  app: string;
  /** Copy keys whose element is plain text, so the app reads them from the copy file. */
  copy: Record<string, string>;
}

/** The app file: the page's own elements, with marked copy read from the copy file. */
export function mirrorApp(m: Mirror, copyKeys: string[] = []): MirrorApp {
  const copy: Record<string, string> = {};
  const lines: string[] = [];
  const emit = (n: MirrorNode, depth: number) => {
    const pad = '  '.repeat(depth);
    if (typeof n === 'string') return void lines.push(...textJsx(n, pad));
    if ('x' in n) return void lines.push(`${pad}{${JSON.stringify(n.x)}}`);
    const tag = /^[a-z][a-z0-9-]*$/.test(n.t) ? n.t : 'div';
    const svg = tag === 'svg';
    const open = `${pad}<${tag}${safeAttrs(tag, n.a, svg)}${styleAttr(n.s)}`;
    if (svg)
      return void lines.push(
        `${open} dangerouslySetInnerHTML={{ __html: ${JSON.stringify(n.h ?? '')} }} />`,
      );
    const kids = n.c ?? [];
    if (VOID.has(tag)) return void lines.push(`${open} />`);
    const key = n.a['data-copy'];
    if (
      key &&
      copyKeys.includes(key) &&
      !(key in copy) &&
      kids.length === 1 &&
      typeof kids[0] === 'string' &&
      kids[0].trim()
    ) {
      copy[key] = kids[0].replace(/\s+/g, ' ').trim();
      lines.push(`${open}>`, `${pad}  {content.${key}}`, `${pad}</${tag}>`);
      return;
    }
    if (!kids.length) return void lines.push(`${open} />`);
    lines.push(`${open}>`);
    for (const k of kids) emit(k, depth + 1);
    lines.push(`${pad}</${tag}>`);
  };
  for (const n of m.tree) emit(n, 3);
  const app = [
    `import content from './content.json';`,
    '',
    '// The page as it was read: its own elements and class names. Scripts were left behind.',
    'export default function App() {',
    '  void content;',
    '  return (',
    '    <>',
    ...lines,
    '    </>',
    '  );',
    '}',
    '',
  ].join('\n');
  return { app, copy };
}

// ---------- CSS ----------

export interface Tokens {
  bg: string;
  ink: string;
  soft: string;
  acc: string;
  display: string;
  body: string;
}

const COLOR_PROPS =
  /^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?-color|fill|stroke|outline-color|text-decoration-color|caret-color|accent-color)$/;
const COLOR_VALUE = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\))$/i;
const TOKEN_NAMES = ['bg', 'ink', 'soft', 'acc', 'display', 'body'] as const;
const fam = (s: string) =>
  s
    .replace(/["']/g, '')
    .replace(/\s*,\s*/g, ',')
    .trim()
    .toLowerCase();

/**
 * One stylesheet from everything the page loaded. Where a rule uses the page's main colours or
 * fonts as plain values, they are swapped for the tokens, so later changes to a token show.
 * A token the page already defines for itself is left alone.
 */
export async function mirrorCss(
  parts: string[],
  tokens: Tokens,
  toHex: (values: string[]) => Promise<Array<string | null>>,
): Promise<string> {
  const roots = parts.map((text) => {
    try {
      return postcss.parse(text);
    } catch {
      return null;
    }
  });
  const taken = new Set<string>();
  const candidates = new Set<string>();
  for (const root of roots)
    root?.walkDecls((d) => {
      if (d.prop.startsWith('--') && (TOKEN_NAMES as readonly string[]).includes(d.prop.slice(2)))
        taken.add(d.prop.slice(2));
      if ((COLOR_PROPS.test(d.prop) || d.prop.startsWith('--')) && COLOR_VALUE.test(d.value.trim()))
        candidates.add(d.value.trim());
    });
  const list = [...candidates];
  const hexes = list.length ? await toHex(list) : [];
  const hexOf = new Map(list.map((v, i) => [v, hexes[i]]));
  const free = (t: string) => !taken.has(t);
  const display = fam(tokens.display);
  const body = fam(tokens.body);
  for (const root of roots)
    root?.walkDecls((d) => {
      const value = d.value.trim();
      const custom = d.prop.startsWith('--');
      if (d.prop === 'font-family' || custom) {
        const f = fam(value);
        if (f && f === body && free('body')) return void (d.value = 'var(--body)');
        if (f && f === display && free('display')) return void (d.value = 'var(--display)');
      }
      const hex = hexOf.get(value);
      if (!hex) return;
      if (hex === tokens.acc && free('acc') && (custom || COLOR_PROPS.test(d.prop)))
        d.value = 'var(--acc)';
      else if (hex === tokens.bg && free('bg') && /^background(-color)?$/.test(d.prop))
        d.value = 'var(--bg)';
      else if (hex === tokens.ink && free('ink') && d.prop === 'color') d.value = 'var(--ink)';
      else if (hex === tokens.soft && free('soft') && d.prop === 'color') d.value = 'var(--soft)';
    });
  return roots.map((r, i) => (r ? r.toString() : parts[i])).join('\n');
}

/** A small script for the rebuilt project: adds the marked classes as elements scroll into view. */
export const INVIEW_SOURCE = `// The original page added these classes by script as each element scrolled into view.
const ATTR = '${INVIEW_ATTR}';
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add(...(e.target.getAttribute(ATTR) ?? '').split(' ').filter(Boolean));
      io.unobserve(e.target);
    }
  },
  { rootMargin: '0px 0px -6% 0px' },
);
const watch = () => document.querySelectorAll('[' + ATTR + ']').forEach((el) => io.observe(el));
new MutationObserver(watch).observe(document.documentElement, { childList: true, subtree: true });
watch();
export {};
`;
