/**
 * Central concurrency budget for the inference worker pool.
 *
 * Every concurrent image owns its own Worker and InferenceSession, so each
 * extra slot costs a full model copy plus per-session WASM memory. The numbers
 * here are tuned to saturate throughput on an 8-core machine without letting
 * the pool oversubscribe the CPU or exhaust memory on large models.
 */

const FALLBACK_CORES = 4;

export function getHardwareConcurrency(): number {
  if (typeof navigator === 'undefined') return FALLBACK_CORES;
  const cores = navigator.hardwareConcurrency;
  return Number.isFinite(cores) && cores > 0 ? Math.max(1, Math.floor(cores)) : FALLBACK_CORES;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 4 workers saturate throughput on 8 logical cores; 6 is flat and 8 regresses.
 * Cap at 4 so the pool never spawns diminishing-return sessions.
 */
export const MAX_BATCH_CONCURRENCY = clamp(getHardwareConcurrency() - 1, 1, 4);

export const DEFAULT_BATCH_CONCURRENCY = clamp(
  getHardwareConcurrency() >= 8 ? 3 : getHardwareConcurrency() >= 4 ? 2 : 1,
  1,
  MAX_BATCH_CONCURRENCY,
);

/**
 * WebGPU queues work on a single device, so extra workers only raise per-image
 * latency without improving throughput. GPU mode always runs one image at a time.
 */
export const GPU_CONCURRENCY = 1;

export function clampBatchConcurrency(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BATCH_CONCURRENCY;
  return clamp(Math.round(value), 1, MAX_BATCH_CONCURRENCY);
}

/** Leave one core for the UI thread and the worker's JS glue. */
export function getMaxSessionThreads(): number {
  return Math.max(1, getHardwareConcurrency() - 1);
}

/**
 * Multithreaded WASM needs SharedArrayBuffer, which the browser only exposes
 * under cross-origin isolation (COOP/COEP). Without it onnxruntime-web is
 * single-threaded, so the whole thread budget collapses to one per worker.
 */
export function isSharedMemoryAvailable(): boolean {
  return typeof SharedArrayBuffer !== 'undefined';
}

/**
 * Split the usable threads across the workers that run in parallel. A single
 * worker gets every available thread; N workers get an even floor share.
 */
export function getSessionThreads(concurrency: number): number {
  if (!isSharedMemoryAvailable()) return 1;
  const parallel = Math.max(1, Math.round(concurrency));
  const available = getMaxSessionThreads();
  if (parallel <= 1) return available;
  return clamp(Math.floor(available / parallel), 1, available);
}

const WORKER_MEMORY_BUDGET_MB = 2048;
const WORKER_MODEL_MULTIPLIER = 4;
const WORKER_BASE_MB = 160;

/**
 * Cap the pool by an approximate memory budget: each session holds the model
 * weights plus several times that in inference scratch buffers.
 */
export function getMaxWorkersForModelBytes(modelBytes: number): number {
  const modelMB = Math.max(0, modelBytes) / (1024 * 1024);
  const perWorkerMB = modelMB * WORKER_MODEL_MULTIPLIER + WORKER_BASE_MB;
  return clamp(Math.floor(WORKER_MEMORY_BUDGET_MB / perWorkerMB), 1, MAX_BATCH_CONCURRENCY);
}

export function getBatchConcurrencyOptions(): number[] {
  return Array.from({ length: MAX_BATCH_CONCURRENCY }, (_, index) => index + 1);
}

export const CONCURRENCY_OPTIONS = getBatchConcurrencyOptions();

export function getGpuConcurrencyOptions(): number[] {
  return [GPU_CONCURRENCY];
}
