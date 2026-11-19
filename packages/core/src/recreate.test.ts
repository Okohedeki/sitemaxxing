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
  type SiteCapture,
} from './recreate';
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

  it('writes an app that renders only what the page had, marked for the copy pass', () => {
    const app = appOf(
      capture({
        quote: undefined,
        facts: [],
        hero: { ...capture().hero, secondaryCta: '', image: undefined },
      }),
    );
    const { file } = parseTsx(app);
    const marked = allJsx(file)
      .map((e) => attr(e, 'data-copy'))
      .filter(Boolean);
    expect(marked).toEqual(expect.arrayContaining(['pill', 'headline', 'subhead', 'cta']));
    expect(app).not.toContain('btn ghost');
    expect(app).not.toContain('className="quote"');
    expect(app).not.toContain('className="spec"');
    expect(app).toContain('hero solo');
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
