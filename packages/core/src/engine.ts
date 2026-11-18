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
import { applyToDisk, canApply, filesTouched, toUnifiedDiff, writePatchFile, patchFileName, PatchApplyError } from './patches';
import { takeSnapshot, emptySnapshot } from './snapshot';
import { detectSections } from './sections';
import { readTokens } from './tokens';
import { createLLM } from './llm';
import { downstreamOf } from './registry';
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
} from './types';

export interface EngineDeps {
  passes: PassDefinition[];
  rules: { search(q: string): RuleCard[]; byId(id: string): RuleCard | undefined; all(): RuleCard[] };
  scorer: (page: Page, dom: SnapshotDOM) => Promise<ScoreResult>;
  browser: () => Promise<Browser>;
  emit: (e: HubEvent) => void;
  registryFile?: string;
  log?: (msg: string) => void;
  /** Base port for read-only version servers. */
  versionPortBase?: number;
}

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
  previewing: { defId: string; variantId?: string; startedAt: number; shownAlongside: string[] } | null;
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
}

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

  private writeRegistry(rows: Array<{ id: string; name: string; rootPath: string; devUrl: string }>) {
    fs.mkdirSync(path.dirname(this.registryPath()), { recursive: true });
    fs.writeFileSync(this.registryPath(), JSON.stringify(rows, null, 2));
  }

  listProjects(): Array<{ id: string; name: string; devUrl: string; rootPath: string; loaded: boolean }> {
    const loaded = [...this.projects.values()].map((r) => ({ id: r.project.id, name: r.project.name, devUrl: r.project.devUrl, rootPath: r.project.rootPath, loaded: true }));
    const reg = this.readRegistry().filter((r) => !this.projects.has(r.id) && fs.existsSync(r.rootPath)).map((r) => ({ ...r, loaded: false }));
    return [...loaded, ...reg];
  }

  hasProject(id: string): boolean {
    return this.projects.has(id);
  }

  // ---------- lifecycle ----------

  static projectIdFor(rootPath: string): string {
    return createHash('sha1').update(path.resolve(rootPath).toLowerCase()).digest('hex').slice(0, 10);
  }

  /** Registers (or reloads) a project, takes a baseline snapshot and score, creates v1. */
  async initProject(rootPath: string, devUrl?: string): Promise<{ projectId: string; sections: Section[]; baseline: number | null; name: string }> {
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
      mode: 'repo',
      rootPath: root,
      devUrl: config.devUrl,
      category: config.category,
      createdAt: existing?.created_at ?? now(),
    };
    db.prepare(
      `INSERT INTO projects(id,name,mode,root_path,dev_url,category,created_at) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, dev_url=excluded.dev_url, category=excluded.category, root_path=excluded.root_path`,
    ).run(id, name, 'repo', root, config.devUrl, config.category ?? null, project.createdAt);

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
    };
    this.projects.set(id, rt);
    const reg = this.readRegistry().filter((r) => r.id !== id);
    reg.unshift({ id, name, rootPath: root, devUrl: config.devUrl });
    this.writeRegistry(reg);

    await this.refreshSnapshot(rt);
    rt.sections = detectSections(rt.dom, id);
    db.prepare('DELETE FROM sections WHERE project_id = ?').run(id);
    const ins = db.prepare('INSERT INTO sections(id,project_id,kind,selector,"order") VALUES(?,?,?,?,?)');
    for (const s of rt.sections) ins.run(s.id, id, s.kind, s.selector, s.order);

    let baseline: number | null = null;
    const v1 = db.prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY number DESC LIMIT 1').get(id) as any;
    if (!v1) {
      const score = await this.measure(rt);
      baseline = score?.score ?? null;
      const sha = gitx.headSha(root);
      const vid = newId();
      const shots = await this.screenshotAll(rt, 1);
      db.prepare('INSERT INTO versions(id,project_id,number,git_sha,mog_score,pass_ids,variant_map,screenshots,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(
        vid,
        id,
        1,
        sha,
        score?.score ?? 0,
        '[]',
        '{}',
        json.str(shots),
        now(),
      );
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
    await this.initProject(r.rootPath, r.devUrl);
  }

  private rt(projectId: string): Runtime {
    const rt = this.projects.get(projectId);
    if (!rt) throw new Error(`project not loaded: ${projectId}`);
    return rt;
  }

  /** Serializes operations per project. */
  private run<T>(projectId: string, what: string | null, fn: (rt: Runtime) => Promise<T>): Promise<T> {
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
      const ctx = await browser.newContext({ viewport: { width: rt.config.viewports[0][0], height: rt.config.viewports[0][1] }, reducedMotion: 'reduce' });
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
    const score = await this.deps.scorer(page, dom);
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
    await page.setViewportSize({ width: rt.config.viewports[0][0], height: rt.config.viewports[0][1] });
    return out;
  }

  private recordScore(rt: Runtime, versionId: string | null, score: ScoreResult) {
    rt.db.prepare('INSERT INTO scores(id,project_id,version_id,mog_score,metrics,created_at) VALUES(?,?,?,?,?,?)').run(newId(), rt.project.id, versionId, score.score, json.str(score), now());
  }

  private latestScore(rt: Runtime): ScoreResult | null {
    const row = rt.db.prepare('SELECT metrics FROM scores WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(rt.project.id) as any;
    return row ? json.parse<ScoreResult | null>(row.metrics, null) : null;
  }

  // ---------- pass context ----------

  private ctx(rt: Runtime): PassContext {
    const files = makeFileSystem(rt.project.rootPath);
    const content = files.exists(rt.config.content) ? { path: rt.config.content, data: JSON.parse(files.read(rt.config.content)) } : undefined;
    const choices: Record<string, string> = {};
    for (const row of rt.db.prepare('SELECT def_id, chosen_variant_id FROM passes WHERE project_id = ?').all(rt.project.id) as any[]) {
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
    };
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

  private setStatus(rt: Runtime, defId: string, status: PassStatus, extra: Record<string, unknown> = {}) {
    const sets = ['status = ?'];
    const vals: unknown[] = [status];
    for (const [k, v] of Object.entries(extra)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
    vals.push(this.passRowId(rt, defId));
    rt.db.prepare(`UPDATE passes SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    this.deps.emit({ type: 'pass.decided', projectId: rt.project.id, ts: Date.now(), passId: this.passRowId(rt, defId), status });
  }

  // ---------- audit ----------

  async audit(projectId: string): Promise<ProjectState> {
    return this.run(projectId, 'Auditing', async (rt) => {
      this.assertClean(rt);
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
        (rt.db.prepare(`SELECT def_id FROM passes WHERE project_id = ? AND status = 'committed'`).all(rt.project.id) as any[]).map((r) => r.def_id),
      );
      const ctx = this.ctx(rt);
      const upsert = rt.db.prepare(
        `INSERT INTO passes(id,project_id,def_id,kind,name,section_id,"order",depends_on,points,status,chosen_variant_id,skip_reason,findings,summary,copy_diff)
         VALUES(@id,@project_id,@def_id,@kind,@name,@section_id,@order,@depends_on,@points,@status,@chosen_variant_id,@skip_reason,@findings,@summary,@copy_diff)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, chosen_variant_id=excluded.chosen_variant_id, skip_reason=excluded.skip_reason,
           findings=excluded.findings, summary=excluded.summary, copy_diff=excluded.copy_diff, points=excluded.points, "order"=excluded."order"`,
      );
      for (const def of rt.defs) {
        const id = this.passRowId(rt, def.id);
        if (committed.has(def.id)) continue;
        let det: { applies: boolean; findings: Finding[]; reason?: string };
        try {
          det = await def.detect(ctx);
        } catch (e) {
          det = { applies: false, findings: [], reason: `detect failed: ${(e as Error).message}` };
        }
        const variants = det.applies ? ((await def.variants?.(ctx)) ?? []) : [];
        rt.variants.set(def.id, variants);
        rt.db.prepare('DELETE FROM variants WHERE pass_id = ?').run(id);
        const prevChoice = (this.row(rt, def.id)?.chosen_variant_id as string | undefined) ?? undefined;
        const chosen = variants.length ? (variants.some((v) => v.id === prevChoice) ? prevChoice : variants[0].id) : null;
        let summary = det.applies ? def.description : null;
        let copyDiff: CopyChange[] | null = null;
        if (det.applies) {
          const targets = variants.length ? variants.map((v) => v.id) : [undefined];
          for (const vid of targets) {
            const pre = await this.precompute(rt, def, vid, ctx);
            if (pre && vid === (chosen ?? undefined)) {
              summary = pre.summary || summary;
              copyDiff = pre.copyDiff ?? null;
              if (pre.notes?.length) det.findings.push(...pre.notes.map((n) => ({ message: n, severity: 'info' as const })));
            }
          }
          for (const v of variants) {
            rt.db
              .prepare('INSERT INTO variants(id,pass_id,label,patch_path,thumbnail_svg,source,attributes) VALUES(?,?,?,?,?,?,?)')
              .run(`${id}:${v.id}`, id, v.label, path.join('.sitemaxxing', 'patches', patchFileName(def.id, v.id)), v.thumbnail, v.source ?? 'library', json.str(v.attributes ?? {}));
          }
        }
        upsert.run({
          id,
          project_id: rt.project.id,
          def_id: def.id,
          kind: def.kind,
          name: def.name,
          section_id: null,
          order: def.order,
          depends_on: json.str(def.dependsOn ?? []),
          points: def.points,
          status: det.applies ? 'proposed' : 'skipped',
          chosen_variant_id: chosen,
          skip_reason: det.applies ? null : (det.reason ?? 'already fine'),
          findings: json.str(det.findings),
          summary,
          copy_diff: copyDiff ? json.str(copyDiff) : null,
        });
      }
      rt.audited = true;
      this.deps.emit({ type: 'audit.done', projectId: rt.project.id, ts: Date.now(), score: rt.score?.score ?? 0 });
      return this.emitState(rt);
    });
  }

  private async precompute(rt: Runtime, def: PassDefinition, variantId: string | undefined, ctx: PassContext): Promise<PrecomputedPatch | null> {
    try {
      const patch = await def.propose(ctx, variantId);
      const text = toUnifiedDiff(patch);
      const file = writePatchFile(path.join(rt.dir, 'patches'), def.id, variantId, text);
      const pre: PrecomputedPatch = { text, files: filesTouched(text), copyDiff: patch.copyDiff, summary: patch.summary, notes: patch.notes, file };
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

  private buildState(rt: Runtime): ProjectState {
    const rows = rt.db.prepare('SELECT * FROM passes WHERE project_id = ? ORDER BY "order"').all(rt.project.id) as any[];
    const versions = this.versions(rt);
    const current = versions.at(-1)?.number ?? 1;
    const ctx = rt.audited ? this.ctx(rt) : null;
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
        points: r.points,
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
      };
    });
    const committedPoints = 0;
    const estimate = this.estimate(rt, passes) + committedPoints;
    return {
      project: rt.project,
      baseline: versions[0]?.score ?? 0,
      score: rt.score ? { ...rt.score, score: estimate } : null,
      passes,
      versions,
      currentVersion: current,
      view: rt.view,
      previewing: rt.previewing ? { passId: this.passRowId(rt, rt.previewing.defId), variantId: rt.previewing.variantId } : null,
      viewingVersion: rt.viewingVersion,
      versionUrl: rt.versionServer?.url ?? null,
      audited: rt.audited,
      busy: rt.busy,
    };
  }

  /** Estimated score: the current version's measured score plus the points of what is applied. */
  private estimate(rt: Runtime, passes: PassView[]): number {
    const versions = this.versions(rt);
    const base = versions.at(-1)?.score ?? 0;
    if (rt.view === 'current') return Math.round(base);
    const applied = new Set(rt.applied.map((a) => a.defId));
    let n = base;
    for (const p of passes) if (applied.has(p.defId) && p.status !== 'committed') n += p.points;
    return Math.min(99, Math.round(n));
  }

  private variantRows(rt: Runtime, passId: string): Variant[] {
    return (rt.db.prepare('SELECT * FROM variants WHERE pass_id = ?').all(passId) as any[]).map((v) => ({
      id: v.id.split(':').at(-1),
      label: v.label,
      thumbnail: v.thumbnail_svg ?? '',
      attributes: json.parse(v.attributes, {}),
      source: v.source,
    }));
  }

  private versions(rt: Runtime): VersionView[] {
    return (rt.db.prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY number').all(rt.project.id) as any[]).map((v) => {
      const ids = json.parse<string[]>(v.pass_ids, []);
      return {
        number: v.number,
        score: Math.round(v.mog_score),
        sha: v.git_sha,
        label: v.number === 1 ? 'Original' : ids.map((id) => rt.defs.find((d) => d.id === id)?.name ?? id).join(', '),
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
    const ignore = ['sitemaxxing.config.ts', 'sitemaxxing.config.js', '.gitignore', 'vite.config.ts', 'vite.config.js', 'vite.config.mts'];
    const dirty = gitx.dirtyFiles(rt.project.rootPath).filter((f) => !ours.has(f) && !ignore.includes(f));
    if (dirty.length) {
      throw new Error(`Uncommitted edits in the target repo: ${dirty.slice(0, 5).join(', ')}${dirty.length > 5 ? '…' : ''}. Commit or stash them first.`);
    }
  }

  private patchFor(rt: Runtime, defId: string, variantId?: string): PrecomputedPatch | undefined {
    return rt.patches.get(pkey(defId, variantId));
  }

  /** Brings the working tree to exactly `desired` (ordered), reversing/applying as needed. */
  private async setApplied(rt: Runtime, desired: Array<{ defId: string; variantId?: string }>): Promise<void> {
    let common = 0;
    while (common < rt.applied.length && common < desired.length && rt.applied[common].defId === desired[common].defId && rt.applied[common].variantId === desired[common].variantId) common++;
    for (let i = rt.applied.length - 1; i >= common; i--) {
      const a = rt.applied[i];
      try {
        applyToDisk(rt.project.rootPath, a.text, { reverse: true });
      } catch (e) {
        this.log(`reverse failed for ${a.defId}: ${(e as Error).message}`);
      }
      rt.applied.pop();
    }
    for (let i = common; i < desired.length; i++) {
      const d = desired[i];
      let pre = this.patchFor(rt, d.defId, d.variantId);
      if (!pre) throw new Error(`no patch for ${d.defId}/${d.variantId ?? 'default'}`);
      if (!canApply(rt.project.rootPath, pre.text)) {
        // Context drift: another applied pass touched neighbouring lines. The pass is
        // deterministic, so re-proposing it against the current tree yields the same change
        // with a diff that applies. Only a real failure marks the pass stale.
        const def = rt.defs.find((x) => x.id === d.defId);
        const fresh = def ? await this.precompute(rt, def, d.variantId, this.ctx(rt)) : null;
        if (fresh) pre = fresh;
      }
      try {
        applyToDisk(rt.project.rootPath, pre.text);
        rt.applied.push({ defId: d.defId, variantId: d.variantId, text: pre.text, files: pre.files });
      } catch (e) {
        if (e instanceof PatchApplyError) {
          this.markStale(rt, [d.defId]);
          throw new Error(`${d.defId} no longer applies cleanly (${e.file}); regenerate it.`);
        }
        throw e;
      }
    }
  }

  private approvedOrdered(rt: Runtime): Array<{ defId: string; variantId?: string }> {
    return (rt.db.prepare(`SELECT def_id, chosen_variant_id FROM passes WHERE project_id = ? AND status = 'approved' ORDER BY "order"`).all(rt.project.id) as any[]).map((r) => ({
      defId: r.def_id,
      variantId: r.chosen_variant_id ?? undefined,
    }));
  }

  private desired(rt: Runtime): Array<{ defId: string; variantId?: string }> {
    if (rt.view === 'current') return [];
    const list = this.approvedOrdered(rt);
    if (rt.previewing && !list.some((x) => x.defId === rt.previewing!.defId)) list.push({ defId: rt.previewing.defId, variantId: rt.previewing.variantId });
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
    if (stale.length) this.deps.emit({ type: 'pass.stale', projectId: rt.project.id, ts: Date.now(), passIds: stale });
  }

  // ---------- preview ----------

  async preview(projectId: string, passId: string, variantId?: string, meta: DecisionMeta = {}): Promise<ProjectState> {
    return this.run(projectId, null, async (rt) => {
      const def = this.defOf(rt, passId);
      const row = this.row(rt, def.id);
      if (!row) throw new Error(`run audit first`);
      if (row.status === 'committed' || row.status === 'skipped') return this.buildState(rt);
      this.assertClean(rt);
      if (rt.viewingVersion) await this.viewVersionInner(rt, null);
      const vid = variantId ?? row.chosen_variant_id ?? undefined;
      if (rt.previewing && rt.previewing.defId === def.id && rt.previewing.variantId === vid) return this.buildState(rt);
      this.closePreviewDecision(rt);
      rt.view = 'changes';
      rt.previewing = { defId: def.id, variantId: vid, startedAt: Date.now(), shownAlongside: meta.shownAlongside ?? this.alongside(rt, def.id) };
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
    return rt.defs.filter((d) => d.id !== defId && d.kind === def?.kind).map((d) => this.passRowId(rt, d.id));
  }

  private closePreviewDecision(rt: Runtime) {
    if (!rt.previewing) return;
    const p = rt.previewing;
    this.logDecision(rt, p.defId, 'preview', p.variantId, { dwellMs: Date.now() - p.startedAt, shownAlongside: p.shownAlongside });
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

  private logDecision(rt: Runtime, defId: string | null, action: DecisionAction, variantId: string | undefined, meta: DecisionMeta) {
    rt.db
      .prepare('INSERT INTO decisions(id,user_id,project_id,pass_id,variant_id,action,shown_alongside,reason_chip,dwell_ms,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(
        newId(),
        'local',
        rt.project.id,
        defId ? this.passRowId(rt, defId) : null,
        variantId ?? null,
        action,
        json.str(meta.shownAlongside ?? (defId ? this.alongside(rt, defId) : [])),
        meta.reasonChip ?? null,
        meta.dwellMs ?? (defId && rt.lastPreviewAt[defId] ? Date.now() - rt.lastPreviewAt[defId] : null),
        now(),
      );
  }

  async decide(projectId: string, passId: string, action: 'approve' | 'reject' | 'pick' | 'regenerate', variantId?: string, meta: DecisionMeta = {}): Promise<ProjectState> {
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
        if (pre) rt.db.prepare('UPDATE passes SET summary = ?, copy_diff = ? WHERE id = ?').run(pre.summary, pre.copyDiff ? json.str(pre.copyDiff) : null, row.id);
        this.logDecision(rt, def.id, 'pick', vid ?? undefined, meta);
        if (changed && row.status === 'approved') this.markStale(rt, downstreamOf(def.id, rt.defs));
        if (rt.previewing?.defId !== def.id) {
          this.closePreviewDecision(rt);
          rt.previewing = { defId: def.id, variantId: vid ?? undefined, startedAt: Date.now(), shownAlongside: this.alongside(rt, def.id) };
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
        const variants = (await def.variants?.(ctx)) ?? rt.variants.get(def.id) ?? [];
        rt.variants.set(def.id, variants);
        const targets = variants.length ? variants.map((v) => v.id) : [undefined];
        let ok = false;
        for (const vid of targets) ok = (await this.precompute(rt, def, vid, ctx)) !== null || ok;
        const pre = this.patchFor(rt, def.id, row.chosen_variant_id ?? undefined);
        this.setStatus(rt, def.id, ok ? 'proposed' : 'stale', { summary: pre?.summary ?? def.description, copy_diff: pre?.copyDiff ? json.str(pre.copyDiff) : null });
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
        if (next === 'proposed') this.markStale(rt, downstreamOf(def.id, rt.defs).filter((d) => this.row(rt, d)?.status === 'approved'));
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
        } else this.deps.emit({ type: 'preview.ended', projectId: rt.project.id, ts: Date.now(), passId: row.id });
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
      this.deps.emit({ type: 'preview.ended', projectId: rt.project.id, ts: Date.now(), passId: row.id });
      return this.emitState(rt);
    });
  }

  /** Attaches an optional reason chip to a rejection (logged as its own decision row). */
  addReason(projectId: string, passId: string, reasonChip: DecisionMeta['reasonChip']): void {
    const rt = this.rt(projectId);
    const def = this.defOf(rt, passId);
    const row = this.row(rt, def.id);
    this.logDecision(rt, def.id, 'reject', row?.chosen_variant_id ?? undefined, { reasonChip, shownAlongside: this.alongside(rt, def.id) });
  }

  async approveAll(projectId: string): Promise<ProjectState> {
    const st = this.state(projectId);
    for (const p of st.passes) if (p.status === 'proposed') await this.decide(projectId, p.id, 'approve');
    return this.state(projectId);
  }

  // ---------- copy + reports ----------

  async setCopy(projectId: string, key: string, text: string): Promise<{ old: string; new: string }> {
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
      this.deps.emit({ type: 'copy.changed', projectId: rt.project.id, ts: Date.now(), key, old, new: text, selector: `[data-copy="${key}"]` });
      return { old, new: text };
    });
  }

  reportPass(projectId: string, name: string, selectors: string[]): void {
    const rt = this.rt(projectId);
    this.deps.emit({ type: 'pass.reported', projectId: rt.project.id, ts: Date.now(), name, selectors });
  }

  // ---------- commit ----------

  async commit(projectId: string): Promise<{ version: number; sha: string; score: number }> {
    return this.run(projectId, 'Committing', async (rt) => {
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
          const vlabel = (rt.variants.get(def.id) ?? []).find((v) => v.id === approved[i].variantId)?.label;
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
      const sha = gitx.commitFiles(rt.project.rootPath, [...touched], `sitemaxxing: v${number} — ${names.join(', ')}`);

      // The approved patches are now part of HEAD.
      const variantMap: Record<string, string> = {};
      for (const a of approved) if (a.variantId) variantMap[a.defId] = a.variantId;
      for (const a of approved) this.setStatus(rt, a.defId, 'committed');
      rt.applied = [];
      rt.extraFiles.clear();
      this.logDecision(rt, null, 'commit', undefined, { shownAlongside: approved.map((a) => this.passRowId(rt, a.defId)) });
      for (const r of rt.db.prepare(`SELECT def_id FROM passes WHERE project_id = ? AND status IN ('rejected','stale')`).all(rt.project.id) as any[]) {
        rt.db.prepare(`UPDATE passes SET status = 'proposed' WHERE id = ?`).run(this.passRowId(rt, r.def_id));
      }

      const score = await this.measure(rt);
      const shots = await this.screenshotAll(rt, number);
      shots.timelapse = toPosix(path.relative(rt.project.rootPath, frameDir));
      const vid = newId();
      rt.db
        .prepare('INSERT INTO versions(id,project_id,number,git_sha,mog_score,pass_ids,variant_map,screenshots,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(vid, rt.project.id, number, sha, score?.score ?? 0, json.str(approved.map((a) => a.defId)), json.str(variantMap), json.str(shots), now());
      if (score) this.recordScore(rt, vid, score);
      const prev = versions.at(-1)?.score ?? 0;
      this.deps.emit({ type: 'version.committed', projectId: rt.project.id, ts: Date.now(), number, sha, score: score?.score ?? 0 });
      this.deps.emit({ type: 'score.updated', projectId: rt.project.id, ts: Date.now(), score: score?.score ?? 0, delta: Math.round((score?.score ?? 0) - prev), metrics: score?.metrics });

      // Re-propose what is still open against the new tree.
      await this.refreshSnapshot(rt);
      const ctx = this.ctx(rt);
      for (const r of rt.db.prepare(`SELECT def_id, chosen_variant_id FROM passes WHERE project_id = ? AND status NOT IN ('committed','skipped')`).all(rt.project.id) as any[]) {
        const def = rt.defs.find((d) => d.id === r.def_id);
        if (!def) continue;
        const variants = rt.variants.get(def.id) ?? [];
        for (const v of variants.length ? variants.map((x) => x.id) : [undefined]) await this.precompute(rt, def, v, ctx);
      }
      this.emitState(rt);
      return { version: number, sha, score: score?.score ?? 0 };
    });
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
    const bin = path.join(rt.project.rootPath, 'node_modules', '.bin', process.platform === 'win32' ? 'prettier.cmd' : 'prettier');
    if (!fs.existsSync(bin) || !files.length) return;
    try {
      execFileSync(bin, ['--write', '--log-level', 'silent', ...files.filter((f) => /\.(tsx?|jsx?|css|json)$/.test(f))], { cwd: rt.project.rootPath, stdio: 'ignore', shell: process.platform === 'win32' });
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

  getScore(projectId: string, version?: number): { score: number; metrics: ScoreResult['metrics']; notes: string[]; version?: number } {
    const rt = this.rt(projectId);
    if (version) {
      const v = rt.db.prepare('SELECT id, mog_score FROM versions WHERE project_id = ? AND number = ?').get(rt.project.id, version) as any;
      if (!v) throw new Error(`no version ${version}`);
      const s = rt.db.prepare('SELECT metrics FROM scores WHERE version_id = ? ORDER BY created_at DESC LIMIT 1').get(v.id) as any;
      const parsed = json.parse<ScoreResult | null>(s?.metrics, null);
      return { score: Math.round(v.mog_score), metrics: parsed?.metrics ?? {}, notes: parsed?.notes ?? [], version };
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
    return this.rt(projectId).db.prepare('SELECT * FROM decisions WHERE project_id = ? ORDER BY created_at').all(projectId);
  }

  versionRows(projectId: string): any[] {
    return this.rt(projectId).db.prepare('SELECT * FROM versions WHERE project_id = ? ORDER BY number').all(projectId);
  }

  async close(): Promise<void> {
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
  const entry = path.join(path.dirname(pkg), JSON.parse(fs.readFileSync(pkg, 'utf8')).bin?.vite ?? 'bin/vite.js');
  return spawn(process.execPath, [entry, '--port', String(port), '--strictPort', '--clearScreen', 'false'], { cwd, stdio: 'ignore' });
}

export function killTree(proc: ChildProcess) {
  if (!proc.pid) return;
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
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
