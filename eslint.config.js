import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import n from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'docs-site/**',
      'node_modules/**',
      'examples/**/dist/**',
      '**/*.d.ts',
      '**/*.d.cts',
    ],
  },

  // ─── JS / config files (no type-aware linting) ────────────────────────────
  {
    files: ['eslint.config.js', '*.config.js', '*.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },

  // ─── TS sources (type-aware) ──────────────────────────────────────────────
  {
    files: ['src/**/*.ts', 'test/**/*.ts', '*.config.ts', '*.config.mts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      promise.configs['flat/recommended'],
      unicorn.configs['flat/recommended'],
      n.configs['flat/recommended-module'],
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        navigator: 'readonly',
        window: 'readonly',
        indexedDB: 'readonly',
        globalThis: 'readonly',
        IDBFactory: 'readonly',
        IDBOpenDBRequest: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'unicorn/prevent-abbreviations': 'off',
      'unicorn/no-null': 'off',
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/no-array-reduce': 'off',
      'unicorn/prefer-global-this': 'off', // we narrow `window` deliberately

      'n/no-missing-import': 'off',
      'n/no-unsupported-features/node-builtins': 'off',
      'n/no-extraneous-import': 'off',
      'n/no-unpublished-import': 'off',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: true },
      ],
      '@typescript-eslint/no-deprecated': 'off', // navigator.vendor still in use
    },
  },

  {
    files: ['test/**/*.ts', '**/*.test.ts', '**/*.bench.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/consistent-function-scoping': 'off',
    },
  },

  prettier,
);
