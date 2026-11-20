/* How closely two screenshots of the same viewport agree, as the share of small blocks whose
   average colour is nearly the same. Used to check a rebuilt page against the original. */

import { PNG } from 'pngjs';

/**
 * Runs in a page before its screenshot is compared: holds every video and animation at its start,
 * so two pictures of the same page do not differ by where their motion happened to be.
 */
export const STILL_JS = String.raw`(async () => {
  for (const v of document.querySelectorAll('video')) { try { v.pause(); v.currentTime = 0; } catch (e) {} }
  for (const a of document.getAnimations()) { try { const t = a.effect && a.effect.getComputedTiming(); if (t && t.iterations === Infinity) { a.currentTime = 0; a.pause(); } else a.finish(); } catch (e) { try { a.pause(); } catch (e2) {} } }
  await new Promise((r) => setTimeout(r, 350));
})()`;

const BLOCK = 12;
/** Largest per-channel difference between two block averages that still counts as the same. */
const TOLERANCE = 18;

function blocks(buf: Buffer): { w: number; h: number; mean: Float32Array } {
  const png = PNG.sync.read(buf);
  const w = Math.floor(png.width / BLOCK);
  const h = Math.floor(png.height / BLOCK);
  const mean = new Float32Array(w * h * 3);
  for (let by = 0; by < h; by++)
    for (let bx = 0; bx < w; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = 0; y < BLOCK; y++)
        for (let x = 0; x < BLOCK; x++) {
          const i = ((by * BLOCK + y) * png.width + bx * BLOCK + x) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
        }
      const o = (by * w + bx) * 3;
      const n = BLOCK * BLOCK;
      mean[o] = r / n;
      mean[o + 1] = g / n;
      mean[o + 2] = b / n;
    }
  return { w, h, mean };
}

/** 0 to 1: the share of the picture that matches. Pictures of different sizes compare their overlap. */
export function screenshotMatch(a: Buffer, b: Buffer): number {
  const A = blocks(a);
  const B = blocks(b);
  const w = Math.min(A.w, B.w);
  const h = Math.min(A.h, B.h);
  if (!w || !h) return 0;
  let same = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * A.w + x) * 3;
      const j = (y * B.w + x) * 3;
      const d = Math.max(
        Math.abs(A.mean[i] - B.mean[j]),
        Math.abs(A.mean[i + 1] - B.mean[j + 1]),
        Math.abs(A.mean[i + 2] - B.mean[j + 2]),
      );
      if (d <= TOLERANCE) same++;
    }
  return same / (w * h);
}
