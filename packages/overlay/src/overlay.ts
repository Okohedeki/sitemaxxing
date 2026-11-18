/* Sitemaxxing overlay: injected into the target site by the Vite plugin during development.
   It never ships to production. It draws a corner pill with the Mog score, outlines the elements
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
.sm-flash { outline: 2px dashed #ff6b8b !important; outline-offset: 4px !important; }
.sm-tag { position: absolute; z-index: 2147483646; font: 500 11px/1 ui-monospace, "JetBrains Mono", Menlo, monospace; background: #ff6b8b; color: #1a0a10; padding: 4px 7px; border-radius: 5px; pointer-events: none; white-space: nowrap; transition: opacity .3s; }
.sm-caret::after { content: ""; display: inline-block; width: .06em; height: .9em; background: currentColor; margin-left: .04em; vertical-align: -.08em; animation: sm-blink .8s steps(1) infinite; }
.sm-strike { text-decoration: line-through; opacity: .55; }
@keyframes sm-blink { 50% { opacity: 0; } }
#sm-pill { position: fixed; right: 14px; bottom: 14px; z-index: 2147483647; display: flex; align-items: center; gap: 10px; background: rgba(12,13,16,.86); color: #eef0f4; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.08); border-radius: 999px; padding: 6px 12px 6px 6px; font: 500 12px/1 "Manrope", system-ui, sans-serif; box-shadow: 0 8px 30px rgba(0,0,0,.35); cursor: pointer; user-select: none; }
#sm-pill b { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: #ff6b8b; color: #1a0a10; font: 600 11px/1 ui-monospace, "JetBrains Mono", monospace; }
#sm-pill span { color: #8c93a1; }
#sm-pill span em { font-style: normal; color: #eef0f4; }
#sm-pill.sm-collapsed { padding: 6px; gap: 0; }
#sm-pill.sm-collapsed span { display: none; }
#sm-pill .sm-dot { width: 6px; height: 6px; border-radius: 50%; background: #3a404c; }
#sm-pill .sm-dot.on { background: #ff6b8b; box-shadow: 0 0 0 3px rgba(255,107,139,.2); }
@media (prefers-reduced-motion: reduce) { .sm-caret::after { animation: none; } .sm-tag { transition: none; } }
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
  let tags: HTMLElement[] = [];
  let flashed: Element[] = [];
  let forced: Element[] = [];
  let timers: number[] = [];
  const clearHighlights = () => {
    for (const el of flashed) el.classList.remove('sm-flash');
    for (const t of tags) t.remove();
    for (const el of forced) el.classList.remove('sm-force-open', 'sm-force-hover');
    for (const t of timers) clearTimeout(t);
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

  const flash = (els: Element[], label: string) => {
    const seen = new Set<Element>();
    for (const el of els.slice(0, 4)) {
      if (seen.has(el) || el.closest('[data-sitemaxxing-overlay]')) continue;
      seen.add(el);
      el.classList.add('sm-flash');
      flashed.push(el);
      const r = el.getBoundingClientRect();
      const tag = document.createElement('div');
      tag.className = 'sm-tag';
      tag.setAttribute('data-sitemaxxing-overlay', '');
      tag.textContent = label;
      tag.style.left = Math.max(6, r.left + scrollX) + 'px';
      tag.style.top = Math.max(6, r.top + scrollY - 24) + 'px';
      document.body.appendChild(tag);
      tags.push(tag);
      timers.push(
        window.setTimeout(() => {
          el.classList.remove('sm-flash');
          tag.style.opacity = '0';
          timers.push(window.setTimeout(() => tag.remove(), 300));
        }, 1400),
      );
    }
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
