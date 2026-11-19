/* Hero art: one canvas component with five original modes. Density, speed and a shape seed are
   props, so the Hero art pass can vary them with noise. Colour comes from --dot. */

export const HERO_FIELD_TSX = `import { useEffect, useRef } from 'react';

export type HeroFieldMode = 'morph' | 'globe' | 'wave' | 'contour' | 'orbits';

interface Props {
  mode?: HeroFieldMode;
  /** 0.5 sparse .. 1.5 dense */
  density?: number;
  /** 0.5 slow .. 1.5 fast */
  speed?: number;
  /** Varies shapes and phases. */
  seed?: number;
  className?: string;
}

const STEP = 0.075;

function sample(kind: 'disc' | 'drop' | 'leaf' | 'rows', step: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let y = -1; y <= 1.001; y += step) {
    for (let x = -1; x <= 1.001; x += step) {
      let inside = false;
      if (kind === 'disc') inside = x * x + y * y < 0.78;
      if (kind === 'leaf') {
        const a = -0.6;
        const rx = x * Math.cos(a) - y * Math.sin(a);
        const ry = x * Math.sin(a) + y * Math.cos(a);
        inside = Math.abs(rx) < 0.5 * Math.cos((ry * Math.PI) / 2) && Math.abs(ry) < 0.98;
      }
      if (kind === 'rows') inside = Math.abs(y) < 0.8 && Math.abs(x) < 0.9 && Math.round((y + 1) / step) % 3 !== 2;
      if (kind === 'drop') {
        const yy = y + 0.15;
        inside = (x * x + yy * yy < 0.42 && yy > -0.1) || (Math.abs(x) < 0.65 * (yy + 0.95) && yy < 0 && yy > -0.95);
      }
      if (inside) pts.push([x, y]);
    }
  }
  return pts;
}

function prng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Dot { x: number; y: number; tx: number; ty: number; a: number; ta: number; s: number }

export function HeroField({ mode = 'morph', density = 1, speed = 1, seed = 1, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cx = cv.getContext('2d');
    if (!cx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rand = prng(seed);
    const step = STEP / Math.sqrt(Math.max(0.4, density));
    const shapes = (['disc', 'drop', 'leaf', 'rows'] as const).map((k) => sample(k, step));
    const order = [0, 1, 2, 3].sort(() => rand() - 0.5);
    const count = Math.round(520 * density);
    const mouse = { x: -9, y: -9 };
    const dots: Dot[] = Array.from({ length: count }, () => ({ x: 0, y: 0, tx: 0, ty: 0, a: 1, ta: 1, s: rand() }));
    const phases = Array.from({ length: 24 }, () => rand() * Math.PI * 2);
    let shapeIx = 0;
    let shapeT = 0;
    const assign = (ix: number, snap: boolean) => {
      const pts = shapes[order[ix]];
      dots.forEach((d, i) => {
        const p = pts[i % pts.length];
        d.tx = p[0]; d.ty = p[1]; d.ta = i < pts.length ? 1 : 0;
        if (snap) { d.x = d.tx; d.y = d.ty; d.a = d.ta; }
      });
    };
    assign(0, true);
    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
    };
    resize();
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouse.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    const onLeave = () => { mouse.x = -9; mouse.y = -9; };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', resize);
    let raf = 0;
    let last = 0;
    let tick = 0;
    let color = '#111';
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, now - (last || now));
      last = now;
      if (tick++ % 30 === 0) color = getComputedStyle(cv).getPropertyValue('--dot').trim() || getComputedStyle(cv).color;
      const W = cv.width, H = cv.height, S = Math.min(W, H) * 0.46, ox = W / 2, oy = H / 2, R = Math.max(1.2, S / 70);
      const t = reduced ? 0 : (now / 1000) * speed;
      cx.clearRect(0, 0, W, H);
      cx.fillStyle = color;
      cx.strokeStyle = color;
      if (mode === 'morph') {
        shapeT += dt * speed;
        if (shapeT > 2600 && !reduced) { shapeT = 0; shapeIx = (shapeIx + 1) % shapes.length; assign(shapeIx, false); }
        for (const d of dots) {
          d.x += (d.tx - d.x) * (0.06 + d.s * 0.05);
          d.y += (d.ty - d.y) * (0.06 + d.s * 0.05);
          d.a += (d.ta - d.a) * 0.08;
          let px = d.x, py = d.y;
          const mx = px - mouse.x, my = py - mouse.y, md = mx * mx + my * my;
          if (md < 0.09) { const f = (0.09 - md) * 2.2; px += mx * f; py += my * f; }
          if (d.a < 0.02) continue;
          cx.globalAlpha = d.a;
          cx.beginPath(); cx.arc(ox + px * S, oy + py * S, R, 0, 6.283); cx.fill();
        }
      } else if (mode === 'globe') {
        const rot = reduced ? 0.6 : t * 0.35;
        for (let i = 0; i < count; i++) {
          const y = 1 - (i / (count - 1)) * 2;
          const rr = Math.sqrt(1 - y * y);
          const th = i * 2.39996 + rot;
          const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
          const k = (z + 1.4) / 2.4;
          cx.globalAlpha = 0.15 + 0.85 * (z > 0 ? k : k * 0.35);
          cx.beginPath(); cx.arc(ox + x * S * 0.95, oy + y * S * 0.95, R * (0.5 + k * 0.8), 0, 6.283); cx.fill();
        }
      } else if (mode === 'wave') {
        const cols = Math.round(34 * Math.sqrt(density)), rows = Math.round(15 * Math.sqrt(density)), ph = t * 1.6;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const u = (i / (cols - 1)) * 2 - 1, v = (j / (rows - 1)) * 2 - 1;
          const px = u * 1.05;
          let py = v * 0.62 + Math.sin(u * 3.2 + ph + v * 1.6 + phases[0]) * 0.1;
          const mx = px - mouse.x, my = py - mouse.y, md = mx * mx + my * my;
          if (md < 0.06) py -= (0.06 - md) * 3;
          const z = (Math.sin(u * 3.2 + ph + v * 1.6 + phases[0]) + 1) / 2;
          cx.globalAlpha = 0.25 + z * 0.75;
          cx.beginPath(); cx.arc(ox + px * S, oy + py * S, R * (0.6 + z * 0.6), 0, 6.283); cx.fill();
        }
      } else if (mode === 'contour') {
        // Stacked elevation lines; the pointer raises a hill the lines bend around.
        const lines = Math.round(16 * density);
        cx.lineWidth = Math.max(1, R * 0.55);
        for (let k = 0; k < lines; k++) {
          const base = -0.85 + (1.7 * k) / (lines - 1);
          cx.globalAlpha = 0.25 + 0.75 * (1 - Math.abs(base));
          cx.beginPath();
          for (let s = 0; s <= 90; s++) {
            const u = -1.05 + (2.1 * s) / 90;
            let v = base + Math.sin(u * 2.1 + phases[k % 24] + t * 0.4) * 0.05 + Math.sin(u * 5.3 + phases[(k + 7) % 24] - t * 0.25) * 0.02;
            const mx = u - mouse.x, my = v - mouse.y, md = mx * mx + my * my;
            v -= Math.exp(-md / 0.05) * 0.18 * Math.sign(my || 1);
            const X = ox + u * S * 1.1, Y = oy + v * S;
            if (s === 0) cx.moveTo(X, Y); else cx.lineTo(X, Y);
          }
          cx.stroke();
        }
      } else {
        // Orbits: tilted rings with a few bodies each; the pointer tilts the system.
        const rings = Math.max(3, Math.round(7 * density));
        const tilt = 0.32 + (mouse.y > -2 ? mouse.y * 0.18 : 0);
        cx.lineWidth = Math.max(1, R * 0.4);
        for (let i = 1; i <= rings; i++) {
          const rx = (S * 1.05 * i) / rings, ry = rx * tilt;
          cx.globalAlpha = 0.18;
          cx.beginPath(); cx.ellipse(ox, oy, rx, ry, -0.35, 0, 6.283); cx.stroke();
          const bodies = 1 + (i % 3);
          for (let b = 0; b < bodies; b++) {
            const th = phases[(i * 3 + b) % 24] + t * (0.9 / i) * (b % 2 ? -1 : 1);
            const x = Math.cos(th) * rx, y = Math.sin(th) * ry;
            const xr = x * Math.cos(-0.35) - y * Math.sin(-0.35), yr = x * Math.sin(-0.35) + y * Math.cos(-0.35);
            cx.globalAlpha = 0.9;
            cx.beginPath(); cx.arc(ox + xr, oy + yr, R * (1.1 + (b === 0 ? 0.9 : 0)), 0, 6.283); cx.fill();
          }
        }
        cx.globalAlpha = 1;
        cx.beginPath(); cx.arc(ox, oy, R * 3, 0, 6.283); cx.fill();
      }
      cx.globalAlpha = 1;
      if (reduced && mode !== 'morph') cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', resize);
    };
  }, [mode, density, speed, seed]);
  return <canvas ref={ref} className={'hero-field' + (className ? ' ' + className : '')} aria-hidden="true" data-mode={mode} />;
}
`;

export const HERO_FIELD_CSS = `.hero-field { position: absolute; inset: 0; width: 100%; height: 100%; display: block; color: var(--dot, currentColor); }`;

const dots = (pts: Array<[number, number, number?]>) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r ?? 1.1}"/>`).join('');

export const HERO_FIELD_THUMBS: Record<string, string> = {
  morph: `<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#14161b"/><g fill="#eef0f4">${dots([[14, 15], [18, 11], [18, 19], [22, 15], [18, 15]])}</g><path d="M26 15h4" stroke="#ff6b8b"/><g fill="#eef0f4">${dots([[34, 10], [38, 14], [34, 18], [38, 20], [36, 15]])}</g></svg>`,
  globe: `<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#14161b"/><g fill="#eef0f4">${dots([[24, 15, 1.4], [19, 12], [29, 12], [19, 18], [29, 18], [24, 8, 0.8], [24, 22, 0.8], [15, 15, 0.7], [33, 15, 0.7]])}</g></svg>`,
  wave: `<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#14161b"/><g fill="#eef0f4">${dots([[8, 15, 1], [14, 12, 1], [20, 10, 1], [26, 12, 1], [32, 15, 1], [38, 18, 1], [8, 21, 1], [14, 18, 1], [20, 16, 1], [26, 18, 1], [32, 21, 1], [38, 24, 1]])}</g></svg>`,
  contour: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#14161b"/><g fill="none" stroke="#eef0f4" stroke-width=".7"><path d="M3 8c8-3 12 3 20 0s12-3 22 0" opacity=".5"/><path d="M3 13c8-2 10 4 18 1s14-5 24 0"/><path d="M3 18c9-1 9 5 19 2s14-4 23-1"/><path d="M3 23c8-2 12 2 20 0s12-2 22 1" opacity=".6"/></g></svg>',
  orbits: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#14161b"/><g fill="none" stroke="#eef0f4" stroke-width=".5" opacity=".5" transform="rotate(-18 24 15)"><ellipse cx="24" cy="15" rx="7" ry="2.4"/><ellipse cx="24" cy="15" rx="13" ry="4.3"/><ellipse cx="24" cy="15" rx="19" ry="6.3"/></g><g fill="#eef0f4"><circle cx="24" cy="15" r="1.8"/><circle cx="31" cy="12.8" r="1"/><circle cx="12" cy="17.5" r="1.2"/><circle cx="40" cy="10" r="1"/></g></svg>',
};
