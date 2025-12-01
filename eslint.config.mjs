import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // Ensure TS parser resolves relative to monorepo root
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'] ,
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        // Types, Interfaces, Classes, Enums
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
        // Variables and functions
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'], leadingUnderscore: 'allow' },
        { selector: 'function', format: ['camelCase'] },
      ],
    },
  },
  {
    // Config files can use CommonJS or different globals without noise
    files: ['**/vite.config.*', '**/vitest.config.*', '**/webpack.config.*', '**/rollup.config.*', '**/eslint.config.*', '**/next.config.*', '**/tailwind.config.*', '**/postcss.config.*'],
    rules: {
      'no-undef': 'off',
    },
  },
];
