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
  return parsePatch(patchText);
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
export function applyToDisk(root: string, patchText: string, opts: { reverse?: boolean } = {}): string[] {
  const parsed = parse(patchText).map((d) => (opts.reverse ? reverseParsed(d) : d));
  const writes: Array<{ abs: string; content: string | null; rel: string }> = [];
  for (const d of parsed) {
    const oldName = stripPrefix(d.oldFileName);
    const newName = stripPrefix(d.newFileName);
    const rel = oldName && oldName !== DEV_NULL ? oldName : newName;
    const abs = path.join(root, rel);
    const creating = oldName === DEV_NULL || !oldName;
    const deleting = newName === DEV_NULL;
    const current = creating ? '' : fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (current === null) throw new PatchApplyError(`file missing: ${rel}`, rel);
    if (deleting) {
      writes.push({ abs, content: null, rel });
      continue;
    }
    const next = applyPatch(current, d, { fuzzFactor: 2 });
    if (next === false) throw new PatchApplyError(`hunk does not apply: ${rel}`, rel);
    writes.push({ abs, content: next, rel });
  }
  for (const w of writes) {
    if (w.content === null) {
      if (fs.existsSync(w.abs)) fs.rmSync(w.abs);
    } else {
      fs.mkdirSync(path.dirname(w.abs), { recursive: true });
      fs.writeFileSync(w.abs, w.content);
    }
  }
  return writes.map((w) => w.rel);
}

/** Pure check: would the patch apply to the given root without writing? */
export function canApply(root: string, patchText: string, reverse = false): boolean {
  try {
    const parsed = parse(patchText).map((d) => (reverse ? reverseParsed(d) : d));
    for (const d of parsed) {
      const oldName = stripPrefix(d.oldFileName);
      const newName = stripPrefix(d.newFileName);
      const rel = oldName && oldName !== DEV_NULL ? oldName : newName;
      if (newName === DEV_NULL) continue;
      const creating = oldName === DEV_NULL || !oldName;
      const abs = path.join(root, rel);
      const current = creating ? '' : fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
      if (current === null) return false;
      if (applyPatch(current, d, { fuzzFactor: 2 }) === false) return false;
    }
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
