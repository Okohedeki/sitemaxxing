/* Preloader: plays once on load, replays on a `sitemaxxing:replay` event, disappears instantly
   under reduced motion. Three variants: counter wipe, split curtain, image stack. */

export const PRELOADER_TSX = `import { useEffect, useRef, useState } from 'react';

export type PreloaderVariant = 'counter' | 'curtain' | 'stack';

export function Preloader({ variant = 'counter', brand = '' }: { variant?: PreloaderVariant; brand?: string }) {
  const [phase, setPhase] = useState<'idle' | 'in' | 'out'>('idle');
  const [n, setN] = useState(0);
  const timers = useRef<number[]>([]);
  const play = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setPhase('idle'); return; }
    setPhase('idle');
    requestAnimationFrame(() => {
      setPhase('in');
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / 1100);
        setN(Math.round(k * 100));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      timers.current.push(window.setTimeout(() => setPhase('out'), 1250));
      timers.current.push(window.setTimeout(() => setPhase('idle'), 2150));
    });
  };
  useEffect(() => {
    play();
    const onReplay = () => play();
    window.addEventListener('sitemaxxing:replay', onReplay);
    return () => { window.removeEventListener('sitemaxxing:replay', onReplay); timers.current.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);
  if (phase === 'idle') return null;
  return (
    <div className={'preloader preloader-' + variant + (phase === 'out' ? ' is-out' : '')} aria-hidden="true">
      {variant === 'counter' && <span className="preloader-n">{n}</span>}
      {variant === 'curtain' && (<><span className="preloader-l" /><span className="preloader-r" /><span className="preloader-logo">{brand}</span></>)}
      {variant === 'stack' && (<><span className="preloader-card" /><span className="preloader-card" /><span className="preloader-card" /></>)}
    </div>
  );
}
`;

export const PRELOADER_CSS = `.preloader { position: fixed; inset: 0; z-index: 90; pointer-events: none; overflow: hidden; }
.preloader-counter { background: var(--ink, #111); transition: transform .7s cubic-bezier(.7, 0, .2, 1); }
.preloader-counter .preloader-n { position: absolute; left: 4vw; bottom: 3vh; font: 400 clamp(72px, 14vw, 220px)/1 var(--display, serif); color: var(--bg, #fff); font-variant-numeric: tabular-nums; }
.preloader-counter.is-out { transform: translateY(-100%); }
.preloader-curtain .preloader-l, .preloader-curtain .preloader-r { position: absolute; top: 0; bottom: 0; width: 50.5%; background: var(--ink, #111); transition: transform .8s cubic-bezier(.7, 0, .2, 1); }
.preloader-curtain .preloader-l { left: 0; } .preloader-curtain .preloader-r { right: 0; }
.preloader-curtain .preloader-logo { position: absolute; inset: 0; display: grid; place-items: center; color: var(--bg, #fff); font: 400 clamp(24px, 3vw, 44px) var(--display, serif); transition: opacity .3s; }
.preloader-curtain.is-out .preloader-l { transform: translateX(-100%); } .preloader-curtain.is-out .preloader-r { transform: translateX(100%); } .preloader-curtain.is-out .preloader-logo { opacity: 0; }
.preloader-stack { background: var(--bg, #fff); transition: opacity .5s .3s; }
.preloader-stack .preloader-card { position: absolute; left: 50%; top: 50%; width: clamp(120px, 18vw, 260px); aspect-ratio: 3 / 4; margin: calc(clamp(120px, 18vw, 260px) * -0.66) 0 0 calc(clamp(120px, 18vw, 260px) * -0.5); border-radius: 12px; background: var(--acc, #333); animation: preloader-stackin .45s cubic-bezier(.2, .7, .1, 1) both; transition: transform .7s cubic-bezier(.7, 0, .2, 1); }
.preloader-stack .preloader-card:nth-of-type(1) { --r: -8deg; opacity: .55; } .preloader-stack .preloader-card:nth-of-type(2) { --r: 5deg; animation-delay: .25s; opacity: .8; } .preloader-stack .preloader-card:nth-of-type(3) { --r: 0deg; animation-delay: .5s; }
@keyframes preloader-stackin { from { opacity: 0; transform: translateY(40px) rotate(var(--r)) scale(.9); } to { transform: rotate(var(--r)); } }
.preloader-stack.is-out { opacity: 0; } .preloader-stack.is-out .preloader-card { transform: scale(2.6); }
@media (prefers-reduced-motion: reduce) { .preloader { display: none; } }`;

export const PRELOADER_THUMBS: Record<string, string> = {
  counter: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#0f1d33"/><text x="5" y="25" font-size="13" fill="#fff" font-family="Georgia">72</text></svg>',
  curtain: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f6f4ef"/><rect width="17" height="30" fill="#0f1d33"/><rect x="31" width="17" height="30" fill="#0f1d33"/></svg>',
  stack:
    '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#f6f4ef"/><rect x="15" y="6" width="12" height="17" fill="#8fa9c8" transform="rotate(-8 21 14)"/><rect x="20" y="6" width="12" height="17" fill="#c7d3df" transform="rotate(6 26 14)"/><rect x="18" y="7" width="12" height="17" fill="#7f9bbd"/></svg>',
};
