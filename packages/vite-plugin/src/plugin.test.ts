import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { sitemaxxing } from './index';

const SAMPLE = path.resolve(__dirname, '..', '..', '..', 'apps', 'sample-fieldnote');

describe('vite plugin', () => {
  it('injects the overlay only while serving', () => {
    const p = sitemaxxing({ hub: 'http://localhost:3333' }) as any;
    expect(p.apply).toBe('serve');
    const tags = p.transformIndexHtml('<html></html>');
    expect(tags[0].attrs.src).toBe('http://localhost:3333/overlay.js');
  });

  it('leaves no overlay reference in a production build of the sample site', async () => {
    const outDir = path.join(SAMPLE, 'dist');
    process.env.NODE_ENV = 'production';
    await build({ root: SAMPLE, mode: 'production', logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    const files = fs.readdirSync(outDir, { recursive: true }) as string[];
    const hits = files.filter((f) => /\.(html|js|css)$/.test(f) && /overlay\.js|data-sitemaxxing|localhost:3333|__sitemaxxing/i.test(fs.readFileSync(path.join(outDir, f), 'utf8')));
    expect(hits).toEqual([]);
    fs.rmSync(outDir, { recursive: true, force: true });
  }, 120_000);
});
