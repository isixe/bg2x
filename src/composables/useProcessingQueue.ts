import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BatchItem, ModelEntry, WorkerResponse } from '../type';

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

  const gpuSupported = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const gpuFallback = ref(false);

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
  let worker: Worker | null = null;
  let currentItem: BatchItem | null = null;
  let resolveCurrent: (() => void) | null = null;
  let queueRunning = false;
  let batchAborted = false;

  /** which (url, gpu) the worker session currently serves; gpu = value requested at load time */
  let loadedUrl: string | null = null;
  let loadedGpuWanted: boolean | null = null;
  let pendingGpuWanted: boolean | null = null;

  onMounted(() => {
    if (typeof Worker !== 'undefined') {
      worker = new Worker(new URL('../workers/super-resolution.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (e) => {
        const { type, payload } = e.data as WorkerResponse;

        switch (type) {
          case 'progress':
            state.value.progress = payload.progress;
            state.value.status = payload.status;
            break;

          case 'complete': {
            state.value.progress = 100;
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
            resolveCurrent?.();
            resolveCurrent = null;
            break;
          }

          case 'error': {
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
            resolveCurrent?.();
            resolveCurrent = null;
            break;
          }

          case 'model-loaded':
            state.value.isModelLoaded = true;
            state.value.isLoadingModel = false;
            state.value.status = 'Model loaded';
            loadedUrl = payload?.modelUrl ?? options.model.value.url;
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
        resolveCurrent?.();
        resolveCurrent = null;
      };
      void preloadCachedModel();
    }

    window.addEventListener('keydown', onGlobalKeydown);
  });

  watch(previewId, (value) => {
    document.body.style.overflow = value !== null ? 'hidden' : '';
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', onGlobalKeydown);
    document.body.style.overflow = '';
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
  watch([() => options.model.value.url, options.gpu], () => {
    if (options.gpu.value) gpuFallback.value = false;
    if (state.value.isProcessing) return;
    state.value.isModelLoaded = false;
    loadedUrl = null;
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

  async function loadModel(modelUrl: string, modelData?: ArrayBuffer) {
    if (!worker) return;

    state.value.isLoadingModel = true;
    state.value.isModelLoaded = false;
    state.value.status = 'Loading model...';
    state.value.error = null;
    pendingGpuWanted = options.gpu.value;

    worker.postMessage({
      type: 'load-model',
      payload: { modelUrl, modelData, gpu: options.gpu.value },
    });
  }

  function waitForModelLoaded(): Promise<void> {
    return new Promise((resolve, reject) => {
      const workerRef = worker!;
      const origOnMsg = workerRef.onmessage;
      const checkMsg = (e: MessageEvent) => {
        if (e.data.type === 'model-loaded') {
          workerRef.onmessage = origOnMsg;
          origOnMsg?.call(workerRef, e);
          resolve();
        } else if (e.data.type === 'error') {
          workerRef.onmessage = origOnMsg;
          reject(new Error(e.data.payload?.message ?? 'Failed to load model'));
        } else {
          origOnMsg?.call(workerRef, e);
        }
      };
      workerRef.onmessage = checkMsg;
    });
  }

  function isModelReadyForCurrentSelection(): boolean {
    return (
      state.value.isModelLoaded &&
      loadedUrl === options.model.value.url &&
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
      const { getCachedModel } = await import('./useModelCache');
      const { getModelById } = await import('./useModelRegistry');
      const { fetchModelBytes } = await import('./useModelDownload');

      const modelUrl = options.model.value.url;
      let modelData = await getCachedModel(modelUrl);
      if (!modelData) {
        const model = getModelById(options.model.value.id);
        if (!model) {
          throw new Error(`Unknown model: ${options.model.value.id}`);
        }
        state.value.status = 'Downloading model...';
        modelData = await fetchModelBytes(model);
      }

      await loadModel(modelUrl, modelData);
      await waitForModelLoaded();
      return true;
    } catch (err) {
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
      const { isModelCached } = await import('./useModelCache');
      if (await isModelCached(options.model.value.url)) {
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

    state.value.isProcessing = true;
    state.value.progress = 0;
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
      return 'error';
    }

    const imageData = getImageData(img);

    worker.postMessage({
      type: 'process',
      payload: {
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
    state.value.isProcessing = true;

    while (!batchAborted) {
      const item = state.value.items.find((i) => i.status === 'pending');
      if (!item) break;

      const result = await processItem(item);
      if (result === 'abort') {
        batchAborted = true;
      }
    }

    if (batchAborted) {
      markRemainingFailed(state.value.error ?? 'Processing aborted');
    }

    state.value.isProcessing = false;
    queueRunning = false;
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

  function clearQueue() {
    if (state.value.isProcessing) return;
    revokeAllOriginalUrls();
    state.value.progress = 0;
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
    gpuSupported,
    gpuFallback,
    processBatch,
    reprocess,
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
