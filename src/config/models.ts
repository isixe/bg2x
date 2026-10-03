import type { ModelEntry } from '../type';

const HF_HOST = 'https://huggingface.co';

function hf(repo: string, file: string): string {
  return `${HF_HOST}/${repo}/resolve/main/${file}`;
}

export const MODELS: ModelEntry[] = [
  {
    id: 'realesr-general-x4v3',
    name: 'Real-ESRGAN General x4v3',
    url: hf('Heliosoph/realesrgan-onnx', 'realesr-general-x4v3.onnx'),
    urls: [
      hf('Heliosoph/realesrgan-onnx', 'realesr-general-x4v3.onnx'),
      hf('CoderViking/realesr-general-x4v3-onnx', 'realesr-general-x4v3.onnx'),
    ],
    scale: 4,
    description: 'Fast general-purpose 4x upscaler (SRVGGNetCompact)',
    maxSize: 2048,
  },
  {
    id: 'real-esrgan-x4plus',
    name: 'Real-ESRGAN x4plus',
    url: hf('SceneWorks/real-esrgan-onnx', 'real_esrgan_x4.onnx'),
    urls: [
      hf('SceneWorks/real-esrgan-onnx', 'real_esrgan_x4.onnx'),
      hf('AXERA-TECH/Real-ESRGAN', 'onnx/realesrgan-x4.onnx'),
    ],
    scale: 4,
    description: 'General-purpose 4x upscaler for real-world images',
    maxSize: 2048,
  },
  {
    id: 'real-esrgan-x4plus-anime',
    name: 'Real-ESRGAN x4plus-anime',
    url: hf('deepghs/imgutils-models', 'real_esrgan/RealESRGAN_x4plus_anime_6B.onnx'),
    urls: [hf('deepghs/imgutils-models', 'real_esrgan/RealESRGAN_x4plus_anime_6B.onnx')],
    scale: 4,
    description: 'Anime-optimized 6-block model, faster inference',
    maxSize: 2048,
  },
];
