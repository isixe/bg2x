export interface ModelEntry {
  id: string;
  name: string;
  /** Primary URL — also used as the IndexedDB cache key. Must equal urls[0]. */
  url: string;
  /**
   * Ordered fallback candidates for the same model. Downloads try each URL in
   * sequence until one succeeds. Only official huggingface.co links are used.
   */
  urls: string[];
  scale: number;
  description: string;
  maxSize?: number;
}

function hf(repo: string, file: string): string {
  return `https://huggingface.co/${repo}/resolve/main/${file}`;
}

export const MODEL_REGISTRY: ModelEntry[] = [
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
    urls: [
      hf('deepghs/imgutils-models', 'real_esrgan/RealESRGAN_x4plus_anime_6B.onnx'),
    ],
    scale: 4,
    description: 'Anime-optimized 6-block model, faster inference',
    maxSize: 2048,
  },
];

export function getModelById(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

const DEFAULT_MODEL_KEY = 'super-resolution-default-model';

export function getDefaultModel(): ModelEntry {
  if (typeof window === 'undefined') return MODEL_REGISTRY[0];
  try {
    const saved = localStorage.getItem(DEFAULT_MODEL_KEY);
    if (saved) {
      const found = MODEL_REGISTRY.find((m) => m.id === saved);
      if (found) return found;
    }
  } catch {}
  return MODEL_REGISTRY[0];
}

export function setDefaultModel(id: string): void {
  try {
    localStorage.setItem(DEFAULT_MODEL_KEY, id);
  } catch {}
}