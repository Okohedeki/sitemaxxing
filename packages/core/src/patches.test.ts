import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyToDisk, canApply, filesTouched, toUnifiedDiff } from './patches';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sm-patch-'));

describe('patches', () => {
  it('round-trips a multi-file patch with a new file and an edit', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'a.css'), '.a { color: red; }\n.b { color: blue; }\n');
    const text = toUnifiedDiff({
      summary: 'test',
      files: [
        { path: 'a.css', before: '.a { color: red; }\n.b { color: blue; }\n', after: '.a { color: green; }\n.b { color: blue; }\n' },
        { path: 'src/new.ts', before: '', after: 'export const x = 1;\n' },
      ],
    });
    expect(filesTouched(text)).toEqual(['a.css', 'src/new.ts']);
    expect(canApply(root, text)).toBe(true);
    applyToDisk(root, text);
    expect(fs.readFileSync(path.join(root, 'a.css'), 'utf8')).toContain('green');
    expect(fs.existsSync(path.join(root, 'src/new.ts'))).toBe(true);
    applyToDisk(root, text, { reverse: true });
    expect(fs.readFileSync(path.join(root, 'a.css'), 'utf8')).toContain('red');
    expect(fs.existsSync(path.join(root, 'src/new.ts'))).toBe(false);
  });

  it('applies with an offset when earlier lines changed', () => {
    const root = tmp();
    const before = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') + '\n';
    const after = before.replace('line 20', 'line twenty');
    const text = toUnifiedDiff({ summary: 't', files: [{ path: 'f.txt', before, after }] });
    fs.writeFileSync(path.join(root, 'f.txt'), 'inserted\ninserted\n' + before);
    applyToDisk(root, text);
    expect(fs.readFileSync(path.join(root, 'f.txt'), 'utf8')).toContain('line twenty');
  });

  it('refuses a patch whose context is gone', () => {
    const root = tmp();
    const text = toUnifiedDiff({ summary: 't', files: [{ path: 'f.txt', before: 'alpha\nbeta\ngamma\n', after: 'alpha\nBETA\ngamma\n' }] });
    fs.writeFileSync(path.join(root, 'f.txt'), 'totally\ndifferent\ncontent\nhere\n');
    expect(canApply(root, text)).toBe(false);
    expect(() => applyToDisk(root, text)).toThrow();
  });
});
