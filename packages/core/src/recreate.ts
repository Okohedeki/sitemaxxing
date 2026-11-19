/* Recreate: turns any public page into a small, editable React project, so a URL can be the
   starting point (v1) for the same passes that work on a repo. The copy is the page's own; the
   look keeps its colours, fonts and corner radius. It is a faithful starting point, not a clone. */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import type { Brief, Goal } from './types';
import { DEFAULT_NOISE } from './brief';

export interface CapturedImage {
  src: string;
  alt: string;
}

export interface CapturedItem {
  title: string;
  text: string;
  image?: CapturedImage;
}

export interface CapturedSection {
  heading: string;
  text: string;
  items: CapturedItem[];
  image?: CapturedImage;
}

export interface SiteCapture {
  url: string;
  title: string;
  description: string;
  lang: string;
  brand: string;
  logo?: CapturedImage;
  nav: Array<{ label: string; href: string }>;
  navCta: string;
  hero: {
    eyebrow: string;
    headline: string;
    subhead: string;
    cta: string;
    secondaryCta: string;
    note: string;
    image?: CapturedImage;
  };
  sections: CapturedSection[];
  facts: Array<{ value: string; label: string }>;
  quote?: { text: string; by: string; role: string };
  footer: string;
  colors: {
    bg: string;
    ink: string;
    soft: string;
    acc: string;
    btnInk: string;
    surface: string | null;
  };
  fonts: { display: string; body: string };
  radius: { button: number; card: number; media: number };
}

/**
 * Runs in the page. Plain JavaScript in a string so bundlers cannot inject helpers into it.
 * Reads the first screen (brand, nav, hero), the sections below it, facts, a quote, the footer,
 * and the computed colours, fonts and radii.
 */
const CAPTURE_JS = String.raw`(() => {
  const vh = innerHeight;
  // Paint each colour into one pixel and read it back, so oklch, color() and named colours all
  // come out as plain sRGB hex.
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 1;
  const cv = cvs.getContext('2d', { willReadFrequently: true });
  const px = (c) => { if (!c || c === 'transparent') return null; cv.clearRect(0, 0, 1, 1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0, 0, 1, 1); return cv.getImageData(0, 0, 1, 1).data; };
  const hex = (d) => '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  const norm = (c) => { const d = px(c); return d ? hex(d) : null; };
  const solid = (c) => { const d = px(c); return d && d[3] > 128 ? hex(d) : null; };
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim();
  // Animated headings often repeat their text for screen readers; keep one copy.
  const dedupe = (t) => { const h = t.length / 2; return t.length > 8 && Number.isInteger(h - 0.5) && t.slice(0, h - 0.5) === t.slice(h + 0.5) ? t.slice(0, h - 0.5) : t; };
  const txt = (el) => dedupe(clean(el.innerText || el.textContent));
  const top = (el) => el.getBoundingClientRect().top + scrollY;
  const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } };
  const all = (sel, root) => Array.from((root || document).querySelectorAll(sel)).filter(vis);
  const before = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const leafy = (el) => !Array.from(el.children).some((c) => vis(c) && txt(c).length > 0 && !/^(B|STRONG|EM|I|SPAN|A|BR|SMALL|SUP|SUB|MARK|CODE)$/.test(c.tagName));
  const imgOf = (el) => {
    if (!el) return undefined;
    if (el.tagName === 'IMG') { const src = abs(el.currentSrc || el.src || el.getAttribute('data-src') || ''); return src && !src.startsWith('data:image/gif') ? { src, alt: clean(el.alt) } : undefined; }
    if (el.tagName === 'VIDEO' && el.poster) return { src: abs(el.poster), alt: '' };
    const bg = getComputedStyle(el).backgroundImage; const m = /url\(["']?([^"')]+)["']?\)/.exec(bg || '');
    return m ? { src: abs(m[1]), alt: '' } : undefined;
  };
  const biggestImage = (root, minArea, notIn) => {
    const c = all('img, video, picture img', root).concat(all('div, section, figure', root).filter((e) => /url\(/.test(getComputedStyle(e).backgroundImage)));
    let best = null, bestA = minArea;
    for (const e of c) { if (notIn && notIn.contains(e)) continue; const a = area(e); if (a > bestA) { const im = imgOf(e); if (im) { best = { el: e, img: im }; bestA = a; } } }
    return best;
  };
  const isBtn = (a) => { const s = getComputedStyle(a); return !!solid(s.backgroundColor) || /btn|button|cta/i.test(String(a.className)) || (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.paddingLeft) > 8); };
  const ctaWords = /sign ?up|get started|start|try|book|buy|order|join|contact|demo|subscribe|download|shop|reserve|apply|register|get /i;

  const bodyText0 = txt(document.body).slice(0, 2000);
  if (/verif(y|ies) you are (not a bot|human)|checking your browser|just a moment\.\.\.|enable javascript and cookies|captcha/i.test(bodyText0 + ' ' + document.title)) return { blocked: true };
  const h1 = all('h1').find((h) => txt(h).length > 2) || all('h2')[0];
  const h1Top = h1 ? top(h1) : vh * 0.3;
  const header = all('header, [role=banner], nav').find((e) => top(e) < Math.min(200, h1Top) && (!h1 || !e.contains(h1)));

  // Brand
  const meta = (n) => (document.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]') || {}).content || '';
  const logoImg = header ? all('img, svg', header).find((e) => top(e) < 140) : null;
  const firstLink = header ? all('a', header)[0] : null;
  const titleParts = clean(document.title).split(/\s[|\-–—:·]\s/);
  let brand = clean(meta('og:site_name')) || (logoImg && logoImg.tagName === 'IMG' ? clean(logoImg.alt).replace(/\s*logo$/i, '') : '') || (firstLink && txt(firstLink).length < 30 ? txt(firstLink) : '') || titleParts[titleParts.length - 1] || location.hostname;
  if (brand.length > 30) brand = titleParts.map((t) => t.trim()).filter((t) => t.length >= 3).sort((a, b) => a.length - b.length)[0] || brand;
  if (brand.length > 30) brand = brand.split(' ').slice(0, 3).join(' ');
  const logo = logoImg && logoImg.tagName === 'IMG' ? imgOf(logoImg) : undefined;

  // Navigation
  let links = header ? all('a, button', header) : [];
  if (links.filter((a) => a.tagName === 'A').length < 2) links = all('a, button').filter((a) => top(a) < Math.min(140, h1Top));
  const nav = []; const seen = new Set(); let navCta = '';
  for (const a of links) {
    const t = txt(a); if (!t || t.length > 28 || t === brand) continue;
    if (isBtn(a) && ctaWords.test(t)) { navCta = t; continue; }
    if (a.tagName !== 'A' || seen.has(t.toLowerCase()) || /log ?in|sign ?in/i.test(t)) continue;
    seen.add(t.toLowerCase()); if (nav.length < 6) nav.push({ label: t, href: '#' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
  }

  // Hero
  let heroRoot = h1 ? h1.parentElement : document.body;
  while (heroRoot && heroRoot.parentElement && heroRoot.parentElement !== document.body && heroRoot.parentElement.getBoundingClientRect().height < vh * 1.25 && !(header && heroRoot.parentElement.contains(header))) heroRoot = heroRoot.parentElement;
  const inHero = (e) => heroRoot && heroRoot.contains(e);
  const leaves = heroRoot ? all('p, span, div, small, a, li', heroRoot).filter((e) => leafy(e) && txt(e)) : [];
  const eyebrowEl = h1 ? leaves.filter((e) => !e.contains(h1) && before(e, h1) && h1.getBoundingClientRect().top - e.getBoundingClientRect().bottom < 160 && txt(e).length >= 4 && txt(e).length < 70 && !(header && header.contains(e))).pop() : null;
  const subEl = h1 ? leaves.find((e) => before(h1, e) && !h1.contains(e) && txt(e).length >= 30 && txt(e).length < 420 && e.tagName !== 'A') : null;
  let heroLinks = heroRoot ? all('a, button', heroRoot).filter((a) => h1 && before(h1, a) && txt(a).length > 1 && txt(a).length < 40) : [];
  // A narrow hero block may hold only the headline; look just below it for the call to action.
  if (!heroLinks.some(isBtn)) heroLinks = heroLinks.concat(all('a, button, input[type=submit]').filter((a) => h1 && before(h1, a) && top(a) < h1Top + vh * 0.8 && !(header && header.contains(a)) && isBtn(a) && (txt(a) || a.value || '').length > 1 && (txt(a) || a.value || '').length < 40));
  const lab = (a) => txt(a) || a.value || '';
  const ctaEl = heroLinks.find((a) => isBtn(a) && ctaWords.test(lab(a))) || heroLinks.find(isBtn) || heroLinks[0] || null;
  const secondEl = heroLinks.find((a) => a !== ctaEl && lab(a) && lab(a) !== (ctaEl ? lab(ctaEl) : '')) || null;
  const lastCta = secondEl || ctaEl;
  const noteEl = lastCta ? leaves.find((e) => before(lastCta, e) && !lastCta.contains(e) && txt(e).length >= 20 && txt(e).length < 140 && e !== subEl) : null;
  const heroImg = biggestImage(heroRoot && heroRoot.getBoundingClientRect().height > 120 ? heroRoot : document.body, 40000, header) ;
  const heroImage = heroImg && top(heroImg.el) < vh * 1.1 ? heroImg.img : undefined;
  const heroBottom = heroRoot ? top(heroRoot) + heroRoot.getBoundingClientRect().height : vh;

  // Sections below the hero, one per h2
  const numRe = /^[~<>]?[$€£]?\d[\d.,]*\s?(%|\+|x|×|k|K|M|B|bn|hrs?|h|min|s|ms|cm|km|kg|m)?\+?$/;
  const facts = []; const seenF = new Set();
  const h2s = all('h2').filter((h) => top(h) >= heroBottom - 4 && txt(h).length > 1);
  const sections = [];
  // Card grids without their own headings: the element with the most similar children that carry text.
  const cardsIn = (box, h) => {
    let best = null;
    for (const el of all('div, ul, ol, section', box)) {
      const kids = Array.from(el.children).filter((k) => vis(k) && txt(k).length >= 16 && txt(k).length < 700 && !k.contains(h));
      if (kids.length < 2 || kids.length > 8) continue;
      const sig = (k) => k.tagName + '.' + String(k.className).split(' ')[0];
      if (!kids.every((k) => sig(k) === sig(kids[0]))) continue;
      const prose = kids.reduce((n, k) => n + txt(k).split(' ').length, 0);
      if (!best || prose > best.prose) best = { kids, prose };
    }
    best = best ? best.kids : null;
    return (best || []).map((k) => {
      const ls = all('*', k).filter((e) => leafy(e) && txt(e)).map((e) => ({ t: txt(e), size: parseFloat(getComputedStyle(e).fontSize), w: +getComputedStyle(e).fontWeight || 400 }));
      const head = ls.filter((l) => l.t.length < 90).sort((a, b) => b.size * (b.w / 400) - a.size * (a.w / 400))[0];
      const body = ls.filter((l) => head && l.t !== head.t).sort((a, b) => b.t.length - a.t.length)[0];
      const im = biggestImage(k, 4000);
      // A card's title stands out from its text; a list of small labels (an app mock-up) is not a card.
      const stands = head && body && (head.size > body.size * 1.04 || head.w >= 600);
      return { title: stands ? head.t.slice(0, 80) : '', text: body ? body.t.slice(0, 280) : '', image: im ? im.img : undefined };
    }).filter((i) => i.title.length >= 3 && !numRe.test(i.title) && (i.text.split(' ').length >= 4 || i.image));
  };
  for (const h of h2s.slice(0, 10)) {
    if (numRe.test(txt(h))) {
      const label = clean(txt(h.parentElement).replace(txt(h), '')).slice(0, 60);
      if (label.length > 1 && facts.length < 4 && !seenF.has(txt(h))) { seenF.add(txt(h)); facts.push({ value: txt(h), label }); }
      continue;
    }
    let box = h;
    const foot = document.querySelector('footer');
    while (box.parentElement && box.parentElement !== document.body && all('h2', box.parentElement).filter((x) => x !== h).length === 0 && !(foot && box.parentElement.contains(foot) && !foot.contains(h)) && box.parentElement.getBoundingClientRect().height < vh * 2.2) box = box.parentElement;
    const items = [];
    for (const t of all('h3, h4', box).slice(0, 8)) {
      let card = t;
      while (card.parentElement && card.parentElement !== box && all('h3, h4', card.parentElement).length === 1) card = card.parentElement;
      const p = all('p, div, span', card).find((e) => leafy(e) && !t.contains(e) && !e.contains(t) && txt(e).length > 12);
      const im = biggestImage(card, 4000);
      items.push({ title: txt(t).slice(0, 80), text: p ? txt(p).slice(0, 280) : '', image: im ? im.img : undefined });
    }
    if (!items.length) items.push(...cardsIn(box, h));
    const used = new Set(items.flatMap((i) => [i.title, i.text]));
    const intro = all('p, div, span', box).find((e) => leafy(e) && before(h, e) && !h.contains(e) && !used.has(txt(e)) && txt(e).length > 30 && txt(e).length < 600);
    const im = items.length ? null : biggestImage(box, 30000);
    if (sections.length >= 8) break;
    sections.push({ heading: txt(h).slice(0, 120), text: intro ? txt(intro).slice(0, 420) : '', items, image: im ? im.img : undefined });
  }

  // Facts: big short numbers with a label next to them
  const bodySize = parseFloat(getComputedStyle(document.body).fontSize) || 16;
  for (const e of all('div, span, p, strong, b, dt, dd, h3, h4').filter((e) => top(e) > heroBottom - 200 && leafy(e))) {
    const t = txt(e);
 if (!numRe.test(t) || parseFloat(getComputedStyle(e).fontSize) < bodySize * 1.4) continue;
    const label = clean(txt(e.parentElement).replace(t, '')).slice(0, 60);
    if (label.length < 2 || seenF.has(t)) continue;
    seenF.add(t); facts.push({ value: t, label });
    if (facts.length >= 4) break;
  }

  // A quote
  let quote;
  const q = all('blockquote, q, figure blockquote')[0] || all('p').find((e) => /^[“"]/.test(txt(e)) && txt(e).length > 40 && txt(e).length < 420);
  if (q) {
    const fig = q.closest('figure') || q.parentElement;
    const by = fig ? all('cite, figcaption, footer', fig).map(txt).find((t) => t && t.length < 80) || '' : '';
    let qt = txt(q); if (by && qt.endsWith(by)) qt = clean(qt.slice(0, -by.length));
    quote = { text: qt.replace(/^[“"]|[”"]$/g, ''), by: by.replace(/^[—–-]\s*/, '').split(/,\s*/)[0] || '', role: by.split(/,\s*/).slice(1).join(', ') };
  }

  // Footer
  const foot = all('footer').pop();
  const footLeaves = foot ? all('p, span, div, small', foot).filter((e) => leafy(e)).map(txt).filter(Boolean) : [];
  const footer = (footLeaves.find((t) => /©|copyright/i.test(t)) || footLeaves.find((t) => t.length >= 12 && t.length <= 160) || '').slice(0, 160) || ('© ' + new Date().getFullYear() + ' ' + brand);

  // Look
  const bodyBg = solid(getComputedStyle(document.body).backgroundColor) || solid(getComputedStyle(document.documentElement).backgroundColor) || (heroRoot && solid(getComputedStyle(heroRoot).backgroundColor)) || '#ffffff';
  const inkEl = h1 || document.body;
  const ctaStyle = ctaEl ? getComputedStyle(ctaEl) : null;
  const linkEl = all('main a, a').find((a) => !isBtn(a));
  const card = sections.length && sections[0].items.length ? all('h3, h4')[0] : null;
  let cardBox = card; while (cardBox && cardBox.parentElement && !solid(getComputedStyle(cardBox).backgroundColor) && cardBox.getBoundingClientRect().height < 500) cardBox = cardBox.parentElement;
  const surface = cardBox ? solid(getComputedStyle(cardBox).backgroundColor) : null;
  const fam = (el) => clean(getComputedStyle(el).fontFamily);
  const bodyText = subEl || all('p')[0] || document.body;
  return {
    url: location.href,
    title: clean(document.title),
    description: clean(meta('description') || meta('og:description')),
    lang: document.documentElement.lang || 'en',
    brand, logo, nav, navCta,
    hero: {
      eyebrow: eyebrowEl ? txt(eyebrowEl).slice(0, 70) : '',
      headline: h1 ? txt(h1).slice(0, 160) : clean(document.title),
      subhead: subEl ? txt(subEl).slice(0, 420) : '',
      cta: ctaEl && (ctaWords.test(lab(ctaEl)) || !navCta) ? lab(ctaEl).slice(0, 40) : navCta,
      secondaryCta: secondEl ? lab(secondEl).slice(0, 40) : '',
      note: noteEl ? txt(noteEl).slice(0, 140) : '',
      image: heroImage,
    },
    sections, facts, quote, footer,
    colors: {
      bg: bodyBg,
      ink: norm(getComputedStyle(inkEl).color) || '#111111',
      soft: norm(getComputedStyle(bodyText).color) || '#555555',
      acc: (ctaStyle && solid(ctaStyle.backgroundColor)) || (linkEl && norm(getComputedStyle(linkEl).color)) || '#2b59c3',
      btnInk: (ctaStyle && solid(ctaStyle.backgroundColor) && norm(ctaStyle.color)) || '#ffffff',
      surface: surface && surface !== bodyBg ? surface : null,
    },
    fonts: { display: fam(inkEl), body: fam(bodyText) },
    radius: {
      button: ctaStyle ? parseFloat(ctaStyle.borderTopLeftRadius) || 0 : 6,
      card: cardBox ? parseFloat(getComputedStyle(cardBox).borderTopLeftRadius) || 0 : 12,
      media: heroImg ? parseFloat(getComputedStyle(heroImg.el).borderTopLeftRadius) || 0 : 12,
    },
  };
})()`;

/** Opens the page, lets lazy content load, and reads it. */
export async function captureSite(
  page: Page,
  url: string,
  onStep: (what: string) => void = () => undefined,
): Promise<SiteCapture> {
  onStep('Opening the page');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => undefined);
  onStep('Reading the layout');
  // Scroll through once so lazy images and reveal-on-scroll sections are present.
  await page.evaluate(`(async () => {
    const h = Math.min(document.body.scrollHeight, 14000);
    for (let y = 0; y < h; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300));
  })()`);
  const cap = (await page.evaluate(CAPTURE_JS)) as SiteCapture & { blocked?: boolean };
  if (cap.blocked)
    throw new Error(
      'the site shows a bot check to automated visitors, so it cannot be read. Try another page, or point Sitemaxxing at the repo',
    );
  if (!cap.hero.headline) throw new Error('could not find a headline on that page');
  return cap;
}

// ---------- colour helpers (Node side) ----------

function toRgb(c: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (hex)
    return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as [number, number, number];
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(c);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
}

const toHex = (rgb: number[]) =>
  '#' +
  rgb
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const mix = (a: string, b: string, t: number) =>
  toHex(toRgb(a).map((v, i) => v * (1 - t) + toRgb(b)[i] * t));
const lum = (c: string) => {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = toRgb(c);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) =>
  (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

// ---------- fonts ----------

/** First family in a CSS font stack, and whether the stack is a serif one. */
function firstFamily(stack: string): { name: string; generic: string } {
  const parts = stack.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
  const name =
    parts.find(
      (p) =>
        !/^(serif|sans-serif|monospace|system-ui|ui-[a-z-]+|-apple-system|BlinkMacSystemFont|cursive)$/i.test(
          p,
        ),
    ) ?? '';
  const generic =
    parts.includes('serif') ||
    /serif|garamond|georgia|times|playfair|merriweather|lora|baskerville|caslon/i.test(
      name.replace(/sans/i, ''),
    )
      ? 'serif'
      : parts.includes('monospace')
        ? 'monospace'
        : 'sans-serif';
  return { name, generic };
}

/** Self-hosted imports for a family when the template has it installed through Fontsource. */
export function fontImports(family: string, modulesDir: string): string[] {
  const slug = family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) return [];
  if (fs.existsSync(path.join(modulesDir, '@fontsource-variable', slug)))
    return [`import '@fontsource-variable/${slug}';`];
  const dir = path.join(modulesDir, '@fontsource', slug);
  if (fs.existsSync(dir))
    return ['400', '600', '700']
      .filter((w) => fs.existsSync(path.join(dir, `${w}.css`)))
      .map((w) => `import '@fontsource/${slug}/${w}.css';`);
  return [];
}

// ---------- the project ----------

export interface SiteFiles {
  [relPath: string]: string;
}

const MAX_SECTIONS = 6;

/** Splits the captured sections into the feature cards and the rest. */
function arrange(cap: SiteCapture) {
  const sections = cap.sections
    .filter((s) => s.heading || s.items.length)
    .slice(0, MAX_SECTIONS + 1);
  const fi = sections.findIndex(
    (s) => s.items.length >= 2 && s.items.length <= 8 && s.items.every((i) => i.title),
  );
  const features = fi >= 0 ? sections[fi] : null;
  const rest = sections.filter((_, i) => i !== fi).slice(0, MAX_SECTIONS);
  return { features, rest };
}

/** The copy file: the page's own words, in the keys the passes read. */
export function contentOf(cap: SiteCapture): Record<string, unknown> {
  const { features, rest } = arrange(cap);
  return {
    brand: cap.brand,
    ...(cap.logo ? { logo: cap.logo.src } : {}),
    nav: cap.nav,
    navCta: cap.navCta || cap.hero.cta || 'Get in touch',
    pill: cap.hero.eyebrow,
    headline: cap.hero.headline,
    highlight: '',
    subhead: cap.hero.subhead,
    cta: cap.hero.cta || cap.navCta || 'Get started',
    secondaryCta: cap.hero.secondaryCta,
    trust: cap.hero.note,
    ...(cap.hero.image ? { heroImage: cap.hero.image } : {}),
    featuresTitle: features?.heading ?? '',
    features: (features?.items ?? []).map((i) => ({
      icon: '',
      title: i.title,
      text: i.text,
      ...(i.image ? { image: i.image } : {}),
    })),
    sections: rest.map((s) => ({
      heading: s.heading,
      text: s.text,
      items: s.items.map((i) => ({
        title: i.title,
        text: i.text,
        ...(i.image ? { image: i.image } : {}),
      })),
      ...(s.image ? { image: s.image } : {}),
    })),
    facts: cap.facts,
    ...(cap.quote?.text ? { quote: cap.quote } : {}),
    footer: cap.footer,
    source: cap.url,
  };
}

export function tokensOf(cap: SiteCapture): string {
  const c = cap.colors;
  const bg = toHex(toRgb(c.bg));
  const ink = toHex(toRgb(c.ink));
  let soft = toHex(toRgb(c.soft));
  if (contrast(soft, bg) < 4.5) soft = mix(ink, bg, 0.3);
  let acc = toHex(toRgb(c.acc));
  if (contrast(acc, bg) < 1.4) acc = ink;
  const btnInk =
    contrast(toHex(toRgb(c.btnInk)), acc) >= 3
      ? toHex(toRgb(c.btnInk))
      : contrast('#ffffff', acc) >= contrast('#111111', acc)
        ? '#ffffff'
        : '#111111';
  const surface = c.surface ? toHex(toRgb(c.surface)) : mix(bg, ink, 0.035);
  const display = firstFamily(cap.fonts.display);
  const body = firstFamily(cap.fonts.body);
  // Keep the page's own stack, so its fallbacks still apply where the first font is not installed.
  const stack = (raw: string, f: { name: string; generic: string }) => {
    const safe = raw.replace(/[;{}<>]/g, '').trim();
    return safe && f.name
      ? safe
      : f.generic === 'serif'
        ? 'Georgia, serif'
        : 'system-ui, sans-serif';
  };
  const px = (n: number, max: number) => `${Math.round(Math.max(0, Math.min(max, n)))}px`;
  return `/* Recreated from ${cap.url}. Passes rewrite these. */
:root {
  --bg: ${bg};
  --ink: ${ink};
  --soft: ${soft};
  --line: ${mix(bg, ink, 0.12)};
  --surface: ${surface};
  --acc: ${acc};
  --dot: ${acc};
  --display: ${stack(cap.fonts.display, display)};
  --body: ${stack(cap.fonts.body, body)};
  --label: ${stack(cap.fonts.body, body)};
  --btn-bg: ${acc};
  --btn-ink: ${btnInk};
  --btn-shadow: none;
  --pill-bg: ${mix(bg, acc, 0.12)};
  --pill-ink: ${contrast(acc, mix(bg, acc, 0.12)) >= 4.5 ? acc : ink};
  --pill-border: 1px solid transparent;
  --radius: ${cap.radius.button >= 40 ? '999px' : px(cap.radius.button, 32)};
  --card-radius: ${px(cap.radius.card, 32)};
  --media-radius: ${px(cap.radius.media, 40)};
  --card-shadow: none;
  --logo-bg: ${acc};
}
`;
}

const img = (expr: string, cls: string) =>
  `<img className="${cls}" src={${expr}.src} alt={${expr}.alt} loading="lazy" referrerPolicy="no-referrer" />`;

/** The app file. Only what the page had is rendered, so v1 reads like the original. */
export function appOf(cap: SiteCapture): string {
  const c = contentOf(cap) as any;
  const hasArt = !!c.heroImage;
  const lines: string[] = [];
  const push = (s: string) => lines.push(s);
  push(`import content from './content.json';`);
  push('');
  push('export default function App() {');
  push('  return (');
  push('    <div className="site">');
  push('      <header className="nav">');
  push('        <a className="logo" href="#top">');
  push(
    c.logo
      ? '          <img className="logo-img" src={content.logo} alt="" referrerPolicy="no-referrer" />'
      : '          <i className="logo-mark" aria-hidden="true" />',
  );
  push(
    c.logo
      ? '          <span className="sr-only">{content.brand}</span>'
      : '          {content.brand}',
  );
  push('        </a>');
  if (c.nav.length) {
    push('        <ul className="links">');
    push('          {content.nav.map((item) => (');
    push('            <li key={item.label}>');
    push('              <a href={item.href}>{item.label}</a>');
    push('            </li>');
    push('          ))}');
    push('        </ul>');
  }
  push('        <div className="nav-actions">');
  push('          <a className="btn" href="#start">');
  push('            {content.navCta}');
  push('          </a>');
  push('        </div>');
  push('      </header>');
  push('');
  push('      <main id="top">');
  push(`        <section className="hero${hasArt ? '' : ' solo'}">`);
  push('          <div className="copy">');
  if (c.pill)
    push(
      '            <span className="pill" data-copy="pill">\n              {content.pill}\n            </span>',
    );
  push(
    '            <h1 className="h1" data-copy="headline">\n              {content.headline}\n            </h1>',
  );
  if (c.subhead)
    push(
      '            <p className="sub" data-copy="subhead">\n              {content.subhead}\n            </p>',
    );
  push('            <div className="ctas">');
  push(
    '              <a className="btn" href="#start" data-copy="cta">\n                {content.cta}\n              </a>',
  );
  if (c.secondaryCta)
    push(
      '              <a className="btn ghost" href="#more">\n                {content.secondaryCta}\n              </a>',
    );
  push('            </div>');
  if (c.trust) push('            <p className="trust">{content.trust}</p>');
  push('          </div>');
  if (hasArt)
    push(
      `          <div className="art">\n            ${img('content.heroImage', 'hero-img')}\n          </div>`,
    );
  push('        </section>');
  if (c.features.length) {
    push('');
    push('        <section className="features">');
    if (c.featuresTitle)
      push('          <h2 className="features-title">{content.featuresTitle}</h2>');
    push('          {content.features.map((f) => (');
    push('            <div className="feature" key={f.title}>');
    if (c.features.some((f: any) => f.image))
      push(`              {'image' in f && f.image ? ${img('f.image', 'feature-img')} : null}`);
    push('              <h3>{f.title}</h3>');
    push('              <p>{f.text}</p>');
    push('            </div>');
    push('          ))}');
    push('        </section>');
  }
  if (c.sections.length) {
    const anyItemImg = c.sections.some((s: any) => s.items.some((i: any) => i.image));
    const anyImg = c.sections.some((s: any) => s.image);
    push('');
    push('        {content.sections.map((s) => (');
    push('          <section className="block" key={s.heading}>');
    push('            {s.heading ? <h2>{s.heading}</h2> : null}');
    push('            {s.text ? <p>{s.text}</p> : null}');
    push('            {s.items.length ? (');
    push('              <div className="items">');
    push('                {s.items.map((i) => (');
    push('                  <div className="item" key={i.title}>');
    if (anyItemImg)
      push(`                    {'image' in i && i.image ? ${img('i.image', 'item-img')} : null}`);
    push('                    <h3>{i.title}</h3>');
    push('                    {i.text ? <p>{i.text}</p> : null}');
    push('                  </div>');
    push('                ))}');
    push('              </div>');
    push('            ) : null}');
    if (anyImg)
      push(`            {'image' in s && s.image ? ${img('s.image', 'block-img')} : null}`);
    push('          </section>');
    push('        ))}');
  }
  if (c.facts.length) {
    push('');
    push('        <div className="spec">');
    push('          {content.facts.map((f) => (');
    push('            <div key={f.label}>');
    push('              <b>{f.value}</b>');
    push('              <span>{f.label}</span>');
    push('            </div>');
    push('          ))}');
    push('        </div>');
  }
  if (c.quote) {
    push('');
    push('        <figure className="quote">');
    push('          <p>{content.quote.text}</p>');
    if (c.quote.by)
      push(
        '          <cite>\n            {content.quote.by}\n            {content.quote.role ? `, ${content.quote.role}` : null}\n          </cite>',
      );
    push('        </figure>');
  }
  push('      </main>');
  push('');
  push('      <footer className="footer">');
  push('        <span>{content.footer}</span>');
  push('      </footer>');
  push('    </div>');
  push('  );');
  push('}');
  return lines.join('\n') + '\n';
}

/** A first draft of the story from the page itself, for the owner to correct. */
export function suggestBrief(cap: SiteCapture): Partial<Brief> {
  const text = `${cap.hero.cta} ${cap.navCta}`.toLowerCase();
  const goal: Goal = /book|reserv|availab|dates|table/.test(text)
    ? 'bookings'
    : /buy|shop|order|cart|pricing|plans?\b/.test(text)
      ? 'sales'
      : /contact|talk|demo|call|quote|touch/.test(text)
        ? 'leads'
        : /sign ?up|get started|start|try|create|join|free|register|download/.test(text)
          ? 'signups'
          : 'awareness';
  const lines = [cap.description, cap.hero.subhead, cap.hero.headline]
    .map((s) => s.trim())
    .filter(Boolean);
  let story = lines[0] ?? '';
  if (story && !story.toLowerCase().includes(cap.brand.toLowerCase()))
    story = `${cap.brand}: ${story}`;
  const feeling: string[] = [];
  if (lum(toHex(toRgb(cap.colors.bg))) < 0.15) feeling.push('dark');
  if (firstFamily(cap.fonts.display).generic === 'serif') feeling.push('classic');
  return {
    story: story.slice(0, 400),
    audience: '',
    goal,
    feeling,
    keep: {},
    avoid: [],
    noise: DEFAULT_NOISE,
  };
}

/** Every file of the recreated project except the shared template files. */
export function siteFiles(
  cap: SiteCapture,
  opts: { devUrl: string; modulesDir: string },
): SiteFiles {
  const display = firstFamily(cap.fonts.display).name;
  const body = firstFamily(cap.fonts.body).name;
  const imports = [
    ...new Set([...fontImports(display, opts.modulesDir), ...fontImports(body, opts.modulesDir)]),
  ];
  const title = cap.title.replace(/[<>&]/g, '') || cap.brand;
  return {
    'src/App.tsx': appOf(cap),
    'src/content.json': JSON.stringify(contentOf(cap), null, 2) + '\n',
    'src/tokens.css': tokensOf(cap),
    'src/fonts.ts': `// Self-hosted fonts (OFL) via Fontsource. Passes add imports here.\n${imports.join('\n')}${imports.length ? '\n' : 'export {};\n'}`,
    'index.html': `<!doctype html>\n<html lang="${cap.lang.replace(/[^a-zA-Z-]/g, '') || 'en'}">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${title}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
    'sitemaxxing.config.ts': `import { defineConfig } from 'sitemaxxing';\n\nexport default defineConfig({\n  devUrl: '${opts.devUrl}',\n  content: 'src/content.json',\n  sections: 'auto',\n  passes: ['default'],\n  viewports: [[1440, 900], [390, 844]],\n});\n`,
    '.sitemaxxing/suggested-brief.json': JSON.stringify(suggestBrief(cap), null, 2) + '\n',
    'README.md': `# ${cap.brand}\n\nRecreated by Sitemaxxing from ${cap.url} as a starting point (v1). The copy is the page's own and\nthe images still load from the original site. Run \`npm run dev\` to serve it.\n`,
    '.gitignore': '.sitemaxxing\nnode_modules\ndist\n',
  };
}

/** A folder name for a site: its host, with a number if that folder is taken. */
export function siteDirFor(sitesDir: string, url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '-');
  let dir = path.join(sitesDir, host);
  for (let n = 2; fs.existsSync(dir); n++) dir = path.join(sitesDir, `${host}-${n}`);
  return dir;
}

/** Accepts "example.com" as well as full URLs; only http and https. */
export function normalizeUrl(input: string): string {
  const raw = input.trim();
  // Bare hosts get https, except local ones, which are almost always plain http dev servers.
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|[^/:]+\.localhost)(:|\/|$)/i.test(raw);
  const u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `${local ? 'http' : 'https'}://${raw}`);
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    throw new Error('only http and https pages can be recreated');
  return u.href;
}
