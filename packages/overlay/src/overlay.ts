/* Sitemaxxing overlay: injected into the target site by the Vite plugin during development.
   It never ships to production. It draws a corner pill with the Mog score, circles the elements
   a pass changed, types new copy in letter by letter, and forces open/hover states on request. */

import type { HubEvent, CopyChange } from '@sitemaxxing/core/protocol';

(() => {
  if ((window as any).__sitemaxxingOverlay) return;
  (window as any).__sitemaxxingOverlay = true;

  const script = document.currentScript as HTMLScriptElement | null;
  const hubOrigin = (() => {
    try {
      return new URL(script?.src ?? 'http://localhost:3333/overlay.js').origin;
    } catch {
      return 'http://localhost:3333';
    }
  })();
  const wsUrl = hubOrigin.replace(/^http/, 'ws') + '/live';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- styles ----------
  const style = document.createElement('style');
  style.setAttribute('data-sitemaxxing-overlay', '');
  style.textContent = `
.sm-ring { position: absolute; z-index: 2147483645; box-sizing: border-box; padding: 2.5px; background: conic-gradient(from 200deg, #ff3d63, #ff8a1f, #ffd83b, #34e07a, #2fa6ff, #9a6bff, #ff3d63); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); border-radius: 46% 54% 48% 52% / 56% 44% 56% 44%; pointer-events: none; transform: rotate(-0.8deg); filter: drop-shadow(0 0 6px rgba(255,150,40,.75)); animation: sm-draw .5s cubic-bezier(.22,1,.36,1) both; }
.sm-tag { position: absolute; z-index: 2147483646; font: 700 11px/1.2 "Archivo", system-ui, sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #ffc36b; background: rgba(9,9,12,.92); padding: 6px 10px; border-radius: 6px; box-shadow: 0 0 0 1px rgba(255,255,255,.1), 0 0 24px -6px rgba(255,150,40,.55), 0 10px 24px -10px rgba(0,0,0,.8); pointer-events: none; white-space: nowrap; animation: sm-note .35s .2s ease both; }
@keyframes sm-draw { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes sm-note { from { opacity: 0; transform: translateY(4px); } }
.sm-caret::after { content: ""; display: inline-block; width: .06em; height: .9em; background: currentColor; margin-left: .04em; vertical-align: -.08em; animation: sm-blink .8s steps(1) infinite; }
.sm-strike { text-decoration: line-through; opacity: .55; }
@keyframes sm-blink { 50% { opacity: 0; } }
#sm-pill { position: fixed; right: 14px; bottom: 14px; z-index: 2147483647; display: flex; align-items: center; gap: 10px; background: rgba(9,9,12,.9); color: #f7f3ec; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 6px 12px 6px 6px; font: 500 12px/1 system-ui, sans-serif; box-shadow: 0 10px 26px -12px rgba(0,0,0,.8); cursor: pointer; user-select: none; }
#sm-pill b { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #f7f3ec; color: #09090c; font: 600 11px/1 ui-monospace, "JetBrains Mono", monospace; }
#sm-pill span { color: #a3a3ad; }
#sm-pill span em { font-style: normal; color: #f7f3ec; }
#sm-pill.sm-collapsed { padding: 6px; gap: 0; }
#sm-pill.sm-collapsed span { display: none; }
#sm-pill .sm-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.24); }
#sm-pill .sm-dot.on { background: #ff9a2e; box-shadow: 0 0 8px #ff9a2e; }
@media (prefers-reduced-motion: reduce) { .sm-caret::after, .sm-ring, .sm-tag { animation: none; } }
`;
  document.head.appendChild(style);

  // ---------- pill ----------
  const pill = document.createElement('div');
  pill.id = 'sm-pill';
  pill.setAttribute('data-sitemaxxing-overlay', '');
  pill.innerHTML = `<b>–</b><span><em>Sitemaxxing</em> · connecting</span><i class="sm-dot"></i>`;
  pill.title = 'Sitemaxxing overlay: click to collapse';
  pill.addEventListener('click', () => pill.classList.toggle('sm-collapsed'));
  document.body.appendChild(pill);
  const setPill = (score: number | null, text: string, live: boolean) => {
    pill.querySelector('b')!.textContent = score === null ? '–' : String(score);
    pill.querySelector('span')!.innerHTML = `<em>Mog ${score ?? '–'}</em> · ${text}`;
    pill.querySelector('.sm-dot')!.classList.toggle('on', live);
  };
  (window as any).__sitemaxxingHide = () => {
    pill.style.display = 'none';
    clearHighlights();
  };
  (window as any).__sitemaxxingShow = () => {
    pill.style.display = '';
  };

  // ---------- highlights ----------
  // A change is circled like a proofreader would: a red ring around what changed and a short note
  // beside it. The marks stay while the change is previewed and follow the layout as it settles.
  let tags: HTMLElement[] = [];
  let flashed: Element[] = [];
  let forced: Element[] = [];
  let timers: number[] = [];
  let marks: Array<{ el: Element; ring: HTMLElement; tag: HTMLElement | null }> = [];
  let follow = 0;
  const clearHighlights = () => {
    for (const m of marks) m.ring.remove();
    for (const t of tags) t.remove();
    for (const el of forced) el.classList.remove('sm-force-open', 'sm-force-hover');
    for (const t of timers) clearTimeout(t);
    if (follow) clearInterval(follow);
    follow = 0;
    marks = [];
    flashed = [];
    tags = [];
    forced = [];
    timers = [];
  };

  const waitFor = (selectors: string[], ms = 1600): Promise<Element[]> =>
    new Promise((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const els = selectors.flatMap((s) => {
          try {
            return Array.from(document.querySelectorAll(s));
          } catch {
            return [];
          }
        });
        const visible = els.filter((e) => (e as HTMLElement).offsetParent !== null || getComputedStyle(e).position === 'fixed');
        if (visible.length || Date.now() - t0 > ms) resolve(visible);
        else setTimeout(tick, 90);
      };
      tick();
    });

  const place = (m: { el: Element; ring: HTMLElement; tag: HTMLElement | null }) => {
    const r = m.el.getBoundingClientRect();
    const pad = Math.min(14, Math.max(6, r.height * 0.12));
    const docW = document.documentElement.clientWidth;
    const left = Math.max(4, r.left + scrollX - pad);
    const right = Math.min(docW + scrollX - 4, r.right + scrollX + pad);
    m.ring.style.left = left + 'px';
    m.ring.style.top = Math.max(4, r.top + scrollY - pad) + 'px';
    m.ring.style.width = Math.max(24, right - left) + 'px';
    m.ring.style.height = r.height + pad * 2 + 'px';
    // An ellipse suits a word or a block; around a whole section it would cut corners off, so big
    // targets get a softer rectangle that still reads as hand-marked.
    const big = r.height > innerHeight * 0.45 || r.width > docW * 0.85;
    m.ring.style.borderRadius = big ? '18px 22px 16px 24px' : '';
    m.ring.style.transform = big ? 'rotate(-0.25deg)' : '';
    if (m.tag) {
      const w = m.tag.offsetWidth;
      m.tag.style.left = Math.max(6, Math.min(docW + scrollX - w - 6, left + 10)) + 'px';
      m.tag.style.top = Math.max(6, r.top + scrollY - pad - 30) + 'px';
    }
  };

  const flash = (els: Element[], label: string) => {
    const seen = new Set<Element>();
    for (const el of els.slice(0, 3)) {
      if (seen.has(el) || el.closest('[data-sitemaxxing-overlay]')) continue;
      seen.add(el);
      flashed.push(el);
      const ring = document.createElement('div');
      ring.className = 'sm-ring';
      ring.setAttribute('data-sitemaxxing-overlay', '');
      document.body.appendChild(ring);
      let tag: HTMLElement | null = null;
      if (!marks.length) {
        tag = document.createElement('div');
        tag.className = 'sm-tag';
        tag.setAttribute('data-sitemaxxing-overlay', '');
        tag.textContent = label;
        document.body.appendChild(tag);
        tags.push(tag);
      }
      const m = { el, ring, tag };
      marks.push(m);
      place(m);
    }
    if (marks.length && !follow) follow = window.setInterval(() => marks.forEach(place), 200);
  };

  const force = (selector: string, state: 'open' | 'hover') => {
    const cls = state === 'open' ? 'sm-force-open' : 'sm-force-hover';
    waitFor(selector.split(',').map((s) => s.trim())).then((els) => {
      for (const el of els.slice(0, 3)) {
        el.classList.add(cls);
        forced.push(el);
      }
    });
  };

  // ---------- typewriter ----------
  const textTarget = (el: Element): Element => {
    const inner = Array.from(el.children).find((c) => !c.classList.contains('arrow') && (c.textContent || '').trim().length > 0 && c.tagName !== 'SVG');
    return el.children.length && inner && el.children.length > 1 ? inner : el;
  };
  const typeInto = (el: Element, text: string, speed: number) => {
    if (reduced()) {
      el.textContent = text;
      return;
    }
    el.classList.add('sm-caret');
    el.textContent = '';
    let i = 0;
    const tick = () => {
      el.textContent = text.slice(0, ++i);
      if (i < text.length) timers.push(window.setTimeout(tick, speed));
      else el.classList.remove('sm-caret');
    };
    tick();
  };
  const speedFor = (key: string, selector: string) => (/headline|h1|title/.test(key + selector) ? 30 : /cta|button|btn/.test(key + selector) ? 40 : 10);
  const typewriter = async (changes: CopyChange[]) => {
    for (const c of changes) {
      if (!c.selector) continue;
      const els = await waitFor([c.selector], 2000);
      const el = els[0];
      if (!el) continue;
      const target = textTarget(el);
      if (reduced()) continue; // the hot reload already swapped the text
      const current = (target.textContent || '').trim();
      // Wait until the hot reload landed the new copy, then replay old → new.
      const t0 = Date.now();
      while ((target.textContent || '').trim() !== c.new.trim() && Date.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 80));
      target.textContent = c.old;
      target.classList.add('sm-strike');
      await new Promise((r) => setTimeout(r, 420));
      target.classList.remove('sm-strike');
      typeInto(target, c.new, speedFor(c.key, c.selector));
      void current;
    }
  };

  // ---------- socket ----------
  let projectId: string | null = null;
  let score: number | null = null;
  let ws: WebSocket | null = null;
  let retry = 0;
  const connect = () => {
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return;
    }
    ws.addEventListener('open', () => {
      retry = 0;
      setPill(score, 'ready', false);
      ws!.send(JSON.stringify({ type: 'overlay.hello', url: location.href }));
    });
    ws.addEventListener('close', () => {
      setPill(score, 'hub offline', false);
      setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
    });
    ws.addEventListener('message', (m) => {
      let ev: HubEvent;
      try {
        ev = JSON.parse(m.data);
      } catch {
        return;
      }
      if (ev.type === 'hello') {
        const mine = ev.projects.find((p) => {
          try {
            return new URL(p.devUrl).origin === location.origin;
          } catch {
            return false;
          }
        });
        projectId = mine?.id ?? (ev.projects.length === 1 ? ev.projects[0].id : null);
        return;
      }
      if (projectId && ev.projectId && ev.projectId !== projectId) return;
      switch (ev.type) {
        case 'state':
          if (ev.state.score) score = ev.state.score.score;
          setPill(score, ev.state.previewing ? `previewing <em>${ev.state.passes.find((p) => p.id === ev.state.previewing!.passId)?.name ?? ''}</em>` : `v${ev.state.currentVersion}`, !!ev.state.previewing);
          break;
        case 'score.updated':
          score = ev.score;
          setPill(score, `v updated ${ev.delta >= 0 ? '+' : ''}${ev.delta}`, false);
          break;
        case 'pass.previewed': {
          clearHighlights();
          setPill(score, `previewing <em>${ev.label}</em>`, true);
          waitFor(ev.selectors).then((els) => {
            flash(els, ev.label);
            if (ev.replay) window.dispatchEvent(new CustomEvent('sitemaxxing:replay'));
          });
          if (ev.forceState) force(ev.forceState.selector, ev.forceState.state);
          if (ev.copyDiff?.length) typewriter(ev.copyDiff);
          break;
        }
        case 'preview.ended':
          clearHighlights();
          setPill(score, 'ready', false);
          break;
        case 'copy.changed':
          typewriter([{ key: ev.key, old: ev.old, new: ev.new, selector: ev.selector }]);
          break;
        case 'pass.reported':
          clearHighlights();
          waitFor(ev.selectors).then((els) => flash(els, ev.name));
          break;
        case 'version.committed':
          score = ev.score;
          setPill(score, `v${ev.number} committed`, false);
          break;
        default:
          break;
      }
    });
  };
  connect();
})();
