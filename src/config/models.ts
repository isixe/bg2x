import type { ModelEntry } from '../type';

const HF_HOST = 'https://huggingface.co';
const ML_HOST = 'https://www.modelscope.cn/models';

// Only models with real ONNX weights are listed — the app runs inference through
// onnxruntime-web and cannot load TensorFlow.js or .pth files. Sizes are approximate.
// `url` is the single official source; `fallbackUrls` only carries non-official mirrors.
export const MODELS: ModelEntry[] = [
  {
    id: 'realesr-general-x4v3',
    name: 'Real-ESRGAN General x4v3',
    url: `${HF_HOST}/Heliosoph/realesrgan-onnx/resolve/main/realesr-general-x4v3.onnx`,
    fallbackUrls: [
      `${ML_HOST}/ctan0ctan0/realesrgan-onnx/resolve/master/realesr-general-x4v3.onnx?view=false`,
    ],
    scale: 4,
    descKey: 'modelDesc.generalX4v3',
    sizeMB: 4.9,
  },
  {
    id: 'real-esrgan-x4plus',
    name: 'Real-ESRGAN x4plus',
    url: `${HF_HOST}/SceneWorks/real-esrgan-onnx/resolve/main/real_esrgan_x4.onnx`,
    fallbackUrls: [
      `${ML_HOST}/starwhisper9/Real-ESRGAN-onnx/resolve/master/RealESRGAN_x4plus.onnx?view=false`,
    ],
    scale: 4,
    descKey: 'modelDesc.x4plus',
    sizeMB: 67,
  },
  {
    id: 'swin2sr-lightweight-x2',
    name: 'Swin2SR Lightweight x2',
    url: `${HF_HOST}/Xenova/swin2SR-lightweight-x2-64/resolve/main/onnx/model.onnx`,
    fallbackUrls: [
      `${ML_HOST}/Xenova/swin2SR-lightweight-x2-64/resolve/master/onnx/model.onnx?view=false`,
    ],
    scale: 2,
    descKey: 'modelDesc.swin2srLight',
    sizeMB: 8.1,
  },
  {
    id: 'swin2sr-classical-x4',
    name: 'Swin2SR Classical x4',
    url: `${HF_HOST}/Xenova/swin2SR-classical-sr-x4-64/resolve/main/onnx/model.onnx`,
    fallbackUrls: [
      `${ML_HOST}/Xenova/swin2SR-classical-sr-x4-64/resolve/master/onnx/model.onnx?view=false`,
    ],
    scale: 4,
    descKey: 'modelDesc.swin2srClassicalX4',
    sizeMB: 55,
  },
  {
    id: 'swin2sr-realworld-x4',
    name: 'Swin2SR RealWorld x4',
    url: `${HF_HOST}/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/main/onnx/model.onnx`,
    fallbackUrls: [
      `${ML_HOST}/Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr/resolve/master/onnx/model.onnx?view=false`,
    ],
    scale: 4,
    descKey: 'modelDesc.swin2srRealworldX4',
    sizeMB: 53,
  },
  {
    id: 'swin2sr-compressed-x4',
    name: 'Swin2SR Compressed x4',
    url: `${HF_HOST}/Xenova/swin2SR-compressed-sr-x4-48/resolve/main/onnx/model.onnx`,
    fallbackUrls: [
      `${ML_HOST}/Xenova/swin2SR-compressed-sr-x4-48/resolve/master/onnx/model.onnx?view=false`,
    ],
    scale: 4,
    descKey: 'modelDesc.swin2srCompressedX4',
    sizeMB: 55,
  },
  {
    id: 'real-cugan-2x',
    name: 'Real-CUGAN 2x (HFA2k)',
    url: `${HF_HOST}/nesaorg/2xHFA2kReal-CUGAN_fp32_opset17/resolve/main/2xHFA2kReal-CUGAN_fp32_opset17.onnx`,
    fallbackUrls: [
      `${ML_HOST}/nesaorg/2xHFA2kReal-CUGAN_fp32_opset17/resolve/master/2xHFA2kReal-CUGAN_fp32_opset17.onnx?view=false`,
    ],
    scale: 2,
    descKey: 'modelDesc.realcugan2x',
    sizeMB: 5.2,
  },
  {
    id: 'real-esrgan-animevideov3',
    name: 'Real-ESRGAN AnimeVideo v3',
    url: `${HF_HOST}/skillsafe-ai/realesr-animevideov3/resolve/main/model.onnx`,
    fallbackUrls: [
      `${ML_HOST}/Rokaa111/real-esrgan-animevideov3/resolve/master/model.onnx?view=false`,
    ],
    scale: 4,
    descKey: 'modelDesc.animevideov3',
    sizeMB: 2.5,
  },
  {
    id: 'real-esrgan-x4plus-anime',
    name: 'Real-ESRGAN x4plus Anime',
    url: `${HF_HOST}/deepghs/imgutils-models/resolve/main/real_esrgan/RealESRGAN_x4plus_anime_6B.onnx`,
    fallbackUrls: [
      `${ML_HOST}/Rokaa111/RealESRGAN_x4plus_anime_6B/resolve/master/RealESRGAN_x4plus_anime_6B.onnx?view=false`,
    ],
    scale: 4,
    descKey: 'modelDesc.x4plusAnime',
    sizeMB: 18,
  },
  {
    id: 'real-esrgan-x4plus-anime-4b32f',
    name: 'Real-ESRGAN x4plus Anime 4B32F',
    url: `${HF_HOST}/deepghs/imgutils-models/resolve/main/real_esrgan/RealESRGAN_x4plus_anime_4B32F.onnx`,
    fallbackUrls: [
      `${ML_HOST}/Rokaa111/real-esrgan-x4plus-anime-4b32f/resolve/master/RealESRGAN_x4plus_anime_4B32F.onnx?view=false`,
    ],
    scale: 4,
    descKey: 'modelDesc.anime4b',
    sizeMB: 5.2,
  },
];
