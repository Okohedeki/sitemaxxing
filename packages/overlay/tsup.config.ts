import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { overlay: 'src/overlay.ts' },
  format: ['iife'],
  globalName: 'Sitemaxxing',
  minify: false,
  clean: true,
  platform: 'browser',
  target: 'es2020',
  outExtension: () => ({ js: '.js' }),
});
