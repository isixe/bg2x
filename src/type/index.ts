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

export type PreviewBackground = 'mask' | 'black' | 'white' | 'custom' | 'image';

export type PreviewBackgroundPosition = 'top' | 'bottom' | 'left' | 'right';

export type KeyboardMode = 'arrows' | 'wasd';

export type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

export interface BatchInput {
  file: File;
  relativePath: string | null;
}

export interface BatchItem {
  id: number;
  name: string;
  file: File;
  relativePath: string | null;
  status: ItemStatus;
  originalUrl: string;
  /** 256px preview blob URL; null until the thumbnail has been generated. */
  thumbnailUrl: string | null;
  /** Byte snapshot taken at import so the item survives the source file being deleted. */
  sourceBlob: Blob | null;
  resultUrl: string | null;
  originalSize: { width: number; height: number } | null;
  resultSize: { width: number; height: number } | null;
  error: string | null;
  /** 0–100 inference progress; only meaningful while status is 'processing'. */
  progress: number;
  /** Epoch ms when this item started processing; null when not running. */
  startedAt: number | null;
  /** Total processing time in ms, set once the item settles (done or error). */
  durationMs: number | null;
  /** Fatal-failure retries consumed; drives the pool's retry budget. */
  attempts: number;
}

export type LoadModelMessage = {
  type: 'load-model';
  /**
   * `modelData` is omitted when the bytes were broadcast ahead of time via a
   * `provide-model` SharedArrayBuffer; the worker then reads its shared copy.
   */
  payload: {
    modelId: string;
    modelData?: ArrayBuffer;
    gpu?: boolean;
    numThreads?: number;
    /** Run one dummy tile so kernels and arenas are ready before real work. */
    warmup?: boolean;
  };
};

/**
 * Hand every worker one shared copy of a model's bytes instead of structured-
 * cloning a private ArrayBuffer per worker. `SharedArrayBuffer` is passed by
 * reference, so N workers share a single allocation.
 */
export type ProvideModelMessage = {
  type: 'provide-model';
  payload: { modelId: string; buffer: SharedArrayBuffer };
};

/** Share the ORT WASM binary across workers so it is fetched from the network once. */
export type ProvideWasmMessage = {
  type: 'provide-wasm';
  payload: { buffer: SharedArrayBuffer };
};

export type ProcessMessage = {
  type: 'process';
  payload: {
    jobId: number;
    imageData: ImageData;
    /**
     * Single-channel alpha at the source resolution, present only when the image
     * is not fully opaque. The network only sees RGB, so the original alpha is
     * carried alongside it and re-applied to the stitched output.
     */
    alpha?: Uint8ClampedArray;
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

/**
 * Re-tune the worker's WASM thread count (and GPU intent) without re-sending the
 * model. ORT only reads `numThreads` when a session is built, so the worker
 * defers the rebuild to the next task boundary.
 */
export type ConfigureWorkerMessage = {
  type: 'configure-worker';
  payload: { numThreads: number; gpu?: boolean };
};

export type WorkerMessage =
  | LoadModelMessage
  | ProcessMessage
  | AbortMessage
  | ConfigureWorkerMessage
  | ProvideModelMessage
  | ProvideWasmMessage;

/** Coarse model-load steps; `InferenceSession.create()` reports no real progress. */
export type ModelLoadStage = 'session' | 'fallback';

export type WorkerResponse =
  | {
      type: 'progress';
      payload: {
        progress: number;
        status: string;
        jobId?: number | null;
        /** Tiles completed so far / total — lets the main thread interpolate between reports at the real rate. */
        tile?: { done: number; total: number };
        /** Present only while loading a model, not during inference. */
        stage?: ModelLoadStage;
      };
    }
  | { type: 'model-loaded'; payload?: { modelId: string; gpu?: boolean } }
  | { type: 'gpu-fallback'; payload: { message: string } }
  /** Emitted when GPU is unavailable at session-build time, so the pool can drop to CPU mode. */
  | { type: 'gpu-status'; payload: { active: boolean; reason?: string } }
  | {
      type: 'complete';
      payload: {
        resultUrl: string;
        size: { width: number; height: number };
        jobId?: number | null;
      };
    }
  | { type: 'aborted'; payload: { message: string; jobId?: number | null } }
  | {
      type: 'error';
      payload: {
        message: string;
        jobId?: number | null;
        /** Worker likely corrupted (OOM/abort) — the pool rebuilds it and retries. */ fatal?: boolean;
      };
    };
