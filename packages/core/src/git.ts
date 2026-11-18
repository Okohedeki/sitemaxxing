import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export function git(root: string, args: string[], opts: { allowFail?: boolean } = {}): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
  }
  return (r.stdout || '').trim();
}

export function isRepo(root: string): boolean {
  const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === 'true';
}

export function headSha(root: string): string {
  return git(root, ['rev-parse', 'HEAD'], { allowFail: true }) || '';
}

/** Repo-relative paths with uncommitted changes, ignoring the Sitemaxxing working dir. */
export function dirtyFiles(root: string): string[] {
  const out = git(root, ['status', '--porcelain', '--untracked-files=all'], { allowFail: true });
  return out
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
    .map((p) => p.replace(/\\/g, '/'))
    .filter((p) => !p.startsWith('.sitemaxxing/'));
}

export function commitFiles(root: string, files: string[], message: string): string {
  if (files.length) git(root, ['add', '-A', '--', ...files]);
  git(root, ['-c', 'user.name=Sitemaxxing', '-c', 'user.email=sitemaxxing@localhost', 'commit', '-q', '-m', message, '--no-verify'], {
    allowFail: false,
  });
  return headSha(root);
}

export function ensureInitialCommit(root: string): string {
  if (!isRepo(root)) {
    git(root, ['init', '-q', '-b', 'main']);
  }
  if (!headSha(root)) {
    git(root, ['add', '-A']);
    git(root, ['-c', 'user.name=Sitemaxxing', '-c', 'user.email=sitemaxxing@localhost', 'commit', '-q', '-m', 'Initial import', '--no-verify']);
  }
  return headSha(root);
}

export function addWorktree(root: string, sha: string, dir: string): string {
  const abs = path.resolve(root, dir);
  if (fs.existsSync(abs)) return abs;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  git(root, ['worktree', 'add', '--detach', '-f', abs, sha]);
  return abs;
}

export function removeWorktree(root: string, dir: string): void {
  const abs = path.resolve(root, dir);
  if (!fs.existsSync(abs)) return;
  git(root, ['worktree', 'remove', '--force', abs], { allowFail: true });
  if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
}

export function hasBinary(name: string): boolean {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
