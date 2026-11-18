import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '.playground/**',
      'docs/mockups/**',
      '**/*.config.*',
      'scripts/**',
      'e2e/.tmp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/components/src/**', 'packages/overlay/src/**', 'apps/**'],
    languageOptions: { globals: { window: 'readonly', document: 'readonly' } },
  },
);
