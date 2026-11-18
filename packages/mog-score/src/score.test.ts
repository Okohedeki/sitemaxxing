import { describe, expect, it } from 'vitest';
import { WEIGHTS, scoreFromParts } from './index';
import { colorfulness, edgeDensity, regionCount, type Raster } from './image';

function solid(w: number, h: number, rgb: [number, number, number]): Raster {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...rgb, 255], i * 4);
  return { width: w, height: h, data };
}

describe('mog score', () => {
  it('weights sum to one', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('rewards a calm, specific page and punishes a busy sloppy one', () => {
    const good = scoreFromParts({ colorfulness: 12, edge: 0.02, regions: 10, typeRatio: 3.5, slopHits: 0, buttons: 1, quietButtons: 1, leftEdges: 1, charsPerLine: 60 });
    const bad = scoreFromParts({ colorfulness: 70, edge: 0.08, regions: 50, typeRatio: 2.2, slopHits: 7, buttons: 4, leftEdges: 5, charsPerLine: 110 });
    expect(good.score).toBeGreaterThanOrEqual(90);
    expect(bad.score).toBeLessThanOrEqual(30);
    expect(bad.notes.length).toBeGreaterThan(good.notes.length);
  });

  it('measures image metrics sensibly', () => {
    const grey = solid(64, 40, [128, 128, 128]);
    expect(colorfulness(grey)).toBe(0);
    expect(edgeDensity(grey)).toBe(0);
    expect(regionCount(grey)).toBe(0);
    const img = solid(64, 40, [250, 250, 250]);
    for (let y = 0; y < 40; y++) for (let x = 20; x < 44; x++) img.data.set([220, 40, 60, 255], (y * 64 + x) * 4);
    expect(colorfulness(img)).toBeGreaterThan(20);
    expect(edgeDensity(img)).toBeGreaterThan(0);
  });
});
