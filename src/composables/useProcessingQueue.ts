import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BatchItem, ModelEntry, WorkerResponse } from '../type';
import { cacheModel, getCachedModel, isModelCached } from './useModelCache';
import { getModelById } from './useModelRegistry';
import { fetchModelBytes } from './useModelDownload';
import { useModelCacheStore } from '../store/stores';

export type DownloadFormat = 'png' | 'jpeg' | 'webp';

export interface ResultReadyPayload {
  file: File;
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

export function useProcessingQueue(options: UseProcessingQueueOptions) {
  const { t } = useI18n();
  const modelCacheStore = useModelCacheStore();

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
  const selectedItems = computed(() =>
    state.value.items.filter((item) => selectedIds.value.includes(item.id)),
  );
  const selectableCount = computed(() => state.value.items.length);
  const selectedCount = computed(() => selectedIds.value.length);
  const allSelected = computed(
    () =>
      state.value.items.length > 0 &&
      state.value.items.every((i) => selectedIds.value.includes(i.id)),
  );

  const hasReprocessable = computed(() =>
    state.value.items.some((i) => i.status === 'done' || i.status === 'error'),
  );
  const hasDownloadable = computed(() => state.value.items.some((i) => i.status === 'done'));

  // batch-wide progress: settled items count fully, the active item contributes its fraction
  const overallProgress = computed(() => {
    const items = state.value.items;
    if (items.length === 0) return 0;
    let sum = 0;
    for (const item of items) {
      if (item.status === 'done' || item.status === 'error') sum += 1;
      else if (item.status === 'processing') sum += state.value.progress / 100;
    }
    return Math.round((sum / items.length) * 100);
  });

  const gpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const gpuFallback = ref(false);

  const modelPhase = ref<'downloading' | 'loading' | null>(null);

  /** copy button feedback: show a check icon for a short while after a successful copy */
  const copiedId = ref<number | null>(null);
  const COPIED_DURATION = 1800;
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;

  function flashCopied(id: number) {
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedId.value = id;
    copiedTimer = setTimeout(() => {
      copiedId.value = null;
      copiedTimer = null;
    }, COPIED_DURATION);
  }

  function resetCopied() {
    if (copiedTimer) {
      clearTimeout(copiedTimer);
      copiedTimer = null;
    }
    copiedId.value = null;
  }

  let itemIdSeq = 0;
  let jobIdSeq = 0;
  let worker: Worker | null = null;
  let currentItem: BatchItem | null = null;
  let currentJobId: number | null = null;
  let resolveCurrent: (() => void) | null = null;
  let queueRunning = false;
  let batchAborted = false;
  let userCancelled = false;
  const STALL_TIMEOUT_MS = 10 * 60_000;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  // The worker only reports at tile boundaries, so a naive bar freezes during a
  // long tile run (notably the first, which pays one-time init cost). Ground the
  // display in real data only: snap to each report, and between reports advance
  // at the measured per-tile rate, capped one tile's worth short of the next
  // report. With no baseline yet we hold honestly — the status text carries it.
  const SMOOTH_INTERVAL_MS = 100;
  const TILE_PROGRESS_SPAN = 70; // worker spreads tile reports across 10..80
  const INFERENCE_MIN = 10;
  const INFERENCE_MAX = 84; // below the real Postprocessing report (85)
  let smoothTimer: ReturnType<typeof setInterval> | null = null;
  let rawProgress = 0;
  let displayProgress = 0;
  let lastReportAt = 0;
  let lastReportInference = false;
  let skipWarmupDelta = false;
  let measuredTileMs: number | null = null;
  let tileTotal: number | null = null;

  /** which (model id, gpu) the worker session currently serves; gpu = value requested at load time */
  let loadedModelId: string | null = null;
  let loadedGpuWanted: boolean | null = null;
  let pendingGpuWanted: boolean | null = null;

  function setupWorker() {
    worker = new Worker(new URL('../workers/super-resolution.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data as WorkerResponse;

      switch (type) {
        case 'progress':
          if (payload.jobId != null && payload.jobId !== currentJobId) break;
          noteProgressReport(payload.progress, payload.tile);
          rawProgress = payload.progress;
          stepProgressSmoothing();
          state.value.status = payload.status;
          armStallWatchdog();
          break;

        case 'complete': {
          if (payload.jobId != null && payload.jobId !== currentJobId) {
            URL.revokeObjectURL(payload.resultUrl);
            break;
          }
          clearStallWatchdog();
          setProgress(100);
          state.value.status = 'Complete';
          const item = currentItem;
          if (item && item.status === 'processing') {
            item.status = 'done';
            item.resultUrl = payload.resultUrl;
            item.resultSize = payload.size;
            activeId.value = item.id;
            options.onResultReady?.({
              file: item.file,
              originalSize: item.originalSize!,
              resultSize: payload.size,
              resultUrl: payload.resultUrl,
            });
          }
          currentItem = null;
          currentJobId = null;
          resolveCurrent?.();
          resolveCurrent = null;
          break;
        }

        case 'error': {
          if (payload.jobId != null && payload.jobId !== currentJobId) break;
          clearStallWatchdog();
          state.value.isLoadingModel = false;
          state.value.error = payload.message;
          state.value.status = 'Error';
          const item = currentItem;
          if (item) {
            item.status = 'error';
            item.error = payload.message;
            currentItem = null;
          } else {
            batchAborted = true;
            markRemainingFailed(payload.message);
          }
          currentJobId = null;
          resolveCurrent?.();
          resolveCurrent = null;
          break;
        }

        case 'aborted': {
          clearStallWatchdog();
          if (payload.jobId != null && payload.jobId !== currentJobId) break;
          state.value.isLoadingModel = false;
          const item = currentItem;
          if (item) {
            markItemCancelled(item);
            currentItem = null;
          }
          currentJobId = null;
          resolveCurrent?.();
          resolveCurrent = null;
          break;
        }

        case 'model-loaded':
          state.value.isModelLoaded = true;
          state.value.isLoadingModel = false;
          modelPhase.value = null;
          state.value.status = 'Model loaded';
          loadedModelId = payload?.modelId ?? options.model.value.id;
          loadedGpuWanted = pendingGpuWanted;
          pendingGpuWanted = null;
          break;

        case 'gpu-fallback':
          gpuFallback.value = true;
          options.gpu.value = false;
          loadedGpuWanted = false;
          state.value.status = t('processing.gpuFallback');
          break;
      }
    };

    worker.onerror = (e) => {
      clearStallWatchdog();
      state.value.isProcessing = false;
      state.value.isLoadingModel = false;
      state.value.error = e.message;
      state.value.status = 'Worker error';
      const item = currentItem;
      if (item) {
        item.status = 'error';
        item.error = e.message;
        currentItem = null;
      } else {
        batchAborted = true;
        markRemainingFailed(e.message);
      }
      currentJobId = null;
      resolveCurrent?.();
      resolveCurrent = null;
    };
    void preloadCachedModel();
  }

  function clearStallWatchdog() {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  }

  function armStallWatchdog() {
    clearStallWatchdog();
    stallTimer = setTimeout(onWorkerStalled, STALL_TIMEOUT_MS);
  }

  function startProgressSmoothing() {
    if (smoothTimer) return;
    smoothTimer = setInterval(stepProgressSmoothing, SMOOTH_INTERVAL_MS);
  }

  function stopProgressSmoothing() {
    if (smoothTimer) {
      clearInterval(smoothTimer);
      smoothTimer = null;
    }
    rawProgress = 0;
    lastReportAt = 0;
    lastReportInference = false;
    skipWarmupDelta = false;
    tileTotal = null;
    measuredTileMs = null;
  }

  function resetProgress() {
    rawProgress = 0;
    displayProgress = 0;
    state.value.progress = 0;
    lastReportAt = 0;
    lastReportInference = false;
    skipWarmupDelta = false;
    tileTotal = null;
    // measuredTileMs is kept: later items in the same run reuse the warm baseline.
  }

  /**
   * Record the worker's reported value; `complete` (100) snaps the bar to the end.
   */
  function setProgress(value: number) {
    rawProgress = value;
    if (value >= 100) {
      displayProgress = 100;
      state.value.progress = 100;
    }
  }

  /**
   * Track report arrival times so the gap between two tile reports can be
   * measured. The interval after the pre-tile-1 report includes one-time model
   * init, so it is skipped instead of poisoning the baseline.
   */
  function noteProgressReport(progress: number, tile?: { done: number; total: number }) {
    const now = performance.now();
    const inInference = progress >= INFERENCE_MIN && progress <= INFERENCE_MAX;
    if (inInference && lastReportInference && lastReportAt > 0 && !skipWarmupDelta) {
      const delta = now - lastReportAt;
      if (delta > 0) {
        measuredTileMs = measuredTileMs === null ? delta : measuredTileMs * 0.3 + delta * 0.7;
      }
    }
    skipWarmupDelta = inInference && (tile?.done ?? 1) === 0;
    if (tile) tileTotal = tile.total;
    lastReportAt = now;
    lastReportInference = inInference;
  }

  /**
   * Display = latest real report, plus a bounded lead: between two tile reports
   * the bar advances at the measured per-tile rate but never more than one
   * tile's worth (so it cannot outrun the next anchor). Without a measured
   * baseline the bar holds; `complete` (100) snaps. Monotonic within an item —
   * transient lower reports never move the bar backwards.
   */
  function stepProgressSmoothing() {
    if (rawProgress >= 100) {
      displayProgress = 100;
    } else if (displayProgress < rawProgress) {
      displayProgress = rawProgress;
    } else if (
      measuredTileMs !== null &&
      tileTotal !== null &&
      lastReportAt > 0 &&
      rawProgress >= INFERENCE_MIN &&
      rawProgress <= INFERENCE_MAX
    ) {
      const gap = TILE_PROGRESS_SPAN / tileTotal;
      const lead = Math.min(gap, gap * ((performance.now() - lastReportAt) / measuredTileMs));
      const ceiling = Math.min(rawProgress + lead, INFERENCE_MAX);
      if (displayProgress < ceiling) {
        displayProgress = ceiling;
      }
    }
    const rounded = Math.round(displayProgress);
    if (rounded !== state.value.progress) {
      state.value.progress = rounded;
    }
  }

  function restartWorker() {
    clearStallWatchdog();
    if (worker) {
      worker.terminate();
      worker = null;
    }
    loadedModelId = null;
    loadedGpuWanted = null;
    pendingGpuWanted = null;
    currentJobId = null;
    state.value.isModelLoaded = false;
    setupWorker();
  }

  /**
   * The worker stopped posting progress for longer than STALL_TIMEOUT_MS — most
   * likely a wedged GPU/WASM inference. Fail the in-flight item and rebuild the
   * worker so the queue does not stay stuck forever.
   */
  function onWorkerStalled() {
    clearStallWatchdog();
    const message = t('processing.stalled');
    state.value.isProcessing = false;
    state.value.isLoadingModel = false;
    state.value.error = message;
    state.value.status = 'Error';
    const item = currentItem;
    if (item) {
      item.status = 'error';
      item.error = message;
      currentItem = null;
    } else {
      batchAborted = true;
      markRemainingFailed(message);
    }
    currentJobId = null;
    resolveCurrent?.();
    resolveCurrent = null;
    restartWorker();
  }

  function markItemCancelled(item: BatchItem) {
    item.status = 'error';
    item.error = t('processing.cancelled');
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
    const cancellingCurrent = currentItem?.id === id;
    markItemCancelled(item);
    if (cancellingCurrent) {
      currentItem = null;
      currentJobId = null;
      resolveCurrent?.();
      resolveCurrent = null;
      worker?.postMessage({ type: 'abort' });
    }
  }

  /** Cancel the whole batch: fail every unfinished item and stop the queue. */
  function cancelProcessing() {
    if (!worker) return;
    const hasActive = state.value.items.some(
      (i) => i.status === 'pending' || i.status === 'processing',
    );
    if (!hasActive) return;
    const hadCurrent = currentItem !== null;
    state.value.items.forEach((i) => {
      if (i.status === 'pending' || i.status === 'processing') markItemCancelled(i);
    });
    currentItem = null;
    currentJobId = null;
    batchAborted = true;
    state.value.error = null;
    userCancelled = true;
    state.value.isProcessing = false;
    resolveCurrent?.();
    resolveCurrent = null;
    if (hadCurrent) worker.postMessage({ type: 'abort' });
  }

  onMounted(() => {
    if (typeof Worker !== 'undefined') {
      setupWorker();
    }

    window.addEventListener('keydown', onGlobalKeydown);
  });

  watch(previewId, (value) => {
    document.body.style.overflow = value !== null ? 'hidden' : '';
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown);
    document.body.style.overflow = '';
    stopProgressSmoothing();
    resetCopied();
    if (worker) {
      worker.terminate();
    }
    revokeAllOriginalUrls();
  });

  /**
   * Soft invalidation: changing model or gpu only forces a reload on the next
   * process — queued items are kept (unlike the old resetState wipe).
   */
  watch([() => options.model.value.id, options.gpu], () => {
    if (options.gpu.value) gpuFallback.value = false;
    if (state.value.isProcessing) return;
    state.value.isModelLoaded = false;
    loadedModelId = null;
    loadedGpuWanted = null;
    if (!state.value.items.some((i) => i.status === 'processing')) {
      state.value.status = state.value.items.length > 0 ? 'Ready' : state.value.status;
    }
    void preloadCachedModel();
  });

  function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && previewId.value !== null) {
      closePreview();
    }
  }

  function markRemainingFailed(message: string) {
    state.value.items.forEach((item) => {
      if (item.status === 'pending' || item.status === 'processing') {
        item.status = 'error';
        item.error = message;
      }
    });
  }

  function revokeAllOriginalUrls() {
    state.value.items.forEach((item) => URL.revokeObjectURL(item.originalUrl));
    state.value.items = [];
    selectedIds.value = [];
    activeId.value = null;
    previewId.value = null;
  }

  async function loadModel(modelId: string, modelData: ArrayBuffer) {
    if (!worker) return;

    state.value.isLoadingModel = true;
    state.value.isModelLoaded = false;
    state.value.status = 'Loading model...';
    state.value.error = null;
    pendingGpuWanted = options.gpu.value;

    worker.postMessage({
      type: 'load-model',
      payload: { modelId, modelData, gpu: options.gpu.value },
    });
  }

  /** Reject instead of spinning forever if the worker never replies (deadlock safety net). */
  const MODEL_LOAD_TIMEOUT_MS = 60_000;

  function waitForModelLoaded(timeoutMs = MODEL_LOAD_TIMEOUT_MS): Promise<void> {
    return new Promise((resolve, reject) => {
      const workerRef = worker!;
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

  function isModelReadyForCurrentSelection(): boolean {
    return (
      state.value.isModelLoaded &&
      loadedModelId === options.model.value.id &&
      loadedGpuWanted === options.gpu.value
    );
  }

  let inflightLoad: Promise<boolean> | null = null;

  async function ensureModel(): Promise<boolean> {
    if (isModelReadyForCurrentSelection()) return true;
    if (inflightLoad) return inflightLoad;

    inflightLoad = doEnsureModel();
    try {
      return await inflightLoad;
    } finally {
      inflightLoad = null;
    }
  }

  async function doEnsureModel(): Promise<boolean> {
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
        modelData = await fetchModelBytes(model);
        await cacheModel(modelId, modelData);
        modelCacheStore.setCached(modelId, true);
      }

      modelPhase.value = 'loading';
      await loadModel(modelId, modelData);
      await waitForModelLoaded();
      return true;
    } catch (err) {
      modelPhase.value = null;
      state.value.isLoadingModel = false;
      state.value.error = err instanceof Error ? err.message : 'Failed to load model';
      state.value.status = 'Error';
      return false;
    }
  }

  /**
   * Warm up the worker with the currently selected model as soon as it is
   * already cached, so processing does not have to wait for the session to load.
   * Best-effort: a failure here is swallowed and retried on demand.
   */
  async function preloadCachedModel(): Promise<void> {
    if (!worker || state.value.isProcessing) return;
    if (isModelReadyForCurrentSelection()) return;

    try {
      if (await isModelCached(options.model.value.id)) {
        await ensureModel();
      }
    } catch {
      /* best-effort preload */
    }
  }

  async function processItem(item: BatchItem): Promise<'done' | 'error' | 'abort'> {
    if (!worker) return 'abort';

    const modelOk = await ensureModel();
    if (!modelOk) {
      item.status = 'error';
      item.error = state.value.error;
      return 'abort';
    }

    // the item may have been cancelled (or the batch aborted) while the model
    // was loading; bail out so a cancelled item is not resurrected here
    if (batchAborted || item.status !== 'pending') {
      return 'error';
    }

    const jobId = ++jobIdSeq;
    currentJobId = jobId;
    state.value.isProcessing = true;
    resetProgress();
    state.value.status = 'Loading image...';
    state.value.error = null;
    item.status = 'processing';
    currentItem = item;

    let img: HTMLImageElement;
    try {
      img = await loadImage(item.originalUrl);
      item.originalSize = { width: img.width, height: img.height };
    } catch (err) {
      item.status = 'error';
      item.error = err instanceof Error ? err.message : 'Failed to load image';
      state.value.status = 'Error';
      state.value.error = item.error;
      currentItem = null;
      currentJobId = null;
      return 'error';
    }

    const imageData = getImageData(img);

    worker.postMessage({
      type: 'process',
      payload: {
        jobId,
        imageData,
        width: img.width,
        height: img.height,
        scale: options.model.value.scale,
        targetScale: options.targetScale.value,
      },
    });

    await new Promise<void>((resolve) => {
      resolveCurrent = resolve;
    });
    resolveCurrent = null;

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

  function getImageData(img: HTMLImageElement): ImageData {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height);
  }

  async function runQueue() {
    if (queueRunning) return;
    queueRunning = true;
    batchAborted = false;
    userCancelled = false;
    currentJobId = null;
    state.value.isProcessing = true;
    startProgressSmoothing();

    try {
      while (!batchAborted) {
        const item = state.value.items.find((i) => i.status === 'pending');
        if (!item) break;

        const result = await processItem(item);
        if (result === 'abort') {
          batchAborted = true;
        }
      }

      if (batchAborted) {
        markRemainingFailed(
          userCancelled ? t('processing.cancelled') : (state.value.error ?? 'Processing aborted'),
        );
      }
    } catch (err) {
      state.value.error = err instanceof Error ? err.message : 'Processing failed';
      state.value.status = 'Error';
      currentItem = null;
      resolveCurrent?.();
      resolveCurrent = null;
      markRemainingFailed(state.value.error);
    } finally {
      state.value.isProcessing = false;
      queueRunning = false;
      stopProgressSmoothing();
    }
  }

  function processBatch(files: File[]) {
    if (files.length === 0) return;

    if (!worker) {
      state.value.error = 'Web Worker not supported';
      state.value.status = 'Error';
      return;
    }

    const newItems: BatchItem[] = files.map((file) => ({
      id: ++itemIdSeq,
      name: file.name,
      file,
      status: 'pending' as const,
      originalUrl: URL.createObjectURL(file),
      resultUrl: null,
      originalSize: null,
      resultSize: null,
      error: null,
    }));
    state.value.items.push(...newItems);

    runQueue();
  }

  /** re-run queue items (given list, or all done/error items when omitted) */
  function reprocess(items?: BatchItem[]) {
    if (state.value.isProcessing || !worker) return;
    const targets = items ?? state.value.items;
    let any = false;
    for (const item of targets) {
      if (item.status === 'done' || item.status === 'error') {
        item.status = 'pending';
        item.error = null;
        item.resultUrl = null;
        item.resultSize = null;
        any = true;
      }
    }
    if (any) runQueue();
  }

  function toggleSelect(id: number) {
    const idx = selectedIds.value.indexOf(id);
    if (idx >= 0) selectedIds.value.splice(idx, 1);
    else selectedIds.value.push(id);
  }

  function toggleSelectAll() {
    if (allSelected.value) {
      selectedIds.value = [];
    } else {
      selectedIds.value = state.value.items.map((i) => i.id);
    }
  }

  function clearSelection() {
    selectedIds.value = [];
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
    link.download = item.name ? item.name.replace(/(\.\w+)$/, '-upscaled$1') : 'upscaled-image.png';
    link.click();
  }

  function outputName(name: string, format: DownloadFormat): string {
    if (!name) return `upscaled-image.${format}`;
    return name.replace(/(\.\w+)$/, `-upscaled.${format}`);
  }

  function uniqueZipName(name: string, used: Set<string>): string {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 2;
    while (used.has(`${base} (${n})${ext}`)) n++;
    const out = `${base} (${n})${ext}`;
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
    triggerDownload(URL.createObjectURL(blob), outputName(item.name, format));
  }

  /** download every done item (optionally only the selected ones) as a zip */
  async function downloadBatch(format: DownloadFormat, items?: BatchItem[]) {
    const targets = (items ?? state.value.items).filter((i) => i.status === 'done' && i.resultUrl);
    if (targets.length === 0) return;

    try {
      if (targets.length === 1) {
        await downloadOne(targets[0], format);
        return;
      }
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const used = new Set<string>();
      for (const item of targets) {
        const blob = await convertBlobUrl(item.resultUrl!, format);
        zip.file(uniqueZipName(outputName(item.name, format), used), blob);
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

  /** copy results to the clipboard (given list, or all done items when omitted) */
  async function copyBatch(items?: BatchItem[]) {
    const targets = (items ?? state.value.items).filter((i) => i.status === 'done');
    for (const item of targets) {
      const ok = await copyOne(item);
      if (!ok) {
        state.value.error = 'Failed to copy to clipboard';
        return;
      }
      flashCopied(item.id);
    }
    if (targets.length > 0) {
      state.value.status = t('processing.copied');
    }
  }

  function removeItem(id: number): boolean {
    const item = state.value.items.find((i) => i.id === id);
    if (!item || item.status === 'processing') return false;

    state.value.items = state.value.items.filter((i) => i.id !== id);
    URL.revokeObjectURL(item.originalUrl);
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);

    const selIdx = selectedIds.value.indexOf(id);
    if (selIdx >= 0) selectedIds.value.splice(selIdx, 1);
    if (activeId.value === id) activeId.value = null;
    if (previewId.value === id) previewId.value = null;

    return true;
  }

  function clearQueue() {
    if (state.value.isProcessing) return;
    revokeAllOriginalUrls();
    resetProgress();
    state.value.status = 'Ready';
    state.value.error = null;
  }

  return {
    state,
    activeId,
    previewId,
    previewItem,
    copiedId,
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
    removeItem,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    selectItem,
    closePreview,
    downloadItem,
    downloadBatch,
    copyBatch,
    clearQueue,
  };
}
