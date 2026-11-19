#!/usr/bin/env node
import { cac } from 'cac';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Engine, HUB_PORT, CONTROL_ROOM_PORT, configPath, writeDefaultConfig, ensureInitialCommit, isRepo, hasBinary, type ProjectState, type PassView } from '@sitemaxxing/core';
import { startHub } from '@sitemaxxing/mcp-server';

const cli = cac('sitemaxxing');
const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

function registryFile(): string {
  return path.join(os.homedir(), '.sitemaxxing', 'projects.json');
}

function addVitePlugin(root: string): 'added' | 'present' | 'none' {
  const cfg = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs'].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
  if (!cfg) return 'none';
  let text = fs.readFileSync(cfg, 'utf8');
  if (/sitemaxxing/.test(text)) return 'present';
  const importLine = `import { sitemaxxing } from 'sitemaxxing/vite';\n`;
  const lastImport = text.lastIndexOf('\nimport ');
  const insertAt = lastImport >= 0 ? text.indexOf('\n', lastImport + 1) + 1 : 0;
  text = text.slice(0, insertAt) + importLine + text.slice(insertAt);
  if (/plugins:\s*\[/.test(text)) text = text.replace(/plugins:\s*\[/, 'plugins: [sitemaxxing(), ');
  else text = text.replace(/defineConfig\(\{/, 'defineConfig({\n  plugins: [sitemaxxing()],');
  fs.writeFileSync(cfg, text);
  return 'added';
}

async function hubAlive(port = HUB_PORT): Promise<boolean> {
  try {
    const r = await fetch(`http://localhost:${port}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

/** Minimal WebSocket RPC client for talking to a running hub from the CLI. */
async function hubRpc<T>(method: string, params: Record<string, unknown>, port = HUB_PORT): Promise<T> {
  const { WebSocket } = await import('ws');
  return new Promise<T>((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/live`);
    const timer = setTimeout(() => (ws.close(), reject(new Error('hub timed out'))), 180_000);
    ws.on('open', () => ws.send(JSON.stringify({ id: 1, method, params })));
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (m.error) reject(new Error(m.error));
      else resolve(m.result as T);
    });
    ws.on('error', (e) => (clearTimeout(timer), reject(e)));
  });
}

function printPasses(state: ProjectState) {
  const line = (p: PassView) => `${p.status.padEnd(10)} ${String(p.impact).padStart(3)}  ${p.name.padEnd(24)} ${p.status === 'skipped' ? 'skipped: ' + (p.skipReason ?? '') : (p.summary ?? '')}`;
  console.log(`Mog score ${state.score?.score ?? '–'}  (v${state.currentVersion})  goal: ${state.brief?.goal ?? '–'}  seed: ${state.brief?.seed ?? '–'}`);
  for (const p of state.passes) console.log('  ' + line(p));
}

cli
  .command('init [path]', 'Register a project: write sitemaxxing.config.ts, add the Vite plugin, ignore .sitemaxxing')
  .option('--dev-url <url>', 'Dev server URL', { default: 'http://localhost:5173' })
  .action(async (p: string | undefined, opts: { devUrl: string }) => {
    const root = path.resolve(p ?? '.');
    if (!fs.existsSync(path.join(root, 'package.json'))) {
      console.error(`No package.json in ${root}`);
      process.exit(1);
    }
    if (!isRepo(root)) console.log('Initializing a git repository (Sitemaxxing commits versions).');
    ensureInitialCommit(root);
    const cfg = configPath(root) ?? writeDefaultConfig(root, opts.devUrl);
    const gi = path.join(root, '.gitignore');
    const gitignore = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
    if (!/^\.sitemaxxing\/?$/m.test(gitignore)) fs.writeFileSync(gi, gitignore + (gitignore.endsWith('\n') || !gitignore ? '' : '\n') + '.sitemaxxing/\n');
    const plugin = addVitePlugin(root);
    const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const hasDep = !!(pkgJson.devDependencies?.sitemaxxing ?? pkgJson.dependencies?.sitemaxxing);
    const id = Engine.projectIdFor(root);
    const reg = registryFile();
    const rows: any[] = fs.existsSync(reg) ? JSON.parse(fs.readFileSync(reg, 'utf8')) : [];
    fs.mkdirSync(path.dirname(reg), { recursive: true });
    fs.writeFileSync(reg, JSON.stringify([{ id, name: path.basename(root), rootPath: root, devUrl: opts.devUrl }, ...rows.filter((r) => r.id !== id)], null, 2));
    console.log(`Registered ${path.basename(root)} (${id})`);
    console.log(`  config:  ${path.relative(root, cfg)}`);
    console.log(`  plugin:  ${plugin === 'added' ? 'added to vite config' : plugin === 'present' ? 'already in vite config' : 'no vite config found'}`);
    if (plugin === 'none') console.log(`  Add this to your HTML in development only:\n  <script src="http://localhost:${HUB_PORT}/overlay.js"></script>`);
    if (!hasDep && plugin !== 'none') console.log(`  Add the package so the plugin resolves:  npm i -D sitemaxxing`);
    console.log(`Next: start your dev server, then run \`npx sitemaxxing dev\` here.`);
  });

cli
  .command('dev [path]', 'Start the MCP server, WebSocket hub and control room for this project')
  .option('--port <port>', 'Hub port', { default: HUB_PORT })
  .option('--control-room-port <port>', 'Control room port', { default: CONTROL_ROOM_PORT })
  .option('--no-open', 'Do not print the open hint')
  .action(async (p: string | undefined, opts: { port: number; controlRoomPort: number }) => {
    const root = path.resolve(p ?? '.');
    const controlRoomDir = (() => {
      const candidates = [path.join(here, '..', 'control-room'), path.join(here, '..', '..', '..', 'apps', 'control-room', 'dist')];
      return candidates.find((c) => fs.existsSync(path.join(c, 'index.html')));
    })();
    const hub = await startHub({ port: Number(opts.port), controlRoomDir, controlRoomPort: Number(opts.controlRoomPort), registryFile: registryFile() });
    if (fs.existsSync(path.join(root, 'package.json'))) {
      try {
        const r = await hub.engine.initProject(root);
        console.log(`[sitemaxxing] project ${r.name}: baseline Mog score ${r.baseline ?? 'n/a (dev server not reachable yet)'}`);
      } catch (e) {
        console.log(`[sitemaxxing] ${(e as Error).message}`);
      }
    }
    console.log(`[sitemaxxing] MCP:          http://localhost:${opts.port}/mcp`);
    console.log(`[sitemaxxing] WebSocket:    ws://localhost:${opts.port}/live`);
    console.log(`[sitemaxxing] Control room: ${controlRoomDir ? `http://localhost:${opts.controlRoomPort}` : '(not built; run pnpm dev in the monorepo)'}`);
    console.log(`[sitemaxxing] Claude Code:  claude mcp add sitemaxxing --transport http http://localhost:${opts.port}/mcp`);
    const stop = async () => {
      await hub.close();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });

cli
  .command('audit [path]', 'Plan from the brief and print the Mog score and proposed passes (CI-friendly)')
  .option('--json', 'JSON output')
  .option('--brief <file>', 'JSON brief: { story, audience, goal, feeling, keep, avoid, noise, seed }')
  .option('--seed <n>', 'Generation seed (same seed, same proposals)')
  .action(async (p: string | undefined, opts: { json?: boolean; brief?: string; seed?: string }) => {
    const root = path.resolve(p ?? '.');
    const id = Engine.projectIdFor(root);
    const brief = opts.brief ? JSON.parse(fs.readFileSync(path.resolve(opts.brief), 'utf8')) : undefined;
    if (brief && opts.seed) brief.seed = Number(opts.seed);
    let state: ProjectState;
    if (await hubAlive()) {
      await hubRpc('init_project', { path: root });
      if (brief) await hubRpc('set_brief', { project_id: id, brief });
      state = await hubRpc<ProjectState>('audit_page', { project_id: id });
    } else {
      const hub = await startHub({ port: 0 as any, registryFile: path.join(os.tmpdir(), 'sitemaxxing-audit.json'), log: () => undefined });
      try {
        await hub.engine.initProject(root);
        if (brief) await hub.engine.setBrief(id, brief);
        state = await hub.engine.audit(id);
      } finally {
        await hub.close();
      }
    }
    if (opts.json) console.log(JSON.stringify({ score: state.score, brief: state.brief, mood: state.mood, passes: state.passes.map((x) => ({ id: x.id, name: x.name, status: x.status, impact: x.impact, why: x.rationale, summary: x.summary, skipReason: x.skipReason, findings: x.findings, variants: x.variants.map((v) => v.label) })) }, null, 2));
    else printPasses(state);
    process.exit(0);
  });

cli.command('commit [path]', 'Commit the approved passes as a new version (same as the Commit button)').action(async (p: string | undefined) => {
  const root = path.resolve(p ?? '.');
  if (!(await hubAlive())) {
    console.error('Start `sitemaxxing dev` first so the approved changes are known.');
    process.exit(1);
  }
  const r = await hubRpc<{ version: number; sha: string; score: number }>('commit_version', { project_id: Engine.projectIdFor(root) });
  console.log(`v${r.version} committed (${r.sha.slice(0, 8)}) · Mog score ${Math.round(r.score)}`);
  process.exit(0);
});

cli
  .command('export [path]', 'Export artifacts for a version')
  .option('--timelapse <file>', 'Write an MP4 with one frame per pass')
  .option('--version <n>', 'Version number (default: latest)')
  .option('--seconds <s>', 'Seconds per frame', { default: 1.2 })
  .action(async (p: string | undefined, opts: { timelapse?: string; version?: string; seconds: number }) => {
    const root = path.resolve(p ?? '.');
    const shotsRoot = path.join(root, '.sitemaxxing', 'screenshots');
    if (!fs.existsSync(shotsRoot)) {
      console.error('No screenshots yet. Commit a version first.');
      process.exit(1);
    }
    const versions = fs
      .readdirSync(shotsRoot)
      .filter((d) => /^v\d+$/.test(d))
      .map((d) => Number(d.slice(1)))
      .sort((a, b) => a - b);
    const n = opts.version ? Number(opts.version) : versions.at(-1);
    const frames = path.join(shotsRoot, `v${n}`, 'timelapse');
    if (!n || !fs.existsSync(frames)) {
      console.error(`No timelapse frames for v${n}.`);
      process.exit(1);
    }
    if (!opts.timelapse) {
      console.log(frames);
      process.exit(0);
    }
    if (!hasBinary('ffmpeg')) {
      console.error('ffmpeg is not on PATH.');
      process.exit(1);
    }
    const files = fs
      .readdirSync(frames)
      .filter((f) => f.endsWith('.png'))
      .sort();
    const list = path.join(frames, 'frames.txt');
    const sec = Number(opts.seconds) || 1.2;
    fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'\nduration ${sec}`).join('\n') + `\nfile '${files.at(-1)}'\n`);
    const out = path.resolve(opts.timelapse);
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', out], { cwd: frames, stdio: 'inherit' });
    if (r.status !== 0) process.exit(r.status ?? 1);
    console.log(`Wrote ${out} (${files.length} frames, ${sec}s each)`);
    process.exit(0);
  });

cli.help();
cli.version(pkg.version);
cli.parse(process.argv, { run: false });
if (!cli.matchedCommand && !process.argv.slice(2).some((a) => a === '--help' || a === '-h' || a === '--version' || a === '-v')) cli.outputHelp();
else await cli.runMatchedCommand();

// Keep a reference so bundlers include the require shim for optional deps.
void createRequire;
