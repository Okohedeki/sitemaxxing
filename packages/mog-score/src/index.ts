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

/** The brief's mood, structurally (avoids a dependency on core). Each axis is -1..1. */
export interface ScoreMood {
  energy: number;
  warmth: number;
  formality: number;
  classic: number;
  density: number;
  dark: number;
}

export interface ScoreOptions {
  /** When given, targets bend toward the brief: a bold or dark brief may be more colourful, a dense one busier. */
  mood?: ScoreMood;
}

/**
 * Targets for a brief. The defaults describe a calm, light page; without this, the score would
 * reward one look and push every site toward it.
 */
export function targetsFor(mood?: ScoreMood): typeof TARGETS {
  const t = JSON.parse(JSON.stringify(TARGETS)) as typeof TARGETS;
  if (!mood) return t;
  const pos = (v: number) => Math.max(0, v);
  t.colorfulness.fine += 30 * pos(mood.energy) + 18 * pos(mood.dark) + 8 * pos(-mood.formality);
  t.colorfulness.zero += 25 * pos(mood.energy) + 15 * pos(mood.dark);
  t.complexity.edgeFine += 0.035 * pos(mood.density) + 0.015 * pos(mood.energy);
  t.complexity.edgeZero += 0.05 * pos(mood.density) + 0.02 * pos(mood.energy);
  t.complexity.regionsFine += 20 * pos(mood.density);
  // Dense, formal pages (documentation, finance) read well with a gentler type scale.
  t.typeContrast.fine -= 0.45 * pos(mood.density) + 0.2 * pos(mood.formality);
  t.typeContrast.min -= 0.3 * pos(mood.density);
  return t;
}

export function scoreFromParts(
  parts: { colorfulness: number; edge: number; regions: number; typeRatio: number; slopHits: number; slopTerms?: string[]; buttons: number; quietButtons?: number; leftEdges: number; charsPerLine: number },
  opts: ScoreOptions = {},
): ScoreResult {
  const t = targetsFor(opts.mood);
  const metrics: Record<string, ScoreMetric> = {};
  const add = (key: string, value: number, sub: number, note: string) => {
    metrics[key] = { value: Math.round(value * 100) / 100, sub: Math.round(clamp01(sub) * 100) / 100, weight: WEIGHTS[key], note };
  };
  add('colorfulness', parts.colorfulness, linearDown(parts.colorfulness, t.colorfulness.fine, t.colorfulness.zero), `Hasler–Süsstrunk ${parts.colorfulness.toFixed(0)} (fine below ${Math.round(t.colorfulness.fine)})`);
  const edgeSub = linearDown(parts.edge, t.complexity.edgeFine, t.complexity.edgeZero);
  const regionSub = linearDown(parts.regions, t.complexity.regionsFine, t.complexity.regionsZero);
  add('complexity', parts.edge, 0.6 * edgeSub + 0.4 * regionSub, `edge density ${(parts.edge * 100).toFixed(1)}%, ${parts.regions} busy regions`);
  add('typeContrast', parts.typeRatio, (parts.typeRatio - t.typeContrast.min) / (t.typeContrast.fine - t.typeContrast.min), `h1 is ${parts.typeRatio.toFixed(1)}x body (target ≥ ${t.typeContrast.fine.toFixed(2)})`);
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
  if (opts.mood) notes.push('Targets adjusted for this brief (colourfulness, complexity and type contrast).');
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
  // Photos, illustrations and canvases are content, not the page's own colour.
  const media = fold
    .filter((n) => ['img', 'svg', 'video', 'canvas', 'picture'].includes(n.tag) || /url\(/.test(n.styles.backgroundImage ?? ''))
    .map((n) => n.box)
    // Only imagery that carries the view counts as content (a quarter of the viewport or more);
    // a small boxed picture beside the copy is part of the composition and stays in the measure.
    .filter((b) => b.w * Math.min(b.h, dom.viewport.height) >= 0.25 * dom.viewport.width * dom.viewport.height);
  return { typeRatio, slopHits: hits, slopTerms, buttons, quietButtons, leftEdges, charsPerLine: cpl, media };
}

export function imageParts(img: Raster, media: Array<{ x: number; y: number; w: number; h: number }> = []) {
  const f = 4;
  const small = downsample(img, f);
  const exclude = media.map((b) => ({ x: Math.floor(b.x / f), y: Math.floor(b.y / f), w: Math.ceil(b.w / f), h: Math.ceil(b.h / f) }));
  return { colorfulness: colorfulness(small, exclude), edge: edgeDensity(small), regions: regionCount(small) };
}

/** Scores the current viewport of a Playwright page. The DOM snapshot comes from core. */
export async function scorePage(page: Page, dom: ScoreDOM, opts: ScoreOptions = {}): Promise<ScoreResult> {
  const buf = await page.screenshot({ fullPage: false, type: 'png' });
  const img = decodePng(buf);
  const d = domParts(dom);
  return scoreFromParts({ ...imageParts(img, d.media), ...d }, opts);
}

export async function scoreScreenshotBuffer(buf: Buffer, dom: ScoreDOM, opts: ScoreOptions = {}): Promise<ScoreResult> {
  const d = domParts(dom);
  return scoreFromParts({ ...imageParts(decodePng(buf), d.media), ...d }, opts);
}

export * from './image';
