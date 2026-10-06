<p align="center">
  <img src="public/favicon.png" alt="bg2x" width="150px">
</p>

<h2 align="center">bg2x</h2>

<p align="center">A free, privacy-first AI image super-resolution (upscaling) tool that runs entirely in your browser.</p>

<p align="center">
  <a href="https://bg2x.itea.dev/">Demo</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#desktop-app">Desktop App</a> ·
  <a href="https://github.com/isixe/bg2x">GitHub</a>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
</p>

## Features

- **AI-Powered Super Resolution** — Upscale images up to 4x with Real-ESRGAN, SwinIR, Swin2SR, Real-CUGAN, and ESRGAN models.
- **Privacy Protected** — 100% client-side inference through ONNX Runtime Web inside a Web Worker. No backend, no uploads.
- **Multiple AI Models** — 15 specialized models for photos, anime, illustrations, and compressed images.
- **GPU Acceleration** — Runs on WebGPU when available, with automatic fallback to WASM.
- **Multiple Export Formats** — Export as PNG, JPG, or WebP, and download a whole batch as a ZIP.
- **Drag & Drop Support** — Add images through drag-and-drop or the file picker.
- **Batch Processing** — Queue multiple images and process them one after another.
- **Offline-Friendly Model Cache** — Models are cached in IndexedDB after the first download.
- **Trilingual Interface** — English, Chinese, and Japanese, with light and dark themes.
- **Desktop App** — Native Electron builds for Windows, macOS, and Linux.

## Tech Stack

| Category         | Technology                       |
| ---------------- | -------------------------------- |
| Framework        | Astro 5 + Vue 3                  |
| Language         | TypeScript                       |
| Styling          | Tailwind CSS v4                  |
| State Management | Pinia                            |
| Routing          | Vue Router                       |
| i18n             | Vue I18n                         |
| AI / ML          | ONNX Runtime Web (WASM / WebGPU) |
| UI Components    | shadcn-vue + Reka UI + Lucide    |

## Available Models

Models are downloaded on demand from Hugging Face and cached locally in IndexedDB.

| Model                          | Scale | Size   |
| ------------------------------ | ----- | ------ |
| Real-ESRGAN AnimeVideo v3      | 4x    | ~2.5MB |
| Real-ESRGAN General x4v3       | 4x    | ~4.9MB |
| Real-ESRGAN x2plus             | 2x    | ~67MB  |
| Real-ESRGAN x4plus             | 4x    | ~67MB  |
| Real-ESRGAN x4plus Anime       | 4x    | ~18MB  |
| Real-ESRGAN x4plus Anime 4B32F | 4x    | ~5.2MB |
| SwinIR-M x4                    | 4x    | ~61MB  |
| SwinIR-L x4                    | 4x    | ~122MB |
| Swin2SR Lightweight x2         | 2x    | ~8.1MB |
| Swin2SR Classical x2           | 2x    | ~54MB  |
| Swin2SR Classical x4           | 4x    | ~55MB  |
| Swin2SR RealWorld x4           | 4x    | ~53MB  |
| Swin2SR Compressed x4          | 4x    | ~55MB  |
| Real-CUGAN 2x                  | 2x    | ~5.2MB |
| ESRGAN x4                      | 4x    | ~67MB  |

## Installation

### Clone the Repository

```bash
git clone https://github.com/isixe/bg2x.git
cd bg2x
```

### Install Dependencies

```bash
pnpm install
```

> This repository contains both `package-lock.json` and `pnpm-lock.yaml`. Use the same package manager as the rest of the team and do not mix them.

### Start the Development Server

```bash
pnpm dev
```

The application will be available at `http://localhost:4321`.

## Build for Production

```bash
pnpm build
```

The production build is output to `./dist/`.

> **Deployment note:** the WASM backend uses `SharedArrayBuffer` for multithreading, which requires cross-origin isolation. Your host must send:
>
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
>
> These headers are configured in `astro.config.mjs` for development. Make sure your production host sends them too, or threaded inference will fall back to a single thread.

## Desktop App

An Electron build ships for Windows, macOS, and Linux (including a Debian `.deb` package). It bundles the same client-side inference pipeline and serves the built site through a custom `app://` protocol that injects the cross-origin isolation headers above, so threaded WASM still works.

Download the latest build from the in-app **Desktop app** page (the monitor icon in the header), which detects your operating system and links straight to the matching installer, or browse all release assets on the [Releases page](https://github.com/isixe/bg2x/releases).

Build the desktop app locally:

```bash
pnpm desktop:pack
```

Installers are written to `./release/`. Pushing a tag that matches the `package.json` version (for example `v0.1.0`) triggers `.github/workflows/release.yml`, which builds every platform and publishes them to a GitHub Release. Use `pnpm desktop:publish` to build and upload from a local machine.

## Project Structure

```
bg2x/
├── public/                  # Static assets
├── electron/                # Electron main process
├── src/
│   ├── components/          # Vue components (views, panels, UI)
│   │   └── ui/              # shadcn-vue primitives
│   ├── composables/         # Model registry, cache, downloads, processing queue
│   ├── config/              # App metadata, models, related projects
│   ├── layouts/             # Astro layout
│   ├── locales/             # i18n messages (en, zh, ja) and setup
│   ├── pages/               # Astro entry points
│   ├── router/              # Vue Router configuration
│   ├── store/               # Pinia stores
│   ├── styles/              # Global styles and Tailwind v4 theme
│   ├── type/                # Shared TypeScript types
│   └── workers/             # ONNX Runtime Web inference worker
├── astro.config.mjs         # Astro configuration
├── electron-builder.yml     # Desktop packaging configuration
├── eslint.config.mjs        # ESLint flat config
├── tsconfig.json            # TypeScript configuration
└── package.json             # Dependencies and scripts
```

## Supported Image Formats

- **Input:** JPG / JPEG, PNG, WebP (any format your browser can decode)
- **Output:** PNG, JPG, WebP

## Commands

| Command             | Action                                |
| ------------------- | ------------------------------------- |
| `pnpm dev`          | Start dev server at `localhost:4321`  |
| `pnpm build`        | Build production site to `./dist/`    |
| `pnpm preview`      | Preview the production build          |
| `pnpm typecheck`    | Run `astro check`                     |
| `pnpm lint`         | Lint `src/` with ESLint               |
| `pnpm format`       | Format `src/` with Prettier           |
| `pnpm desktop:pack` | Build the desktop app to `./release/` |

## License

This project is licensed under the [MIT](LICENSE) License.
