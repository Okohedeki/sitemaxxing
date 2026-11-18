import type { Page } from 'playwright';
import type { SnapNode, SnapshotDOM } from './types';

const STYLE_KEYS = [
  'display',
  'position',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textTransform',
  'color',
  'backgroundColor',
  'backgroundImage',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginBottom',
  'gap',
  'rowGap',
  'columnGap',
  'borderRadius',
  'boxShadow',
  'borderTopWidth',
  'borderTopColor',
  'opacity',
  'animationName',
  'transitionProperty',
  'transitionDuration',
  'justifyContent',
  'alignItems',
  'flexDirection',
  'gridTemplateColumns',
  'overflow',
  'visibility',
  'maxWidth',
  'width',
];

interface RawSnapshot {
  nodes: Array<Omit<SnapNode, 'children'> & { children: number[] }>;
  bodyFontSize: number;
  fonts: string[];
  title: string;
  url: string;
  viewport: { width: number; height: number };
}

/**
 * Walks the rendered page and returns a compact tree of visible elements with the computed
 * styles passes care about. Runs in the page; keep it dependency free.
 */
export async function takeSnapshot(page: Page): Promise<SnapshotDOM> {
  const raw: RawSnapshot = await page.evaluate(
    ({ keys }) => {
      const nodes: any[] = [];
      const fonts = new Set<string>();
      const cssPath = (el: Element): string => {
        if (el.id && !/\d{5,}/.test(el.id)) return `#${CSS.escape(el.id)}`;
        const parts: string[] = [];
        let cur: Element | null = el;
        while (cur && cur !== document.body && parts.length < 6) {
          let part = cur.tagName.toLowerCase();
          if (cur.id && !/\d{5,}/.test(cur.id)) {
            parts.unshift(`#${CSS.escape(cur.id)}`);
            break;
          }
          const cls = Array.from(cur.classList).filter((c) => !c.startsWith('sm-') && !/^\d/.test(c)).slice(0, 2);
          if (cls.length) part += '.' + cls.map((c) => CSS.escape(c)).join('.');
          const parent = cur.parentElement;
          if (parent) {
            const same = Array.from(parent.children).filter((s) => s.tagName === cur!.tagName);
            if (same.length > 1 && !cls.length) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
          }
          parts.unshift(part);
          cur = cur.parentElement;
        }
        return parts.join(' > ');
      };
      const walk = (el: Element, depth: number, parent: number): number => {
        if (el.closest('[data-sitemaxxing-overlay]')) return -1;
        const tag = el.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'link', 'meta', 'svg', 'path'].includes(tag) && tag !== 'svg') return -1;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return -1;
        const r = el.getBoundingClientRect();
        const styles: Record<string, string> = {};
        for (const k of keys) styles[k] = (cs as any)[k];
        fonts.add(cs.fontFamily.split(',')[0].replace(/["']/g, '').trim());
        const attrs: Record<string, string> = {};
        for (const a of Array.from(el.attributes)) {
          if (a.name === 'class' || a.name === 'style') continue;
          attrs[a.name] = a.value.slice(0, 200);
        }
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent || '')
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const index = nodes.length;
        const node = {
          tag,
          id: el.id || '',
          classes: Array.from(el.classList),
          text: (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'p' || tag === 'a' || tag === 'button' || tag === 'li' || tag === 'span'
            ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400)
            : own.slice(0, 400)),
          selector: cssPath(el),
          box: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
          styles,
          attrs,
          depth,
          index,
          parent,
          children: [] as number[],
        };
        nodes.push(node);
        if (tag === 'svg' || nodes.length > 2500) return index;
        for (const c of Array.from(el.children)) {
          const ci = walk(c, depth + 1, index);
          if (ci >= 0) node.children.push(ci);
        }
        return index;
      };
      walk(document.body, 0, -1);
      return {
        nodes,
        bodyFontSize: parseFloat(getComputedStyle(document.body).fontSize) || 16,
        fonts: Array.from(fonts),
        title: document.title,
        url: location.href,
        viewport: { width: innerWidth, height: innerHeight },
      };
    },
    { keys: STYLE_KEYS },
  );
  return hydrate(raw);
}

export function hydrate(raw: RawSnapshot): SnapshotDOM {
  const nodes = raw.nodes as SnapNode[];
  const matches = (n: SnapNode, sel: string): boolean => {
    // Supports the subset of selectors passes use: tag, #id, .class, [attr=value], and
    // descendant combinators between them.
    const parts = sel.trim().split(/\s+/);
    let cur: SnapNode | undefined = n;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (i === parts.length - 1) {
        if (!simple(cur!, parts[i])) return false;
      } else {
        let p: SnapNode | undefined = cur!.parent >= 0 ? nodes[cur!.parent] : undefined;
        while (p && !simple(p, parts[i])) p = p.parent >= 0 ? nodes[p.parent] : undefined;
        if (!p) return false;
        cur = p;
      }
    }
    return true;
  };
  const simple = (n: SnapNode, s: string): boolean => {
    const m = s.match(/^([a-z0-9*-]*)((?:[#.][\w-]+|\[[^\]]+\])*)$/i);
    if (!m) return false;
    if (m[1] && m[1] !== '*' && n.tag !== m[1].toLowerCase()) return false;
    const rest = m[2] || '';
    for (const tok of rest.match(/[#.][\w-]+|\[[^\]]+\]/g) ?? []) {
      if (tok[0] === '#' && n.id !== tok.slice(1)) return false;
      if (tok[0] === '.' && !n.classes.includes(tok.slice(1))) return false;
      if (tok[0] === '[') {
        const am = tok.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"']*)["']?)?$/);
        if (!am) return false;
        if (!(am[1] in n.attrs)) return false;
        if (am[2] !== undefined && n.attrs[am[1]] !== am[2]) return false;
      }
    }
    return true;
  };
  const dom: SnapshotDOM = {
    url: raw.url,
    viewport: raw.viewport,
    nodes,
    bodyFontSize: raw.bodyFontSize,
    fonts: raw.fonts,
    title: raw.title,
    aboveFold: () => nodes.filter((n) => n.box.y < raw.viewport.height && n.box.y + n.box.h > 0 && n.box.w > 0 && n.box.h > 0),
    query: (sel) => sel.split(',').flatMap((s) => nodes.filter((n) => matches(n, s))),
    byTag: (tag) => nodes.filter((n) => n.tag === tag),
    first: (sel) => dom.query(sel)[0],
    textOf: (sel) => dom.first(sel)?.text ?? '',
    parentOf: (n) => (n.parent >= 0 ? nodes[n.parent] : undefined),
    childrenOf: (n) => n.children.map((i) => nodes[i]),
  };
  return dom;
}

export function emptySnapshot(url = ''): SnapshotDOM {
  return hydrate({ nodes: [], bodyFontSize: 16, fonts: [], title: '', url, viewport: { width: 1440, height: 900 } });
}
