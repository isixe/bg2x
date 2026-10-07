<p align="center">
  <img src="public/favicon.png" alt="bg2x" width="200px">
</p>

<h2 align="center">bg2x</h2>

<p align="center">一款完全在浏览器中运行的免费、注重隐私的 AI 图像超分辨率（放大）工具。</p>

<p align="center">
  <a href="https://bg2x.itea.dev/">在线体验</a> ·
  <a href="#安装">安装</a> ·
  <a href="#桌面端">桌面端</a> ·
  <a href="https://github.com/isixe/bg2x">GitHub</a>
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

## 特性

- **AI 超分辨率** —— 使用 Real-ESRGAN、Swin2SR 和 Real-CUGAN 模型，最高可放大 4 倍。
- **隐私保护** —— 通过 Web Worker 中的 ONNX Runtime Web 进行 100% 客户端推理。无后端，不上传。
- **多种 AI 模型** —— 10 个专用模型，覆盖照片、动漫、插画和压缩图片。
- **GPU 加速** —— 在支持时使用 WebGPU 运行，并可自动回退到 WASM。
- **多种导出格式** —— 可导出为 PNG、JPG 或 WebP，并支持将整批结果打包为 ZIP 下载。
- **拖拽支持** —— 通过拖拽或文件选择器添加图片。
- **批处理** —— 将多张图片加入队列，依次处理。
- **离线友好的模型缓存** —— 模型在首次下载后缓存到 IndexedDB。
- **三语界面** —— 支持英文、中文和日文，并提供明暗主题。
- **桌面端应用** —— 提供 Windows、macOS 和 Linux 的原生 Electron 构建。

## 技术栈

| 类别     | 技术                             |
| -------- | -------------------------------- |
| 框架     | Astro 5 + Vue 3                  |
| 语言     | TypeScript                       |
| 样式     | Tailwind CSS v4                  |
| 状态管理 | Pinia                            |
| 路由     | Vue Router                       |
| 国际化   | Vue I18n                         |
| AI / ML  | ONNX Runtime Web (WASM / WebGPU) |
| UI 组件  | shadcn-vue + Reka UI + Lucide    |

## 可用模型

模型按需从 Hugging Face 下载，并缓存到本地 IndexedDB。当主源不可达时，会使用 ModelScope 镜像作为回退。

| 模型                           | 倍率 | 大小   | 适用场景                                       |
| ------------------------------ | ---- | ------ | ---------------------------------------------- |
| Real-ESRGAN AnimeVideo v3      | 4x   | ~2.5MB | 速度最快；适合动漫与视频帧、干净的线稿         |
| Real-ESRGAN General x4v3       | 4x   | ~4.9MB | 紧凑的通用 4x；均衡的日常默认选择              |
| Real-ESRGAN x4plus             | 4x   | ~67MB  | 高质量通用 4x；擅长真实照片与纹理（较慢）      |
| Real-ESRGAN x4plus Anime       | 4x   | ~18MB  | 6 层动漫模型；适合插画，保留干净边缘与平色     |
| Real-ESRGAN x4plus Anime 4B32F | 4x   | ~5.2MB | 超小 4 层动漫模型；快速轻量                    |
| Swin2SR Lightweight x2         | 2x   | ~8.1MB | 轻量级 Swin2SR 2x 放大                         |
| Swin2SR Classical x4           | 4x   | ~55MB  | 面向经典退化；干净图像高保真                   |
| Swin2SR RealWorld x4           | 4x   | ~53MB  | 面向真实世界 / BSRGAN 退化；适合噪点或压缩照片 |
| Swin2SR Compressed x4          | 4x   | ~55MB  | 面向高度压缩的 JPEG；抑制块效应                |
| Real-CUGAN 2x (HFA2k)          | 2x   | ~5.2MB | 动漫向 2x；线条保留与降噪能力强                |

## 安装

### 克隆仓库

```bash
git clone https://github.com/isixe/bg2x.git
cd bg2x
```

### 安装依赖

```bash
pnpm install
```

> 本仓库同时包含 `package-lock.json` 和 `pnpm-lock.yaml`。请与团队使用相同的包管理器，不要混用。

### 启动开发服务器

```bash
pnpm dev
```

应用将运行在 `http://localhost:4321`。

## 构建生产版本

```bash
pnpm build
```

生产构建输出到 `./dist/`。

> **部署提示：** WASM 后端使用 `SharedArrayBuffer` 实现多线程，这要求跨源隔离。你的服务器必须发送以下响应头：
>
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```
>
> 开发环境下这些响应头已在 `astro.config.mjs` 中配置。请确保你的生产环境也发送它们，否则多线程推理会回退为单线程。

## 桌面端

桌面端提供 Windows、macOS 和 Linux 的 Electron 构建（含 Debian `.deb` 安装包）。它内置了完全相同的客户端推理流程，并通过自定义的 `app://` 协议提供构建后的站点，同时注入上述跨源隔离响应头，因此多线程 WASM 依然可用。

你可以从应用内的**桌面端**页面（顶栏的显示器图标）下载最新版本——该页面会自动识别你的操作系统并直接链接到对应的安装包，也可以前往 [Releases 页面](https://github.com/isixe/bg2x/releases) 浏览所有发布资源。

在本地构建桌面端：

```bash
pnpm desktop:pack
```

安装包会输出到 `./release/`。推送与 `package.json` 版本一致的 tag（例如 `v0.1.0`）会触发 `.github/workflows/release.yml`，自动构建所有平台并发布到 GitHub Release。也可以使用 `pnpm desktop:publish` 在本地构建并上传。

## 项目结构

```
bg2x/
├── public/                  # 静态资源
├── electron/                # Electron 主进程
├── src/
│   ├── components/          # Vue 组件（视图、面板、UI）
│   │   └── ui/              # shadcn-vue 基础组件
│   ├── composables/         # 模型注册、缓存、下载、处理队列
│   ├── config/              # 应用元信息、模型、相关项目
│   ├── layouts/             # Astro 布局
│   ├── locales/             # i18n 文案（en、zh、ja）与配置
│   ├── pages/               # Astro 入口
│   ├── router/              # Vue Router 配置
│   ├── store/               # Pinia 状态
│   ├── styles/              # 全局样式与 Tailwind v4 主题
│   ├── type/                # 共享 TypeScript 类型
│   └── workers/             # ONNX Runtime Web 推理 Worker
├── astro.config.mjs         # Astro 配置
├── electron-builder.yml     # 桌面端打包配置
├── eslint.config.mjs        # ESLint flat 配置
├── tsconfig.json            # TypeScript 配置
└── package.json             # 依赖与脚本
```

## 支持的图片格式

- **输入：** JPG / JPEG、PNG、WebP（任何浏览器可解码的格式）
- **输出：** PNG、JPG、WebP

## 命令

| 命令                | 说明                               |
| ------------------- | ---------------------------------- |
| `pnpm dev`          | 在 `localhost:4321` 启动开发服务器 |
| `pnpm build`        | 构建生产站点到 `./dist/`           |
| `pnpm preview`      | 预览生产构建                       |
| `pnpm typecheck`    | 运行 `astro check`                 |
| `pnpm lint`         | 使用 ESLint 检查 `src/`            |
| `pnpm format`       | 使用 Prettier 格式化 `src/`        |
| `pnpm desktop:pack` | 构建桌面端应用到 `./release/`      |

## 许可证

本项目基于 [MIT](LICENSE) 许可证开源。
