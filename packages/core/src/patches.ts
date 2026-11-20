import { applyPatch, createTwoFilesPatch, parsePatch, type ParsedDiff } from 'diff';
import fs from 'node:fs';
import path from 'node:path';
import type { Patch, PatchFile } from './types';

const DEV_NULL = '/dev/null';

/** Turns a structured patch into unified-diff text (one section per file). */
export function toUnifiedDiff(patch: Patch): string {
  return patch.files
    .map((f) => {
      const oldName = f.before === '' ? DEV_NULL : `a/${f.path}`;
      const newName = f.after === '' ? DEV_NULL : `b/${f.path}`;
      const text = createTwoFilesPatch(oldName, newName, f.before, f.after, '', '', { context: 3 });
      return text.replace(/^Index:.*\n=+\n/m, '');
    })
    .join('');
}

export function parse(patchText: string): ParsedDiff[] {
  // An empty patch parses as one diff with no file; a change that touches nothing has no diffs.
  return parsePatch(patchText).filter((d) => d.hunks.length > 0 && !!(d.oldFileName || d.newFileName));
}

export function reverseParsed(d: ParsedDiff): ParsedDiff {
  return {
    ...d,
    oldFileName: d.newFileName,
    newFileName: d.oldFileName,
    oldHeader: d.newHeader,
    newHeader: d.oldHeader,
    hunks: d.hunks.map((h) => ({
      oldStart: h.newStart,
      oldLines: h.newLines,
      newStart: h.oldStart,
      newLines: h.oldLines,
      lines: h.lines.map((l) => (l[0] === '+' ? '-' + l.slice(1) : l[0] === '-' ? '+' + l.slice(1) : l)),
    })),
  };
}

function stripPrefix(name: string | undefined): string {
  if (!name) return '';
  return name.replace(/^[ab]\//, '');
}

export function filesTouched(patchText: string): string[] {
  return parse(patchText).map((d) => {
    const a = stripPrefix(d.oldFileName);
    const b = stripPrefix(d.newFileName);
    return a && a !== DEV_NULL ? a : b;
  });
}

export class PatchApplyError extends Error {
  constructor(
    message: string,
    public file: string,
  ) {
    super(message);
  }
}

/**
 * Applies (or reverses) a multi-file unified diff on disk. All files are checked first so a
 * failing hunk leaves the tree untouched.
 */
/**
 * A staging area over the working tree. Reversals and applications are done in memory and flushed
 * with one write per file, so a dev server's watcher sees a single change instead of two writes a
 * few milliseconds apart (which file watchers can coalesce and serve stale).
 */
export class Staging {
  private files = new Map<string, string | null>();
  constructor(public root: string) {}

  read(rel: string): string | null {
    if (this.files.has(rel)) return this.files.get(rel)!;
    const abs = path.join(this.root, rel);
    return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  }

  write(rel: string, content: string | null) {
    this.files.set(rel, content);
  }

  get dirty(): boolean {
    return this.files.size > 0;
  }

  /** Writes every staged file whose content differs from disk. Returns the files written. */
  flush(): string[] {
    const written: string[] = [];
    for (const [rel, content] of this.files) {
      const abs = path.join(this.root, rel);
      const onDisk = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (onDisk === content) continue;
      if (content === null) fs.rmSync(abs, { force: true });
      else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
      }
      written.push(rel);
    }
    this.files.clear();
    return written;
  }
}

function plan(stage: Staging, patchText: string, reverse: boolean): Array<{ rel: string; content: string | null }> {
  const parsed = parse(patchText).map((d) => (reverse ? reverseParsed(d) : d));
  const out: Array<{ rel: string; content: string | null }> = [];
  for (const d of parsed) {
    const oldName = stripPrefix(d.oldFileName);
    const newName = stripPrefix(d.newFileName);
    const rel = oldName && oldName !== DEV_NULL ? oldName : newName;
    const creating = oldName === DEV_NULL || !oldName;
    if (newName === DEV_NULL) {
      out.push({ rel, content: null });
      continue;
    }
    const current = creating ? '' : stage.read(rel);
    if (current === null) throw new PatchApplyError(`file missing: ${rel}`, rel);
    const next = applyPatch(current, d, { fuzzFactor: 2 });
    if (next === false) throw new PatchApplyError(`hunk does not apply: ${rel}`, rel);
    out.push({ rel, content: next });
  }
  return out;
}

/** Applies (or reverses) a multi-file diff into a staging area. All files are checked first. */
export function applyStaged(stage: Staging, patchText: string, opts: { reverse?: boolean } = {}): string[] {
  const writes = plan(stage, patchText, !!opts.reverse);
  for (const w of writes) stage.write(w.rel, w.content);
  return writes.map((w) => w.rel);
}

/** Applies (or reverses) a multi-file unified diff on disk. A failing hunk leaves the tree untouched. */
export function applyToDisk(root: string, patchText: string, opts: { reverse?: boolean } = {}): string[] {
  const stage = new Staging(root);
  const files = applyStaged(stage, patchText, opts);
  stage.flush();
  return files;
}

/** Pure check: would the patch apply (to the staged tree, or to disk) without writing? */
export function canApply(root: string | Staging, patchText: string, reverse = false): boolean {
  try {
    plan(typeof root === 'string' ? new Staging(root) : root, patchText, reverse);
    return true;
  } catch {
    return false;
  }
}

export function patchFileName(passId: string, variantId?: string): string {
  return `${passId}__${variantId ?? 'default'}.patch`;
}

export function writePatchFile(dir: string, passId: string, variantId: string | undefined, text: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, patchFileName(passId, variantId));
  fs.writeFileSync(p, text);
  return p;
}

export function isEmptyPatch(patch: Patch): boolean {
  return patch.files.every((f: PatchFile) => f.before === f.after);
}
