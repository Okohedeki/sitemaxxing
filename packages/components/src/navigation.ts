/* Navigation variants: preview tiles, fullscreen reveal (circle / curtain / split), side drawer.
   Each component supports a forced-open state through the `sm-force-open` class the overlay
   toggles on the root element. */

export const NAV_TYPES_TSX = `export interface NavLink { label: string; href: string; blurb?: string; index?: string }`;

export const REVEAL_NAV_TSX = `import { useEffect, useState } from 'react';
import type { NavLink } from './nav-types';

export type RevealAnimation = 'circle' | 'curtain' | 'split';

export function RevealNav({ links, animation = 'circle', aside }: { links: NavLink[]; animation?: RevealAnimation; aside?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={'reveal-nav reveal-' + animation + (open ? ' is-open' : '')}>
      <button type="button" className="reveal-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{open ? 'Close' : 'Menu'}</span><b aria-hidden="true" />
      </button>
      <div className="reveal-panel" aria-hidden={!open}>
        <nav className="reveal-links">
          {links.map((l, i) => (
            <a key={l.label} href={l.href} onClick={() => setOpen(false)}><small>{String(i + 1).padStart(2, '0')}</small>{l.label}</a>
          ))}
        </nav>
        {aside ? <aside className="reveal-aside">{aside}</aside> : null}
      </div>
    </div>
  );
}
`;

export const REVEAL_NAV_CSS = `.reveal-nav { margin-left: auto; position: static; }
.reveal-toggle { display: inline-flex; align-items: center; gap: 10px; border: 0; background: none; font: 500 14px var(--label, inherit); color: var(--ink); letter-spacing: .02em; padding: 8px 0; cursor: pointer; position: relative; z-index: 8; }
.reveal-toggle b { width: 34px; height: 34px; border-radius: 50%; background: var(--ink); display: inline-block; position: relative; }
.reveal-toggle b::before, .reveal-toggle b::after { content: ""; position: absolute; left: 28%; right: 28%; height: 1.5px; background: var(--bg); top: 42%; }
.reveal-toggle b::after { top: 56%; }
.reveal-panel { position: fixed; inset: 0; z-index: 7; background: var(--ink); color: var(--bg); display: grid; grid-template-columns: 1.4fr 1fr; padding: clamp(96px, 12vw, 160px) clamp(20px, 5vw, 64px) clamp(32px, 5vw, 64px); gap: 40px; pointer-events: none; visibility: hidden; transition: clip-path .8s cubic-bezier(.7, 0, .2, 1), visibility 0s .8s; }
.reveal-circle .reveal-panel { clip-path: circle(0% at 96% 4%); }
.reveal-curtain .reveal-panel { clip-path: inset(0 0 100% 0); transition-duration: .75s; }
.reveal-split .reveal-panel { clip-path: inset(0 50% 0 50%); transition-duration: .7s; }
.reveal-nav.is-open .reveal-panel, .reveal-nav.sm-force-open .reveal-panel { visibility: visible; pointer-events: auto; transition: clip-path .8s cubic-bezier(.7, 0, .2, 1); }
.reveal-circle.is-open .reveal-panel, .reveal-circle.sm-force-open .reveal-panel { clip-path: circle(150% at 96% 4%); }
.reveal-curtain.is-open .reveal-panel, .reveal-curtain.sm-force-open .reveal-panel { clip-path: inset(0 0 0 0); }
.reveal-split.is-open .reveal-panel, .reveal-split.sm-force-open .reveal-panel { clip-path: inset(0 0 0 0); }
.reveal-links { display: flex; flex-direction: column; gap: 6px; }
.reveal-links a { font: 400 clamp(36px, 5.4vw, 80px)/1.05 var(--display, inherit); letter-spacing: -.025em; display: flex; gap: 18px; align-items: baseline; color: inherit; text-decoration: none; }
.reveal-links a small { font: 400 13px var(--label, inherit); opacity: .55; letter-spacing: .06em; }
.reveal-nav.is-open .reveal-links a, .reveal-nav.sm-force-open .reveal-links a { animation: reveal-up .7s .25s cubic-bezier(.2, .7, .1, 1) both; }
.reveal-nav.is-open .reveal-links a:nth-child(2), .reveal-nav.sm-force-open .reveal-links a:nth-child(2) { animation-delay: .31s; }
.reveal-nav.is-open .reveal-links a:nth-child(3), .reveal-nav.sm-force-open .reveal-links a:nth-child(3) { animation-delay: .37s; }
.reveal-nav.is-open .reveal-links a:nth-child(4), .reveal-nav.sm-force-open .reveal-links a:nth-child(4) { animation-delay: .43s; }
.reveal-nav.is-open .reveal-toggle, .reveal-nav.sm-force-open .reveal-toggle { color: var(--bg); }
.reveal-nav.is-open .reveal-toggle b, .reveal-nav.sm-force-open .reveal-toggle b { background: var(--bg); }
.reveal-nav.is-open .reveal-toggle b::before, .reveal-nav.is-open .reveal-toggle b::after, .reveal-nav.sm-force-open .reveal-toggle b::before, .reveal-nav.sm-force-open .reveal-toggle b::after { background: var(--ink); }
.reveal-aside { align-self: end; font: 400 15px/1.6 var(--label, inherit); opacity: .7; display: grid; gap: 24px; }
@keyframes reveal-up { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .reveal-panel, .reveal-links a { transition: none !important; animation: none !important; } }`;

export const NAV_TILES_TSX = `import type { NavLink } from './nav-types';

/** A hover dropdown that previews each destination with a small art tile and a one-line blurb. */
export function NavTiles({ label, items }: { label: string; items: NavLink[] }) {
  return (
    <li className="nav-tiles">
      <span className="nav-tiles-label">{label} <i aria-hidden="true">▾</i></span>
      <div className="nav-tiles-panel" role="menu">
        {items.map((it, i) => (
          <a key={it.label} href={it.href} role="menuitem" className="nav-tile" style={{ ['--tile' as string]: i }}>
            <span className="nav-tile-art" aria-hidden="true" />
            <span className="nav-tile-name">{it.label}</span>
            {it.blurb ? <span className="nav-tile-blurb">{it.blurb}</span> : null}
          </a>
        ))}
      </div>
    </li>
  );
}
`;

export const NAV_TILES_CSS = `.nav-tiles { position: relative; }
.nav-tiles-label { cursor: default; }
.nav-tiles-panel { position: absolute; top: calc(100% + 14px); left: -12px; width: min(640px, 70vw); display: none; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 14px; background: var(--bg); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 18px 50px rgba(0, 0, 0, .14); z-index: 9; text-transform: none; letter-spacing: 0; font-weight: 400; }
.nav-tiles:hover .nav-tiles-panel, .nav-tiles:focus-within .nav-tiles-panel, .nav-tiles.sm-force-open .nav-tiles-panel { display: grid; }
.nav-tile { display: grid; gap: 6px; text-decoration: none; color: inherit; font-size: 14px; border-radius: 8px; }
.nav-tile-art { display: block; aspect-ratio: 4 / 3; border-radius: 8px; background: linear-gradient(160deg, color-mix(in srgb, var(--acc) 55%, var(--bg)), color-mix(in srgb, var(--acc) 85%, var(--ink))); position: relative; overflow: hidden; }
.nav-tile-art::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 28%; background: var(--ink); opacity: .35; clip-path: polygon(0 60%, 25% 20%, 45% 50%, 65% 10%, 100% 55%, 100% 100%, 0 100%); }
.nav-tile-name { font-weight: 500; }
.nav-tile-blurb { color: var(--soft, inherit); font-size: 12.5px; }`;

export const NAV_DRAWER_TSX = `import { useEffect, useState } from 'react';
import type { NavLink } from './nav-types';

export function NavDrawer({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={'nav-drawer' + (open ? ' is-open' : '')}>
      <button type="button" className="nav-drawer-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{open ? 'Close' : 'Menu'}</span><b aria-hidden="true" />
      </button>
      <div className="nav-drawer-scrim" onClick={() => setOpen(false)} />
      <aside className="nav-drawer-panel" aria-hidden={!open}>
        {links.map((l) => (<a key={l.label} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>))}
        <span className="nav-drawer-art" aria-hidden="true" />
      </aside>
    </div>
  );
}
`;

export const NAV_DRAWER_CSS = `.nav-drawer { margin-left: auto; }
.nav-drawer-toggle { display: inline-flex; align-items: center; gap: 10px; border: 0; background: none; font: 500 14px var(--label, inherit); color: var(--ink); padding: 8px 0; cursor: pointer; position: relative; z-index: 12; }
.nav-drawer-toggle b { width: 34px; height: 34px; border-radius: 50%; background: var(--ink); display: inline-block; position: relative; }
.nav-drawer-toggle b::before, .nav-drawer-toggle b::after { content: ""; position: absolute; left: 28%; right: 28%; height: 1.5px; background: var(--bg); top: 42%; }
.nav-drawer-toggle b::after { top: 56%; }
.nav-drawer-scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .35); opacity: 0; pointer-events: none; transition: opacity .4s; z-index: 10; }
.nav-drawer-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 85vw); background: var(--bg); color: var(--ink); z-index: 11; box-shadow: -24px 0 60px rgba(0, 0, 0, .22); transform: translateX(105%); transition: transform .55s cubic-bezier(.2, .7, .1, 1); padding: clamp(48px, 8vh, 96px) clamp(24px, 3vw, 40px); display: flex; flex-direction: column; gap: 14px; }
.nav-drawer-panel a { font: 400 clamp(28px, 2.8vw, 40px)/1.1 var(--display, inherit); color: inherit; text-decoration: none; border-bottom: 1px solid var(--line); padding-bottom: 12px; }
.nav-drawer-art { margin-top: auto; display: block; aspect-ratio: 5 / 3; border-radius: 12px; background: linear-gradient(160deg, color-mix(in srgb, var(--acc) 50%, var(--bg)), var(--acc)); }
.nav-drawer.is-open .nav-drawer-panel, .nav-drawer.sm-force-open .nav-drawer-panel { transform: none; }
.nav-drawer.is-open .nav-drawer-scrim, .nav-drawer.sm-force-open .nav-drawer-scrim { opacity: 1; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) { .nav-drawer-panel, .nav-drawer-scrim { transition: none !important; } }`;

export const NAV_THUMBS: Record<string, string> = {
  tiles:
    '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f6f4ef"/><rect x="4" y="6" width="40" height="18" rx="2" fill="#fff" stroke="#ddd"/><rect x="7" y="9" width="10" height="9" fill="#9cb7d6"/><rect x="19" y="9" width="10" height="9" fill="#c7d3df"/><rect x="31" y="9" width="10" height="9" fill="#7f9bbd"/></svg>',
  'fullscreen-circle': '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#e8e7e2"/><circle cx="44" cy="3" r="30" fill="#121212"/></svg>',
  'fullscreen-curtain': '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#e8e7e2"/><rect width="48" height="19" fill="#121212"/></svg>',
  'fullscreen-split': '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#e8e7e2"/><rect x="12" width="24" height="30" fill="#121212"/></svg>',
  drawer:
    '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#c9d4e2"/><rect x="30" width="18" height="30" fill="#fff"/><rect x="33" y="6" width="11" height="2" fill="#1c2430"/><rect x="33" y="11" width="9" height="2" fill="#1c2430"/><rect x="33" y="16" width="12" height="2" fill="#1c2430"/></svg>',
};
