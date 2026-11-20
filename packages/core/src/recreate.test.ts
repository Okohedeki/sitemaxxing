import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  appOf,
  contentOf,
  normalizeUrl,
  siteDirFor,
  suggestBrief,
  tokensOf,
  siteFiles,
  type SiteCapture,
} from './recreate';
import { mirrorCss, type Mirror } from './mirror';
import { screenshotMatch } from './fidelity';
import { PNG } from 'pngjs';
import { parseTsx, allJsx, attr } from './edit/jsx';

const capture = (over: Partial<SiteCapture> = {}): SiteCapture => ({
  url: 'https://tidepool.example/',
  title: 'Tidepool | Swim school',
  description: 'Small-group swim lessons for children in a warm indoor pool.',
  lang: 'en',
  brand: 'Tidepool',
  nav: [
    { label: 'Lessons', href: '#lessons' },
    { label: 'Prices', href: '#prices' },
  ],
  navCta: 'Book a trial',
  hero: {
    eyebrow: 'Ages 3 to 12',
    headline: 'Confident swimmers in ten weeks',
    subhead:
      'Four children per teacher, a pool kept at 31 degrees, and a report after every lesson.',
    cta: 'Book a trial',
    secondaryCta: 'See the timetable',
    note: '',
    image: { src: 'https://tidepool.example/pool.jpg', alt: 'The pool' },
  },
  sections: [
    {
      heading: 'How lessons work',
      text: '',
      items: [
        {
          title: 'Small groups',
          text: 'Never more than four children in the water with a teacher.',
        },
        { title: 'Warm water', text: 'Kept at 31 degrees so nobody spends the lesson shivering.' },
        {
          title: 'Clear progress',
          text: 'A short note after each lesson on what to practise next.',
        },
      ],
    },
    {
      heading: 'Where to find us',
      text: 'Behind the library, with parking for twenty cars.',
      items: [],
    },
  ],
  facts: [{ value: '1,200', label: 'Children taught' }],
  quote: {
    text: 'She went from clinging to the side to swimming a length.',
    by: 'A parent',
    role: 'Autumn term',
  },
  footer: '© Tidepool Swim School',
  colors: {
    bg: '#ffffff',
    ink: '#14212b',
    soft: '#e8e8e8',
    acc: '#fdfdfd',
    btnInk: '#ffffff',
    surface: null,
  },
  fonts: { display: '"Fraunces", Georgia, serif', body: 'Inter, system-ui, sans-serif' },
  radius: { button: 999, card: 14, media: 20 },
  ...over,
});

describe('recreate', () => {
  it('keeps the page copy in the keys the passes read, with the card grid as features', () => {
    const c = contentOf(capture()) as any;
    expect(c.headline).toBe('Confident swimmers in ten weeks');
    expect(c.cta).toBe('Book a trial');
    expect(c.features.map((f: any) => f.title)).toEqual([
      'Small groups',
      'Warm water',
      'Clear progress',
    ]);
    expect(c.featuresTitle).toBe('How lessons work');
    expect(c.sections.map((s: any) => s.heading)).toEqual(['Where to find us']);
    expect(c.facts).toHaveLength(1);
    expect(c.quote.by).toBe('A parent');
  });

  const mirror: Mirror = {
    html: { lang: 'en', class: 'theme-light' },
    body: { class: 'page' },
    htmlStyle: [],
    bodyStyle: [['--gap', '12px']],
    sheets: [],
    fontUrls: [],
    nodes: 6,
    tree: [
      {
        t: 'header',
        a: { class: 'top md:flex', 'data-state': 'open' },
        c: [
          {
            t: 'svg',
            a: { viewBox: '0 0 24 24', 'stroke-width': '2', class: 'mark' },
            h: '<path d="M0 0h24"></path>',
          },
          {
            t: 'a',
            a: {
              href: 'https://tidepool.example/prices',
              target: '_blank',
              rel: 'noreferrer',
              tabindex: '0',
            },
            c: ['Prices'],
          },
        ],
      },
      {
        t: 'main',
        a: {},
        c: [
          {
            t: 'h1',
            a: { class: 'title', 'data-copy': 'headline' },
            s: [
              ['--delay', '280ms'],
              ['margin-top', '4px'],
            ],
            c: ['Confident swimmers ', { t: 'span', a: { class: 'accent' }, c: ['in ten weeks'] }],
          },
          {
            t: 'p',
            a: { 'data-copy': 'subhead', 'data-sm-inview': 'is-visible' },
            c: ['  Four children per teacher.  '],
          },
          { t: 'img', a: { src: 'https://tidepool.example/pool.jpg', alt: 'The "warm" pool' } },
          {
            t: 'input',
            a: { type: 'email', value: 'you@example.com', disabled: '', maxlength: '40' },
          },
        ],
      },
    ],
  };

  it('writes the page as it was: its own elements, classes and inline styles', () => {
    const { app, copy } = appOf(capture({ mirror }));
    const { file } = parseTsx(app);
    expect(
      file.getPreEmitDiagnostics().filter((d) => d.getCategory() === 1 && d.getCode() < 2000),
    ).toEqual([]);
    expect(app).toContain('<header className="top md:flex" data-state="open">');
    expect(app).toContain('strokeWidth="2"');
    expect(app).toContain('dangerouslySetInnerHTML={{ __html: "<path d=\\"M0 0h24\\"></path>" }}');
    expect(app).toContain('tabIndex="0"');
    expect(app).toContain('style={{ "--delay": "280ms", marginTop: "4px" }}');
    expect(app).toContain(`alt={"The \\"warm\\" pool"}`);
    expect(app).toContain('defaultValue="you@example.com" disabled maxLength="40"');
    // A headline with its own markup stays as written; plain copy is read from the copy file.
    expect(app).toContain('<span className="accent">');
    expect(app).toContain('{content.subhead}');
    expect(copy).toEqual({ subhead: 'Four children per teacher.' });
    const marked = allJsx(file)
      .map((e) => attr(e, 'data-copy'))
      .filter(Boolean);
    expect(marked).toEqual(['headline', 'subhead']);
  });

  it('keeps the page attributes and replays classes added on scroll', () => {
    const files = siteFiles(capture({ mirror, css: '.title { color: red; }' }), {
      devUrl: 'http://localhost:5199',
      modulesDir: os.tmpdir(),
    });
    expect(files['index.html']).toContain('<html lang="en" class="theme-light">');
    expect(files['index.html']).toContain('<body class="page" style="--gap: 12px">');
    expect(files['src/styles.css']).toContain('.title { color: red; }');
    expect(files['src/inview.ts']).toContain('IntersectionObserver');
    expect(files['src/main.tsx']).toContain(`import './inview';`);
    expect(JSON.parse(files['src/content.json'] as string).subhead).toBe(
      'Four children per teacher.',
    );
  });

  it('points the page main colours and fonts at the tokens, unless the page defines them itself', async () => {
    const tokens = {
      bg: '#ffffff',
      ink: '#14212b',
      soft: '#556270',
      acc: '#0aa0a0',
      display: '"Fraunces", Georgia, serif',
      body: 'Inter, system-ui, sans-serif',
    };
    const toHex = async (values: string[]) =>
      values.map(
        (v) =>
          ({ 'rgb(10, 160, 160)': '#0aa0a0', '#14212B': '#14212b', '#fff': '#ffffff' })[v] ?? null,
      );
    const css = await mirrorCss(
      [
        ':root { --brand: rgb(10, 160, 160); } h1 { color: #14212B; font-family: Fraunces, Georgia, serif; } .card { background: #fff; color: #fff; }',
        'broken {',
      ],
      tokens,
      toHex,
    );
    expect(css).toContain('--brand: var(--acc)');
    expect(css).toContain('color: var(--ink)');
    expect(css).toContain('font-family: var(--display)');
    expect(css).toContain('background: var(--bg); color: #fff');
    expect(css).toContain('broken {');
    const own = await mirrorCss(
      [':root { --acc: rgb(10, 160, 160); } a { color: rgb(10, 160, 160); }'],
      tokens,
      toHex,
    );
    expect(own).toContain('a { color: rgb(10, 160, 160); }');
  });

  it('scores how much of two screenshots agree', () => {
    const shot = (split: number) => {
      const png = new PNG({ width: 120, height: 120 });
      for (let y = 0; y < 120; y++)
        for (let x = 0; x < 120; x++) {
          const i = (y * 120 + x) * 4;
          const v = y < split ? 250 : 20;
          png.data[i] = png.data[i + 1] = png.data[i + 2] = v;
          png.data[i + 3] = 255;
        }
      return PNG.sync.write(png);
    };
    expect(screenshotMatch(shot(60), shot(60))).toBe(1);
    expect(screenshotMatch(shot(120), shot(60))).toBeCloseTo(0.5, 1);
  });

  it('keeps colours legible and the original font stacks', () => {
    const css = tokensOf(capture());
    // The muted grey and the near-white accent are both unreadable on white; both are replaced.
    expect(css).not.toContain('--soft: #e8e8e8');
    expect(css).toContain('--acc: #14212b');
    expect(css).toContain('--display: "Fraunces", Georgia, serif');
    expect(css).toContain('--radius: 999px');
  });

  it('drafts a story and goal from the page', () => {
    const b = suggestBrief(capture());
    expect(b.goal).toBe('bookings');
    expect(b.story).toContain('Tidepool');
    expect(b.feeling).toContain('classic');
  });

  it('accepts bare hosts, refuses other schemes, and never reuses a folder', () => {
    expect(normalizeUrl('tidepool.example')).toBe('https://tidepool.example/');
    expect(normalizeUrl('localhost:5173')).toBe('http://localhost:5173/');
    expect(() => normalizeUrl('file:///etc/hosts')).toThrow(/http/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-sites-'));
    fs.mkdirSync(path.join(dir, 'tidepool.example'));
    expect(path.basename(siteDirFor(dir, 'https://www.tidepool.example/'))).toBe(
      'tidepool.example-2',
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
