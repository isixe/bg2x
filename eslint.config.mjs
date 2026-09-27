import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Global ignores
  { ignores: ['dist/', 'node_modules/', '*.astro'] },

  // Base JS rules
  js.configs.recommended,

  // TypeScript rules
  ...tseslint.configs.recommended,

  // Vue rules (essential + recommended)
  ...pluginVue.configs['flat/recommended'],

  // Vue files: TS parser + browser globals
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FileList: 'readonly',
        DragEvent: 'readonly',
        FormData: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        Image: 'readonly',
        Worker: 'readonly',
        MessageEvent: 'readonly',
        AbortController: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLImageElement: 'readonly',
        ImageData: 'readonly',
        ClipboardItem: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
      },
    },
  },

  // Worker files: worker globals
  {
    files: ['**/*.worker.ts'],
    languageOptions: {
      globals: {
        self: 'readonly',
        postMessage: 'readonly',
        importScripts: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        ImageData: 'readonly',
        OffscreenCanvas: 'readonly',
        Image: 'readonly',
      },
    },
  },

  // Custom rules
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Prettier must be last to disable conflicting rules
  prettierConfig,
];
