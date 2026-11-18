import fs from 'node:fs';
import path from 'node:path';
import { ensureInitialCommit } from './git';
import { linkNodeModules } from './engine';

const SKIP = new Set(['node_modules', 'dist', '.sitemaxxing', '.git', '.playground']);

/**
 * Copies a sample app into a throwaway folder with its own git history, so commits made by
 * Sitemaxxing never touch the repository the sample lives in.
 */
export function preparePlayground(srcDir: string, dstDir: string, opts: { devUrl?: string; fresh?: boolean } = {}): string {
  const src = path.resolve(srcDir);
  const dst = path.resolve(dstDir);
  if (opts.fresh && fs.existsSync(dst)) removeTree(dst);
  const existed = fs.existsSync(path.join(dst, 'package.json'));
  if (!existed) {
    fs.mkdirSync(dst, { recursive: true });
    copyDir(src, dst);
    if (opts.devUrl) {
      const cfg = path.join(dst, 'sitemaxxing.config.ts');
      if (fs.existsSync(cfg)) fs.writeFileSync(cfg, fs.readFileSync(cfg, 'utf8').replace(/devUrl: '[^']*'/, `devUrl: '${opts.devUrl}'`));
    }
    const gi = path.join(dst, '.gitignore');
    const lines = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
    if (!/\.sitemaxxing/.test(lines)) fs.writeFileSync(gi, lines + (lines.endsWith('\n') || !lines ? '' : '\n') + '.sitemaxxing\nnode_modules\ndist\n');
  }
  linkNodeModules(src, dst);
  ensureInitialCommit(dst);
  return dst;
}

/** Removes a playground, unlinking the node_modules junction first so its target is untouched. */
export function removeTree(dir: string) {
  const nm = path.join(dir, 'node_modules');
  try {
    if (fs.lstatSync(nm).isSymbolicLink()) fs.rmdirSync(nm);
  } catch {
    /* no link */
  }
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function copyDir(from: string, to: string) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else fs.copyFileSync(s, d);
  }
}
