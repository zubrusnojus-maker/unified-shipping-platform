import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      '@next/next': nextPlugin,
    },
  },
  {
    files: ['tailwind.config.js', 'postcss.config.mjs', 'next.config.mjs', 'vitest.config.ts'],
    rules: {
      'no-undef': 'off',
    },
  },
];
