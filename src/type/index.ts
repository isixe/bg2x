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

export interface HistoryRecord {
  id: string;
  timestamp: number;
  originalFileName: string;
  originalSize: { width: number; height: number };
  resultSize: { width: number; height: number };
  modelId: string;
  modelName: string;
  originalDataUrl: string;
  resultDataUrl: string;
  resultBlobUrl?: string;
}

export interface FetchModelBytesOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  timeoutMs?: number;
}

export interface CachedModel {
  url: string;
  data: ArrayBuffer;
  cachedAt: number;
}

export interface ModelState {
  cached: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  abortController: AbortController | null;
}

export interface PreviewItem {
  id: string;
  name: string;
  originalUrl: string;
  resultUrl: string | null;
  originalSize?: { width: number; height: number } | null;
  resultSize?: { width: number; height: number } | null;
}

export type ViewName = 'home' | 'upload' | 'history' | 'models';

export type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

export interface BatchItem {
  id: number;
  name: string;
  file: File;
  status: ItemStatus;
  originalUrl: string;
  resultUrl: string | null;
  originalSize: { width: number; height: number } | null;
  resultSize: { width: number; height: number } | null;
  error: string | null;
}

export type LoadModelMessage = {
  type: 'load-model';
  payload: { modelUrl: string; modelData?: ArrayBuffer; gpu?: boolean };
};

export type ProcessMessage = {
  type: 'process';
  payload: {
    imageData: ImageData;
    width: number;
    height: number;
    /** Native model scale (e.g. 4) — used for inference output sizing. */
    scale: number;
    /** User-selected output scale; worker resamples when it differs from `scale`. */
    targetScale?: number;
  };
};

export type WorkerMessage = LoadModelMessage | ProcessMessage;

export type WorkerResponse =
  | { type: 'progress'; payload: { progress: number; status: string } }
  | { type: 'model-loaded'; payload?: { modelUrl: string; gpu?: boolean } }
  | { type: 'complete'; payload: { resultUrl: string; size: { width: number; height: number } } }
  | { type: 'error'; payload: { message: string } };
