import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  BatchInput,
  BatchItem,
  ModelEntry,
  ModelLoadStage,
  WorkerMessage,
  WorkerResponse,
} from '../type';
import { getCachedModel, isModelCached } from './useModelCache';
import { getModelById } from './useModelRegistry';
import { downloadModel } from './useModelDownloads';
import { useSettingsStore } from '../store/stores';
import {
  GPU_CONCURRENCY,
  clampBatchConcurrency,
  getMaxWorkersForModelBytes,
  getSessionThreads,
  isSharedMemoryAvailable,
} from '../config/concurrency';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';
import {
  createRememberedImageUrl,
  persistImageBlob,
  releaseImageUrl,
  snapshotImageBlob,
} from '../utils/imageStore';
import { createThumbnailBlob } from '../utils/thumbnail';

export type DownloadFormat = 'png' | 'jpeg' | 'webp';

export interface ResultReadyPayload {
  file: File;
  sourceBlob: Blob;
  originalUrl: string;
  originalSize: { width: number; height: number };
  resultSize: { width: number; height: number };
  resultUrl: string;
}

export interface UseProcessingQueueOptions {
  model: ComputedRef<ModelEntry>;
  /** user-selected output scale (1x/2x/4x); worker resamples when != model native scale */
  targetScale: Ref<number>;
  gpu: Ref<boolean>;
  /** called once per completed item — the caller uses it to record history */
  onResultReady?: (payload: ResultReadyPayload) => void;
}

interface ProcessingState {
  isProcessing: boolean;
  isModelLoaded: boolean;
  isLoadingModel: boolean;
  progress: number;
  status: string;
  error: string | null;
  items: BatchItem[];
}

/**
 * One pooled worker and the single item it is currently processing. Inference is
 * not re-entrant within a worker, so each slot owns exactly one in-flight item
 * and the pool provides the concurrency.
 */
interface WorkerSlot {
  worker: Worker;
  item: BatchItem | null;
  jobId: number | null;
  resolve: (() => void) | null;
  loadedModelId: string | null;
  loadedGpuWanted: boolean | null;
  pendingGpuWanted: boolean | null;
  inflightLoad: Promise<boolean> | null;
  stallTimer: ReturnType<typeof setTimeout> | null;
  rawProgress: number;
  displayProgress: number;
  lastReportAt: number;
  lastReportInference: boolean;
  skipWarmupDelta: boolean;
  measuredTileMs: number | null;
  tileTotal: number | null;
  smoothTimer: ReturnType<typeof setInterval> | null;
  retiring: boolean;
}

export function useProcessingQueue(options: UseProcessingQueueOptions) {
  const { t } = useI18n();
  const settings = useSettingsStore();

  const state = ref<ProcessingState>({
    isProcessing: false,
    isModelLoaded: false,
    isLoadingModel: false,
    progress: 0,
    status: 'Ready',
    error: null,
    items: [],
  });

  const activeId = ref<number | null>(null);
  const previewId = ref<number | null>(null);
  const previewItem = computed<BatchItem | null>(
    () => state.value.items.find((item) => item.id === previewId.value) ?? null,
  );

  const selectedIds = ref<number[]>([]);
  const rangeAnchorId = ref<number | null>(null);
  const selectedItems = computed(() =>
    state.value.items.filter((item) => selectedIds.value.includes(item.id)),
  );
  const isSelectable = (item: BatchItem) => item.status === 'done' || item.status === 'error';
  const selectableCount = computed(() => state.value.items.filter(isSelectable).length);
  const selectedCount = computed(() => selectedIds.value.length);
  const allSelected = computed(
    () =>
      state.value.items.some(isSelectable) &&
      state.value.items.every((i) => !isSelectable(i) || selectedIds.value.includes(i.id)),
  );

  const hasReprocessable = computed(() =>
    state.value.items.some((i) => i.status === 'done' || i.status === 'error'),
  );
  const hasDownloadable = computed(() => state.value.items.some((i) => i.status === 'done'));

  // batch-wide progress: settled items count fully, each running item contributes
  // its own fraction so several concurrent inferences sum up correctly
  const overallProgress = computed(() => {
    const items = state.value.items;
    if (items.length === 0) return 0;
    let sum = 0;
    for (const item of items) {
      if (item.status === 'done' || item.status === 'error') sum += 1;
      else if (item.status === 'processing') sum += item.progress / 100;
    }
    return Math.round((sum / items.length) * 100);
  });

  const gpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const gpuFallback = ref(false);

  const modelPhase = ref<'downloading' | 'loading' | null>(null);
  const modelLoadStage = ref<ModelLoadStage | null>(null);

  function resetModelLoad() {
    modelLoadStage.value = null;
  }

  /** copy button feedback: flip to a check icon immediately on click, then revert after a short while */
  const copiedId = ref<number | null>(null);
  const batchCopied = ref(false);
  const COPIED_DURATION = 2000;
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;
  let batchCopiedTimer: ReturnType<typeof setTimeout> | null = null;

  function flashCopied(id: number) {
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedId.value = id;
    copiedTimer = setTimeout(() => {
      copiedId.value = null;
      copiedTimer = null;
    }, COPIED_DURATION);
  }

  function flashBatchCopied() {
    if (batchCopiedTimer) clearTimeout(batchCopiedTimer);
    batchCopied.value = true;
    batchCopiedTimer = setTimeout(() => {
      batchCopied.value = false;
      batchCopiedTimer = null;
    }, COPIED_DURATION);
  }

  function resetCopied() {
    if (copiedTimer) {
      clearTimeout(copiedTimer);
      copiedTimer = null;
    }
    if (batchCopiedTimer) {
      clearTimeout(batchCopiedTimer);
      batchCopiedTimer = null;
    }
    copiedId.value = null;
    batchCopied.value = false;
  }

  // Last known model size, used to keep several full sessions inside a sane
  // memory budget. Starts from the registry estimate so the pool is sized
  // correctly before the first download completes.
  const currentModelBytes = ref(options.model.value.sizeMB * 1024 * 1024);

  const effectiveConcurrency = computed(() => {
    if (options.gpu.value) return GPU_CONCURRENCY;
    return Math.max(
      1,
      Math.min(
        clampBatchConcurrency(settings.concurrency),
        getMaxWorkersForModelBytes(currentModelBytes.value),
      ),
    );
  });

  let pendingPoolRebuild = false;
  let wakeRunners: (() => void) | null = null;
  let configuredThreads = 0;

  let slots: WorkerSlot[] = [];
  let itemIdSeq = 0;
  let jobIdSeq = 0;
  let queueRunning = false;
  let batchAborted = false;
  let userCancelled = false;
  let disposed = false;
  const STALL_TIMEOUT_MS = 10 * 60_000;

  // A backend corruption (OOM, wasm abort) leaves the worker unusable; rebuild it
  // and requeue the item, up to MAX_ATTEMPTS retries before failing it for good.
  const FATAL_PATTERN =
    /memory access out of bounds|cannot enlarge memory|out of memory|allocation failed|RangeError|Aborted|RuntimeError|Assertion failed|OOM/i;
  const MAX_ATTEMPTS = 2;

  // SharedArrayBuffer-backed model/WASM bytes, fetched once on the main thread and
  // broadcast by reference so the pool holds one allocation instead of N copies.
  const canShareMemory = isSharedMemoryAvailable();
  let wasmBuffer: SharedArrayBuffer | null = null;
  let wasmBufferRequest: Promise<void> | null = null;
  const modelBuffers = new Map<string, SharedArrayBuffer>();

  // The worker only reports at tile boundaries, so a naive bar freezes during a
  // long tile run (notably the first, which pays one-time init cost). Ground the
  // display in real data only: snap to each report, and between reports advance
  // at the measured per-tile rate, capped one tile's worth short of the next
  // report. With no baseline yet we hold honestly — the status text carries it.
  const SMOOTH_INTERVAL_MS = 100;
  const TILE_PROGRESS_SPAN = 70; // worker spreads tile reports across 10..80
  const INFERENCE_MIN = 10;
  const INFERENCE_MAX = 84; // below the real Postprocessing report (85)

  function createWorker(): Worker {
    return new Worker(new URL('../workers/super-resolution.worker.ts', import.meta.url), {
      type: 'module',
    });
  }

  /** Per-worker thread budget: split the cores across `workers`, one core left for the UI. */
  function workerThreads(workers: number): number {
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')) return 1;
    return getSessionThreads(workers);
  }

  /**
   * Push the per-worker thread budget to every idle-and-busy slot. ORT only reads
   * numThreads when a session is built, so the worker marks its session stale and
   * rebuilds lazily at the next task boundary.
   */
  function applyThreadConfig(workers: number) {
    const numThreads = workerThreads(workers);
    if (numThreads === configuredThreads) return;
    configuredThreads = numThreads;
    for (const slot of slots) {
      slot.worker.postMessage({
        type: 'configure-worker',
        payload: { numThreads, gpu: options.gpu.value },
      });
    }
  }

  /**
   * Grow or shrink the pool immediately. Extra workers finish their current item
   * before they are terminated, so a running batch is never disrupted.
   */
  function resizePool(target: number, reconfigure = true) {
    if (disposed || typeof Worker === 'undefined') return;
    const desired = Math.max(1, target);
    while (slots.length < desired) {
      slots.push(createSlot());
    }
    let live = slots.filter((slot) => !slot.retiring).length;
    for (let i = slots.length - 1; i >= 0 && live > desired; i--) {
      const slot = slots[i];
      if (slot.retiring) continue;
      live--;
      if (slot.item || slot.inflightLoad) {
        slot.retiring = true;
        continue;
      }
      retireSlot(slot);
    }
    if (reconfigure) applyThreadConfig(slots.length);
  }

  function retireSlot(slot: WorkerSlot) {
    const index = slots.indexOf(slot);
    if (index === -1) return;
    slot.retiring = true;
    clearSlotWatchdog(slot);
    stopSlotSmoothing(slot);
    slot.worker.terminate();
    slots.splice(index, 1);
  }

  function replaySharedBuffers(worker: Worker) {
    if (wasmBuffer) worker.postMessage({ type: 'provide-wasm', payload: { buffer: wasmBuffer } });
    for (const [modelId, buffer] of modelBuffers) {
      worker.postMessage({ type: 'provide-model', payload: { modelId, buffer } });
    }
  }

  function createSlot(): WorkerSlot {
    const worker = createWorker();
    replaySharedBuffers(worker);
    const slot: WorkerSlot = {
      worker,
      item: null,
      jobId: null,
      resolve: null,
      loadedModelId: null,
      loadedGpuWanted: null,
      pendingGpuWanted: null,
      inflightLoad: null,
      stallTimer: null,
      rawProgress: 0,
      displayProgress: 0,
      lastReportAt: 0,
      lastReportInference: false,
      skipWarmupDelta: false,
      measuredTileMs: null,
      tileTotal: null,
      smoothTimer: null,
      retiring: false,
    };
    attachSlotHandlers(slot);
    if (configuredThreads > 0) {
      worker.postMessage({
        type: 'configure-worker',
        payload: { numThreads: configuredThreads, gpu: options.gpu.value },
      });
    }
    return slot;
  }

  function attachSlotHandlers(slot: WorkerSlot) {
    slot.worker.onmessage = (e) => {
      const { type, payload } = e.data as WorkerResponse;

      switch (type) {
        case 'progress':
          if (payload.jobId != null && payload.jobId !== slot.jobId) break;
          noteProgressReport(slot, payload.progress, payload.tile);
          slot.rawProgress = payload.progress;
          stepProgressSmoothing(slot);
          if (payload.stage) modelLoadStage.value = payload.stage;
          state.value.status = payload.status;
          armSlotWatchdog(slot);
          break;

        case 'complete': {
          if (payload.jobId != null && payload.jobId !== slot.jobId) {
            URL.revokeObjectURL(payload.resultUrl);
            break;
          }
          clearSlotWatchdog(slot);
          setSlotProgress(slot, 100);
          state.value.status = 'Complete';
          const item = slot.item;
          if (item && item.status === 'processing') {
            stopItemTimer(item);
            item.status = 'done';
            item.progress = 100;
            item.resultUrl = payload.resultUrl;
            item.resultSize = payload.size;
            activeId.value = item.id;
            void persistResultBlob(payload.resultUrl);
            options.onResultReady?.({
              file: item.file,
              sourceBlob: item.sourceBlob ?? item.file,
              originalUrl: item.originalUrl,
              originalSize: item.originalSize!,
              resultSize: payload.size,
              resultUrl: payload.resultUrl,
            });
          }
          slot.item = null;
          slot.jobId = null;
          stopSlotSmoothing(slot);
          slot.resolve?.();
          slot.resolve = null;
          updateGlobalProgress();
          break;
        }

        case 'error': {
          if (payload.jobId != null && payload.jobId !== slot.jobId) break;
          clearSlotWatchdog(slot);
          state.value.isLoadingModel = false;
          const item = slot.item;
          const fatal = payload.fatal === true || FATAL_PATTERN.test(payload.message);

          // A fatal error means the worker itself is unusable: rebuild it and put
          // the item back on the queue so it runs again on a fresh session.
          if (fatal && item && item.attempts < MAX_ATTEMPTS) {
            item.attempts += 1;
            item.status = 'pending';
            item.progress = 0;
            item.startedAt = null;
            item.durationMs = null;
            item.error = null;
            slot.item = null;
            slot.jobId = null;
            stopSlotSmoothing(slot);
            slot.resolve?.();
            slot.resolve = null;
            restartSlot(slot);
            updateGlobalProgress();
            state.value.status = t('processing.retrying');
            break;
          }

          state.value.error = payload.message;
          state.value.status = 'Error';
          if (item) {
            stopItemTimer(item);
            item.status = 'error';
            item.error = payload.message;
            slot.item = null;
          }
          slot.jobId = null;
          stopSlotSmoothing(slot);
          slot.resolve?.();
          slot.resolve = null;
          updateGlobalProgress();
          break;
        }

        case 'aborted': {
          // a late ack for a job the queue already moved past: leave the new
          // job's watchdog and loading state alone
          if (payload.jobId != null && payload.jobId !== slot.jobId) break;
          clearSlotWatchdog(slot);
          state.value.isLoadingModel = false;
          const item = slot.item;
          if (item) {
            markItemCancelled(item);
            slot.item = null;
          }
          slot.jobId = null;
          stopSlotSmoothing(slot);
          slot.resolve?.();
          slot.resolve = null;
          updateGlobalProgress();
          break;
        }

        case 'model-loaded':
          state.value.isModelLoaded = true;
          state.value.isLoadingModel = false;
          modelPhase.value = null;
          resetModelLoad();
          state.value.status = 'Model loaded';
          slot.loadedModelId = payload?.modelId ?? options.model.value.id;
          slot.loadedGpuWanted = payload?.gpu ?? slot.pendingGpuWanted;
          slot.pendingGpuWanted = null;
          break;

        case 'gpu-fallback':
          gpuFallback.value = true;
          options.gpu.value = false;
          slot.loadedGpuWanted = false;
          state.value.status = t('processing.gpuFallback');
          break;

        case 'gpu-status':
          if (payload.active) {
            gpuFallback.value = false;
          } else {
            gpuFallback.value = true;
            options.gpu.value = false;
          }
          break;
      }
    };

    slot.worker.onerror = (e) => {
      handleSlotError(slot, e.message);
    };
  }

  function buildPool() {
    teardownPool();
    const count = effectiveConcurrency.value;
    configuredThreads = workerThreads(count);
    slots = Array.from({ length: count }, () => createSlot());
    state.value.isModelLoaded = false;
    state.value.isLoadingModel = false;
    modelPhase.value = null;
    resetModelLoad();
  }

  function teardownPool() {
    for (const slot of slots) {
      clearSlotWatchdog(slot);
      stopSlotSmoothing(slot);
      slot.worker.terminate();
    }
    slots = [];
    configuredThreads = 0;
  }

  function restartSlot(slot: WorkerSlot) {
    if (disposed) return;
    clearSlotWatchdog(slot);
    stopSlotSmoothing(slot);
    slot.worker.terminate();
    slot.loadedModelId = null;
    slot.loadedGpuWanted = null;
    slot.pendingGpuWanted = null;
    slot.jobId = null;
    slot.inflightLoad = null;
    slot.worker = createWorker();
    replaySharedBuffers(slot.worker);
    attachSlotHandlers(slot);
    if (configuredThreads > 0) {
      slot.worker.postMessage({
        type: 'configure-worker',
        payload: { numThreads: configuredThreads, gpu: options.gpu.value },
      });
    }
  }

  function clearSlotWatchdog(slot: WorkerSlot) {
    if (slot.stallTimer) {
      clearTimeout(slot.stallTimer);
      slot.stallTimer = null;
    }
  }

  function armSlotWatchdog(slot: WorkerSlot) {
    clearSlotWatchdog(slot);
    slot.stallTimer = setTimeout(() => onSlotStalled(slot), STALL_TIMEOUT_MS);
  }

  function startSlotSmoothing(slot: WorkerSlot) {
    if (slot.smoothTimer) return;
    slot.smoothTimer = setInterval(() => stepProgressSmoothing(slot), SMOOTH_INTERVAL_MS);
  }

  function stopSlotSmoothing(slot: WorkerSlot) {
    if (slot.smoothTimer) {
      clearInterval(slot.smoothTimer);
      slot.smoothTimer = null;
    }
    slot.rawProgress = 0;
    slot.lastReportAt = 0;
    slot.lastReportInference = false;
    slot.skipWarmupDelta = false;
    slot.tileTotal = null;
    // measuredTileMs is kept: later items reuse the warm baseline.
  }

  function resetSlotProgress(slot: WorkerSlot) {
    slot.rawProgress = 0;
    slot.displayProgress = 0;
    slot.lastReportAt = 0;
    slot.lastReportInference = false;
    slot.skipWarmupDelta = false;
    slot.tileTotal = null;
    // measuredTileMs is kept: later items in the same run reuse the warm baseline.
  }

  /** Highest per-item progress among running items, for the shared toolbar bar. */
  function updateGlobalProgress() {
    let max = 0;
    for (const item of state.value.items) {
      if (item.status === 'processing' && item.progress > max) max = item.progress;
    }
    if (state.value.progress !== max) state.value.progress = max;
  }

  function publishSlotProgress(slot: WorkerSlot) {
    const rounded = Math.round(slot.displayProgress);
    if (slot.item && slot.item.status === 'processing' && slot.item.progress !== rounded) {
      slot.item.progress = rounded;
    }
    updateGlobalProgress();
  }

  /** Record the worker's reported value; `complete` (100) snaps the bar to the end. */
  function setSlotProgress(slot: WorkerSlot, value: number) {
    slot.rawProgress = value;
    if (value >= 100) {
      slot.displayProgress = 100;
      if (slot.item) slot.item.progress = 100;
      updateGlobalProgress();
    }
  }

  /**
   * Track report arrival times so the gap between two tile reports can be
   * measured. The interval after the pre-tile-1 report includes one-time model
   * init, so it is skipped instead of poisoning the baseline.
   */
  function noteProgressReport(
    slot: WorkerSlot,
    progress: number,
    tile?: { done: number; total: number },
  ) {
    const now = performance.now();
    const inInference = progress >= INFERENCE_MIN && progress <= INFERENCE_MAX;
    if (inInference && slot.lastReportInference && slot.lastReportAt > 0 && !slot.skipWarmupDelta) {
      const delta = now - slot.lastReportAt;
      if (delta > 0) {
        slot.measuredTileMs =
          slot.measuredTileMs === null ? delta : slot.measuredTileMs * 0.3 + delta * 0.7;
      }
    }
    slot.skipWarmupDelta = inInference && (tile?.done ?? 1) === 0;
    if (tile) slot.tileTotal = tile.total;
    slot.lastReportAt = now;
    slot.lastReportInference = inInference;
  }

  /**
   * Display = latest real report, plus a bounded lead: between two tile reports
   * the bar advances at the measured per-tile rate but never more than one
   * tile's worth (so it cannot outrun the next anchor). Without a measured
   * baseline the bar holds; `complete` (100) snaps. Monotonic within an item —
   * transient lower reports never move the bar backwards.
   */
  function stepProgressSmoothing(slot: WorkerSlot) {
    if (slot.rawProgress >= 100) {
      slot.displayProgress = 100;
    } else if (slot.displayProgress < slot.rawProgress) {
      slot.displayProgress = slot.rawProgress;
    } else if (
      slot.measuredTileMs !== null &&
      slot.tileTotal !== null &&
      slot.lastReportAt > 0 &&
      slot.rawProgress >= INFERENCE_MIN &&
      slot.rawProgress <= INFERENCE_MAX
    ) {
      const gap = TILE_PROGRESS_SPAN / slot.tileTotal;
      const lead = Math.min(
        gap,
        gap * ((performance.now() - slot.lastReportAt) / slot.measuredTileMs),
      );
      const ceiling = Math.min(slot.rawProgress + lead, INFERENCE_MAX);
      if (slot.displayProgress < ceiling) {
        slot.displayProgress = ceiling;
      }
    }
    publishSlotProgress(slot);
  }

  /**
   * One worker stopped posting progress for longer than STALL_TIMEOUT_MS — most
   * likely a wedged GPU/WASM inference. Fail its in-flight item and rebuild just
   * that worker so the rest of the pool keeps going.
   */
  function onSlotStalled(slot: WorkerSlot) {
    clearSlotWatchdog(slot);
    const message = t('processing.stalled');
    state.value.error = message;
    state.value.status = 'Error';
    if (modelPhase.value === 'loading') modelPhase.value = null;
    resetModelLoad();
    const item = slot.item;
    if (item) {
      stopItemTimer(item);
      item.status = 'error';
      item.error = message;
      slot.item = null;
    }
    slot.jobId = null;
    stopSlotSmoothing(slot);
    slot.resolve?.();
    slot.resolve = null;
    updateGlobalProgress();
    restartSlot(slot);
  }

  function handleSlotError(slot: WorkerSlot, message: string) {
    clearSlotWatchdog(slot);
    state.value.error = message;
    state.value.status = 'Worker error';
    state.value.isLoadingModel = false;
    if (modelPhase.value === 'loading') modelPhase.value = null;
    resetModelLoad();
    const item = slot.item;
    if (item) {
      stopItemTimer(item);
      item.status = 'error';
      item.error = message;
      slot.item = null;
    }
    slot.jobId = null;
    stopSlotSmoothing(slot);
    slot.resolve?.();
    slot.resolve = null;
    updateGlobalProgress();
    restartSlot(slot);
  }

  function markItemCancelled(item: BatchItem) {
    stopItemTimer(item);
    item.status = 'error';
    item.error = t('processing.cancelled');
  }

  function stopItemTimer(item: BatchItem) {
    if (item.startedAt != null) {
      item.durationMs = Date.now() - item.startedAt;
      item.startedAt = null;
    }
  }

  /** Fail one item but keep the queue running (unlike cancelProcessing). */
  function cancelItem(id: number) {
    const item = state.value.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === 'pending') {
      markItemCancelled(item);
      return;
    }
    if (item.status !== 'processing') return;
    const slot = slots.find((s) => s.item?.id === id) ?? null;
    markItemCancelled(item);
    if (slot) {
      slot.item = null;
      slot.jobId = null;
      clearSlotWatchdog(slot);
      stopSlotSmoothing(slot);
      const resolve = slot.resolve;
      slot.resolve = null;
      resolve?.();
      // Terminate and rebuild the worker: a bare `abort` leaves the cancelled job
      // unwinding in the old worker, so a requeued item would wait behind it and
      // its late result could be mistaken for the new job's.
      restartSlot(slot);
    }
    updateGlobalProgress();
  }

  /** Cancel the whole batch: fail every unfinished item and stop the pool. */
  function cancelProcessing() {
    if (slots.length === 0) return;
    const hasActive = state.value.items.some(
      (i) => i.status === 'pending' || i.status === 'processing',
    );
    if (!hasActive) return;
    state.value.items.forEach((i) => {
      if (i.status === 'pending' || i.status === 'processing') markItemCancelled(i);
    });
    batchAborted = true;
    state.value.error = null;
    userCancelled = true;
    state.value.isProcessing = false;
    for (const slot of slots) {
      const hadItem = slot.item !== null;
      slot.item = null;
      slot.jobId = null;
      clearSlotWatchdog(slot);
      stopSlotSmoothing(slot);
      const resolve = slot.resolve;
      slot.resolve = null;
      resolve?.();
      // Rebuild any worker that had a job in flight so no stale job lingers in it.
      if (hadItem) restartSlot(slot);
    }
    updateGlobalProgress();
  }

  onMounted(() => {
    if (typeof Worker !== 'undefined') {
      buildPool();
      void preloadCachedModel();
    }

    window.addEventListener('keydown', onGlobalKeydown);
  });

  watch(previewId, (value) => {
    document.body.style.overflow = value !== null ? 'hidden' : '';
  });

  onUnmounted(() => {
    disposed = true;
    window.removeEventListener('keydown', onGlobalKeydown);
    document.body.style.overflow = '';
    resetCopied();
    teardownPool();
    releaseAllItemUrls();
  });

  // The pool is shaped by GPU mode, the requested CPU concurrency, and the
  // model's memory budget. A concurrency change applies immediately, even while a
  // batch runs: growth adds workers, shrink retires idle ones and lets busy ones
  // finish their current item first.
  function requestPoolRebuild() {
    if (disposed || typeof Worker === 'undefined') return;
    const target = effectiveConcurrency.value;
    if (state.value.isProcessing) {
      resizePool(target, target >= slots.length);
      wakeRunners?.();
      return;
    }
    if (slots.some((slot) => slot.inflightLoad)) {
      pendingPoolRebuild = true;
      return;
    }
    pendingPoolRebuild = false;
    resizePool(target);
    void preloadCachedModel();
  }

  function flushPendingPoolRebuild() {
    if (!pendingPoolRebuild) return;
    if (state.value.isProcessing || slots.some((slot) => slot.inflightLoad)) return;
    pendingPoolRebuild = false;
    resizePool(effectiveConcurrency.value);
    void preloadCachedModel();
  }

  watch(effectiveConcurrency, () => requestPoolRebuild());

  watch(
    () => settings.preloadWarmup,
    (enabled) => {
      if (enabled) void preloadCachedModel();
    },
  );

  function invalidateSlotModels() {
    if (state.value.isProcessing) return;
    state.value.isModelLoaded = false;
    for (const slot of slots) {
      slot.loadedModelId = null;
      slot.loadedGpuWanted = null;
    }
    if (!state.value.items.some((i) => i.status === 'processing')) {
      state.value.status = state.value.items.length > 0 ? 'Ready' : state.value.status;
    }
    void preloadCachedModel();
  }

  /**
   * Soft invalidation: changing model or gpu only forces a reload on the next
   * process — queued items are kept (unlike the old resetState wipe).
   */
  watch(
    () => options.model.value.id,
    () => {
      currentModelBytes.value = options.model.value.sizeMB * 1024 * 1024;
      invalidateSlotModels();
    },
  );

  watch(options.gpu, () => {
    if (options.gpu.value) gpuFallback.value = false;
    invalidateSlotModels();
  });

  function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && previewId.value !== null) {
      closePreview();
    }
  }

  function markRemainingFailed(message: string) {
    state.value.items.forEach((item) => {
      if (item.status === 'pending' || item.status === 'processing') {
        stopItemTimer(item);
        item.status = 'error';
        item.error = message;
      }
    });
    updateGlobalProgress();
  }

  function releaseAllItemUrls() {
    state.value.items.forEach((item) => {
      releaseImageUrl(item.originalUrl);
      releaseImageUrl(item.thumbnailUrl);
      releaseImageUrl(item.resultUrl);
    });
    state.value.items = [];
    selectedIds.value = [];
    activeId.value = null;
    previewId.value = null;
  }

  /** Reject instead of spinning forever if the worker never replies (deadlock safety net). */
  const MODEL_LOAD_TIMEOUT_MS = 60_000;

  function waitForSlotModelLoaded(
    slot: WorkerSlot,
    timeoutMs = MODEL_LOAD_TIMEOUT_MS,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const workerRef = slot.worker;
      const origOnMsg = workerRef.onmessage;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const restore = () => {
        if (timer) clearTimeout(timer);
        workerRef.onmessage = origOnMsg;
      };
      const checkMsg = (e: MessageEvent) => {
        if (e.data.type === 'model-loaded') {
          restore();
          origOnMsg?.call(workerRef, e);
          resolve();
        } else if (e.data.type === 'error') {
          restore();
          reject(new Error(e.data.payload?.message ?? 'Failed to load model'));
        } else {
          origOnMsg?.call(workerRef, e);
        }
      };
      workerRef.onmessage = checkMsg;
      timer = setTimeout(() => {
        restore();
        reject(new Error(`Model load timed out after ${Math.round(timeoutMs / 1000)}s`));
      }, timeoutMs);
    });
  }

  function slotModelReady(slot: WorkerSlot): boolean {
    return (
      slot.loadedModelId === options.model.value.id && slot.loadedGpuWanted === options.gpu.value
    );
  }

  function postToWorkers(message: WorkerMessage) {
    for (const slot of slots) slot.worker.postMessage(message);
  }

  /**
   * Fetch the ORT WASM binary once and broadcast it as a SharedArrayBuffer so every
   * worker compiles from one shared copy instead of fetching its own.
   */
  function ensureWasmBuffer(): Promise<void> {
    if (wasmBufferRequest) return wasmBufferRequest;
    wasmBufferRequest = (async () => {
      try {
        if (!canShareMemory || wasmBuffer) return;
        const res = await fetch(ortWasmUrl);
        if (!res.ok) return;
        const bytes = await res.arrayBuffer();
        if (disposed) return;
        const sab = new SharedArrayBuffer(bytes.byteLength);
        new Uint8Array(sab).set(new Uint8Array(bytes));
        wasmBuffer = sab;
        postToWorkers({ type: 'provide-wasm', payload: { buffer: sab } });
      } catch (err) {
        console.warn('[pool] WASM share failed:', err);
      }
    })();
    return wasmBufferRequest;
  }

  /**
   * Build (once per model) a shared copy of the model bytes and broadcast it, so the
   * pool holds a single allocation instead of one structured-cloned copy per worker.
   */
  function getOrCreateModelSab(modelId: string, modelData: ArrayBuffer): SharedArrayBuffer | null {
    if (!canShareMemory) return null;
    const existing = modelBuffers.get(modelId);
    if (existing) return existing;
    const sab = new SharedArrayBuffer(modelData.byteLength);
    new Uint8Array(sab).set(new Uint8Array(modelData));
    modelBuffers.set(modelId, sab);
    postToWorkers({ type: 'provide-model', payload: { modelId, buffer: sab } });
    return sab;
  }

  // The model bytes are fetched once; with SharedArrayBuffer available they are
  // broadcast shared, otherwise each slot gets its own structured-cloned copy.
  let inflightModelData: Promise<ArrayBuffer | null> | null = null;

  async function ensureModelData(): Promise<ArrayBuffer | null> {
    if (!inflightModelData) {
      inflightModelData = fetchModelData().finally(() => {
        inflightModelData = null;
      });
    }
    return inflightModelData;
  }

  async function fetchModelData(): Promise<ArrayBuffer | null> {
    try {
      const modelId = options.model.value.id;
      let modelData = await getCachedModel(modelId);
      if (!modelData) {
        const model = getModelById(modelId);
        if (!model) {
          throw new Error(`Unknown model: ${modelId}`);
        }
        state.value.status = 'Downloading model...';
        modelPhase.value = 'downloading';
        modelData = await downloadModel(model);
      }
      if (modelData) currentModelBytes.value = modelData.byteLength;
      return modelData;
    } catch (err) {
      modelPhase.value = null;
      resetModelLoad();
      state.value.isLoadingModel = false;
      if (err instanceof DOMException && err.name === 'AbortError') {
        state.value.status = 'Ready';
        return null;
      }
      state.value.error = err instanceof Error ? err.message : 'Failed to load model';
      state.value.status = 'Error';
      return null;
    }
  }

  function perWorkerThreads(): number {
    return configuredThreads > 0 ? configuredThreads : workerThreads(effectiveConcurrency.value);
  }

  async function ensureSlotModel(slot: WorkerSlot, warmup = false): Promise<boolean> {
    if (slotModelReady(slot)) return true;
    if (slot.inflightLoad) return slot.inflightLoad;

    slot.inflightLoad = doEnsureSlotModel(slot, warmup);
    try {
      return await slot.inflightLoad;
    } finally {
      slot.inflightLoad = null;
    }
  }

  async function doEnsureSlotModel(slot: WorkerSlot, warmup = false): Promise<boolean> {
    try {
      const modelId = options.model.value.id;
      const modelData = await ensureModelData();
      if (!modelData) return false;

      state.value.isLoadingModel = true;
      state.value.isModelLoaded = false;
      state.value.status = 'Loading model...';
      state.value.error = null;
      modelPhase.value = 'loading';
      modelLoadStage.value = null;
      slot.pendingGpuWanted = options.gpu.value;

      await ensureWasmBuffer();
      const sharedModel = getOrCreateModelSab(modelId, modelData);
      if (sharedModel) {
        // Provide the shared bytes first (FIFO), then load without re-cloning them.
        slot.worker.postMessage({
          type: 'provide-model',
          payload: { modelId, buffer: sharedModel },
        });
        slot.worker.postMessage({
          type: 'load-model',
          payload: { modelId, gpu: options.gpu.value, numThreads: perWorkerThreads(), warmup },
        });
      } else {
        slot.worker.postMessage({
          type: 'load-model',
          payload: {
            modelId,
            modelData,
            gpu: options.gpu.value,
            numThreads: perWorkerThreads(),
            warmup,
          },
        });
      }
      await waitForSlotModelLoaded(slot);
      return true;
    } catch (err) {
      modelPhase.value = null;
      resetModelLoad();
      state.value.isLoadingModel = false;
      if (err instanceof DOMException && err.name === 'AbortError') {
        state.value.status = 'Ready';
        return false;
      }
      state.value.error = err instanceof Error ? err.message : 'Failed to load model';
      state.value.status = 'Error';
      return false;
    }
  }

  /**
   * Warm every idle worker with the selected model once its bytes are cached, so a
   * batch starts on ready sessions instead of loading them one worker at a time.
   * Best-effort: a failure here is swallowed and retried on demand.
   */
  async function preloadCachedModel(): Promise<void> {
    if (disposed || state.value.isProcessing) return;
    if (slots.length === 0) return;

    try {
      if (await isModelCached(options.model.value.id)) {
        const pending = slots.filter((slot) => !slot.inflightLoad && !slotModelReady(slot));
        await Promise.all(pending.map((slot) => ensureSlotModel(slot, settings.preloadWarmup)));
      }
    } catch {
      /* best-effort preload */
    } finally {
      flushPendingPoolRebuild();
    }
  }

  async function processItemOnSlot(
    slot: WorkerSlot,
    item: BatchItem,
  ): Promise<'done' | 'error' | 'abort'> {
    if (disposed) return 'abort';

    // Reserve the item synchronously (before any await) so another slot's
    // scheduler loop cannot pick the same pending item.
    item.status = 'processing';
    item.progress = 0;
    item.startedAt = Date.now();
    item.durationMs = null;
    updateGlobalProgress();

    const modelOk = await ensureSlotModel(slot);
    if (!modelOk) {
      stopItemTimer(item);
      item.status = 'error';
      item.error = state.value.error ?? 'Failed to load model';
      updateGlobalProgress();
      return 'abort';
    }

    // the item may have been cancelled while the model was loading
    if (batchAborted || item.status !== 'processing') {
      return 'error';
    }

    const jobId = ++jobIdSeq;
    slot.jobId = jobId;
    slot.item = item;
    resetSlotProgress(slot);
    startSlotSmoothing(slot);
    state.value.isProcessing = true;
    state.value.status = 'Loading image...';
    state.value.error = null;

    let img: HTMLImageElement;
    try {
      await ensureItemSource(item);
      img = await loadImage(item.originalUrl);
      item.originalSize = { width: img.width, height: img.height };
    } catch (err) {
      stopItemTimer(item);
      item.status = 'error';
      item.error = err instanceof Error ? err.message : 'Failed to load image';
      state.value.status = 'Error';
      state.value.error = item.error;
      slot.item = null;
      slot.jobId = null;
      stopSlotSmoothing(slot);
      updateGlobalProgress();
      return 'error';
    }

    const { imageData, alpha } = prepareSourceImage(img);

    slot.worker.postMessage({
      type: 'process',
      payload: {
        jobId,
        imageData,
        alpha,
        width: img.width,
        height: img.height,
        scale: options.model.value.scale,
        targetScale: options.targetScale.value,
      },
    });

    await new Promise<void>((resolve) => {
      slot.resolve = resolve;
    });
    slot.resolve = null;

    // status is mutated by the worker callback — read it back fresh so TS
    // control-flow narrowing on the earlier `= 'processing'` assignment
    // does not flag the comparison as impossible
    const settled = state.value.items.find((i) => i.id === item.id);
    return settled?.status === 'done' ? 'done' : 'error';
  }

  function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
  }

  function prepareSourceImage(img: HTMLImageElement): {
    imageData: ImageData;
    alpha?: Uint8ClampedArray;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const data = imageData.data;
    const pixels = img.width * img.height;
    const alpha = new Uint8ClampedArray(pixels);

    let opaque = true;
    for (let i = 0, p = 3; i < pixels; i++, p += 4) {
      const a = data[p];
      alpha[i] = a;
      if (a !== 255) opaque = false;
    }

    if (opaque) return { imageData };

    bleedTransparentPixels(data, alpha, img.width, img.height);
    return { imageData, alpha };
  }

  /**
   * Canvas storage is premultiplied, so a fully transparent pixel always reads
   * back as pure black. Handing that to the network paints a black backdrop and
   * darkens the subject edges it blends into, so spread the nearest opaque colour
   * outwards first. A forward and a backward sweep reach most transparent regions.
   */
  function bleedTransparentPixels(
    data: Uint8ClampedArray,
    alpha: Uint8ClampedArray,
    width: number,
    height: number,
  ) {
    const resolved = new Uint8Array(width * height);
    for (let i = 0; i < alpha.length; i++) resolved[i] = alpha[i] === 0 ? 0 : 1;

    const copy = (dst: number, src: number) => {
      const d = dst * 4;
      const s = src * 4;
      data[d] = data[s];
      data[d + 1] = data[s + 1];
      data[d + 2] = data[s + 2];
      resolved[dst] = 1;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (resolved[i]) continue;
        if (x > 0 && resolved[i - 1]) copy(i, i - 1);
        else if (y > 0 && resolved[i - width]) copy(i, i - width);
      }
    }

    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const i = y * width + x;
        if (resolved[i]) continue;
        if (x + 1 < width && resolved[i + 1]) copy(i, i + 1);
        else if (y + 1 < height && resolved[i + width]) copy(i, i + width);
      }
    }
  }

  async function runQueue() {
    if (queueRunning || slots.length === 0) return;
    queueRunning = true;
    batchAborted = false;
    userCancelled = false;
    state.value.isProcessing = true;

    // Each slot drives its own loop over the pending items, so up to N items run
    // at once. Reserving an item marks it `processing` synchronously, so two
    // loops never grab the same item.
    const active = new Map<WorkerSlot, Promise<void>>();

    const runSlotLoop = async (slot: WorkerSlot) => {
      try {
        while (!batchAborted && !slot.retiring) {
          const item = state.value.items.find((i) => i.status === 'pending');
          if (!item) break;

          const result = await processItemOnSlot(slot, item);
          if (result === 'abort') {
            batchAborted = true;
            break;
          }
        }
      } finally {
        if (slot.retiring) retireSlot(slot);
      }
    };

    const hasPending = () => state.value.items.some((i) => i.status === 'pending');

    const ensureRunners = () => {
      if (!hasPending()) return;
      for (const slot of slots) {
        if (slot.retiring || active.has(slot)) continue;
        const job = runSlotLoop(slot).finally(() => {
          active.delete(slot);
          wakeRunners?.();
        });
        active.set(slot, job);
      }
    };

    ensureRunners();

    try {
      while (active.size > 0) {
        const wake = new Promise<void>((resolve) => {
          wakeRunners = resolve;
        });
        await Promise.race([...active.values(), wake]);
        wakeRunners = null;
        ensureRunners();
      }

      if (batchAborted) {
        markRemainingFailed(
          userCancelled ? t('processing.cancelled') : (state.value.error ?? 'Processing aborted'),
        );
      }
    } catch (err) {
      state.value.error = err instanceof Error ? err.message : 'Processing failed';
      state.value.status = 'Error';
      for (const slot of slots) {
        slot.item = null;
        slot.jobId = null;
        slot.resolve?.();
        slot.resolve = null;
      }
      markRemainingFailed(state.value.error);
    } finally {
      wakeRunners = null;
      state.value.isProcessing = false;
      queueRunning = false;
      flushPendingPoolRebuild();
    }
  }

  const itemSourceJobs = new WeakMap<BatchItem, Promise<Blob | null>>();

  function ensureItemSource(item: BatchItem): Promise<Blob | null> {
    if (item.sourceBlob) return Promise.resolve(item.sourceBlob);

    const inflight = itemSourceJobs.get(item);
    if (inflight) return inflight;

    const job = snapshotImageBlob(item.file)
      .then((snapshot) => {
        item.sourceBlob = snapshot;
        const previousUrl = item.originalUrl;
        item.originalUrl = createRememberedImageUrl(snapshot);
        releaseImageUrl(previousUrl);
        return snapshot;
      })
      .catch(() => null)
      .finally(() => {
        itemSourceJobs.delete(item);
      });

    itemSourceJobs.set(item, job);
    return job;
  }

  async function generateItemThumbnail(item: BatchItem): Promise<void> {
    const source = await ensureItemSource(item);
    if (!source || disposed) return;

    const thumbnail = await createThumbnailBlob(source);
    if (!thumbnail || disposed || !state.value.items.includes(item)) return;

    item.thumbnailUrl = createRememberedImageUrl(thumbnail);
  }

  async function persistResultBlob(url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      await persistImageBlob(url, await response.blob());
    } catch {
      return;
    }
  }

  function processBatch(inputs: BatchInput[]) {
    if (inputs.length === 0) return;

    if (slots.length === 0) {
      state.value.error = 'Web Worker not supported';
      state.value.status = 'Error';
      return;
    }

    const newItems: BatchItem[] = inputs.map(({ file, relativePath }) => ({
      id: ++itemIdSeq,
      name: file.name,
      file,
      relativePath: relativePath ?? null,
      status: 'pending' as const,
      originalUrl: URL.createObjectURL(file),
      thumbnailUrl: null,
      sourceBlob: null,
      resultUrl: null,
      originalSize: null,
      resultSize: null,
      error: null,
      progress: 0,
      startedAt: null,
      durationMs: null,
      attempts: 0,
    }));
    state.value.items.push(...newItems);
    newItems.forEach((item) => void generateItemThumbnail(item));

    if (!state.value.isProcessing) {
      const pendingCount = state.value.items.filter((i) => i.status === 'pending').length;
      resizePool(Math.max(1, Math.min(effectiveConcurrency.value, pendingCount)));
    }

    runQueue();
  }

  /** re-run queue items (given list, or all done/error when omitted); allowed mid-run, requeued after the current items */
  function reprocess(items?: BatchItem[]) {
    if (slots.length === 0) return;
    const targets = items ?? state.value.items;
    const reset: BatchItem[] = [];
    for (const item of targets) {
      if (item.status === 'done' || item.status === 'error') {
        item.status = 'pending';
        item.error = null;
        releaseImageUrl(item.resultUrl);
        item.resultUrl = null;
        item.resultSize = null;
        item.progress = 0;
        item.startedAt = null;
        item.durationMs = null;
        item.attempts = 0;
        reset.push(item);
      }
    }
    if (reset.length === 0) return;

    const running = slots.map((s) => s.item).filter((i): i is BatchItem => i !== null);
    if (running.length > 0) {
      const resetIds = new Set(reset.map((i) => i.id));
      const rest = state.value.items.filter((i) => !resetIds.has(i.id));
      const lastRunningIndex = rest.reduce(
        (acc, i, idx) => (running.some((r) => r.id === i.id) ? idx : acc),
        -1,
      );
      const insertAt = lastRunningIndex >= 0 ? lastRunningIndex + 1 : rest.length;
      state.value.items = [...rest.slice(0, insertAt), ...reset, ...rest.slice(insertAt)];
    }

    if (!state.value.isProcessing) {
      const pendingCount = state.value.items.filter((i) => i.status === 'pending').length;
      resizePool(Math.max(1, Math.min(effectiveConcurrency.value, pendingCount)));
    }

    runQueue();
  }

  function toggleSelect(id: number) {
    const item = state.value.items.find((i) => i.id === id);
    if (!item || !isSelectable(item)) return;
    const idx = selectedIds.value.indexOf(id);
    if (idx >= 0) {
      selectedIds.value.splice(idx, 1);
      if (rangeAnchorId.value === id) rangeAnchorId.value = null;
    } else {
      selectedIds.value.push(id);
      rangeAnchorId.value = id;
    }
  }

  /**
   * Shift range-select: from the anchor up to the clicked item, inclusive. The
   * anchor is the most recently checked item and stays fixed across shift-clicks
   * so the range never flips the earlier selection; with no anchor the range
   * starts at the first item. Only selectable (done/error) items are collected, so gaps are skipped.
   */
  function selectRange(id: number) {
    const items = state.value.items;
    const clickedIndex = items.findIndex((i) => i.id === id);
    if (clickedIndex === -1 || !isSelectable(items[clickedIndex])) return;

    let anchorIndex = 0;
    if (rangeAnchorId.value != null) {
      const found = items.findIndex((i) => i.id === rangeAnchorId.value);
      if (found >= 0) anchorIndex = found;
    }

    const start = Math.min(anchorIndex, clickedIndex);
    const end = Math.max(anchorIndex, clickedIndex);
    selectedIds.value = items
      .slice(start, end + 1)
      .filter(isSelectable)
      .map((i) => i.id);
  }

  function toggleSelectAll() {
    if (allSelected.value) {
      selectedIds.value = [];
    } else {
      selectedIds.value = state.value.items.filter(isSelectable).map((i) => i.id);
      rangeAnchorId.value = null;
    }
  }

  function clearSelection() {
    selectedIds.value = [];
    rangeAnchorId.value = null;
  }

  function selectItem(item: BatchItem) {
    if (item.status !== 'done') return;
    activeId.value = item.id;
    previewId.value = item.id;
  }

  function closePreview() {
    previewId.value = null;
    resetCopied();
  }

  function downloadItem(item: BatchItem) {
    if (!item.resultUrl) return;
    const link = document.createElement('a');
    link.href = item.resultUrl;
    if (item.name) {
      const base = item.name.replace(/(\.\w+)$/, '') || item.name;
      const ext = item.name.match(/(\.\w+)$/)?.[1] ?? '';
      link.download = `${base}${suffixPart()}${ext}`;
    } else {
      link.download = `upscaled-image${suffixPart()}.png`;
    }
    link.click();
  }

  function suffixPart(): string {
    if (!settings.filenameSuffixEnabled) return '';
    return settings.filenameSuffix.trim();
  }

  function exportFileName(name: string, format: DownloadFormat): string {
    if (!name) return `upscaled-image.${format}`;
    const base = name.replace(/(\.\w+)$/, '') || name;
    return `${base}${suffixPart()}.${format}`;
  }

  function folderPrefix(relativePath: string | null): string {
    if (!relativePath) return '';
    const idx = relativePath.lastIndexOf('/');
    return idx >= 0 ? relativePath.slice(0, idx + 1) : '';
  }

  function uniqueZipPath(path: string, used: Set<string>): string {
    if (!used.has(path)) {
      used.add(path);
      return path;
    }
    const slash = path.lastIndexOf('/');
    const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
    const fileName = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    const ext = dot > 0 ? fileName.slice(dot) : '';
    let n = 2;
    while (used.has(`${dir}${base} (${n})${ext}`)) n++;
    const out = `${dir}${base} (${n})${ext}`;
    used.add(out);
    return out;
  }

  async function convertBlobUrl(url: string, format: DownloadFormat): Promise<Blob> {
    if (format === 'png') {
      return (await fetch(url)).blob();
    }
    const source = await (await fetch(url)).blob();
    const bitmap = await createImageBitmap(source);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    if (format === 'jpeg') {
      // JPEG has no alpha channel — composite onto white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Image conversion failed'))),
        `image/${format}`,
        0.92,
      );
    });
  }

  function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    if (url.startsWith('blob:')) {
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    }
  }

  /** download a single result, converted to the requested format */
  async function downloadOne(item: BatchItem, format: DownloadFormat) {
    if (!item.resultUrl) return;
    const blob = await convertBlobUrl(item.resultUrl, format);
    triggerDownload(URL.createObjectURL(blob), exportFileName(item.name, format));
  }

  /** download every done item (optionally only the selected ones) as a zip */
  async function downloadBatch(format: DownloadFormat, items?: BatchItem[]) {
    const targets = (items ?? state.value.items).filter((i) => i.status === 'done' && i.resultUrl);
    if (targets.length === 0) return;

    const sourceMode = settings.exportMode === 'source';

    try {
      if (!sourceMode && targets.length === 1) {
        await downloadOne(targets[0], format);
        return;
      }
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const used = new Set<string>();
      for (const item of targets) {
        const blob = await convertBlobUrl(item.resultUrl!, format);
        const fileName = exportFileName(item.name, format);
        const path = sourceMode ? `${folderPrefix(item.relativePath)}${fileName}` : fileName;
        zip.file(uniqueZipPath(path, used), blob);
      }
      const out = await zip.generateAsync({ type: 'blob' });
      triggerDownload(URL.createObjectURL(out), 'upscaled-images.zip');
      state.value.status = 'Complete';
    } catch (err) {
      state.value.error = err instanceof Error ? err.message : 'Download failed';
      state.value.status = 'Error';
    }
  }

  async function copyOne(item: BatchItem): Promise<boolean> {
    if (!item.resultUrl) return false;
    try {
      const blob = await convertBlobUrl(item.resultUrl, 'png');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }

  /** copy one item and flash its own row button */
  async function copyItem(item: BatchItem) {
    if (item.status !== 'done') return;
    flashCopied(item.id);

    const ok = await copyOne(item);
    if (!ok) {
      state.value.error = 'Failed to copy to clipboard';
      return;
    }
    state.value.status = t('processing.copied');
  }

  /** copy results to the clipboard (given list, or all done items when omitted) and flash the batch button */
  async function copyBatch(items?: BatchItem[]) {
    const targets = (items ?? state.value.items).filter((i) => i.status === 'done');
    if (targets.length === 0) return;

    flashBatchCopied();

    for (const item of targets) {
      const ok = await copyOne(item);
      if (!ok) {
        state.value.error = 'Failed to copy to clipboard';
        return;
      }
    }
    state.value.status = t('processing.copied');
  }

  function removeItem(id: number): boolean {
    const item = state.value.items.find((i) => i.id === id);
    if (!item || item.status === 'processing') return false;

    state.value.items = state.value.items.filter((i) => i.id !== id);
    releaseImageUrl(item.originalUrl);
    releaseImageUrl(item.thumbnailUrl);
    releaseImageUrl(item.resultUrl);

    const selIdx = selectedIds.value.indexOf(id);
    if (selIdx >= 0) selectedIds.value.splice(selIdx, 1);
    if (activeId.value === id) activeId.value = null;
    if (previewId.value === id) previewId.value = null;

    return true;
  }

  function clearQueue() {
    if (state.value.isProcessing) return;
    releaseAllItemUrls();
    updateGlobalProgress();
    state.value.status = 'Ready';
    state.value.error = null;
  }

  return {
    state,
    activeId,
    previewId,
    previewItem,
    copiedId,
    batchCopied,
    selectedIds,
    selectedItems,
    selectedCount,
    selectableCount,
    allSelected,
    hasReprocessable,
    hasDownloadable,
    overallProgress,
    gpuSupported,
    gpuFallback,
    processBatch,
    reprocess,
    cancelProcessing,
    cancelItem,
    modelPhase,
    modelLoadStage,
    removeItem,
    toggleSelect,
    toggleSelectAll,
    selectRange,
    clearSelection,
    selectItem,
    closePreview,
    downloadItem,
    downloadBatch,
    copyItem,
    copyBatch,
    clearQueue,
  };
}
