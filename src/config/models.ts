import type { ModelEntry } from '../type';

const HF_HOST = 'https://huggingface.co';

function hf(repo: string, file: string): string {
  return `${HF_HOST}/${repo}/resolve/main/${file}`;
}

const ML_HOST = 'https://www.modelscope.cn/models';

function ml(repo: string, file: string): string {
  return `${ML_HOST}/${repo}/resolve/master/${file}?view=false`;
}

// Only models with real ONNX weights are listed — the app runs inference through
// onnxruntime-web and cannot load TensorFlow.js or .pth files. Sizes are approximate.
// `url` is the single official source; `fallbackUrls` only carries non-official mirrors.
export const MODELS: ModelEntry[] = [
  {
    id: 'real-esrgan-animevideov3',
    name: 'Real-ESRGAN AnimeVideo v3',
    url: hf('skillsafe-ai/realesr-animevideov3', 'model.onnx'),
    scale: 4,
    descKey: 'modelDesc.animevideov3',
    sizeMB: 2.5,
    maxSize: 2048,
  },
  {
    id: 'realesr-general-x4v3',
    name: 'Real-ESRGAN General x4v3',
    url: hf('Heliosoph/realesrgan-onnx', 'realesr-general-x4v3.onnx'),
    scale: 4,
    descKey: 'modelDesc.generalX4v3',
    sizeMB: 4.9,
    maxSize: 2048,
  },
  {
    id: 'real-esrgan-x4plus',
    name: 'Real-ESRGAN x4plus',
    url: hf('SceneWorks/real-esrgan-onnx', 'real_esrgan_x4.onnx'),
    fallbackUrls: [ml('starwhisper9/Real-ESRGAN-onnx', 'RealESRGAN_x4plus.onnx')],
    scale: 4,
    descKey: 'modelDesc.x4plus',
    sizeMB: 67,
    maxSize: 2048,
  },
  {
    id: 'real-esrgan-x4plus-anime',
    name: 'Real-ESRGAN x4plus Anime',
    url: hf('deepghs/imgutils-models', 'real_esrgan/RealESRGAN_x4plus_anime_6B.onnx'),
    scale: 4,
    descKey: 'modelDesc.x4plusAnime',
    sizeMB: 18,
    maxSize: 2048,
  },
  {
    id: 'real-esrgan-x4plus-anime-4b32f',
    name: 'Real-ESRGAN x4plus Anime 4B32F',
    url: hf('deepghs/imgutils-models', 'real_esrgan/RealESRGAN_x4plus_anime_4B32F.onnx'),
    scale: 4,
    descKey: 'modelDesc.anime4b',
    sizeMB: 5.2,
    maxSize: 2048,
  },
  {
    id: 'swinir-m-x4',
    name: 'SwinIR-M x4',
    url: hf('rocca/swin-ir-onnx', '003_realSR_BSRGAN_DFO_s64w8_SwinIR-M_x4_GAN.onnx'),
    scale: 4,
    descKey: 'modelDesc.swinirM',
    sizeMB: 61,
    maxSize: 2048,
  },
  {
    id: 'swinir-l-x4',
    name: 'SwinIR-L x4',
    url: hf('Heliosoph/swinir-onnx', 'swinir_realsr_x4.onnx'),
    scale: 4,
    descKey: 'modelDesc.swinirL',
    sizeMB: 122,
    maxSize: 2048,
  },
  {
    id: 'swin2sr-lightweight-x2',
    name: 'Swin2SR Lightweight x2',
    url: hf('Xenova/swin2SR-lightweight-x2-64', 'onnx/model.onnx'),
    scale: 2,
    descKey: 'modelDesc.swin2srLight',
    sizeMB: 8.1,
    maxSize: 2048,
  },
  {
    id: 'swin2sr-classical-x4',
    name: 'Swin2SR Classical x4',
    url: hf('Xenova/swin2SR-classical-sr-x4-64', 'onnx/model.onnx'),
    scale: 4,
    descKey: 'modelDesc.swin2srClassicalX4',
    sizeMB: 55,
    maxSize: 2048,
  },
  {
    id: 'swin2sr-realworld-x4',
    name: 'Swin2SR RealWorld x4',
    url: hf('Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr', 'onnx/model.onnx'),
    scale: 4,
    descKey: 'modelDesc.swin2srRealworldX4',
    sizeMB: 53,
    maxSize: 2048,
  },
  {
    id: 'swin2sr-compressed-x4',
    name: 'Swin2SR Compressed x4',
    url: hf('Xenova/swin2SR-compressed-sr-x4-48', 'onnx/model.onnx'),
    scale: 4,
    descKey: 'modelDesc.swin2srCompressedX4',
    sizeMB: 55,
    maxSize: 2048,
  },
  {
    id: 'real-cugan-2x',
    name: 'Real-CUGAN 2x (HFA2k)',
    url: hf('nesaorg/2xHFA2kReal-CUGAN_fp32_opset17', '2xHFA2kReal-CUGAN_fp32_opset17.onnx'),
    scale: 2,
    descKey: 'modelDesc.realcugan2x',
    sizeMB: 5.2,
    maxSize: 2048,
  },
  {
    id: 'esrgan-x4',
    name: 'ESRGAN x4',
    url: hf('Subeesesh/esrgan-onnx', 'esrgan.onnx'),
    scale: 4,
    descKey: 'modelDesc.esrganX4',
    sizeMB: 67,
    maxSize: 2048,
  },
];
