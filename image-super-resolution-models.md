# 图片超分辨率模型清单

> 仅收录成熟可用的模型，排除论文和不出名的新模型
> 生成日期: 2026-09-14

---

## 一、模型分类总览

| 系列 | 数量 | 主要用途 | 模型大小范围 |
|------|------|----------|--------------|
| Real-ESRGAN | 5个 | 通用/动漫 | 1.3-34 MB |
| Real-CUGAN | 8个 | 动漫/插画 | 2.6-2.9 MB |
| ESRGAN (UpscalerJS) | 8个 | 通用 | 1-12 MB |
| SwinIR | 3个 | 高质量修复 | 16.4-110 MB |
| 其他 | 3个 | 特殊场景 | 4.8-20 MB |

---

## 二、Real-ESRGAN 系列

基于 RRDB (Residual in Residual Dense Block) 架构，支持真实世界退化处理。

| 模型名称 | 参数量 | 模型大小 | 放大倍数 | 适用场景 |
|----------|--------|----------|----------|----------|
| RealESRGAN-animevideov3 | - | 1.3 MB | 4x | 动漫视频 |
| RealESRGAN-general-x4v3 | - | 2.5 MB | 4x | 通用快速 |
| realesr-general-x4v3 | - | ~5 MB | 4x | 通用推荐 |
| RealESRGAN_x4plus_anime_6B | 16.7M | 9.2 MB | 4x | 动漫图片 |
| RealESRGAN_x4plus | 16.7M | 34 MB | 4x | 通用高质量 |

**特点**: 真实世界退化建模，抗噪能力强，适合照片修复

---

## 三、Real-CUGAN 系列

专为动漫/插画优化的超分辨率模型，支持多种降噪级别。

| 模型名称 | 放大倍数 | 模型大小 | 降噪级别 |
|----------|----------|----------|----------|
| Real-CUGAN 2x-conservative | 2x | 2.6 MB | 保守 |
| Real-CUGAN 2x-denoise0x | 2x | 2.6 MB | 无降噪 |
| Real-CUGAN 2x-denoise1x | 2x | 2.6 MB | 轻度 |
| Real-CUGAN 2x-denoise2x | 2x | 2.6 MB | 中度 |
| Real-CUGAN 2x-denoise3x | 2x | 2.6 MB | 重度 |
| Real-CUGAN 4x-conservative | 4x | 2.9 MB | 保守 |
| Real-CUGAN 4x-denoise0x | 4x | 2.9 MB | 无降噪 |
| Real-CUGAN 4x-denoise3x | 4x | 2.9 MB | 重度 |

**特点**: 动漫线条保持好，模型小，适合二次元内容

---

## 四、ESRGAN UpscalerJS 系列

通过 UpscalerJS 库提供的预训练模型，基于 TensorFlow.js。

| 模型名称 | 放大倍数 | 模型大小 | 备注 |
|----------|----------|----------|------|
| esrgan-slim 2x | 2x | ~1 MB | 轻量快速 |
| esrgan-slim 3x | 3x | ~1 MB | 轻量快速 |
| esrgan-slim 4x | 4x | ~1 MB | 轻量快速 |
| esrgan-slim 8x | 8x | ~1 MB | 仅Node.js |
| esrgan-medium 2x | 2x | ~5 MB | 平衡选择 |
| esrgan-medium 4x | 4x | ~5 MB | 平衡选择 |
| esrgan-thick 2x | 2x | ~12 MB | 高质量 |
| esrgan-thick 4x | 4x | ~12 MB | 高质量 |

**特点**: 即插即用，前端友好，多种质量档位可选

---

## 五、SwinIR 系列

基于 Swin Transformer 架构，像素级保真度最高。

| 模型名称 | 参数量 | 模型大小 | 放大倍数 | PSNR (Set5) |
|----------|--------|----------|----------|-------------|
| SwinIR-S (Small) | 11.8M | 16.4 MB | 2x/4x | ~31.5 dB |
| SwinIR-M (Middle) | 11.8M | 56 MB | 2x/4x | ~32.5 dB |
| SwinIR-L (Large) | 11.8M | 110 MB | 4x | 32.92 dB |

**特点**: 像素级保真度最高，适合图像修复，但模型较大

---

## 六、其他模型

| 模型名称 | 模型大小 | 放大倍数 | 适用场景 |
|----------|----------|----------|----------|
| HFA2kShallowESRGAN | ~10 MB | 2x | 高保真动漫 |
| Swin2SR | ~20 MB | 2x | 通用 |
| ESRGAN_x4 (TF Hub) | 4.8 MB | 4x | 通用 |

---

## 七、2025-2026 SOTA 模型 (参考)

### 像素级保真度最强 (PSNR)

| 模型 | PSNR (Set5 x4) | 参数量 | 备注 |
|------|----------------|--------|------|
| HAT | 33.18 dB | 20.8M | 2024 SOTA |
| SwinIR-L | 32.92 dB | 11.8M | 经典 |
| MambaIRv2 | 32.85 dB | 12M | 2025新架构 |
| RCAN | 32.63 dB | 15.6M | 经典 |

### 感知质量最强

| 模型 | 特点 |
|------|------|
| Real-ESRGAN | RRDB + GAN，真实世界退化 |
| BSRGAN | 实用退化模型 |
| Real-CUGAN | 动漫优化 |
| FlowSR | 单步扩散模型 |

### 效率与质量平衡 (AIM 2025)

| 模型 | 参数量 | 特点 |
|------|--------|------|
| TinyESRGAN | <5M | 轻量级 |
| MDBN | 轻量 | PSNR +0.2dB |

---

## 八、可用 JS/TS 库

### 1. UpscalerJS

```bash
npm install upscaler
```

- **运行时**: TensorFlow.js
- **周下载**: 7,634
- **支持模型**: ESRGAN 系列
- **特点**: 前端友好，API 简洁

```typescript
import Upscaler from 'upscaler';
const upscaler = new Upscaler();
const result = await upscaler.upscale(image);
```

### 2. upscalejs

```bash
npm install upscalejs
```

- **运行时**: ONNX Runtime Web (WASM)
- **支持模型**: 6B, HFA2kShallowESRGAN, Swin2SR
- **特点**: Web Worker 多线程，ONNX 原生

```typescript
import { Upscaler } from "upscalejs";
const upscaler = new Upscaler({ model: "6B", workerCount: 3 });
const result = await upscaler.upscale(bitmap);
```

### 3. waifu2x-bin

```bash
npm install waifu2x
```

- **运行时**: Node.js 二进制
- **特点**: 经典 waifu2x 封装

### 4. web-realesrgan

- **GitHub**: 432 stars
- **运行时**: TensorFlow.js
- **特点**: 纯前端 Real-ESRGAN 实现

### 5. onnxruntime-web

```bash
npm install onnxruntime-web
```

- **运行时**: WASM + WebGL
- **特点**: 微软官方，可加载任意 ONNX 模型

---

## 九、模型下载链接

| 模型系列 | 下载地址 |
|----------|----------|
| Real-ESRGAN ONNX | https://huggingface.co/bukuroo/Real-ESRGAN-x4-ONNX |
| Real-CUGAN TF.js | https://huggingface.co/shammisw/real-cugan-tensorflowjs |
| SwinIR | https://github.com/JingyunLiang/SwinIR |
| UpscalerJS 模型 | https://github.com/thekevinscott/UpscalerJS |

---

## 十、选型建议

| 使用场景 | 推荐模型 | 模型大小 | 原因 |
|----------|----------|----------|------|
| 照片修复 | Real-ESRGAN_x4plus | 34 MB | 真实世界退化处理 |
| 动漫图片 | Real-CUGAN 4x | 2.9 MB | 动漫优化，模型小 |
| 动漫视频 | RealESRGAN-animevideov3 | 1.3 MB | 视频优化，极小 |
| 通用快速 | RealESRGAN-general-x4v3 | 2.5 MB | 速度快，效果好 |
| 高质量修复 | SwinIR-L | 110 MB | PSNR 最高 |
| 前端集成 | UpscalerJS + esrgan-slim | ~1 MB | 即插即用 |
| 浏览器端 | upscalejs + 6B | ~10 MB | WASM 高性能 |

---

## 十一、技术架构对比

| 架构 | 代表模型 | 优点 | 缺点 |
|------|----------|------|------|
| RRDB | Real-ESRGAN | 效果好，成熟 | 模型较大 |
| SwinIR | SwinIR-L | PSNR最高 | 模型巨大 |
| CUGAN | Real-CUGAN | 动漫专用 | 通用性差 |
| GAN | Real-ESRGAN | 感知质量好 | 训练不稳定 |
| Transformer | HAT, SwinIR | 全局建模 | 计算量大 |

---

*本文档持续更新，如有新模型或库可用，请补充。*
