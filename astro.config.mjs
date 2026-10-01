// @ts-check
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwind from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  integrations: [vue({ appEntrypoint: '/src/pages/_app' })],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  vite: {
    plugins: [tailwind()],
    optimizeDeps: {
      exclude: ['onnxruntime-web']
    },
    ssr: {
      // Bundle vue-i18n during SSR so vite `define` values (e.g. __VUE_PROD_DEVTOOLS__)
      // are applied; the raw ESM dist references them as bare identifiers.
      noExternal: ['vue-i18n'],
    },
    define: {
      __VUE_PROD_DEVTOOLS__: false,
    },
  }
});
