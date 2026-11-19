/* High-value page sections: proof, features and the closing call to action. All original, all
   styled from the direction tokens (--bg, --ink, --soft, --line, --acc, --display, --label), and
   all driven by content from the site's copy file, so nothing is invented. */

export const SECTION_TYPES_TSX = `export interface Fact { value: string; label: string }
export interface Feature { title: string; text: string; icon?: string }
export interface Quote { text: string; by: string; role?: string }
`;

// ---------- proof ----------

export const METRIC_STRIP_TSX = `import type { Fact } from './section-types';

/** Big figures in a row. Reads at a glance; the numbers carry the claim. */
export function MetricStrip({ items }: { items: Fact[] }) {
  if (!items?.length) return null;
  return (
    <section className="sm-metrics" aria-label="Key figures">
      {items.slice(0, 4).map((m) => (
        <div key={m.label} className="sm-metric">
          <b>{m.value}</b>
          <span>{m.label}</span>
        </div>
      ))}
    </section>
  );
}
`;

export const METRIC_STRIP_CSS = `.sm-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 0 clamp(20px, 5vw, 64px); border-top: 1px solid var(--line, #ddd); }
.sm-metric { padding: clamp(20px, 3vw, 36px) clamp(12px, 2vw, 28px) clamp(20px, 3vw, 36px) 0; border-right: 1px solid var(--line, #ddd); }
.sm-metric:last-child { border-right: 0; }
.sm-metric + .sm-metric { padding-left: clamp(12px, 2vw, 28px); }
.sm-metric b { display: block; font-family: var(--display, inherit); font-weight: 400; font-size: clamp(36px, 4.4vw, 64px); line-height: 1; letter-spacing: -0.03em; color: var(--ink, inherit); }
.sm-metric span { display: block; margin-top: 10px; font-family: var(--label, inherit); font-size: 12.5px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--soft, #666); }`;

export const PULL_QUOTE_TSX = `import type { Quote } from './section-types';

/** One customer voice, given room. Only renders when the copy file has a real quote. */
export function PullQuote({ quote }: { quote?: Quote }) {
  if (!quote?.text) return null;
  return (
    <figure className="sm-quote">
      <blockquote>
        <p>{quote.text}</p>
      </blockquote>
      <figcaption>
        <b>{quote.by}</b>
        {quote.role ? <span>{quote.role}</span> : null}
      </figcaption>
    </figure>
  );
}
`;

export const PULL_QUOTE_CSS = `.sm-quote { margin: clamp(48px, 8vw, 120px) clamp(20px, 5vw, 64px); max-width: 980px; display: grid; gap: 22px; padding-left: clamp(16px, 2.5vw, 32px); border-left: 3px solid var(--acc, currentColor); }
.sm-quote blockquote { margin: 0; }
.sm-quote p { margin: 0; font-family: var(--display, inherit); font-size: clamp(26px, 3.2vw, 46px); line-height: 1.15; letter-spacing: -0.02em; color: var(--ink, inherit); text-wrap: balance; }
.sm-quote p::before { content: "\\201C"; } .sm-quote p::after { content: "\\201D"; }
.sm-quote figcaption { display: flex; gap: 12px; align-items: baseline; font-family: var(--label, inherit); font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--soft, #666); }
.sm-quote figcaption b { color: var(--ink, inherit); font-weight: 500; }`;

export const FACT_TICKER_TSX = `import type { Fact } from './section-types';

/** The facts as a slow band that runs across the page. Static under reduced motion. */
export function FactTicker({ items }: { items: Fact[] }) {
  if (!items?.length) return null;
  const run = [...items, ...items, ...items];
  return (
    <section className="sm-ticker" aria-label="Key figures">
      <div className="sm-ticker-track">
        {run.map((m, i) => (
          <span key={i} aria-hidden={i >= items.length}>
            <b>{m.value}</b> {m.label}
          </span>
        ))}
      </div>
    </section>
  );
}
`;

export const FACT_TICKER_CSS = `.sm-ticker { overflow: hidden; border-block: 1px solid var(--line, #ddd); margin: clamp(24px, 4vw, 48px) 0; padding: 18px 0; }
.sm-ticker-track { display: flex; gap: 56px; width: max-content; animation: sm-ticker 38s linear infinite; }
.sm-ticker span { font-family: var(--label, inherit); font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--soft, #666); white-space: nowrap; }
.sm-ticker b { font-family: var(--display, inherit); font-size: 22px; letter-spacing: -0.01em; text-transform: none; color: var(--ink, inherit); margin-right: 6px; font-weight: 500; }
@keyframes sm-ticker { to { transform: translateX(-33.333%); } }
@media (prefers-reduced-motion: reduce) { .sm-ticker-track { animation: none; flex-wrap: wrap; width: auto; padding: 0 clamp(20px, 5vw, 64px); } .sm-ticker span[aria-hidden="true"] { display: none; } }`;

// ---------- features ----------

export const NUMBERED_ROWS_TSX = `import type { Feature } from './section-types';

/** Features as numbered rows: number, title, sentence. Calm and easy to scan. */
export function NumberedRows({ items }: { items: Feature[] }) {
  if (!items?.length) return null;
  return (
    <section className="sm-rows" aria-label="What it does">
      {items.map((f, i) => (
        <article key={f.title} className="sm-row">
          <span className="sm-row-n">{String(i + 1).padStart(2, '0')}</span>
          <h3>{f.title}</h3>
          <p>{f.text}</p>
        </article>
      ))}
    </section>
  );
}
`;

export const NUMBERED_ROWS_CSS = `.sm-rows { margin: clamp(32px, 6vw, 96px) clamp(20px, 5vw, 64px); }
.sm-row { display: grid; grid-template-columns: 64px minmax(160px, 1fr) minmax(220px, 1.6fr); gap: clamp(12px, 3vw, 40px); align-items: baseline; padding: clamp(18px, 2.4vw, 28px) 0; border-top: 1px solid var(--line, #ddd); }
.sm-row:last-child { border-bottom: 1px solid var(--line, #ddd); }
.sm-row-n { font-family: var(--label, inherit); font-size: 13px; color: var(--acc, currentColor); letter-spacing: 0.06em; }
.sm-row h3 { margin: 0; font-family: var(--display, inherit); font-weight: 500; font-size: clamp(20px, 2vw, 28px); letter-spacing: -0.015em; color: var(--ink, inherit); }
.sm-row p { margin: 0; color: var(--soft, #555); font-size: 16px; line-height: 1.55; max-width: 52ch; }
@media (max-width: 720px) { .sm-row { grid-template-columns: 40px 1fr; } .sm-row p { grid-column: 2; } }`;

export const BENTO_GRID_TSX = `import type { Feature } from './section-types';

/** Features as a bento grid: the first item leads, one tile carries the accent. */
export function BentoGrid({ items }: { items: Feature[] }) {
  if (!items?.length) return null;
  return (
    <section className="sm-bento" aria-label="What it does">
      {items.slice(0, 5).map((f, i) => (
        <article key={f.title} className={'sm-tile' + (i === 0 ? ' sm-tile-lead' : '') + (i === 1 ? ' sm-tile-acc' : '')}>
          <h3>{f.title}</h3>
          <p>{f.text}</p>
        </article>
      ))}
    </section>
  );
}
`;

export const BENTO_GRID_CSS = `.sm-bento { display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: minmax(160px, auto); gap: 12px; margin: clamp(32px, 6vw, 96px) clamp(20px, 5vw, 64px); }
.sm-tile { border-radius: 18px; padding: clamp(20px, 2.4vw, 32px); background: color-mix(in srgb, var(--ink, #111) 5%, var(--bg, #fff)); display: flex; flex-direction: column; justify-content: flex-end; gap: 8px; }
.sm-tile-lead { grid-column: span 2; grid-row: span 2; }
.sm-tile-acc { background: var(--acc, #333); color: var(--bg, #fff); }
.sm-tile h3 { margin: 0; font-family: var(--display, inherit); font-weight: 500; font-size: clamp(20px, 2vw, 28px); letter-spacing: -0.015em; }
.sm-tile-lead h3 { font-size: clamp(28px, 3.4vw, 48px); }
.sm-tile p { margin: 0; font-size: 15.5px; line-height: 1.5; opacity: 0.8; max-width: 44ch; }
@media (max-width: 720px) { .sm-bento { grid-template-columns: 1fr; } .sm-tile-lead { grid-column: auto; grid-row: auto; } }`;

export const SPEC_LIST_TSX = `import type { Feature, Fact } from './section-types';

/** A two-column spec sheet: dense, precise, for people who compare. */
export function SpecList({ items, facts }: { items: Feature[]; facts?: Fact[] }) {
  if (!items?.length) return null;
  return (
    <section className="sm-spec" aria-label="Specifications">
      <dl>
        {items.map((f) => (
          <div key={f.title}>
            <dt>{f.title}</dt>
            <dd>{f.text}</dd>
          </div>
        ))}
        {(facts ?? []).map((m) => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd className="sm-spec-v">{m.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
`;

export const SPEC_LIST_CSS = `.sm-spec { margin: clamp(32px, 6vw, 96px) clamp(20px, 5vw, 64px); }
.sm-spec dl { margin: 0; display: grid; grid-template-columns: repeat(2, 1fr); column-gap: clamp(24px, 4vw, 64px); }
.sm-spec dl > div { display: grid; grid-template-columns: minmax(120px, 0.8fr) 1.2fr; gap: 16px; padding: 14px 0; border-top: 1px solid var(--line, #ddd); }
.sm-spec dt { font-family: var(--label, inherit); font-size: 12.5px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--soft, #666); padding-top: 3px; }
.sm-spec dd { margin: 0; font-size: 15.5px; line-height: 1.5; color: var(--ink, inherit); }
.sm-spec-v { font-family: var(--label, inherit); font-size: 17px !important; }
@media (max-width: 720px) { .sm-spec dl { grid-template-columns: 1fr; } }`;

// ---------- closing call to action ----------

export const CLOSING_BAND_TSX = `/** A full-width closing band: one line and one button, on the ink colour. */
export function ClosingBand({ title, cta, href = '#start' }: { title: string; cta: string; href?: string }) {
  return (
    <section className="sm-closing" aria-label="Get started">
      <h2>{title}</h2>
      <a className="sm-closing-btn" href={href}>
        {cta} <span aria-hidden="true">→</span>
      </a>
    </section>
  );
}
`;

export const CLOSING_BAND_CSS = `.sm-closing { margin-top: clamp(48px, 8vw, 120px); padding: clamp(56px, 9vw, 140px) clamp(20px, 5vw, 64px); background: var(--ink, #111); color: var(--bg, #fff); display: flex; flex-wrap: wrap; gap: 28px; align-items: flex-end; justify-content: space-between; }
.sm-closing h2 { margin: 0; font-family: var(--display, inherit); font-weight: 400; font-size: clamp(36px, 5.2vw, 76px); line-height: 1; letter-spacing: -0.035em; max-width: 16ch; text-wrap: balance; }
.sm-closing-btn { display: inline-flex; align-items: center; gap: 10px; padding: 16px 26px; border-radius: 999px; background: var(--acc, #fff); color: var(--ink, #111); font-weight: 600; text-decoration: none; min-height: 44px; }
.sm-closing-btn span { transition: transform .2s cubic-bezier(.2, .7, .1, 1); }
.sm-closing-btn:hover span, .sm-closing-btn:focus-visible span { transform: translateX(4px); }
@media (prefers-reduced-motion: reduce) { .sm-closing-btn span { transition: none; } }`;

export const STICKY_BAR_TSX = `import { useEffect, useState } from 'react';

/** A slim bar that appears once the hero has scrolled away, so the next step is always in reach. */
export function StickyBar({ title, cta, href = '#start' }: { title: string; cta: string; href?: string }) {
  const [shown, setShown] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const on = () => setShown(window.scrollY > window.innerHeight * 0.6);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  if (closed) return null;
  return (
    <div className={'sm-sticky' + (shown ? ' is-shown' : '')} role="region" aria-label="Next step">
      <span>{title}</span>
      <a href={href}>{cta}</a>
      <button type="button" aria-label="Dismiss" onClick={() => setClosed(true)}>×</button>
    </div>
  );
}
`;

export const STICKY_BAR_CSS = `.sm-sticky { position: fixed; left: 50%; bottom: 18px; z-index: 50; display: flex; align-items: center; gap: 16px; padding: 8px 8px 8px 20px; border-radius: 999px; background: var(--ink, #111); color: var(--bg, #fff); box-shadow: 0 12px 40px rgba(0, 0, 0, .22); transform: translate(-50%, 140%); transition: transform .45s cubic-bezier(.2, .7, .1, 1); max-width: calc(100vw - 32px); }
.sm-sticky.is-shown, .sm-sticky.sm-force-open { transform: translate(-50%, 0); }
.sm-sticky span { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sm-sticky a { padding: 10px 18px; border-radius: 999px; background: var(--acc, #fff); color: var(--ink, #111); font-weight: 600; text-decoration: none; white-space: nowrap; min-height: 36px; display: inline-flex; align-items: center; }
.sm-sticky button { width: 32px; height: 32px; border-radius: 50%; border: 0; background: transparent; color: inherit; font-size: 18px; cursor: pointer; opacity: .7; }
@media (prefers-reduced-motion: reduce) { .sm-sticky { transition: none; } }`;

export const SPLIT_CTA_TSX = `/** Closing call to action in two columns: the claim on the left, the step on the right. */
export function SplitCta({ title, text, cta, href = '#start' }: { title: string; text?: string; cta: string; href?: string }) {
  return (
    <section className="sm-split" aria-label="Get started">
      <h2>{title}</h2>
      <div>
        {text ? <p>{text}</p> : null}
        <a className="sm-split-btn" href={href}>{cta}</a>
      </div>
    </section>
  );
}
`;

export const SPLIT_CTA_CSS = `.sm-split { margin: clamp(48px, 8vw, 120px) clamp(20px, 5vw, 64px); padding-top: clamp(32px, 5vw, 64px); border-top: 1px solid var(--ink, #111); display: grid; grid-template-columns: 1.3fr 1fr; gap: clamp(24px, 5vw, 80px); align-items: end; }
.sm-split h2 { margin: 0; font-family: var(--display, inherit); font-weight: 400; font-size: clamp(32px, 4.4vw, 64px); line-height: 1.02; letter-spacing: -0.03em; color: var(--ink, inherit); text-wrap: balance; }
.sm-split p { margin: 0 0 20px; color: var(--soft, #555); font-size: 16px; line-height: 1.55; max-width: 42ch; }
.sm-split-btn { display: inline-flex; align-items: center; padding: 15px 24px; border-radius: 10px; background: var(--ink, #111); color: var(--bg, #fff); font-weight: 600; text-decoration: none; min-height: 44px; }
@media (max-width: 720px) { .sm-split { grid-template-columns: 1fr; } }`;

const svg = (body: string) => `<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f3f2ee"/>${body}</svg>`;

export const SECTION_THUMBS: Record<string, string> = {
  'metric-strip': svg('<g fill="#141414"><rect x="4" y="9" width="10" height="6"/><rect x="19" y="9" width="10" height="6"/><rect x="34" y="9" width="10" height="6"/></g><g fill="#888"><rect x="4" y="18" width="8" height="2"/><rect x="19" y="18" width="8" height="2"/><rect x="34" y="18" width="8" height="2"/></g><path d="M4 6h40" stroke="#ccc" stroke-width=".5"/>'),
  'pull-quote': svg('<rect x="6" y="7" width="1.4" height="15" fill="#c2412d"/><g fill="#141414"><rect x="10" y="8" width="30" height="3"/><rect x="10" y="13" width="24" height="3"/></g><rect x="10" y="19" width="12" height="2" fill="#888"/>'),
  'fact-ticker': svg('<path d="M0 10h48M0 20h48" stroke="#ccc" stroke-width=".5"/><g fill="#141414"><rect x="-2" y="13" width="9" height="4"/><rect x="14" y="13" width="9" height="4"/><rect x="30" y="13" width="9" height="4"/><rect x="46" y="13" width="9" height="4"/></g>'),
  'numbered-rows': svg('<g stroke="#ccc" stroke-width=".5"><path d="M4 8h40M4 15h40M4 22h40"/></g><g fill="#c2412d"><rect x="4" y="10" width="3" height="2"/><rect x="4" y="17" width="3" height="2"/></g><g fill="#141414"><rect x="10" y="10" width="10" height="2.4"/><rect x="10" y="17" width="12" height="2.4"/></g><g fill="#999"><rect x="25" y="10" width="18" height="1.6"/><rect x="25" y="17" width="16" height="1.6"/></g>'),
  'bento-grid': svg('<rect x="4" y="4" width="25" height="22" rx="2" fill="#e2e0da"/><rect x="31" y="4" width="13" height="10" rx="2" fill="#141414"/><rect x="31" y="16" width="13" height="10" rx="2" fill="#e2e0da"/>'),
  'spec-list': svg('<g stroke="#ccc" stroke-width=".5"><path d="M4 8h18M4 14h18M4 20h18M26 8h18M26 14h18M26 20h18"/></g><g fill="#888"><rect x="4" y="10" width="6" height="1.5"/><rect x="4" y="16" width="6" height="1.5"/><rect x="26" y="10" width="6" height="1.5"/><rect x="26" y="16" width="6" height="1.5"/></g><g fill="#141414"><rect x="13" y="10" width="8" height="1.5"/><rect x="13" y="16" width="8" height="1.5"/><rect x="35" y="10" width="8" height="1.5"/><rect x="35" y="16" width="8" height="1.5"/></g>'),
  'closing-band': svg('<rect y="6" width="48" height="20" fill="#141414"/><g fill="#f3f2ee"><rect x="5" y="11" width="20" height="3.5"/><rect x="5" y="16" width="14" height="3.5"/></g><rect x="32" y="17" width="11" height="4" rx="2" fill="#c2412d"/>'),
  'sticky-bar': svg('<g fill="#ddd"><rect x="4" y="5" width="30" height="2"/><rect x="4" y="9" width="22" height="2"/></g><rect x="9" y="21" width="30" height="6" rx="3" fill="#141414"/><rect x="29" y="22.2" width="8" height="3.6" rx="1.8" fill="#c2412d"/>'),
  'split-cta': svg('<path d="M4 7h40" stroke="#141414" stroke-width=".7"/><g fill="#141414"><rect x="4" y="11" width="20" height="3.5"/><rect x="4" y="16" width="15" height="3.5"/></g><rect x="29" y="12" width="14" height="1.6" fill="#999"/><rect x="29" y="17" width="10" height="4" rx="1" fill="#141414"/>'),
};
