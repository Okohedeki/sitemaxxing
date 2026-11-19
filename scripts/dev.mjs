// pnpm dev: builds the packages, prepares both sample playgrounds, starts their dev servers,
// the hub (MCP + WebSocket) and the control room. Prints every port.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

if (!process.argv.includes('--no-build')) {
  const b = spawnSync(pnpm, ['build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

const core = await import(pathToFileURL(path.join(root, 'packages', 'core', 'dist', 'index.js')).href);
const { startHub } = await import(pathToFileURL(path.join(root, 'packages', 'mcp-server', 'dist', 'index.js')).href);

const SAMPLES = [
  { name: 'fieldnote', port: 5173 },
  { name: 'isvik', port: 5174 },
];
const children = [];
let hubRef = null;
const stop = async () => {
  for (const c of children) core.killTree(c);
  // Also stops the dev servers of sites recreated from a URL.
  await hubRef?.close().catch(() => undefined);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

// --fresh rebuilds the playgrounds from the samples (the end-to-end tests start from a clean page).
const fresh = process.argv.includes('--fresh');
const dirs = [];
if (fresh) {
  // Pages rebuilt from a URL are throwaway too.
  const sites = path.join(root, '.playground', 'sites');
  for (const d of fs.existsSync(sites) ? fs.readdirSync(sites) : []) core.removeTree(path.join(sites, d));
  fs.rmSync(path.join(root, '.playground', 'projects.json'), { force: true });
}
for (const s of SAMPLES) {
  const dir = core.preparePlayground(path.join(root, 'apps', `sample-${s.name}`), path.join(root, '.playground', s.name), { devUrl: `http://localhost:${s.port}`, fresh });
  dirs.push({ ...s, dir });
  children.push(core.spawnVite(dir, s.port));
}
for (const d of dirs) await core.waitForUrl(`http://localhost:${d.port}`, 30_000);

const hub = (hubRef = await startHub({
  port: 3333,
  registryFile: path.join(root, '.playground', 'projects.json'),
  // Any URL: pasted pages are recreated under .playground/sites from apps/site-template.
  sites: { dir: path.join(root, '.playground', 'sites'), template: path.join(root, 'apps', 'site-template') },
}));
for (const d of dirs) {
  try {
    const r = await hub.engine.initProject(d.dir, `http://localhost:${d.port}`);
    console.log(`[sitemaxxing] ${d.name}: baseline Mog score ${r.baseline}`);
  } catch (e) {
    console.log(`[sitemaxxing] ${d.name}: ${e.message}`);
  }
}

const cr = spawn(pnpm, ['--filter', 'control-room', 'dev'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
children.push(cr);

console.log(`
  Sitemaxxing is up.

  Control room   http://localhost:4747
  Hub (MCP)      http://localhost:3333/mcp
  Hub (WS)       ws://localhost:3333/live
  Fieldnote      http://localhost:5173   (.playground/fieldnote)
  Isvik          http://localhost:5174   (.playground/isvik)

  Claude Code:   claude mcp add sitemaxxing --transport http http://localhost:3333/mcp
`);
