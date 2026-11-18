/* Hero art: a pointer-reactive dot field drawn on a canvas. Three variants share one component.
   The dot colour comes from the --dot custom property on the nearest ancestor. */

export const DOT_FIELD_TSX = `import { useEffect, useRef } from 'react';

export type DotFieldVariant = 'morph' | 'globe' | 'wave';

const COUNT = 520;
const STEP = 0.075;

function sample(kind: 'disc' | 'drop' | 'leaf' | 'rows'): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let y = -1; y <= 1.001; y += STEP) {
    for (let x = -1; x <= 1.001; x += STEP) {
      let inside = false;
      if (kind === 'disc') inside = x * x + y * y < 0.78;
      if (kind === 'leaf') {
        const a = -0.6;
        const rx = x * Math.cos(a) - y * Math.sin(a);
        const ry = x * Math.sin(a) + y * Math.cos(a);
        inside = Math.abs(rx) < 0.5 * Math.cos((ry * Math.PI) / 2) && Math.abs(ry) < 0.98;
      }
      if (kind === 'rows') inside = Math.abs(y) < 0.8 && Math.abs(x) < 0.9 && Math.round((y + 1) / STEP) % 3 !== 2;
      if (kind === 'drop') {
        const yy = y + 0.15;
        inside = (x * x + yy * yy < 0.42 && yy > -0.1) || (Math.abs(x) < 0.65 * (yy + 0.95) && yy < 0 && yy > -0.95);
      }
      if (inside) pts.push([x, y]);
    }
  }
  return pts;
}

const SHAPES = (['disc', 'drop', 'leaf', 'rows'] as const).map(sample);

interface Dot { x: number; y: number; tx: number; ty: number; a: number; ta: number; s: number }

export function DotField({ variant = 'morph', className }: { variant?: DotFieldVariant; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cx = cv.getContext('2d');
    if (!cx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mouse = { x: -9, y: -9 };
    const dots: Dot[] = Array.from({ length: COUNT }, () => ({ x: 0, y: 0, tx: 0, ty: 0, a: 1, ta: 1, s: Math.random() }));
    let shapeIx = 0;
    let shapeT = 0;
    const assign = (ix: number, snap: boolean) => {
      const pts = SHAPES[ix];
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
      cx.clearRect(0, 0, W, H);
      cx.fillStyle = color;
      const t = now / 1000;
      if (variant === 'morph') {
        shapeT += dt;
        if (shapeT > 2600 && !reduced) { shapeT = 0; shapeIx = (shapeIx + 1) % SHAPES.length; assign(shapeIx, false); }
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
      } else if (variant === 'globe') {
        const rot = reduced ? 0.6 : t * 0.35;
        for (let i = 0; i < COUNT; i++) {
          const y = 1 - (i / (COUNT - 1)) * 2;
          const rr = Math.sqrt(1 - y * y);
          const th = i * 2.39996 + rot;
          const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
          const k = (z + 1.4) / 2.4;
          cx.globalAlpha = 0.15 + 0.85 * (z > 0 ? k : k * 0.35);
          cx.beginPath(); cx.arc(ox + x * S * 0.95, oy + y * S * 0.95, R * (0.5 + k * 0.8), 0, 6.283); cx.fill();
        }
      } else {
        const cols = 34, rows = 15, ph = reduced ? 0 : t * 1.6;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const u = (i / (cols - 1)) * 2 - 1, v = (j / (rows - 1)) * 2 - 1;
          const px = u * 1.05;
          let py = v * 0.62 + Math.sin(u * 3.2 + ph + v * 1.6) * 0.1;
          const mx = px - mouse.x, my = py - mouse.y, md = mx * mx + my * my;
          if (md < 0.06) py -= (0.06 - md) * 3;
          const z = (Math.sin(u * 3.2 + ph + v * 1.6) + 1) / 2;
          cx.globalAlpha = 0.25 + z * 0.75;
          cx.beginPath(); cx.arc(ox + px * S, oy + py * S, R * (0.6 + z * 0.6), 0, 6.283); cx.fill();
        }
      }
      cx.globalAlpha = 1;
      if (reduced && variant !== 'morph') cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', resize);
    };
  }, [variant]);
  return <canvas ref={ref} className={'dot-field' + (className ? ' ' + className : '')} aria-hidden="true" data-variant={variant} />;
}
`;

export const DOT_FIELD_CSS = `.dot-field { position: absolute; inset: 0; width: 100%; height: 100%; display: block; color: var(--dot, currentColor); }`;

export const DOT_FIELD_THUMBS: Record<string, string> = {
  morph:
    '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#14161b"/><g fill="#eef0f4"><circle cx="14" cy="15" r="1.1"/><circle cx="18" cy="11" r="1.1"/><circle cx="18" cy="19" r="1.1"/><circle cx="22" cy="15" r="1.1"/><circle cx="18" cy="15" r="1.1"/></g><path d="M26 15h4" stroke="#ff6b8b"/><g fill="#eef0f4"><circle cx="34" cy="10" r="1.1"/><circle cx="38" cy="14" r="1.1"/><circle cx="34" cy="18" r="1.1"/><circle cx="38" cy="20" r="1.1"/><circle cx="36" cy="15" r="1.1"/></g></svg>',
  globe:
    '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#14161b"/><g fill="#eef0f4"><circle cx="24" cy="15" r="1.4"/><circle cx="19" cy="12" r="1.1"/><circle cx="29" cy="12" r="1.1"/><circle cx="19" cy="18" r="1.1"/><circle cx="29" cy="18" r="1.1"/><circle cx="24" cy="8" r=".8"/><circle cx="24" cy="22" r=".8"/><circle cx="15" cy="15" r=".7"/><circle cx="33" cy="15" r=".7"/></g></svg>',
  wave: '<svg viewBox="0 0 48 30"><rect width="48" height="30" fill="#14161b"/><g fill="#eef0f4"><circle cx="8" cy="15" r="1"/><circle cx="14" cy="12" r="1"/><circle cx="20" cy="10" r="1"/><circle cx="26" cy="12" r="1"/><circle cx="32" cy="15" r="1"/><circle cx="38" cy="18" r="1"/><circle cx="8" cy="21" r="1"/><circle cx="14" cy="18" r="1"/><circle cx="20" cy="16" r="1"/><circle cx="26" cy="18" r="1"/><circle cx="32" cy="21" r="1"/><circle cx="38" cy="24" r="1"/></g></svg>',
};
