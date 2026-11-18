import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, 'e2e', '.tmp');

/** `npx sitemaxxing init` against a fresh Vite + React project made with create-vite. */
test('init works on a fresh create-vite project', async () => {
  test.setTimeout(300_000);
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const create = spawnSync(npx, ['--yes', 'create-vite@6', 'fresh-app', '--template', 'react-ts'], { cwd: TMP, encoding: 'utf8', shell: process.platform === 'win32', timeout: 240_000 });
  expect(create.status, create.stderr).toBe(0);
  const app = path.join(TMP, 'fresh-app');
  expect(fs.existsSync(path.join(app, 'vite.config.ts'))).toBe(true);

  const cli = path.join(ROOT, 'packages', 'cli', 'bin', 'sitemaxxing.js');
  const init = spawnSync(process.execPath, [cli, 'init', app, '--dev-url', 'http://localhost:5190'], { encoding: 'utf8', env: { ...process.env, HOME: TMP, USERPROFILE: TMP } });
  expect(init.status, init.stderr + init.stdout).toBe(0);
  expect(init.stdout).toContain('Registered fresh-app');

  const cfg = fs.readFileSync(path.join(app, 'sitemaxxing.config.ts'), 'utf8');
  expect(cfg).toContain("devUrl: 'http://localhost:5190'");
  const vite = fs.readFileSync(path.join(app, 'vite.config.ts'), 'utf8');
  expect(vite).toContain("from 'sitemaxxing/vite'");
  expect(vite).toMatch(/plugins:\s*\[sitemaxxing\(\)/);
  expect(fs.readFileSync(path.join(app, '.gitignore'), 'utf8')).toContain('.sitemaxxing/');
  expect(spawnSync('git', ['-C', app, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).status).toBe(0);
  const registry = JSON.parse(fs.readFileSync(path.join(TMP, '.sitemaxxing', 'projects.json'), 'utf8'));
  expect(registry[0].name).toBe('fresh-app');
});
