# AGENTS.md

## What this is
`bg2x` — browser-based AI image super-resolution (upscaling). **All inference runs client-side** via ONNX Runtime Web (WASM/WebGPU) inside a Web Worker. There is no backend.

## Commands
- `npm run dev` — dev server bound to `0.0.0.0`
- `npm run build` — static Astro build → `dist/`
- `npm run preview` — serve the build
- `npm run lint` / `npm run lint:fix` — ESLint over `src/` (ignores all `*.astro`)
- `npm run format` / `npm run format:check` — Prettier over `src/`
- `npm run typecheck` — `astro check`
- Verify in order: `lint` → `typecheck` → `build`. **There are no tests and no test framework.**
- Package manager is ambiguous: both `package-lock.json` and `pnpm-lock.yaml` (plus `pnpm-workspace.yaml`) are committed. Confirm which one the team uses before installing; do not mix.

## Architecture
- Astro 5 renders only static shells. `src/pages/index.astro` and `src/pages/[...view].astro` mount `App.vue` with `client:only="vue"`; everything after that is a Vue 3 SPA.
- **Adding a route requires two edits**: add it to `src/router/router.ts` **and** to `getStaticPaths()` in `src/pages/[...view].astro`. Static output pre-renders one HTML file per view name, so a route missing from `getStaticPaths` 404s on direct load / refresh.
- Router uses `createWebHistory` in the browser and `createMemoryHistory` during SSR.
- Inference pipeline: `src/composables/useProcessingQueue.ts` (main thread) ↔ `src/workers/super-resolution.worker.ts`, communicating through the typed messages in `src/type/index.ts` (`WorkerMessage` / `WorkerResponse`). Change one side → update those shared types.
- `useProcessingQueue` temporarily swaps `worker.onmessage` in `waitForModelLoaded` and dedupes concurrent loads with `inflightLoad`; edit that flow carefully.
- Models: registry in `src/config/models.ts` (`MODELS`). `ModelEntry.url` **must equal `fallbackUrls[0]`** — `url` is the IndexedDB cache key; `fallbackUrls` is an ordered list of fallback mirrors. Cached in IndexedDB DB `super-resolution-models` → store `models` (keyPath `url`), see `useModelCache.ts`.
- Worker execution providers: `webgpu` when GPU is on, with automatic fallback to `wasm`; thread count = `navigator.hardwareConcurrency`.

## Vite / Astro quirks — do not "fix" these
- `astro.config.mjs` sets `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`. These are **required** for onnxruntime-web WASM SharedArrayBuffer multithreading. Any production host must send the same headers or threading will break.
- `vite.optimizeDeps.exclude: ['onnxruntime-web']`, `ssr.noExternal: ['vue-i18n']`, and `define.__VUE_PROD_DEVTOOLS__: false` are deliberate (vue-i18n's raw ESM references bare identifiers under SSR).

## Styling
- Tailwind v4 config lives in **CSS**, not JS: `src/styles/globals.css` (`@import 'tailwindcss'`, `@custom-variant dark`, `@theme inline`). The root `tailwind.config.js` is legacy and is **not loaded** (there is no `@config` directive) — it even uses `require()` in an ESM file. Edit `globals.css`.
- Two variable systems coexist: shadcn tokens (`--background`, `--primary`, …) in `globals.css`, and macOS-style `--color-*` tokens in `Layout.astro`. Existing components reference `var(--color-*)`.
- Dark mode = `.dark` class on `<html>`. `Layout.astro` contains an inline FOUC-prevention script that reads localStorage key `super-resolution-theme` directly — keep it in sync if you rename the theme store's persist key.

## State & i18n
- Pinia persist keys are fixed strings: `super-resolution-locale`, `super-resolution-theme`, `super-resolution-settings`, `super-resolution-default-model`, `image-super-resolution-history`. History only persists while the `historyPersist` setting is enabled.
- Locale is rehydrated into vue-i18n in `src/pages/_app.ts`.
- i18n: `src/locales/{en,zh,ja}.json`, default and fallback `en`. Every new key must be added to all three files. User-facing strings go through `t()` — no hardcoded UI text.

## Conventions
- Prettier: single quotes, trailing commas, `printWidth: 100`, LF. Run `npm run format` before finishing.
- Commit messages: Conventional Commits in English (`feat(scope): …`, `fix(scope): …`). No AI attribution / co-author trailers.
- `tsconfig` extends `astro/tsconfigs/strict`; alias `@/*` → `src/*`. Do not suppress types.
- Generated/ignored (never edit): `dist/`, `.astro/`, `node_modules/`, `.history/` (VS Code Local History artifacts).
