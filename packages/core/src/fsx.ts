import fs from 'node:fs';
import path from 'node:path';
import type { FileSystem } from './types';

export function makeFileSystem(root: string): FileSystem {
  return {
    root,
    read(rel) {
      return fs.readFileSync(path.join(root, rel), 'utf8');
    },
    exists(rel) {
      return fs.existsSync(path.join(root, rel));
    },
    list(dir, ext) {
      const abs = path.join(root, dir);
      if (!fs.existsSync(abs)) return [];
      const out: string[] = [];
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (!ext || e.name.endsWith(ext)) out.push(path.relative(root, p).replace(/\\/g, '/'));
        }
      };
      walk(abs);
      return out;
    },
  };
}

export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}
