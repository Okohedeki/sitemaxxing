import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, spawnSync, execFileSync, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import type { Browser, Page } from 'playwright';
import { openDb, newId, now, json, type DB } from './db';
import { loadConfig } from './config';
import { makeFileSystem, toPosix } from './fsx';
import * as gitx from './git';
import {
  applyStaged,
  canApply,
  filesTouched,
  toUnifiedDiff,
  writePatchFile,
  patchFileName,
  PatchApplyError,
  Staging,
} from './patches';
import { takeSnapshot, emptySnapshot } from './snapshot';
import { detectSections } from './sections';
import { readTokens } from './tokens';
import { createLLM } from './llm';
import { downstreamOf } from './registry';
import { normalizeBrief, moodOf } from './brief';
import { captureSite, normalizeUrl, siteDirFor, siteFiles } from './recreate';
import { STILL_JS, screenshotMatch } from './fidelity';
import { readSystem, type SystemReading } from './system';
import net from 'node:net';
import { applyLean, describeLean, isNeutral, leanFor } from './taste';
import { plan, type Detection } from './planner';
import { hashSeed, newSeed } from './random';
import type { HubEvent, DecisionMeta } from './protocol';
import type {
  CopyChange,
  DecisionAction,
  Finding,
  PassContext,
  PassDefinition,
  PassStatus,
  PassView,
  Project,
  ProjectState,
  ResolvedConfig,
  RuleCard,
  ScoreResult,
  Section,
  SnapshotDOM,
  Variant,
  VersionView,
  LLM,
  Brief,
  Mood,
  ReasonChip,
} from './types';

export interface EngineDeps {
  passes: PassDefinition[];
  rules: {
    search(q: string): RuleCard[];
    byId(id: string): RuleCard | undefined;
    all(): RuleCard[];
  };
  scorer: (page: Page, dom: SnapshotDOM, opts?: { mood?: Mood }) => Promise<ScoreResult>;
  browser: () => Promise<Browser>;
  emit: (e: HubEvent) => void;
  registryFile?: string;
  log?: (msg: string) => void;
  /** Base port for read-only version servers. */
  versionPortBase?: number;
  /**
   * Where sites recreated from a URL are written, and the template app whose files and installed
   * dependencies they start from. Without it, recreating from a URL is unavailable.
   */
  sites?: { dir: string; template: string };
}

/** Marks a project folder as recreated from a URL. */
const RECREATED = path.join('.sitemaxxing', 'recreated.json');

interface AppliedPatch {
  defId: string;
  variantId?: string;
  text: string;
  files: string[];
}

interface PrecomputedPatch {
  text: string;
  files: string[];
  copyDiff?: CopyChange[];
  summary: string;
  notes?: string[];
  file: string;
}

interface Runtime {
  project: Project;
  config: ResolvedConfig;
  db: DB;
  dir: string;
  defs: PassDefinition[];
  dom: SnapshotDOM;
  sections: Section[];
  llm?: LLM;
  patches: Map<string, PrecomputedPatch>;
  variants: Map<string, Variant[]>;
  applied: AppliedPatch[];
  previewing: {
    defId: string;
    variantId?: string;
    startedAt: number;
    shownAlongside: string[];
  } | null;
  lastPreviewAt: Record<string, number>;
  view: 'current' | 'changes';
  viewingVersion: number | null;
  versionServer: { proc: ChildProcess; url: string; number: number } | null;
  page: Page | null;
  busy: string | null;
  score: ScoreResult | null;
  audited: boolean;
  extraFiles: Set<string>;
  queue: Promise<unknown>;
  brief: Brief | null;
  mood: Mood | null;
  /** Per-pass generation seeds; Randomize replaces them. */
  seeds: Record<string, number>;
  measureTimer: ReturnType<typeof setTimeout> | null;
}

/** Used only to build contexts for highlights before a story exists. */
const PLACEHOLDER_BRIEF: Brief = {
  story: '',
  audience: '',
  goal: 'signups',
  feeling: [],
  keep: {},
  avoid: [],
  noise: 0,
  seed: 1,
};

const pkey = (defId: string, variantId?: string) => `${defId}__${variantId ?? 'default'}`;

export class Engine {
  private projects = new Map<string, Runtime>();
  constructor(private deps: EngineDeps) {}

  // ---------- registry ----------

  private registryPath(): string {
    return this.deps.registryFile ?? path.join(os.homedir(), '.sitemaxxing', 'projects.json');
  }

  readRegistry(): Array<{ id: string; name: string; rootPath: string; devUrl: string }> {
    try {
      return JSON.parse(fs.readFileSync(this.registryPath(), 'utf8'));
    } catch {
      return [];
    }
  }

  private writeRegistry(
    rows: Array<{ id: string; name: string; rootPath: string; devUrl: string }>,
  ) {
    fs.mkdirSync(path.dirname(this.registryPath()), { recursive: true });
    fs.writeFileSync(this.registryPath(), JSON.stringify(rows, null, 2));
  }

  listProjects(): Array<{
    id: string;
    name: string;
    devUrl: string;
    rootPath: string;
    loaded: boolean;
    source: string | null;
  }> {
    const source = (root: string) =>
      json.parse<{ url?: string } | null>(readIf(path.join(root, RECREATED)), null)?.url ?? null;
    const loaded = [...this.projects.values()].map((r) => ({
      id: r.project.id,
      name: r.project.name,
      devUrl: r.project.devUrl,
      rootPath: r.project.rootPath,
      loaded: true,
      source: source(r.project.rootPath),
    }));
    const reg = this.readRegistry()
      .filter((r) => !this.projects.has(r.id) && fs.existsSync(r.rootPath))
      .map((r) => ({ ...r, loaded: false, source: source(r.rootPath) }));
    return [...loaded, ...reg];
  }

  hasProject(id: string): boolean {
    return this.projects.has(id);
  }

  // ---------- lifecycle ----------

  static projectIdFor(rootPath: string): string {
    return createHash('sha1')
      .update(path.resolve(rootPath).toLowerCase())
      .digest('hex')
      .slice(0, 10);
  }

  /** Registers (or reloads) a project, takes a baseline snapshot and score, creates v1. */
  async initProject(
    rootPath: string,
    devUrl?: string,
  ): Promise<{ projectId: string; sections: Section[]; baseline: number | null; name: string }> {
    const root = path.resolve(rootPath);
    if (!fs.existsSync(root)) throw new Error(`path does not exist: ${root}`);
    const config = await loadConfig(root);
    if (devUrl) config.devUrl = devUrl;
    const id = Engine.projectIdFor(root);
    const dir = path.join(root, '.sitemaxxing');
    fs.mkdirSync(dir, { recursive: true });
    gitx.ensureInitialCommit(root);
    const db = openDb(path.join(dir, 'sitemaxxing.db'));
    const name = path.basename(root);
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    const project: Project = {
      id,
      name,
      mode: fs.existsSync(path.join(root, RECREATED)) ? 'url' : 'repo',
      rootPath: root,
      devUrl: config.devUrl,
      category: config.category,
      createdAt: existing?.created_at ?? now(),
    };
    db.prepare(
      `INSERT INTO projects(id,name,mode,root_path,dev_url,category,created_at) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, dev_url=excluded.dev_url, category=excluded.category, root_path=excluded.root_path`,
    ).run(id, name, project.mode, root, config.devUrl, config.category ?? null, project.createdAt);

    const old = this.projects.get(id);
    if (old?.versionServer) this.stopVersionServer(old);
    const rt: Runtime = {
      project,
      config,
      db,
      dir,
      defs: this.deps.passes,
      dom: emptySnapshot(config.devUrl),
      sections: [],
      llm: createLLM(config, path.join(dir, 'cache')),
      patches: new Map(),
      variants: new Map(),
      applied: [],
      previewing: null,
      lastPreviewAt: {},
      view: 'changes',
      viewingVersion: null,
      versionServer: null,
      page: old?.page ?? null,
      busy: null,
      score: null,
      audited: false,
      extraFiles: new Set(),
      queue: Promise.resolve(),
      brief: null,
      mood: null,
      seeds: {},
      measureTimer: null,
    };
    if (old) {
      // Re-registering an open project (a second client, a reconnect) must not forget what is
      // applied on disk, or its own previews would read as someone else's uncommitted edits.
      await old.queue.catch(() => undefined);
      Object.assign(rt, {
        applied: old.applied,
        extraFiles: old.extraFiles,
        patches: old.patches,
        variants: old.variants,
        previewing: old.previewing,
        lastPreviewAt: old.lastPreviewAt,
        view: old.view,
        audited: old.audited,
      });
      if (old.measureTimer) clearTimeout(old.measureTimer);
    } else this.restoreApplied(rt);
    this.loadBrief(rt);
    for (const r of db
      .prepare('SELECT def_id, seed FROM passes WHERE project_id = ?')
      .all(id) as any[])
      if (r.seed != null) rt.seeds[r.def_id] = Number(r.seed);
    this.projects.set(id, rt);
    const reg = this.readRegistry().filter((r) => r.id !== id);
    reg.unshift({ id, name, rootPath: root, devUrl: config.devUrl });
    this.writeRegistry(reg);

    await this.refreshSnapshot(rt);
    rt.sections = detectSections(rt.dom, id);
    db.prepare('DELETE FROM sections WHERE project_id = ?').run(id);
    const ins = db.prepare(
      'INSERT INTO sections(id,project_id,kind,selector,"order") VALUES(?,?,?,?,?)',
    );
    for (const s of rt.sections) ins.run(s.id, id, s.kind, s.selector, s.order);

    let baseline: number | null = null;
    const v1 = db
      .prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY number DESC LIMIT 1')
      .get(id) as any;
    if (!v1) {
      const score = await this.measure(rt);
      baseline = score?.score ?? null;
      const sha = gitx.headSha(root);
      const vid = newId();
      const shots = await this.screenshotAll(rt, 1);
      db.prepare(
        'INSERT INTO versions(id,project_id,number,git_sha,mog_score,pass_ids,variant_map,screenshots,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      ).run(vid, id, 1, sha, score?.score ?? 0, '[]', '{}', json.str(shots), now());
      if (score) this.recordScore(rt, vid, score);
    } else {
      rt.score = this.latestScore(rt);
      baseline = v1.mog_score;
    }
    this.emitState(rt);
    return { projectId: id, sections: rt.sections, baseline, name };
  }

  async loadRegistered(id: string): Promise<void> {
    const r = this.readRegistry().find((x) => x.id === id);
    if (!r) throw new Error(`unknown project ${id}`);
    // A recreated site has no dev server of its own running; start it again on its port.
    if (fs.existsSync(path.join(r.rootPath, RECREATED)) && !(await waitForUrl(r.devUrl, 600)))
      await this.serveSite(r.rootPath, r.devUrl);
    await this.initProject(r.rootPath, r.devUrl);
  }

  private siteServers = new Map<string, ChildProcess>();

  private async serveSite(dir: string, devUrl: string): Promise<void> {
    const port = Number(new URL(devUrl).port);
    const old = this.siteServers.get(dir);
    if (old) killTree(old);
    const proc = spawnVite(dir, port);
    this.siteServers.set(dir, proc);
    if (!(await waitForUrl(devUrl, 40_000)))
      throw new Error(`the recreated site did not start on ${devUrl}`);
  }

  /**
   * Any URL: reads a public page, writes it as a small React project that keeps the page's own
   * elements, styles and fonts, commits that as v1, serves it, checks its first screen against the
   * original, and opens it as a project. The story is left for the owner, with a first draft read
   * from the page.
   */
  async recreate(
    input: string,
  ): Promise<{ projectId: string; url: string; rootPath: string; baseline: number | null }> {
    const sites = this.deps.sites;
    if (!sites)
      throw new Error(
        'Recreating from a URL needs a sites folder; start Sitemaxxing with `sitemaxxing dev`.',
      );
    const url = normalizeUrl(input);
    const step = (what: string | null) =>
      this.deps.emit({ type: 'recreate.step', projectId: '', ts: Date.now(), url, what });
    try {
      const browser = await this.deps.browser();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      let cap;
      try {
        cap = await captureSite(page, url, step);
      } catch (e) {
        throw new Error(`Could not read ${url}: ${(e as Error).message.split('\n')[0]}`);
      } finally {
        await context.close().catch(() => undefined);
      }
      step('Writing it as code');
      fs.mkdirSync(sites.dir, { recursive: true });
      const dir = siteDirFor(sites.dir, url);
      const port = await freePort();
      const devUrl = `http://localhost:${port}`;
      copyTemplate(sites.template, dir);
      const modulesDir = path.join(sites.template, 'node_modules');
      for (const [rel, text] of Object.entries(siteFiles(cap, { devUrl, modulesDir }))) {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.writeFileSync(path.join(dir, rel), text);
      }
      const mark = (match: number | null) =>
        fs.writeFileSync(
          path.join(dir, RECREATED),
          JSON.stringify({ url, capturedAt: now(), match }, null, 2) + '\n',
        );
      mark(null);
      linkNodeModules(sites.template, dir);
      gitx.git(dir, ['init', '-q', '-b', 'main']);
      gitx.git(dir, ['add', '-A']);
      gitx.git(dir, [
        '-c',
        'user.name=Sitemaxxing',
        '-c',
        'user.email=sitemaxxing@localhost',
        'commit',
        '-q',
        '-m',
        `v1: recreated from ${url}`,
        '--no-verify',
      ]);
      step('Starting its dev server');
      await this.serveSite(dir, devUrl);
      step('Checking it against the original');
      const match = cap.shot ? await this.matchOf(devUrl, cap.shot) : null;
      mark(match);
      this.log(
        `recreated ${url}: first screen matches ${match === null ? 'unknown' : Math.round(match * 100) + '%'}`,
      );
      step('Measuring v1');
      const r = await this.initProject(dir, devUrl);
      return { projectId: r.projectId, url, rootPath: dir, baseline: r.baseline };
    } finally {
      step(null);
    }
  }

  /** Screenshots the rebuilt page's first screen and compares it with the original's. */
  private async matchOf(devUrl: string, original: Buffer): Promise<number | null> {
    try {
      const browser = await this.deps.browser();
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      try {
        const page = await context.newPage();
        await page.goto(devUrl, { waitUntil: 'load', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => undefined);
        await page.evaluate('document.fonts.ready');
        await page.waitForTimeout(600);
        await page.evaluate(STILL_JS);
        return screenshotMatch(original, await page.screenshot({ type: 'png' }));
      } finally {
        await context.close().catch(() => undefined);
      }
    } catch {
      return null;
    }
  }

  private rt(projectId: string): Runtime {
    const rt = this.projects.get(projectId);
    if (!rt) throw new Error(`project not loaded: ${projectId}`);
    return rt;
  }

  /** Serializes operations per project. */
  private run<T>(
    projectId: string,
    what: string | null,
    fn: (rt: Runtime) => Promise<T>,
  ): Promise<T> {
    const rt = this.rt(projectId);
    const next = rt.queue.then(async () => {
      if (what) this.setBusy(rt, what);
      try {
        return await fn(rt);
      } finally {
        if (what) this.setBusy(rt, null);
      }
    });
    rt.queue = next.catch(() => undefined);
    return next;
  }

  private setBusy(rt: Runtime, what: string | null) {
    rt.busy = what;
    this.deps.emit({ type: 'busy', projectId: rt.project.id, ts: Date.now(), what });
  }

  private log(msg: string) {
    this.deps.log?.(msg);
  }

  // ---------- browser helpers ----------

  private async page(rt: Runtime): Promise<Page | null> {
    try {
      if (rt.page && !rt.page.isClosed()) return rt.page;
      const browser = await this.deps.browser();
      const ctx = await browser.newContext({
        viewport: { width: rt.config.viewports[0][0], height: rt.config.viewports[0][1] },
        reducedMotion: 'reduce',
      });
      rt.page = await ctx.newPage();
      return rt.page;
    } catch (e) {
      this.log(`browser unavailable: ${(e as Error).message}`);
      return null;
    }
  }

  private async gotoDev(rt: Runtime, url = rt.project.devUrl): Promise<Page | null> {
    const page = await this.page(rt);
    if (!page) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
        // A cold dev server can reload the page after "network idle" (Vite re-optimising its
        // dependencies), which would leave a blank page to snapshot. Wait until the app has
        // rendered something, then for the network to settle again.
        await page
          .waitForFunction(() => (document.body?.innerText ?? '').trim().length > 0, undefined, {
            timeout: 10_000,
          })
          .catch(() => undefined);
        await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
        await page.evaluate(() => (window as any).__sitemaxxingHide?.());
        await page.waitForTimeout(150);
        return page;
      } catch (e) {
        const msg = (e as Error).message;
        if (/interrupted by another navigation/.test(msg) && attempt < 2) {
          await page.waitForTimeout(400);
          continue;
        }
        this.log(`dev server not reachable at ${url}: ${msg}`);
        return null;
      }
    }
    return null;
  }

  private async refreshSnapshot(rt: Runtime): Promise<void> {
    const page = await this.gotoDev(rt);
    rt.dom = page ? await takeSnapshot(page) : emptySnapshot(rt.project.devUrl);
  }

  private async measure(rt: Runtime): Promise<ScoreResult | null> {
    const page = await this.gotoDev(rt);
    if (!page) return null;
    const dom = await takeSnapshot(page);
    const score = await this.deps.scorer(page, dom, { mood: rt.mood ?? undefined });
    rt.score = score;
    return score;
  }

  private async screenshotAll(rt: Runtime, version: number): Promise<Record<string, string>> {
    const page = await this.gotoDev(rt);
    const out: Record<string, string> = {};
    if (!page) return out;
    const dir = path.join(rt.dir, 'screenshots', `v${version}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [w, h] of rt.config.viewports) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(120);
      const file = path.join(dir, `${w}x${h}.png`);
      await page.screenshot({ path: file, fullPage: false });
      out[`${w}x${h}`] = toPosix(path.relative(rt.project.rootPath, file));
    }
    await page.setViewportSize({
      width: rt.config.viewports[0][0],
      height: rt.config.viewports[0][1],
    });
    return out;
  }

  private recordScore(rt: Runtime, versionId: string | null, score: ScoreResult) {
    rt.db
      .prepare(
        'INSERT INTO scores(id,project_id,version_id,mog_score,metrics,created_at) VALUES(?,?,?,?,?,?)',
      )
      .run(newId(), rt.project.id, versionId, score.score, json.str(score), now());
  }

  private latestScore(rt: Runtime): ScoreResult | null {
    const row = rt.db
      .prepare('SELECT metrics FROM scores WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(rt.project.id) as any;
    return row ? json.parse<ScoreResult | null>(row.metrics, null) : null;
  }

  // ---------- pass context ----------

  private ctx(rt: Runtime): PassContext {
    const files = makeFileSystem(rt.project.rootPath);
    const content = files.exists(rt.config.content)
      ? { path: rt.config.content, data: JSON.parse(files.read(rt.config.content)) }
      : undefined;
    const choices: Record<string, string> = {};
    for (const row of rt.db
      .prepare('SELECT def_id, chosen_variant_id FROM passes WHERE project_id = ?')
      .all(rt.project.id) as any[]) {
      if (row.chosen_variant_id) choices[row.def_id] = row.chosen_variant_id;
    }
    return {
      project: rt.project,
      config: rt.config,
      files,
      dom: rt.dom,
      tokens: readTokens(files, rt.config),
      llm: rt.llm,
      content,
      choices,
      applied: rt.applied.map((a) => a.defId),
      brief: rt.brief ?? PLACEHOLDER_BRIEF,
      mood: rt.mood ?? moodOf(PLACEHOLDER_BRIEF),
      seeds: Object.fromEntries(rt.defs.map((d) => [d.id, this.seedFor(rt, d.id)])),
    };
  }

  /** The owner's latest "why not?" answer per pass since the story was last told. */
  private answers(rt: Runtime): Record<string, ReasonChip | null> {
    const since =
      (
        rt.db
          .prepare(
            'SELECT created_at FROM briefs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
          )
          .get(rt.project.id) as any
      )?.created_at ?? '';
    const rows = rt.db
      .prepare(
        `SELECT pass_id, reason_chip FROM decisions WHERE project_id = ? AND action = 'reject' AND created_at >= ? AND (reason_chip IS NOT NULL OR meta LIKE '%"clearReason":true%') ORDER BY created_at, rowid`,
      )
      .all(rt.project.id, since) as any[];
    const out: Record<string, ReasonChip | null> = {};
    const prefix = `${rt.project.id}:`;
    for (const r of rows)
      if (r.pass_id) out[String(r.pass_id).replace(prefix, '')] = r.reason_chip ?? null;
    return out;
  }

  /** The context one pass generates from: the brief's mood and noise, leaned by the owner's answers. */
  private leaned(
    rt: Runtime,
    defId: string,
    ctx: PassContext,
    answers = this.answers(rt),
  ): PassContext {
    if (!rt.brief || !rt.mood) return ctx;
    const lean = leanFor(defId, answers);
    if (isNeutral(lean)) return { ...ctx, mood: rt.mood, brief: rt.brief };
    const { mood, noise } = applyLean(rt.mood, rt.brief.noise, lean);
    return { ...ctx, mood, brief: { ...rt.brief, noise } };
  }

  private seedFor(rt: Runtime, defId: string): number {
    return rt.seeds[defId] ?? hashSeed((rt.brief ?? PLACEHOLDER_BRIEF).seed, defId);
  }

  // ---------- brief ----------

  private loadBrief(rt: Runtime) {
    const row = rt.db
      .prepare('SELECT brief FROM briefs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(rt.project.id) as any;
    let brief: Brief | null = null;
    if (row) brief = json.parse<Brief | null>(row.brief, null);
    else {
      const file = path.join(rt.dir, 'brief.json');
      const fromFile = fs.existsSync(file)
        ? json.parse<Partial<Brief> | null>(fs.readFileSync(file, 'utf8'), null)
        : null;
      const seedBrief = fromFile ?? rt.config.brief ?? null;
      if (seedBrief?.story && seedBrief.story.trim().length >= 12)
        brief = normalizeBrief(seedBrief);
    }
    rt.brief = brief;
    rt.mood = brief ? moodOf(brief) : null;
  }

  getBrief(projectId: string): { brief: Brief | null; mood: Mood | null } {
    const rt = this.rt(projectId);
    return { brief: rt.brief, mood: rt.mood };
  }

  /** Stores the owner's story. A changed story or seed resets the generation seeds. */
  async setBrief(projectId: string, input: Partial<Brief>): Promise<ProjectState> {
    return this.run(projectId, null, async (rt) => {
      const prev = rt.brief;
      const brief = normalizeBrief({ ...(prev ?? {}), ...input, seed: input.seed ?? prev?.seed });
      const mood = moodOf(brief);
      rt.db
        .prepare('INSERT INTO briefs(id,project_id,brief,mood,created_at) VALUES(?,?,?,?,?)')
        .run(newId(), rt.project.id, json.str(brief), json.str(mood), now());
      fs.writeFileSync(path.join(rt.dir, 'brief.json'), JSON.stringify(brief, null, 2) + '\n');
      const changed =
        !prev ||
        prev.seed !== brief.seed ||
        prev.story !== brief.story ||
        prev.goal !== brief.goal ||
        prev.feeling.join() !== brief.feeling.join() ||
        prev.noise !== brief.noise;
      rt.brief = brief;
      rt.mood = mood;
      if (changed) {
        rt.seeds = {};
        rt.db
          .prepare(`UPDATE passes SET seed = NULL WHERE project_id = ? AND status != 'committed'`)
          .run(rt.project.id);
        rt.audited = false;
      }
      return this.emitState(rt);
    });
  }

  private passRowId(rt: Runtime, defId: string) {
    return `${rt.project.id}:${defId}`;
  }

  private defOf(rt: Runtime, passId: string): PassDefinition {
    const defId = passId.includes(':') ? passId.split(':').slice(1).join(':') : passId;
    const def = rt.defs.find((d) => d.id === defId);
    if (!def) throw new Error(`unknown pass ${passId}`);
    return def;
  }

  private row(rt: Runtime, defId: string): any {
    return rt.db.prepare('SELECT * FROM passes WHERE id = ?').get(this.passRowId(rt, defId));
  }

  private setStatus(
    rt: Runtime,
    defId: string,
    status: PassStatus,
    extra: Record<string, unknown> = {},
  ) {
    const sets = ['status = ?'];
    const vals: unknown[] = [status];
    for (const [k, v] of Object.entries(extra)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    vals.push(this.passRowId(rt, defId));
    rt.db.prepare(`UPDATE passes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    this.deps.emit({
      type: 'pass.decided',
      projectId: rt.project.id,
      ts: Date.now(),
      passId: this.passRowId(rt, defId),
      status,
    });
  }

  // ---------- audit ----------

  async audit(projectId: string): Promise<ProjectState> {
    return this.run(projectId, 'Planning', async (rt) => {
      if (!rt.brief || !rt.mood)
        throw new Error(
          'Tell the story first: set a brief (what this is, who it is for, the goal, how it should feel) before planning.',
        );
      this.assertClean(rt);
      this.measureSuspended = true;
      try {
        return await this.auditInner(rt);
      } finally {
        this.measureSuspended = false;
      }
    });
  }

  private async auditInner(rt: Runtime): Promise<ProjectState> {
    {
      if (!rt.brief || !rt.mood) throw new Error('no brief');
      await this.setApplied(rt, []);
      rt.previewing = null;
      rt.view = 'changes';
      rt.patches.clear();
      rt.variants.clear();
      await this.refreshSnapshot(rt);
      rt.sections = detectSections(rt.dom, rt.project.id);
      const score = await this.measure(rt);
      if (score) this.recordScore(rt, null, score);
      const committed = new Set(
        (
          rt.db
            .prepare(`SELECT def_id FROM passes WHERE project_id = ? AND status = 'committed'`)
            .all(rt.project.id) as any[]
        ).map((r) => r.def_id),
      );
      const ctx = this.ctx(rt);
      const upsert = rt.db.prepare(
        `INSERT INTO passes(id,project_id,def_id,kind,name,section_id,"order",depends_on,points,status,chosen_variant_id,skip_reason,findings,summary,copy_diff,rationale,seed)
         VALUES(@id,@project_id,@def_id,@kind,@name,@section_id,@order,@depends_on,@points,@status,@chosen_variant_id,@skip_reason,@findings,@summary,@copy_diff,@rationale,@seed)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, chosen_variant_id=excluded.chosen_variant_id, skip_reason=excluded.skip_reason,
           findings=excluded.findings, summary=excluded.summary, copy_diff=excluded.copy_diff, points=excluded.points, "order"=excluded."order",
           rationale=excluded.rationale, seed=excluded.seed`,
      );
      // 1. Detect on every pass, 2. plan for this brief, 3. generate variants only for what matters.
      const detections = new Map<string, Detection>();
      for (const def of rt.defs) {
        if (committed.has(def.id)) continue;
        try {
          detections.set(def.id, await def.detect(ctx));
        } catch (e) {
          detections.set(def.id, {
            applies: false,
            findings: [],
            reason: `detect failed: ${(e as Error).message}`,
          });
        }
      }
      const items = plan(
        rt.defs.filter((d) => !committed.has(d.id)),
        detections,
        rt.brief,
        rt.mood,
      );
      const answers = this.answers(rt);
      for (const item of items) {
        const def = rt.defs.find((d) => d.id === item.defId)!;
        const id = this.passRowId(rt, def.id);
        const det = detections.get(def.id)!;
        const seed = this.seedFor(rt, def.id);
        rt.seeds[def.id] = seed;
        const dctx = this.leaned(rt, def.id, ctx, answers);
        const variants = item.include ? ((await def.variants?.(dctx)) ?? []) : [];
        rt.variants.set(def.id, variants);
        rt.db.prepare('DELETE FROM variants WHERE pass_id = ?').run(id);
        const prevChoice =
          (this.row(rt, def.id)?.chosen_variant_id as string | undefined) ?? undefined;
        const chosen = variants.length
          ? variants.some((v) => v.id === prevChoice)
            ? prevChoice
            : variants[0].id
          : null;
        let summary = item.include ? def.description : null;
        let copyDiff: CopyChange[] | null = null;
        let include = item.include;
        if (include) {
          const targets = variants.length ? variants.map((v) => v.id) : [undefined];
          let any = false;
          for (const vid of targets) {
            const pre = await this.precompute(rt, def, vid, ctx);
            any = any || !!pre;
            if (pre && vid === (chosen ?? undefined)) {
              summary = pre.summary || summary;
              copyDiff = pre.copyDiff ?? null;
              if (pre.notes?.length)
                det.findings.push(
                  ...pre.notes.map((n) => ({ message: n, severity: 'info' as const })),
                );
            }
          }
          if (!any) {
            include = false;
            item.skipReason = 'could not build a change for this page';
          }
          for (const v of variants) {
            rt.db
              .prepare(
                'INSERT INTO variants(id,pass_id,label,patch_path,thumbnail_svg,source,attributes) VALUES(?,?,?,?,?,?,?)',
              )
              .run(
                `${id}:${v.id}`,
                id,
                v.label,
                path.join('.sitemaxxing', 'patches', patchFileName(def.id, v.id)),
                v.thumbnail,
                v.source ?? 'library',
                json.str(v.attributes ?? {}),
              );
          }
        }
        upsert.run({
          id,
          project_id: rt.project.id,
          def_id: def.id,
          kind: def.kind,
          name: def.name,
          section_id: null,
          order: item.order,
          depends_on: json.str(def.dependsOn ?? []),
          points: item.impact,
          status: include ? 'proposed' : 'skipped',
          chosen_variant_id: chosen,
          skip_reason: include ? null : (item.skipReason ?? 'already fine'),
          findings: json.str(det.findings),
          summary,
          copy_diff: copyDiff ? json.str(copyDiff) : null,
          rationale: item.rationale,
          seed,
        });
      }
      rt.audited = true;
      this.deps.emit({
        type: 'audit.done',
        projectId: rt.project.id,
        ts: Date.now(),
        score: rt.score?.score ?? 0,
      });
      return this.emitState(rt);
    }
  }

  private async precompute(
    rt: Runtime,
    def: PassDefinition,
    variantId: string | undefined,
    ctx: PassContext,
  ): Promise<PrecomputedPatch | null> {
    try {
      const patch = await def.propose(this.leaned(rt, def.id, ctx), variantId);
      const text = toUnifiedDiff(patch);
      const file = writePatchFile(path.join(rt.dir, 'patches'), def.id, variantId, text);
      const pre: PrecomputedPatch = {
        text,
        files: filesTouched(text),
        copyDiff: patch.copyDiff,
        summary: patch.summary,
        notes: patch.notes,
        file,
      };
      rt.patches.set(pkey(def.id, variantId), pre);
      return pre;
    } catch (e) {
      this.log(`propose failed for ${def.id}/${variantId ?? 'default'}: ${(e as Error).message}`);
      return null;
    }
  }

  // ---------- state ----------

  state(projectId: string): ProjectState {
    return this.buildState(this.rt(projectId));
  }

  private readings = new WeakMap<SnapshotDOM, { stamp: string; reading: SystemReading }>();

  /** The design system the project has now, read from the last snapshot and its stylesheets. */
  private systemOf(rt: Runtime): SystemReading | null {
    if (!rt.dom.nodes.length) return null;
    const files = makeFileSystem(rt.project.rootPath);
    // The page is read once per snapshot; the stylesheets again whenever one of them changes.
    const stamp = [...new Set([rt.config.sources.tokens, rt.config.sources.styles, ...files.list('src', '.css')])]
      .map((f) => {
        try {
          return `${f}:${fs.statSync(path.join(rt.project.rootPath, f)).mtimeMs}`;
        } catch {
          return '';
        }
      })
      .join('|');
    const cached = this.readings.get(rt.dom);
    let reading = cached?.stamp === stamp ? cached.reading : undefined;
    if (!reading) {
      const sheets = [
        ...new Set([
          rt.config.sources.tokens,
          rt.config.sources.styles,
          ...files.list('src', '.css'),
        ]),
      ].filter((f) => files.exists(f));
      reading = readSystem(
        rt.dom,
        sheets.map((f) => files.read(f)),
      );
      this.readings.set(rt.dom, { stamp, reading });
    }
    return reading;
  }

  readSystem(projectId: string): SystemReading | null {
    return this.systemOf(this.rt(projectId));
  }

  private buildState(rt: Runtime): ProjectState {
    const rows = rt.db
      .prepare('SELECT * FROM passes WHERE project_id = ? ORDER BY "order"')
      .all(rt.project.id) as any[];
    const versions = this.versions(rt);
    const current = versions.at(-1)?.number ?? 1;
    const ctx = rt.audited ? this.ctx(rt) : null;
    const answers = rt.brief ? this.answers(rt) : {};
    const passes: PassView[] = rows.map((r) => {
      const def = rt.defs.find((d) => d.id === r.def_id);
      const variants = rt.variants.get(r.def_id) ?? this.variantRows(rt, r.id);
      const pre = rt.patches.get(pkey(r.def_id, r.chosen_variant_id ?? undefined));
      return {
        id: r.id,
        defId: r.def_id,
        name: r.name,
        kind: r.kind,
        order: r.order,
        impact: r.points ?? 0,
        rationale: r.rationale ?? '',
        seed: r.seed ?? 0,
        status: rt.previewing?.defId === r.def_id ? 'previewing' : r.status,
        baseStatus: r.status,
        description: def?.description ?? '',
        chosenVariantId: r.chosen_variant_id ?? undefined,
        variants,
        findings: json.parse<Finding[]>(r.findings, []),
        skipReason: r.skip_reason ?? undefined,
        dependsOn: json.parse<string[]>(r.depends_on, []),
        ruleCards: def?.ruleCards ?? [],
        copyDiff: pre?.copyDiff ?? json.parse<CopyChange[] | undefined>(r.copy_diff, undefined),
        summary: pre?.summary ?? r.summary ?? def?.description,
        forceState: def?.forceState,
        replay: def?.replay,
        highlight: def && ctx ? safeHighlight(def, ctx, r.chosen_variant_id ?? undefined) : [],
        reason: answers[r.def_id] ?? undefined,
        lean: describeLean(leanFor(r.def_id, answers)),
      };
    });
    return {
      project: rt.project,
      baseline: versions[0]?.score ?? 0,
      score: rt.score,
      passes,
      versions,
      currentVersion: current,
      view: rt.view,
      previewing: rt.previewing
        ? { passId: this.passRowId(rt, rt.previewing.defId), variantId: rt.previewing.variantId }
        : null,
      viewingVersion: rt.viewingVersion,
      versionUrl: rt.versionServer?.url ?? null,
      audited: rt.audited,
      busy: rt.busy,
      brief: rt.brief,
      mood: rt.mood,
      source:
        rt.project.mode === 'url'
          ? (json.parse<{ url?: string } | null>(
              readIf(path.join(rt.project.rootPath, RECREATED)),
              null,
            )?.url ?? null)
          : null,
      sourceMatch:
        rt.project.mode === 'url'
          ? (json.parse<{ match?: number | null } | null>(
              readIf(path.join(rt.project.rootPath, RECREATED)),
              null,
            )?.match ?? null)
          : null,
      system: this.systemOf(rt),
      suggestedBrief: rt.brief
        ? null
        : json.parse<Partial<Brief> | null>(
            readIf(path.join(rt.dir, 'suggested-brief.json')),
            null,
          ),
    };
  }

  /**
   * Re-measures the real page shortly after the tree changes, so the score ring reflects what is
   * on screen rather than a table of expected gains. Debounced so hover previews stay fast.
   */
  private scheduleMeasure(rt: Runtime) {
    if (rt.measureTimer) clearTimeout(rt.measureTimer);
    rt.measureTimer = setTimeout(() => {
      rt.measureTimer = null;
      this.run(rt.project.id, null, async () => {
        if (rt.viewingVersion) return;
        const before = rt.score?.score ?? null;
        const score = await this.measure(rt);
        if (!score) return;
        this.deps.emit({
          type: 'score.updated',
          projectId: rt.project.id,
          ts: Date.now(),
          score: score.score,
          delta: before === null ? 0 : Math.round(score.score - before),
          metrics: score.metrics,
        });
        this.emitState(rt);
      }).catch((e) => this.log(`measure failed: ${(e as Error).message}`));
    }, 900);
  }

  private variantRows(rt: Runtime, passId: string): Variant[] {
    return (rt.db.prepare('SELECT * FROM variants WHERE pass_id = ?').all(passId) as any[]).map(
      (v) => ({
        id: v.id.split(':').at(-1),
        label: v.label,
        thumbnail: v.thumbnail_svg ?? '',
        attributes: json.parse(v.attributes, {}),
        source: v.source,
      }),
    );
  }

  private versions(rt: Runtime): VersionView[] {
    return (
      rt.db
        .prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY number')
        .all(rt.project.id) as any[]
    ).map((v) => {
      const ids = json.parse<string[]>(v.pass_ids, []);
      return {
        number: v.number,
        score: Math.round(v.mog_score),
        sha: v.git_sha,
        label:
          v.number === 1
            ? 'Original'
            : ids.map((id) => rt.defs.find((d) => d.id === id)?.name ?? id).join(', '),
        createdAt: v.created_at,
      };
    });
  }

  private emitState(rt: Runtime): ProjectState {
    const state = this.buildState(rt);
    this.deps.emit({ type: 'state', projectId: rt.project.id, ts: Date.now(), state });
    return state;
  }

  listPasses(projectId: string): PassView[] {
    return this.state(projectId).passes;
  }

  // ---------- applying patches ----------

  private assertClean(rt: Runtime) {
    const ours = new Set<string>();
    for (const a of rt.applied) a.files.forEach((f) => ours.add(f));
    for (const f of rt.extraFiles) ours.add(f);
    const ignore = [
      'sitemaxxing.config.ts',
      'sitemaxxing.config.js',
      '.gitignore',
      'vite.config.ts',
      'vite.config.js',
      'vite.config.mts',
    ];
    const dirty = gitx
      .dirtyFiles(rt.project.rootPath)
      .filter((f) => !ours.has(f) && !ignore.includes(f));
    if (dirty.length) {
      throw new Error(
        `Uncommitted edits in the target repo: ${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? '…' : ''}. Commit or stash them first.`,
      );
    }
  }

  private patchFor(rt: Runtime, defId: string, variantId?: string): PrecomputedPatch | undefined {
    return rt.patches.get(pkey(defId, variantId));
  }

  /** Brings the working tree to exactly `desired` (ordered), reversing/applying as needed. */
  private async setApplied(
    rt: Runtime,
    desired: Array<{ defId: string; variantId?: string }>,
  ): Promise<void> {
    let common = 0;
    while (
      common < rt.applied.length &&
      common < desired.length &&
      rt.applied[common].defId === desired[common].defId &&
      rt.applied[common].variantId === desired[common].variantId
    )
      common++;
    const stage = new Staging(rt.project.rootPath);
    try {
      for (let i = rt.applied.length - 1; i >= common; i--) {
        const a = rt.applied[i];
        try {
          applyStaged(stage, a.text, { reverse: true });
        } catch (e) {
          this.log(`reverse failed for ${a.defId}: ${(e as Error).message}`);
        }
        rt.applied.pop();
      }
      for (let i = common; i < desired.length; i++) {
        const d = desired[i];
        let pre = this.patchFor(rt, d.defId, d.variantId);
        if (!pre) throw new Error(`no patch for ${d.defId}/${d.variantId ?? 'default'}`);
        if (!canApply(stage, pre.text)) {
          // Context drift: another applied pass touched neighbouring lines. The pass is
          // deterministic, so re-proposing it against the current tree yields the same change
          // with a diff that applies. Passes read from disk, so flush the staged tree first.
          stage.flush();
          const def = rt.defs.find((x) => x.id === d.defId);
          const fresh = def ? await this.precompute(rt, def, d.variantId, this.ctx(rt)) : null;
          if (fresh) pre = fresh;
        }
        try {
          applyStaged(stage, pre.text);
          rt.applied.push({
            defId: d.defId,
            variantId: d.variantId,
            text: pre.text,
            files: pre.files,
          });
        } catch (e) {
          if (e instanceof PatchApplyError) {
            this.markStale(rt, [d.defId]);
            throw new Error(`${d.defId} no longer applies cleanly (${e.file}); regenerate it.`);
          }
          throw e;
        }
      }
    } finally {
      this.touchLater(rt, stage.flush());
      this.persistApplied(rt);
    }
    if (rt.audited && !this.measureSuspended) this.scheduleMeasure(rt);
  }

  /**
   * What is applied on disk, kept next to the database. If the hub stops without cleaning up (a
   * killed process, a crash), the next start can take back exactly its own edits.
   */
  private persistApplied(rt: Runtime) {
    try {
      fs.writeFileSync(
        path.join(rt.dir, 'applied.json'),
        JSON.stringify({ applied: rt.applied, extraFiles: [...rt.extraFiles] }),
      );
    } catch (e) {
      this.log(`could not record applied patches: ${(e as Error).message}`);
    }
  }

  /** Reverses patches a previous run left applied, so the tree is back at HEAD plus copy edits. */
  private restoreApplied(rt: Runtime) {
    const file = path.join(rt.dir, 'applied.json');
    const saved = json.parse<{ applied: AppliedPatch[]; extraFiles: string[] } | null>(
      readIf(file),
      null,
    );
    if (!saved) return;
    for (const f of saved.extraFiles ?? []) rt.extraFiles.add(f);
    if (saved.applied?.length) {
      const stage = new Staging(rt.project.rootPath);
      for (const a of [...saved.applied].reverse()) {
        try {
          applyStaged(stage, a.text, { reverse: true });
        } catch (e) {
          this.log(`could not take back ${a.defId} from an earlier run: ${(e as Error).message}`);
        }
      }
      stage.flush();
      this.log(`took back ${saved.applied.length} change(s) an earlier run left applied`);
    }
    this.persistApplied(rt);
  }

  /**
   * Dev-server watchers can coalesce writes that land a few milliseconds apart and keep serving the
   * earlier content. Once writes go quiet, bump the mtime of everything written so a final change
   * event always arrives with the final content.
   */
  private pendingTouch = new Map<string, Set<string>>();
  private touchTimer: ReturnType<typeof setTimeout> | null = null;
  private touchLater(rt: Runtime, files: string[]) {
    if (!files.length) return;
    const set = this.pendingTouch.get(rt.project.rootPath) ?? new Set<string>();
    files.forEach((f) => set.add(f));
    this.pendingTouch.set(rt.project.rootPath, set);
    if (this.touchTimer) clearTimeout(this.touchTimer);
    this.touchTimer = setTimeout(() => {
      this.touchTimer = null;
      const now = new Date();
      for (const [root, rels] of this.pendingTouch) {
        for (const rel of rels) {
          const abs = path.join(root, rel);
          try {
            if (fs.existsSync(abs)) fs.utimesSync(abs, now, now);
          } catch {
            /* best effort */
          }
        }
      }
      this.pendingTouch.clear();
    }, 180);
  }

  /** Commit and audit measure on their own; they suspend the debounced re-measure. */
  private measureSuspended = false;

  private approvedOrdered(rt: Runtime): Array<{ defId: string; variantId?: string }> {
    return (
      rt.db
        .prepare(
          `SELECT def_id, chosen_variant_id FROM passes WHERE project_id = ? AND status = 'approved' ORDER BY "order"`,
        )
        .all(rt.project.id) as any[]
    ).map((r) => ({
      defId: r.def_id,
      variantId: r.chosen_variant_id ?? undefined,
    }));
  }

  private desired(rt: Runtime): Array<{ defId: string; variantId?: string }> {
    if (rt.view === 'current') return [];
    const list = this.approvedOrdered(rt);
    if (rt.previewing && !list.some((x) => x.defId === rt.previewing!.defId))
      list.push({ defId: rt.previewing.defId, variantId: rt.previewing.variantId });
    else if (rt.previewing) {
      const i = list.findIndex((x) => x.defId === rt.previewing!.defId);
      list[i] = { defId: rt.previewing.defId, variantId: rt.previewing.variantId };
    }
    return list;
  }

  private markStale(rt: Runtime, defIds: string[]) {
    const stale: string[] = [];
    for (const id of defIds) {
      const row = this.row(rt, id);
      if (!row || ['committed', 'skipped'].includes(row.status)) continue;
      rt.db.prepare(`UPDATE passes SET status = 'stale' WHERE id = ?`).run(row.id);
      stale.push(row.id);
    }
    if (stale.length)
      this.deps.emit({
        type: 'pass.stale',
        projectId: rt.project.id,
        ts: Date.now(),
        passIds: stale,
      });
  }

  // ---------- preview ----------

  async preview(
    projectId: string,
    passId: string,
    variantId?: string,
    meta: DecisionMeta = {},
  ): Promise<ProjectState> {
    return this.run(projectId, null, async (rt) => {
      const def = this.defOf(rt, passId);
      const row = this.row(rt, def.id);
      if (!row) throw new Error(`run audit first`);
      if (row.status === 'committed' || row.status === 'skipped') return this.buildState(rt);
      this.assertClean(rt);
      if (rt.viewingVersion) await this.viewVersionInner(rt, null);
      const vid = variantId ?? row.chosen_variant_id ?? undefined;
      if (rt.previewing && rt.previewing.defId === def.id && rt.previewing.variantId === vid)
        return this.buildState(rt);
      this.closePreviewDecision(rt);
      rt.view = 'changes';
      rt.previewing = {
        defId: def.id,
        variantId: vid,
        startedAt: Date.now(),
        shownAlongside: meta.shownAlongside ?? this.alongside(rt, def.id),
      };
      try {
        await this.setApplied(rt, this.desired(rt));
      } catch (e) {
        rt.previewing = null;
        this.emitState(rt);
        throw e;
      }
      rt.lastPreviewAt[def.id] = Date.now();
      const ctx = this.ctx(rt);
      const pre = this.patchFor(rt, def.id, vid);
      const variants = rt.variants.get(def.id) ?? [];
      const vlabel = variants.find((v) => v.id === vid)?.label;
      const label = vlabel ? `${def.name} · ${vlabel}` : def.name;
      this.deps.emit({
        type: 'pass.previewed',
        projectId: rt.project.id,
        ts: Date.now(),
        passId: row.id,
        variantId: vid,
        selectors: safeHighlight(def, ctx, vid),
        label,
        forceState: def.forceState,
        replay: def.replay,
        copyDiff: pre?.copyDiff,
      });
      return this.emitState(rt);
    });
  }

  private alongside(rt: Runtime, defId: string): string[] {
    const def = rt.defs.find((d) => d.id === defId);
    return rt.defs
      .filter((d) => d.id !== defId && d.kind === def?.kind)
      .map((d) => this.passRowId(rt, d.id));
  }

  private closePreviewDecision(rt: Runtime) {
    if (!rt.previewing) return;
    const p = rt.previewing;
    this.logDecision(rt, p.defId, 'preview', p.variantId, {
      dwellMs: Date.now() - p.startedAt,
      shownAlongside: p.shownAlongside,
    });
  }

  async endPreview(projectId: string): Promise<ProjectState> {
    return this.run(projectId, null, async (rt) => {
      if (!rt.previewing) return this.buildState(rt);
      const passId = this.passRowId(rt, rt.previewing.defId);
      this.closePreviewDecision(rt);
      rt.previewing = null;
      await this.setApplied(rt, this.desired(rt));
      this.deps.emit({ type: 'preview.ended', projectId: rt.project.id, ts: Date.now(), passId });
      return this.emitState(rt);
    });
  }

  async setView(projectId: string, view: 'current' | 'changes'): Promise<ProjectState> {
    return this.run(projectId, null, async (rt) => {
      if (rt.viewingVersion) await this.viewVersionInner(rt, null);
      if (rt.previewing) {
        this.closePreviewDecision(rt);
        rt.previewing = null;
      }
      rt.view = view;
      await this.setApplied(rt, this.desired(rt));
      return this.emitState(rt);
    });
  }

  // ---------- decisions ----------

  private logDecision(
    rt: Runtime,
    defId: string | null,
    action: DecisionAction,
    variantId: string | undefined,
    meta: DecisionMeta,
  ) {
    const variant =
      defId && variantId
        ? (rt.variants.get(defId) ?? []).find((v) => v.id === variantId)
        : undefined;
    const extra = {
      seed: defId ? this.seedFor(rt, defId) : rt.brief?.seed,
      goal: rt.brief?.goal,
      noise: rt.brief?.noise,
      mood: rt.mood,
      attributes: variant?.attributes,
      ...(meta.extra ?? {}),
    };
    rt.db
      .prepare(
        'INSERT INTO decisions(id,user_id,project_id,pass_id,variant_id,action,shown_alongside,reason_chip,dwell_ms,created_at,meta) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        newId(),
        'local',
        rt.project.id,
        defId ? this.passRowId(rt, defId) : null,
        variantId ?? null,
        action,
        json.str(meta.shownAlongside ?? (defId ? this.alongside(rt, defId) : [])),
        meta.reasonChip ?? null,
        meta.dwellMs ??
          (defId && rt.lastPreviewAt[defId] ? Date.now() - rt.lastPreviewAt[defId] : null),
        now(),
        json.str(extra),
      );
  }

  async decide(
    projectId: string,
    passId: string,
    action: 'approve' | 'reject' | 'pick' | 'regenerate',
    variantId?: string,
    meta: DecisionMeta = {},
  ): Promise<ProjectState> {
    return this.run(projectId, action === 'regenerate' ? 'Regenerating' : null, async (rt) => {
      const def = this.defOf(rt, passId);
      const row = this.row(rt, def.id);
      if (!row) throw new Error('run audit first');
      if (row.status === 'committed') return this.buildState(rt);
      this.assertClean(rt);
      if (rt.viewingVersion) await this.viewVersionInner(rt, null);
      const wasPreviewing = rt.previewing?.defId === def.id;

      if (action === 'pick') {
        const vid = variantId ?? row.chosen_variant_id;
        const changed = vid !== row.chosen_variant_id;
        rt.db.prepare('UPDATE passes SET chosen_variant_id = ? WHERE id = ?').run(vid, row.id);
        const pre = this.patchFor(rt, def.id, vid ?? undefined);
        if (pre)
          rt.db
            .prepare('UPDATE passes SET summary = ?, copy_diff = ? WHERE id = ?')
            .run(pre.summary, pre.copyDiff ? json.str(pre.copyDiff) : null, row.id);
        this.logDecision(rt, def.id, 'pick', vid ?? undefined, meta);
        if (changed && row.status === 'approved') this.markStale(rt, downstreamOf(def.id, rt.defs));
        if (rt.previewing?.defId !== def.id) {
          this.closePreviewDecision(rt);
          rt.previewing = {
            defId: def.id,
            variantId: vid ?? undefined,
            startedAt: Date.now(),
            shownAlongside: this.alongside(rt, def.id),
          };
        } else rt.previewing = { ...rt.previewing, variantId: vid ?? undefined };
        rt.view = 'changes';
        await this.setApplied(rt, this.desired(rt));
        const ctx = this.ctx(rt);
        const vlabel = (rt.variants.get(def.id) ?? []).find((v) => v.id === vid)?.label;
        this.deps.emit({
          type: 'pass.previewed',
          projectId: rt.project.id,
          ts: Date.now(),
          passId: row.id,
          variantId: vid ?? undefined,
          selectors: safeHighlight(def, ctx, vid ?? undefined),
          label: vlabel ? `${def.name} · ${vlabel}` : def.name,
          forceState: def.forceState,
          replay: def.replay,
          copyDiff: pre?.copyDiff,
        });
        return this.emitState(rt);
      }

      if (action === 'regenerate') {
        if (wasPreviewing) {
          this.closePreviewDecision(rt);
          rt.previewing = null;
          await this.setApplied(rt, this.desired(rt));
        }
        await this.refreshSnapshot(rt);
        const ctx = this.ctx(rt);
        const variants =
          (await def.variants?.(this.leaned(rt, def.id, ctx))) ?? rt.variants.get(def.id) ?? [];
        rt.variants.set(def.id, variants);
        const targets = variants.length ? variants.map((v) => v.id) : [undefined];
        let ok = false;
        for (const vid of targets) ok = (await this.precompute(rt, def, vid, ctx)) !== null || ok;
        const pre = this.patchFor(rt, def.id, row.chosen_variant_id ?? undefined);
        this.setStatus(rt, def.id, ok ? 'proposed' : 'stale', {
          summary: pre?.summary ?? def.description,
          copy_diff: pre?.copyDiff ? json.str(pre.copyDiff) : null,
        });
        this.logDecision(rt, def.id, 'regenerate', row.chosen_variant_id ?? undefined, meta);
        return this.emitState(rt);
      }

      const vid = row.chosen_variant_id ?? undefined;
      if (action === 'approve') {
        const next: PassStatus = row.status === 'approved' ? 'proposed' : 'approved';
        if (row.status === 'stale') throw new Error('This pass is stale; regenerate it first.');
        if (wasPreviewing) {
          this.closePreviewDecision(rt);
          rt.previewing = null;
        }
        this.setStatus(rt, def.id, next);
        this.logDecision(rt, def.id, 'approve', vid, meta);
        if (next === 'proposed')
          this.markStale(
            rt,
            downstreamOf(def.id, rt.defs).filter((d) => this.row(rt, d)?.status === 'approved'),
          );
        rt.view = 'changes';
        await this.setApplied(rt, this.desired(rt));
        if (next === 'approved') {
          const ctx = this.ctx(rt);
          this.deps.emit({
            type: 'pass.previewed',
            projectId: rt.project.id,
            ts: Date.now(),
            passId: row.id,
            variantId: vid,
            selectors: safeHighlight(def, ctx, vid),
            label: def.name,
            forceState: undefined,
            replay: def.replay,
          });
        } else
          this.deps.emit({
            type: 'preview.ended',
            projectId: rt.project.id,
            ts: Date.now(),
            passId: row.id,
          });
        return this.emitState(rt);
      }

      // reject (toggle)
      const next: PassStatus = row.status === 'rejected' ? 'proposed' : 'rejected';
      if (wasPreviewing) {
        this.closePreviewDecision(rt);
        rt.previewing = null;
      }
      this.setStatus(rt, def.id, next);
      this.logDecision(rt, def.id, 'reject', vid, meta);
      if (next === 'rejected') this.markStale(rt, downstreamOf(def.id, rt.defs));
      await this.setApplied(rt, this.desired(rt));
      this.deps.emit({
        type: 'preview.ended',
        projectId: rt.project.id,
        ts: Date.now(),
        passId: row.id,
      });
      return this.emitState(rt);
    });
  }

  /** Attaches an optional reason chip to a rejection (logged as its own decision row). */
  addReason(
    projectId: string,
    passId: string,
    reasonChip: DecisionMeta['reasonChip'] | null,
  ): ProjectState {
    const rt = this.rt(projectId);
    const def = this.defOf(rt, passId);
    const row = this.row(rt, def.id);
    this.logDecision(
      rt,
      def.id,
      'reject',
      row?.chosen_variant_id ?? undefined,
      reasonChip
        ? { reasonChip, shownAlongside: this.alongside(rt, def.id) }
        : { shownAlongside: this.alongside(rt, def.id), extra: { clearReason: true } },
    );
    return this.emitState(rt);
  }

  /**
   * Randomize. Gives one pass (or every open pass) a new seed and regenerates its variants, so the
   * same brief surfaces different references and parameters. Approved and committed passes stay.
   */
  async reroll(projectId: string, passId?: string): Promise<ProjectState> {
    return this.run(projectId, passId ? 'Re-rolling' : 'Randomizing', async (rt) => {
      if (!rt.brief) throw new Error('Tell the story first.');
      this.assertClean(rt);
      const rows = (
        rt.db.prepare('SELECT * FROM passes WHERE project_id = ?').all(rt.project.id) as any[]
      ).filter((r) =>
        passId
          ? r.id === passId || r.def_id === passId
          : ['proposed', 'rejected', 'stale'].includes(r.status),
      );
      if (rt.previewing && rows.some((r) => r.def_id === rt.previewing!.defId)) {
        this.closePreviewDecision(rt);
        rt.previewing = null;
      }
      const wasApproved = rows.filter((r) => r.status === 'approved').map((r) => r.def_id);
      for (const r of rows)
        if (r.status === 'approved')
          rt.db.prepare(`UPDATE passes SET status = 'proposed' WHERE id = ?`).run(r.id);
      await this.setApplied(rt, this.desired(rt));
      const ctx0 = this.ctx(rt);
      const answers = this.answers(rt);
      for (const r of rows) {
        if (['committed', 'skipped'].includes(r.status)) continue;
        const def = rt.defs.find((d) => d.id === r.def_id);
        if (!def) continue;
        // A re-roll must show something new. Low noise keeps the Fit steady, so try fresh seeds
        // until the set of options differs; a pass whose options do not depend on the seed says so.
        const signature = (vs: Variant[]) =>
          JSON.stringify(vs.map((v) => [v.id, v.attributes ?? {}]));
        const old = signature(rt.variants.get(def.id) ?? this.variantRows(rt, r.id));
        let seed = newSeed();
        let ctx = { ...ctx0, seeds: { ...ctx0.seeds, [def.id]: seed } };
        let variants = (await def.variants?.(this.leaned(rt, def.id, ctx, answers))) ?? [];
        for (
          let attempt = 0;
          attempt < 12 && variants.length && signature(variants) === old;
          attempt++
        ) {
          seed = newSeed();
          ctx = { ...ctx0, seeds: { ...ctx0.seeds, [def.id]: seed } };
          variants = (await def.variants?.(this.leaned(rt, def.id, ctx, answers))) ?? [];
        }
        if (passId && variants.length && signature(variants) === old)
          this.deps.emit({
            type: 'error',
            projectId: rt.project.id,
            ts: Date.now(),
            message: `${def.name} has no other options for this brief; raise the noise to reach further.`,
          });
        rt.seeds[def.id] = seed;
        for (const k of [...rt.patches.keys()])
          if (k.startsWith(`${def.id}__`)) rt.patches.delete(k);
        rt.variants.set(def.id, variants);
        rt.db.prepare('DELETE FROM variants WHERE pass_id = ?').run(r.id);
        for (const v of variants) {
          rt.db
            .prepare(
              'INSERT INTO variants(id,pass_id,label,patch_path,thumbnail_svg,source,attributes) VALUES(?,?,?,?,?,?,?)',
            )
            .run(
              `${r.id}:${v.id}`,
              r.id,
              v.label,
              path.join('.sitemaxxing', 'patches', patchFileName(def.id, v.id)),
              v.thumbnail,
              v.source ?? 'library',
              json.str(v.attributes ?? {}),
            );
        }
        const chosen = variants[0]?.id ?? null;
        let ok = false;
        for (const vid of variants.length ? variants.map((v) => v.id) : [undefined])
          ok = (await this.precompute(rt, def, vid, ctx)) !== null || ok;
        const pre = this.patchFor(rt, def.id, chosen ?? undefined);
        rt.db
          .prepare(
            `UPDATE passes SET seed = ?, chosen_variant_id = ?, status = ?, summary = ?, copy_diff = ? WHERE id = ?`,
          )
          .run(
            seed,
            chosen,
            ok ? 'proposed' : 'stale',
            pre?.summary ?? def.description,
            pre?.copyDiff ? json.str(pre.copyDiff) : null,
            r.id,
          );
        this.logDecision(rt, def.id, 'regenerate', chosen ?? undefined, {
          extra: { reroll: true, seed },
        });
      }
      if (wasApproved.length)
        this.markStale(
          rt,
          wasApproved
            .flatMap((id) => downstreamOf(id, rt.defs))
            .filter((id) => this.row(rt, id)?.status === 'approved'),
        );
      return this.emitState(rt);
    });
  }

  async approveAll(projectId: string): Promise<ProjectState> {
    const st = this.state(projectId);
    for (const p of st.passes)
      if (p.status === 'proposed') await this.decide(projectId, p.id, 'approve');
    return this.state(projectId);
  }

  // ---------- copy + reports ----------

  async setCopy(
    projectId: string,
    key: string,
    text: string,
  ): Promise<{ old: string; new: string }> {
    return this.run(projectId, null, async (rt) => {
      const file = path.join(rt.project.rootPath, rt.config.content);
      if (!fs.existsSync(file)) throw new Error(`content file not found: ${rt.config.content}`);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const parts = key.split('.');
      let cur: any = data;
      for (const p of parts.slice(0, -1)) cur = cur[p] ?? (cur[p] = {});
      const old = String(cur[parts.at(-1)!] ?? '');
      cur[parts.at(-1)!] = text;
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
      rt.extraFiles.add(toPosix(rt.config.content));
      this.persistApplied(rt);
      this.deps.emit({
        type: 'copy.changed',
        projectId: rt.project.id,
        ts: Date.now(),
        key,
        old,
        new: text,
        selector: `[data-copy="${key}"]`,
      });
      return { old, new: text };
    });
  }

  reportPass(projectId: string, name: string, selectors: string[]): void {
    const rt = this.rt(projectId);
    this.deps.emit({
      type: 'pass.reported',
      projectId: rt.project.id,
      ts: Date.now(),
      name,
      selectors,
    });
  }

  // ---------- commit ----------

  async commit(projectId: string): Promise<{ version: number; sha: string; score: number }> {
    return this.run(projectId, 'Committing', async (rt) => {
      this.measureSuspended = true;
      if (rt.measureTimer) clearTimeout(rt.measureTimer);
      try {
        return await this.commitInner(rt);
      } finally {
        this.measureSuspended = false;
      }
    });
  }

  private async commitInner(rt: Runtime): Promise<{ version: number; sha: string; score: number }> {
    {
      if (rt.viewingVersion) await this.viewVersionInner(rt, null);
      this.assertClean(rt);
      if (rt.previewing) {
        this.closePreviewDecision(rt);
        rt.previewing = null;
      }
      rt.view = 'changes';
      const approved = this.approvedOrdered(rt);
      if (!approved.length) throw new Error('Nothing approved to commit.');
      const versions = this.versions(rt);
      const number = (versions.at(-1)?.number ?? 0) + 1;

      // Timelapse frames: apply the approved passes one at a time and capture each.
      await this.setApplied(rt, []);
      const frames: string[] = [];
      const frameDir = path.join(rt.dir, 'screenshots', `v${number}`, 'timelapse');
      fs.mkdirSync(frameDir, { recursive: true });
      const page = await this.gotoDev(rt);
      if (page) {
        await page.waitForTimeout(100);
        const f0 = path.join(frameDir, `00-before.png`);
        await this.labelledShot(page, f0, `v${number - 1}`);
        frames.push(f0);
      }
      const stack: Array<{ defId: string; variantId?: string }> = [];
      for (let i = 0; i < approved.length; i++) {
        stack.push(approved[i]);
        await this.setApplied(rt, [...stack]);
        if (page) {
          await page.waitForTimeout(450);
          const def = rt.defs.find((d) => d.id === approved[i].defId)!;
          const vlabel = (rt.variants.get(def.id) ?? []).find(
            (v) => v.id === approved[i].variantId,
          )?.label;
          const f = path.join(frameDir, `${String(i + 1).padStart(2, '0')}-${def.id}.png`);
          await this.labelledShot(page, f, vlabel ? `${def.name} · ${vlabel}` : def.name);
          frames.push(f);
        }
      }

      const touched = new Set<string>();
      for (const a of rt.applied) a.files.forEach((f) => touched.add(f));
      for (const f of rt.extraFiles) touched.add(f);
      for (const f of ['sitemaxxing.config.ts', '.gitignore', 'vite.config.ts']) {
        if (gitx.dirtyFiles(rt.project.rootPath).includes(f)) touched.add(f);
      }
      this.formatFiles(rt, [...touched]);
      const names = approved.map((a) => rt.defs.find((d) => d.id === a.defId)?.name ?? a.defId);
      const sha = gitx.commitFiles(
        rt.project.rootPath,
        [...touched],
        `sitemaxxing: v${number} — ${names.join(', ')}`,
      );

      // The approved patches are now part of HEAD.
      const variantMap: Record<string, string> = {};
      for (const a of approved) if (a.variantId) variantMap[a.defId] = a.variantId;
      for (const a of approved) this.setStatus(rt, a.defId, 'committed');
      rt.applied = [];
      rt.extraFiles.clear();
      this.persistApplied(rt);
      this.logDecision(rt, null, 'commit', undefined, {
        shownAlongside: approved.map((a) => this.passRowId(rt, a.defId)),
      });
      for (const r of rt.db
        .prepare(
          `SELECT def_id FROM passes WHERE project_id = ? AND status IN ('rejected','stale')`,
        )
        .all(rt.project.id) as any[]) {
        rt.db
          .prepare(`UPDATE passes SET status = 'proposed' WHERE id = ?`)
          .run(this.passRowId(rt, r.def_id));
      }

      const score = await this.measure(rt);
      const shots = await this.screenshotAll(rt, number);
      shots.timelapse = toPosix(path.relative(rt.project.rootPath, frameDir));
      const vid = newId();
      rt.db
        .prepare(
          'INSERT INTO versions(id,project_id,number,git_sha,mog_score,pass_ids,variant_map,screenshots,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .run(
          vid,
          rt.project.id,
          number,
          sha,
          score?.score ?? 0,
          json.str(approved.map((a) => a.defId)),
          json.str(variantMap),
          json.str(shots),
          now(),
        );
      if (score) this.recordScore(rt, vid, score);
      const prev = versions.at(-1)?.score ?? 0;
      this.deps.emit({
        type: 'version.committed',
        projectId: rt.project.id,
        ts: Date.now(),
        number,
        sha,
        score: score?.score ?? 0,
      });
      this.deps.emit({
        type: 'score.updated',
        projectId: rt.project.id,
        ts: Date.now(),
        score: score?.score ?? 0,
        delta: Math.round((score?.score ?? 0) - prev),
        metrics: score?.metrics,
      });

      // Re-propose what is still open against the new tree.
      await this.refreshSnapshot(rt);
      const ctx = this.ctx(rt);
      for (const r of rt.db
        .prepare(
          `SELECT def_id, chosen_variant_id FROM passes WHERE project_id = ? AND status NOT IN ('committed','skipped')`,
        )
        .all(rt.project.id) as any[]) {
        const def = rt.defs.find((d) => d.id === r.def_id);
        if (!def) continue;
        const variants = rt.variants.get(def.id) ?? [];
        for (const v of variants.length ? variants.map((x) => x.id) : [undefined])
          await this.precompute(rt, def, v, ctx);
      }
      this.emitState(rt);
      return { version: number, sha, score: score?.score ?? 0 };
    }
  }

  private async labelledShot(page: Page, file: string, label: string) {
    try {
      await page.evaluate(() => (window as any).__sitemaxxingHide?.());
      await page.evaluate((text) => {
        let el = document.getElementById('sm-timelapse-chip');
        if (!el) {
          el = document.createElement('div');
          el.id = 'sm-timelapse-chip';
          el.setAttribute('data-sitemaxxing-overlay', '');
          document.body.appendChild(el);
        }
        el.textContent = text;
        el.setAttribute(
          'style',
          'position:fixed;left:16px;bottom:16px;z-index:2147483647;font:500 13px/1 ui-monospace,Menlo,monospace;background:#ff6b8b;color:#1a0a10;padding:8px 11px;border-radius:7px;box-shadow:0 2px 10px rgba(0,0,0,.25)',
        );
      }, label);
      await page.screenshot({ path: file });
      await page.evaluate(() => document.getElementById('sm-timelapse-chip')?.remove());
    } catch (e) {
      this.log(`frame failed: ${(e as Error).message}`);
    }
  }

  private formatFiles(rt: Runtime, files: string[]) {
    const bin = path.join(
      rt.project.rootPath,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'prettier.cmd' : 'prettier',
    );
    if (!fs.existsSync(bin) || !files.length) return;
    try {
      execFileSync(
        bin,
        [
          '--write',
          '--log-level',
          'silent',
          ...files.filter((f) => /\.(tsx?|jsx?|css|json)$/.test(f)),
        ],
        { cwd: rt.project.rootPath, stdio: 'ignore', shell: process.platform === 'win32' },
      );
    } catch {
      /* formatting is best-effort */
    }
  }

  // ---------- versions ----------

  async viewVersion(projectId: string, number: number | null): Promise<{ url: string | null }> {
    return this.run(projectId, number ? `Checking out v${number}` : null, async (rt) => {
      const url = await this.viewVersionInner(rt, number);
      this.emitState(rt);
      return { url };
    });
  }

  private async viewVersionInner(rt: Runtime, number: number | null): Promise<string | null> {
    const versions = this.versions(rt);
    const current = versions.at(-1)?.number ?? 1;
    if (number === null || number === current) {
      this.stopVersionServer(rt);
      rt.viewingVersion = null;
      return null;
    }
    const v = versions.find((x) => x.number === number);
    if (!v) throw new Error(`no version ${number}`);
    if (rt.versionServer?.number === number) {
      rt.viewingVersion = number;
      return rt.versionServer.url;
    }
    this.stopVersionServer(rt);
    const dir = path.join('.sitemaxxing', 'worktrees', `v${number}`);
    const abs = gitx.addWorktree(rt.project.rootPath, v.sha, dir);
    linkNodeModules(rt.project.rootPath, abs);
    const port = (this.deps.versionPortBase ?? 5300) + number;
    const url = `http://localhost:${port}`;
    const proc = spawnVite(abs, port);
    rt.versionServer = { proc, url, number };
    rt.viewingVersion = number;
    await waitForUrl(url, 20_000);
    return url;
  }

  private stopVersionServer(rt: Runtime) {
    if (!rt.versionServer) return;
    killTree(rt.versionServer.proc);
    rt.versionServer = null;
  }

  // ---------- scores and rules ----------

  getScore(
    projectId: string,
    version?: number,
  ): { score: number; metrics: ScoreResult['metrics']; notes: string[]; version?: number } {
    const rt = this.rt(projectId);
    if (version) {
      const v = rt.db
        .prepare('SELECT id, mog_score FROM versions WHERE project_id = ? AND number = ?')
        .get(rt.project.id, version) as any;
      if (!v) throw new Error(`no version ${version}`);
      const s = rt.db
        .prepare('SELECT metrics FROM scores WHERE version_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(v.id) as any;
      const parsed = json.parse<ScoreResult | null>(s?.metrics, null);
      return {
        score: Math.round(v.mog_score),
        metrics: parsed?.metrics ?? {},
        notes: parsed?.notes ?? [],
        version,
      };
    }
    const s = rt.score ?? this.latestScore(rt);
    return { score: Math.round(s?.score ?? 0), metrics: s?.metrics ?? {}, notes: s?.notes ?? [] };
  }

  searchRules(q: string): RuleCard[] {
    return this.deps.rules.search(q);
  }

  ruleCard(id: string): RuleCard | undefined {
    return this.deps.rules.byId(id);
  }

  decisions(projectId: string): any[] {
    return this.rt(projectId)
      .db.prepare('SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at')
      .all(projectId);
  }

  versionRows(projectId: string): any[] {
    return this.rt(projectId)
      .db.prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY number')
      .all(projectId);
  }

  async close(): Promise<void> {
    for (const proc of this.siteServers.values()) killTree(proc);
    this.siteServers.clear();
    for (const rt of this.projects.values()) {
      this.stopVersionServer(rt);
      try {
        await this.setApplied(rt, []);
      } catch {
        /* best effort */
      }
      rt.db.close();
    }
  }

  /** Reverses everything applied, for tests and shutdown. */
  async resetWorkingTree(projectId: string): Promise<void> {
    await this.run(projectId, null, async (rt) => {
      rt.previewing = null;
      await this.setApplied(rt, []);
    });
  }
}

function safeHighlight(def: PassDefinition, ctx: PassContext, variantId?: string): string[] {
  try {
    return def.highlight(ctx, variantId);
  } catch {
    return [];
  }
}

function readIf(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** A port nothing is listening on right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

const TEMPLATE_SKIP = new Set([
  'node_modules',
  'dist',
  '.sitemaxxing',
  '.git',
  'src/App.tsx',
  'src/content.json',
  'src/tokens.css',
  'src/fonts.ts',
  'index.html',
  'README.md',
]);

/** Copies the template app's shared files (package.json, Vite config, entry, base styles). */
function copyTemplate(from: string, to: string, rel = '') {
  fs.mkdirSync(path.join(to, rel), { recursive: true });
  for (const e of fs.readdirSync(path.join(from, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (TEMPLATE_SKIP.has(r) || e.isSymbolicLink()) continue;
    if (e.isDirectory()) copyTemplate(from, to, r);
    else fs.copyFileSync(path.join(from, r), path.join(to, r));
  }
}

export function linkNodeModules(from: string, to: string) {
  const src = path.join(from, 'node_modules');
  const dst = path.join(to, 'node_modules');
  if (!fs.existsSync(src) || fs.existsSync(dst)) return;
  try {
    fs.symlinkSync(src, dst, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    /* ignore */
  }
}

export function spawnVite(cwd: string, port: number): ChildProcess {
  // Resolve Vite's entry through Node rather than the .bin shim: pnpm shims use relative paths
  // that break behind the node_modules junctions used by playgrounds and version worktrees.
  const req = createRequire(path.join(cwd, 'package.json'));
  const pkg = req.resolve('vite/package.json');
  const entry = path.join(
    path.dirname(pkg),
    JSON.parse(fs.readFileSync(pkg, 'utf8')).bin?.vite ?? 'bin/vite.js',
  );
  const args = [entry, '--port', String(port), '--strictPort', '--clearScreen', 'false'];
  const wrapper = isolatedViteConfig(cwd);
  if (wrapper) args.push('--config', wrapper);
  return spawn(process.execPath, args, { cwd, stdio: 'ignore' });
}

/**
 * Playgrounds, version previews and rebuilt sites link one shared node_modules, so by default
 * their dev servers share one Vite dependency cache and invalidate each other when two run at
 * once (the page then reloads blank). A small wrapper config gives each its own cache under
 * .sitemaxxing while keeping the project's own config.
 */
function isolatedViteConfig(cwd: string): string | null {
  const own = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'].find((f) =>
    fs.existsSync(path.join(cwd, f)),
  );
  if (!own) return null;
  const dir = path.join(cwd, '.sitemaxxing');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'vite.isolated.config.mjs');
    const text = `// Written by Sitemaxxing: the project's Vite config with a dev-server cache of its own.
import base from '../${own}';
export default async (env) => {
  const config = typeof base === 'function' ? await base(env) : await base;
  return { ...config, cacheDir: '.sitemaxxing/vite-cache' };
};
`;
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text)
      fs.writeFileSync(file, text);
    return file;
  } catch {
    return null;
  }
}

export function killTree(proc: ChildProcess) {
  if (!proc.pid) return;
  try {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else proc.kill('SIGTERM');
  } catch {
    /* ignore */
  }
}

export async function waitForUrl(url: string, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
