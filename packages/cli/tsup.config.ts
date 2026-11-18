import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts', vite: 'src/vite.ts' },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts', vite: 'src/vite.ts' } },
  clean: true,
  target: 'node20',
  external: ['@sitemaxxing/core', '@sitemaxxing/mcp-server', '@sitemaxxing/passes', '@sitemaxxing/vite-plugin'],
});
