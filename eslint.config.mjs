import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const tsGlobs = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

/** Browser globals referenced in public/page scripts (no extra npm package). */
const browserRuntimeGlobals = {
  AbortController: 'readonly',
  caches: 'readonly',
  clearTimeout: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  navigator: 'readonly',
  setTimeout: 'readonly',
  SpeechSynthesisUtterance: 'readonly',
  window: 'readonly',
};

/** Globals referenced in public/sw.js */
const serviceWorkerRuntimeGlobals = {
  caches: 'readonly',
  self: 'readonly',
};

/** Node / CLI globals for scripts (no extra npm package). */
const scriptsRuntimeGlobals = {
  AbortController: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  exports: 'writable',
  fetch: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setTimeout: 'readonly',
};

export default defineConfig(
  {
    ignores: ['dist/**', 'node_modules/**', 'backups/**', 'logs/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: config.files ?? tsGlobs,
  })),
  {
    files: ['**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: serviceWorkerRuntimeGlobals,
    },
  },
  {
    files: ['public/**/*.js'],
    ignores: ['public/sw.js'],
    languageOptions: {
      globals: browserRuntimeGlobals,
    },
  },
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js', 'scripts/**/*.cjs'],
    languageOptions: {
      globals: scriptsRuntimeGlobals,
    },
  },
);
