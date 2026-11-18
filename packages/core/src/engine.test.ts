import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { chromium, type Browser } from 'playwright';
import { passes } from '@sitemaxxing/passes';
import { rules } from '@sitemaxxing/rules';
import { scorePage } from '@sitemaxxing/mog-score';
import { Engine, preparePlayground, removeTree, spawnVite, waitForUrl, killTree, git } from './index';
import type { HubEvent } from './protocol';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SAMPLE = process.env.SITEMAXXING_TEST_SAMPLE ?? 'fieldnote';
const PORT = SAMPLE === 'isvik' ? 5198 : 5199;

describe(`engine against sample-${SAMPLE}`, () => {
  let browser: Browser;
  let vite: ReturnType<typeof spawnVite>;
  let engine: Engine;
  let projectId: string;
  const events: HubEvent[] = [];
  let dir: string;

  beforeAll(async () => {
    dir = preparePlayground(path.join(ROOT, 'apps', `sample-${SAMPLE}`), path.join(ROOT, '.playground', `test-${SAMPLE}-${process.pid}`), { fresh: true, devUrl: `http://localhost:${PORT}` });
    vite = spawnVite(dir, PORT);
    expect(await waitForUrl(`http://localhost:${PORT}`, 30_000)).toBe(true);
    browser = await chromium.launch();
    engine = new Engine({
      passes,
      rules,
      scorer: scorePage as any,
      browser: async () => browser,
      emit: (e) => events.push(e),
      registryFile: path.join(os.tmpdir(), `sitemaxxing-test-${Date.now()}.json`),
      log: (m) => console.log('[engine]', m),
    });
  }, 90_000);

  afterAll(async () => {
    await engine?.close();
    await browser?.close();
    if (vite) killTree(vite);
    if (process.env.SITEMAXXING_KEEP) return;
    try {
      removeTree(dir);
    } catch {
      /* best effort */
    }
  });

  it('inits with a baseline score between 30 and 40', async () => {
    const r = await engine.initProject(dir);
    projectId = r.projectId;
    console.log('baseline', r.baseline, JSON.stringify(engine.getScore(projectId).metrics, null, 0));
    expect(r.sections.length).toBeGreaterThan(0);
    expect(r.baseline).not.toBeNull();
    expect(r.baseline!).toBeGreaterThanOrEqual(30);
    expect(r.baseline!).toBeLessThanOrEqual(40);
  });

  it('audits and proposes every built-in pass', async () => {
    const state = await engine.audit(projectId);
    for (const p of state.passes) console.log(`${p.status.padEnd(9)} ${p.defId.padEnd(14)} ${p.skipReason ?? p.summary ?? ''}`);
    const proposed = state.passes.filter((p) => p.status === 'proposed').map((p) => p.defId);
    expect(proposed).toEqual(passes.map((p) => p.id));
    const copyPass = state.passes.find((p) => p.defId === 'copy')!;
    expect(copyPass.copyDiff?.length).toBeGreaterThan(0);
  });

  it('previews every pass and variant in under a second', async () => {
    const state = engine.state(projectId);
    for (const p of state.passes) {
      const variants = p.variants.length ? p.variants.map((v) => v.id) : [undefined];
      for (const v of variants) {
        const t0 = Date.now();
        await engine.preview(projectId, p.id, v);
        const ms = Date.now() - t0;
        const ev = events.filter((e) => e.type === 'pass.previewed').at(-1) as any;
        expect(ev.passId).toBe(p.id);
        expect(ev.selectors.length).toBeGreaterThan(0);
        expect(ms).toBeLessThan(1000);
        await engine.endPreview(projectId);
      }
    }
    expect(git(dir, ['status', '--porcelain'])).toBe('');
  });

  it('marks downstream passes stale when direction is rejected', async () => {
    const s0 = engine.state(projectId);
    const direction = s0.passes.find((p) => p.defId === 'direction')!;
    await engine.decide(projectId, direction.id, 'reject', undefined, { reasonChip: 'too plain' });
    const s1 = engine.state(projectId);
    expect(s1.passes.find((p) => p.defId === 'font')!.status).toBe('stale');
    expect(s1.passes.find((p) => p.defId === 'font-size')!.status).toBe('stale');
    await engine.decide(projectId, s1.passes.find((p) => p.defId === 'font')!.id, 'regenerate');
    await engine.decide(projectId, s1.passes.find((p) => p.defId === 'font-size')!.id, 'regenerate');
    await engine.decide(projectId, direction.id, 'reject'); // toggle back
    const s2 = engine.state(projectId);
    expect(s2.passes.find((p) => p.defId === 'font')!.status).toBe('proposed');
    expect(s2.passes.find((p) => p.defId === 'direction')!.status).toBe('proposed');
  });

  it('approves everything and commits one version with a high score', async () => {
    await engine.approveAll(projectId);
    const before = git(dir, ['rev-list', '--count', 'HEAD']);
    const r = await engine.commit(projectId);
    const after = git(dir, ['rev-list', '--count', 'HEAD']);
    expect(Number(after) - Number(before)).toBe(1);
    expect(r.version).toBe(2);
    console.log('committed score', r.score, JSON.stringify(engine.getScore(projectId, 2).metrics, null, 0));
    expect(git(dir, ['status', '--porcelain'])).toBe('');
    const state = engine.state(projectId);
    expect(state.versions.length).toBe(2);
    expect(state.passes.every((p) => p.status === 'committed')).toBe(true);
    expect(fs.existsSync(path.join(dir, '.sitemaxxing', 'screenshots', 'v2', 'timelapse'))).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it('logged decisions with dwell and shown_alongside', async () => {
    const rows = engine.decisions(projectId);
    const actions = new Set(rows.map((r) => r.action));
    expect(actions.has('preview')).toBe(true);
    expect(actions.has('reject')).toBe(true);
    expect(actions.has('approve')).toBe(true);
    expect(actions.has('commit')).toBe(true);
    expect(rows.some((r) => r.reason_chip === 'too plain')).toBe(true);
    expect(rows.filter((r) => r.action === 'preview').every((r) => typeof r.dwell_ms === 'number')).toBe(true);
    expect(rows.every((r) => JSON.parse(r.shown_alongside) instanceof Array)).toBe(true);
  });

  it('serves an older version read-only', async () => {
    const { url } = await engine.viewVersion(projectId, 1);
    expect(url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(await waitForUrl(url!, 20_000)).toBe(true);
    await engine.viewVersion(projectId, null);
  }, 60_000);
});
