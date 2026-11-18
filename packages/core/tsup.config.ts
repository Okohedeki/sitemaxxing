import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', protocol: 'src/protocol.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
});
