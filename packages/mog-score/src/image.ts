import { PNG } from 'pngjs';

export interface Raster {
  width: number;
  height: number;
  data: Uint8Array; // RGBA
}

export function decodePng(buf: Buffer): Raster {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length) };
}

/** Nearest-neighbour downsample by an integer factor (keeps the metrics cheap and stable). */
export function downsample(img: Raster, factor: number): Raster {
  const w = Math.floor(img.width / factor);
  const h = Math.floor(img.height / factor);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * img.width + (x * factor + dx)) * 4;
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
        }
      }
      const n = factor * factor;
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Hasler and Süsstrunk colourfulness: sqrt(σrg² + σyb²) + 0.3·sqrt(μrg² + μyb²).
 * Pixels inside `exclude` (in raster coordinates) are skipped, so photos and illustrations do not
 * count as the page's own colour.
 */
export function colorfulness(img: Raster, exclude: Rect[] = []): number {
  const total = img.width * img.height;
  let n = 0;
  let srg = 0,
    syb = 0,
    srg2 = 0,
    syb2 = 0;
  const inside = (x: number, y: number) => exclude.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  for (let i = 0; i < total; i++) {
    if (exclude.length && inside(i % img.width, Math.floor(i / img.width))) continue;
    n++;
    const r = img.data[i * 4];
    const g = img.data[i * 4 + 1];
    const b = img.data[i * 4 + 2];
    const rg = r - g;
    const yb = (r + g) / 2 - b;
    srg += rg;
    syb += yb;
    srg2 += rg * rg;
    syb2 += yb * yb;
  }
  if (n < total * 0.15) return colorfulness(img);
  const mrg = srg / n;
  const myb = syb / n;
  const vrg = srg2 / n - mrg * mrg;
  const vyb = syb2 / n - myb * myb;
  return Math.sqrt(Math.max(0, vrg) + Math.max(0, vyb)) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
}

export function grayscale(img: Raster): Float32Array {
  const n = img.width * img.height;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
  return g;
}

/** Fraction of pixels whose Sobel gradient magnitude exceeds a threshold. */
export function edgeDensity(img: Raster, threshold = 60): number {
  const g = grayscale(img);
  const { width: w, height: h } = img;
  let edges = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -g[i - w - 1] + g[i - w + 1] - 2 * g[i - 1] + 2 * g[i + 1] - g[i + w - 1] + g[i + w + 1];
      const gy = -g[i - w - 1] - 2 * g[i - w] - g[i - w + 1] + g[i + w - 1] + 2 * g[i + w] + g[i + w + 1];
      if (Math.sqrt(gx * gx + gy * gy) > threshold) edges++;
    }
  }
  return edges / ((w - 2) * (h - 2));
}

/** Counts connected regions of "busy" cells on a coarse grid (a cheap stand-in for distinct regions). */
export function regionCount(img: Raster, cell = 24, varianceThreshold = 180): number {
  const cols = Math.floor(img.width / cell);
  const rows = Math.floor(img.height / cell);
  const g = grayscale(img);
  const busy = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      let s = 0,
        s2 = 0;
      const n = cell * cell;
      for (let y = 0; y < cell; y++) {
        for (let x = 0; x < cell; x++) {
          const v = g[(cy * cell + y) * img.width + cx * cell + x];
          s += v;
          s2 += v * v;
        }
      }
      const mean = s / n;
      busy[cy * cols + cx] = s2 / n - mean * mean > varianceThreshold ? 1 : 0;
    }
  }
  let regions = 0;
  const seen = new Uint8Array(cols * rows);
  const stack: number[] = [];
  for (let i = 0; i < busy.length; i++) {
    if (!busy[i] || seen[i]) continue;
    regions++;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % cols;
      const y = Math.floor(j / cols);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const k = ny * cols + nx;
        if (busy[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
  }
  return regions;
}
