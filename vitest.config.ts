import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@sitemaxxing/core/protocol': r('./packages/core/src/protocol.ts'),
      '@sitemaxxing/core': r('./packages/core/src/index.ts'),
      '@sitemaxxing/rules': r('./packages/rules/src/index.ts'),
      '@sitemaxxing/passes': r('./packages/passes/src/index.ts'),
      '@sitemaxxing/components': r('./packages/components/src/index.ts'),
      '@sitemaxxing/mog-score': r('./packages/mog-score/src/index.ts'),
      '@sitemaxxing/vite-plugin': r('./packages/vite-plugin/src/index.ts'),
      '@sitemaxxing/mcp-server': r('./packages/mcp-server/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
