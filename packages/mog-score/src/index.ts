import type { Page } from 'playwright';
import { slopHits } from '@sitemaxxing/rules';
import weightsFile from './weights.json';
import { colorfulness, decodePng, downsample, edgeDensity, regionCount, type Raster } from './image';

export interface ScoreMetric {
  value: number;
  sub: number;
  weight: number;
  note: string;
}

export interface ScoreResult {
  score: number;
  metrics: Record<string, ScoreMetric>;
  notes: string[];
}

/** The subset of the DOM snapshot the score reads. Matches @sitemaxxing/core's SnapshotDOM. */
export interface ScoreDOM {
  bodyFontSize: number;
  viewport: { width: number; height: number };
  aboveFold(): Array<{ tag: string; text: string; box: { x: number; y: number; w: number; h: number }; styles: Record<string, string>; classes: string[]; attrs: Record<string, string>; parent: number; index: number }>;
  nodes: Array<{ tag: string; parent: number }>;
}

export const WEIGHTS = weightsFile.weights as Record<string, number>;
export const TARGETS = weightsFile.targets;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const px = (v: string | undefined) => parseFloat(v ?? '') || 0;

function linearDown(value: number, fine: number, zero: number): number {
  if (value <= fine) return 1;
  if (value >= zero) return 0;
  return 1 - (value - fine) / (zero - fine);
}

export function scoreFromParts(parts: { colorfulness: number; edge: number; regions: number; typeRatio: number; slopHits: number; slopTerms?: string[]; buttons: number; quietButtons?: number; leftEdges: number; charsPerLine: number }): ScoreResult {
  const t = TARGETS;
  const metrics: Record<string, ScoreMetric> = {};
  const add = (key: string, value: number, sub: number, note: string) => {
    metrics[key] = { value: Math.round(value * 100) / 100, sub: Math.round(clamp01(sub) * 100) / 100, weight: WEIGHTS[key], note };
  };
  add('colorfulness', parts.colorfulness, linearDown(parts.colorfulness, t.colorfulness.fine, t.colorfulness.zero), `Hasler–Süsstrunk ${parts.colorfulness.toFixed(0)} (fine below ${t.colorfulness.fine})`);
  const edgeSub = linearDown(parts.edge, t.complexity.edgeFine, t.complexity.edgeZero);
  const regionSub = linearDown(parts.regions, t.complexity.regionsFine, t.complexity.regionsZero);
  add('complexity', parts.edge, 0.6 * edgeSub + 0.4 * regionSub, `edge density ${(parts.edge * 100).toFixed(1)}%, ${parts.regions} busy regions`);
  add('typeContrast', parts.typeRatio, (parts.typeRatio - t.typeContrast.min) / (t.typeContrast.fine - t.typeContrast.min), `h1 is ${parts.typeRatio.toFixed(1)}x body (target ≥ ${t.typeContrast.fine})`);
  add('copySlop', parts.slopHits, 1 - parts.slopHits * t.copySlop.perHit, `${parts.slopHits} slop or emoji hits in headings and buttons${parts.slopTerms?.length ? ` (${parts.slopTerms.slice(0, 6).join(', ')})` : ''}`);
  const solid = parts.buttons;
  const quiet = parts.quietButtons ?? 0;
  const focusSub = solid === 0 ? 0.5 : solid === 1 ? (quiet <= 1 ? 1 : 0.85) : solid === 2 ? 0.3 : solid === 3 ? 0.15 : 0.05;
  add('focus', solid, focusSub, `${solid} solid button${solid === 1 ? '' : 's'} and ${quiet} quiet above the fold (target: 1 primary, at most 1 quiet secondary)`);
  add('alignment', parts.leftEdges, linearDown(parts.leftEdges, t.alignment.fine, t.alignment.zero), `${parts.leftEdges} distinct left edges (target ≤ ${t.alignment.fine})`);
  const cpl = parts.charsPerLine;
  const llSub = cpl === 0 ? 0.8 : cpl < t.lineLength.min ? clamp01(1 - (t.lineLength.min - cpl) / t.lineLength.zeroBeyond) : cpl > t.lineLength.max ? clamp01(1 - (cpl - t.lineLength.max) / t.lineLength.zeroBeyond) : 1;
  add('lineLength', cpl, llSub, `${cpl} characters per line (target 45 to 90)`);
  let total = 0;
  for (const m of Object.values(metrics)) total += m.sub * m.weight;
  const score = Math.round(total * 100);
  const notes = Object.entries(metrics)
    .filter(([, m]) => m.sub < 0.6)
    .map(([k, m]) => `${k}: ${m.note}`);
  return { score, metrics, notes };
}

function isButtonLike(n: { tag: string; styles: Record<string, string>; attrs: Record<string, string>; text: string }): boolean {
  if (n.attrs['aria-expanded'] !== undefined || /^(menu|close)$/i.test(n.text.trim())) return false;
  if (n.tag === 'button') return true;
  if (n.tag !== 'a' && n.attrs.role !== 'button') return false;
  const bg = n.styles.backgroundColor ?? '';
  const img = n.styles.backgroundImage ?? 'none';
  const border = px(n.styles.borderTopWidth);
  const padded = px(n.styles.paddingLeft) >= 10;
  return padded && ((bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || img !== 'none' || border > 0);
}

export function domParts(dom: ScoreDOM) {
  const fold = dom.aboveFold();
  const h1 = fold.find((n) => n.tag === 'h1');
  const body = dom.bodyFontSize || 16;
  const typeRatio = h1 ? px(h1.styles.fontSize) / body : 1;
  const headingText = fold.filter((n) => ['h1', 'h2', 'h3'].includes(n.tag) || isButtonLike(n)).map((n) => n.text);
  const slopTerms = headingText.flatMap((t) => slopHits(t).map((h) => h.term));
  const hits = slopTerms.length;
  const allButtons = fold.filter(isButtonLike);
  const isSolid = (n: { styles: Record<string, string> }) => {
    const bg = n.styles.backgroundColor ?? '';
    return (bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || (n.styles.backgroundImage ?? 'none') !== 'none';
  };
  const buttons = allButtons.filter(isSolid).length;
  const quietButtons = allButtons.length - buttons;
  // Block-level text only: labels, nav links and inline spans do not define the page's edges.
  const textBlocks = fold.filter((n) => ['h1', 'h2', 'h3', 'p', 'li'].includes(n.tag) && n.text.length > 15 && n.box.w > 40);
  const leftEdges = new Set(textBlocks.map((n) => Math.round(n.box.x / 8) * 8)).size;
  const paras = fold.filter((n) => n.tag === 'p' && n.text.length > 40);
  let cpl = 0;
  if (paras.length) {
    // Measure capacity rather than the text's own wrapping: a short subhead on a sensible measure
    // should not read as a narrow column. Average glyph width is about half the font size.
    const p = paras[0];
    const fs = px(p.styles.fontSize) || 16;
    const lh = px(p.styles.lineHeight) || fs * 1.5;
    const lines = Math.max(1, Math.round(p.box.h / lh));
    cpl = lines > 1 ? Math.round(p.box.w / (fs * 0.5)) : Math.round(p.text.length);
  }
  return { typeRatio, slopHits: hits, slopTerms, buttons, quietButtons, leftEdges, charsPerLine: cpl };
}

export function imageParts(img: Raster) {
  const small = downsample(img, 4);
  return { colorfulness: colorfulness(small), edge: edgeDensity(small), regions: regionCount(small) };
}

/** Scores the current viewport of a Playwright page. The DOM snapshot comes from core. */
export async function scorePage(page: Page, dom: ScoreDOM): Promise<ScoreResult> {
  const buf = await page.screenshot({ fullPage: false, type: 'png' });
  const img = decodePng(buf);
  return scoreFromParts({ ...imageParts(img), ...domParts(dom) });
}

export async function scoreScreenshotBuffer(buf: Buffer, dom: ScoreDOM): Promise<ScoreResult> {
  return scoreFromParts({ ...imageParts(decodePng(buf)), ...domParts(dom) });
}

export * from './image';
