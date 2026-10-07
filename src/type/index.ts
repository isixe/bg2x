export interface ModelEntry {
  id: string;
  name: string;
  /** Primary download source — a single official source. */
  url: string;
  /**
   * Optional extra mirror URLs for the same model, tried in order after `url`
   * until one succeeds. Must not repeat `url`.
   */
  fallbackUrls?: string[];
  scale: number;
  descKey: string;
  sizeMB: number;
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
  /** True when full-resolution blobs are available in the history IndexedDB cache. */
  hasCache?: boolean;
}

export interface FetchModelBytesOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  timeoutMs?: number;
}

export interface CachedModel {
  /** `ModelEntry.id` — the cache key, independent of which source it was downloaded from. */
  id: string;
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
  payload: { modelId: string; modelData: ArrayBuffer; gpu?: boolean };
};

export type ProcessMessage = {
  type: 'process';
  payload: {
    jobId: number;
    imageData: ImageData;
    width: number;
    height: number;
    /** Native model scale (e.g. 4) — used for inference output sizing. */
    scale: number;
    /** User-selected output scale; worker resamples when it differs from `scale`. */
    targetScale?: number;
  };
};

export type AbortMessage = {
  type: 'abort';
};

export type WorkerMessage = LoadModelMessage | ProcessMessage | AbortMessage;

export type WorkerResponse =
  | {
      type: 'progress';
      payload: {
        progress: number;
        status: string;
        jobId?: number | null;
        /** Tiles completed so far / total — lets the main thread interpolate between reports at the real rate. */
        tile?: { done: number; total: number };
      };
    }
  | { type: 'model-loaded'; payload?: { modelId: string; gpu?: boolean } }
  | { type: 'gpu-fallback'; payload: { message: string } }
  | {
      type: 'complete';
      payload: {
        resultUrl: string;
        size: { width: number; height: number };
        jobId?: number | null;
      };
    }
  | { type: 'aborted'; payload: { message: string; jobId?: number | null } }
  | { type: 'error'; payload: { message: string; jobId?: number | null } };
