/* Hero entrance: one animation on load, nothing else. Variants: line rise, word stagger, blur in.
   Replays when the window receives `sitemaxxing:replay`. */

export const REVEAL_TSX = `import { useEffect, useRef, useState, type ReactNode } from 'react';

export type RevealVariant = 'rise' | 'words' | 'blur';

export function Reveal({ variant = 'rise', children, className }: { variant?: RevealVariant; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (variant === 'words') {
      const h = root.querySelector('h1');
      if (h && !h.querySelector('.reveal-word')) {
        const words = (h.textContent || '').split(' ');
        h.textContent = '';
        words.forEach((w, i) => {
          const s = document.createElement('span');
          s.className = 'reveal-word';
          s.style.setProperty('--i', String(i));
          s.textContent = w;
          h.appendChild(s);
          if (i < words.length - 1) h.appendChild(document.createTextNode(' '));
        });
      }
    }
    root.classList.remove('is-in');
    void root.offsetWidth;
    root.classList.add('is-in');
    const onReplay = () => setKey((k) => k + 1);
    window.addEventListener('sitemaxxing:replay', onReplay);
    return () => window.removeEventListener('sitemaxxing:replay', onReplay);
  }, [variant, key]);
  return <div ref={ref} className={'reveal reveal-' + variant + (className ? ' ' + className : '')} data-reveal-key={key}>{children}</div>;
}
`;

export const REVEAL_CSS = `.reveal > * { opacity: 0; }
.reveal.is-in > * { opacity: 1; }
.reveal-rise.is-in > * { animation: reveal-rise .9s cubic-bezier(.2, .7, .1, 1) both; }
.reveal-rise.is-in > *:nth-child(2) { animation-delay: .12s; }
.reveal-rise.is-in > *:nth-child(3) { animation-delay: .22s; }
.reveal-rise.is-in > *:nth-child(4) { animation-delay: .3s; }
.reveal-blur.is-in > * { animation: reveal-blur 1.1s ease both; }
.reveal-blur.is-in > *:nth-child(n+2) { animation: reveal-rise .9s .25s cubic-bezier(.2, .7, .1, 1) both; }
.reveal-words.is-in > * { animation: reveal-rise .9s .3s cubic-bezier(.2, .7, .1, 1) both; }
.reveal-words.is-in > h1 { animation: none; opacity: 1; }
.reveal-word { display: inline-block; opacity: 0; }
.reveal-words.is-in .reveal-word { animation: reveal-rise .7s cubic-bezier(.2, .7, .1, 1) both; animation-delay: calc(var(--i) * 70ms); }
@keyframes reveal-rise { from { opacity: 0; transform: translateY(28px); clip-path: inset(0 0 100% 0); } to { opacity: 1; transform: none; clip-path: inset(0 0 -20% 0); } }
@keyframes reveal-blur { from { opacity: 0; filter: blur(14px); letter-spacing: .06em; } to { opacity: 1; filter: none; } }
@media (prefers-reduced-motion: reduce) { .reveal > *, .reveal-word { animation: none !important; opacity: 1 !important; } }`;

export const REVEAL_THUMBS: Record<string, string> = {
  rise: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f6f4ef"/><rect x="6" y="9" width="30" height="4" fill="#1c2430"/><rect x="6" y="17" width="22" height="4" fill="#1c2430" opacity=".35"/><path d="M40 20v-9m-3 3 3-3 3 3" stroke="#2f5bea" fill="none"/></svg>',
  words: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f6f4ef"/><rect x="6" y="12" width="9" height="4" fill="#1c2430"/><rect x="17" y="13" width="9" height="4" fill="#1c2430" opacity=".6"/><rect x="28" y="14" width="9" height="4" fill="#1c2430" opacity=".3"/></svg>',
  blur: '<svg viewBox="0 0 48 30"><defs><filter id="bf"><feGaussianBlur stdDeviation="1.4"/></filter></defs><rect width="48" height="30" fill="#f6f4ef"/><rect x="6" y="12" width="34" height="5" fill="#1c2430" filter="url(#bf)"/></svg>',
};

export const ARROW_BUTTON_CSS: Record<'nudge' | 'disc', string> = {
  nudge: `.btn .arrow { display: inline-block; transition: transform .2s cubic-bezier(.2, .7, .1, 1); }
.btn:hover .arrow, .btn:focus-visible .arrow, .btn.sm-force-hover .arrow { transform: translateX(4px); }
.btn.sm-force-hover .arrow { animation: arrow-nudge 1s ease-in-out infinite; }
@keyframes arrow-nudge { 50% { transform: translateX(7px); } }
@media (prefers-reduced-motion: reduce) { .btn .arrow { transition: none; animation: none !important; } }`,
  disc: `.btn .arrow { width: 1.7em; height: 1.7em; border-radius: 50%; background: var(--btn-ink, currentColor); color: var(--btn-bg, var(--ink)); display: inline-grid; place-items: center; font-size: .9em; margin-left: .2em; transition: transform .22s cubic-bezier(.2, .7, .1, 1); }
.btn:hover .arrow, .btn:focus-visible .arrow, .btn.sm-force-hover .arrow { transform: rotate(-45deg); }
@media (prefers-reduced-motion: reduce) { .btn .arrow { transition: none; } }`,
};

export const ARROW_THUMBS: Record<string, string> = {
  nudge: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f6f4ef"/><rect x="8" y="10" width="32" height="11" rx="5.5" fill="#1c2430"/><path d="M27 15.5h8m-3-3 3 3-3 3" stroke="#fff" fill="none"/></svg>',
  disc: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f6f4ef"/><rect x="8" y="10" width="32" height="11" rx="5.5" fill="#1c2430"/><circle cx="33" cy="15.5" r="4" fill="#fff"/><path d="M31 17.5l4-4m-3 0h3v3" stroke="#1c2430" fill="none" stroke-width=".9"/></svg>',
};
