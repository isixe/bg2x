<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, Copy, Download, Image as ImageIcon, Layers, X } from 'lucide-vue-next';
import CompareSlider from './CompareSlider.vue';

const { t } = useI18n();

const props = defineProps<{
  modelId: string;
  modelUrl: string;
  modelScale: number;
}>();

const emit = defineEmits<{
  (e: 'processing-complete'): void;
  (e: 'processing-start'): void;
  (e: 'processing-error'): void;
  (
    e: 'result-ready',
    payload: {
      file: File;
      originalSize: { width: number; height: number };
      resultSize: { width: number; height: number };
      resultUrl: string;
    },
  ): void;
}>();

type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

interface BatchItem {
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

interface ProcessingState {
  isProcessing: boolean;
  isModelLoaded: boolean;
  isLoadingModel: boolean;
  progress: number;
  status: string;
  error: string | null;
  items: BatchItem[];
}

const state: Ref<ProcessingState> = ref({
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

const previewCopied = computed(
  () => copiedId.value !== null && copiedId.value === previewItem.value?.id,
);

const resultSectionRef = ref<HTMLElement | null>(null);

function scrollToResult() {
  if (state.value.items.length === 0) return;
  resultSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && previewId.value !== null) {
    closePreview();
  }
}

let itemIdSeq = 0;
let worker: Worker | null = null;
let currentModelUrl: string | null = null;
let currentItem: BatchItem | null = null;
let resolveCurrent: (() => void) | null = null;
let queueRunning = false;
let batchAborted = false;

onMounted(() => {
  if (typeof Worker !== 'undefined') {
    worker = new Worker(new URL('../workers/super-resolution.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e) => {
      const { type, payload } = e.data;

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
            item.originalSize = item.originalSize ?? null;
            item.resultSize = payload.size;
            activeId.value = item.id;
            emit('result-ready', {
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
          currentModelUrl = payload?.modelUrl ?? props.modelUrl;
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
  activeId.value = null;
  previewId.value = null;
}

async function loadModel(modelUrl: string, modelData?: ArrayBuffer) {
  if (!worker) return;

  state.value.isLoadingModel = true;
  state.value.isModelLoaded = false;
  state.value.status = 'Loading model...';
  state.value.error = null;

  worker.postMessage({
    type: 'load-model',
    payload: { modelUrl, modelData },
  });
}

function waitForModelLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    const origOnMsg = worker!.onmessage;
    const checkMsg = (e: MessageEvent) => {
      if (e.data.type === 'model-loaded') {
        worker!.onmessage = origOnMsg;
        origOnMsg?.(e as MessageEvent);
        resolve();
      } else if (e.data.type === 'error') {
        worker!.onmessage = origOnMsg;
        reject(new Error(e.data.payload?.message ?? 'Failed to load model'));
      } else {
        origOnMsg?.(e as MessageEvent);
      }
    };
    worker!.onmessage = checkMsg;
  });
}

async function ensureModel(): Promise<boolean> {
  if (state.value.isModelLoaded && currentModelUrl === props.modelUrl) return true;

  try {
    const { getCachedModel } = await import('../composables/useModelCache');
    const { getModelById } = await import('../composables/useModelRegistry');
    const { fetchModelBytes } = await import('../composables/useModelDownload');

    let modelData = await getCachedModel(props.modelUrl);
    if (!modelData) {
      const model = getModelById(props.modelId);
      if (!model) {
        throw new Error(`Unknown model: ${props.modelId}`);
      }
      state.value.status = 'Downloading model...';
      modelData = await fetchModelBytes(model);
    }

    await loadModel(props.modelUrl, modelData);
    await waitForModelLoaded();
    return true;
  } catch (err) {
    state.value.isLoadingModel = false;
    state.value.error = err instanceof Error ? err.message : 'Failed to load model';
    state.value.status = 'Error';
    return false;
  }
}

async function processItem(item: BatchItem): Promise<'done' | 'error' | 'abort'> {
  if (!worker) return 'abort';

  const modelOk = await ensureModel();
  if (!modelOk) {
    item.status = 'error';
    item.error = state.value.error;
    emit('processing-error');
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
      scale: props.modelScale,
    },
  });

  await new Promise<void>((resolve) => {
    resolveCurrent = resolve;
  });
  resolveCurrent = null;

  return item.status === 'done' ? 'done' : 'error';
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
  emit('processing-start');

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
  emit('processing-complete');
  scrollToResult();
}

function processBatch(files: File[]) {
  if (files.length === 0) return;

  if (!worker) {
    state.value.error = 'Web Worker not supported';
    state.value.status = 'Error';
    emit('processing-error');
    emit('processing-complete');
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

function downloadResult(item: BatchItem) {
  if (!item.resultUrl) return;
  const link = document.createElement('a');
  link.href = item.resultUrl;
  link.download = item.name ? item.name.replace(/(\.\w+)$/, '-upscaled$1') : 'upscaled-image.png';
  link.click();
}

function copyToClipboard(item: BatchItem) {
  if (!item.resultUrl) return;
  const img = new Image();
  img.onload = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    canvas.toBlob(async (blob) => {
      if (blob) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          state.value.status = t('processing.copied');
          flashCopied(item.id);
        } catch {
          state.value.error = 'Failed to copy to clipboard';
        }
      }
    }, 'image/png');
  };
  img.src = item.resultUrl;
}

function resetState() {
  resolveCurrent?.();
  resolveCurrent = null;
  currentItem = null;
  batchAborted = true;
  state.value.isProcessing = false;
  state.value.progress = 0;
  state.value.status = 'Ready';
  state.value.error = null;
  revokeAllOriginalUrls();
  state.value.isModelLoaded = false;
  currentModelUrl = null;
}

defineExpose({ processBatch, loadModel, resetState, scrollToResult });
</script>

<template>
  <div class="processing-panel">
    <div class="panel-header">
      <h2>{{ t('processing.title') }}</h2>
      <span
        class="status-badge"
        :class="{
          processing: state.isProcessing || state.isLoadingModel,
          success: !state.isProcessing && state.status === 'Complete',
          error: state.error,
        }"
      >
        <span class="status-dot"></span>
        {{ state.status }}
      </span>
    </div>

    <div v-if="state.isLoadingModel" class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill progress-indeterminate"></div>
      </div>
      <span class="progress-text">{{ t('processing.loadingModel') }}</span>
    </div>

    <div v-else-if="state.isProcessing" class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${state.progress}%` }"></div>
      </div>
      <span class="progress-text">{{ Math.round(state.progress) }}%</span>
    </div>

    <div v-if="state.error" class="error-section">
      <p>{{ state.error }}</p>
    </div>

    <div v-if="state.items.length > 0" ref="resultSectionRef" class="result-section">
      <div class="result-list">
        <div
          v-for="item in state.items"
          :key="item.id"
          class="list-item"
          :class="[item.status, { active: item.id === activeId }]"
          :role="item.status === 'done' ? 'button' : undefined"
          :tabindex="item.status === 'done' ? 0 : undefined"
          :title="item.status === 'done' ? t('processing.clickToCompare') : item.name"
          @click="selectItem(item)"
          @keydown.enter="selectItem(item)"
          @keydown.space.prevent="selectItem(item)"
        >
          <img :src="item.originalUrl" class="list-item-thumb" :alt="item.name" draggable="false" />
          <div class="list-item-info">
            <span class="list-item-name">{{ item.name }}</span>
            <span v-if="item.status === 'done'" class="list-item-meta">
              {{ item.originalSize?.width }}×{{ item.originalSize?.height }} →
              {{ item.resultSize?.width }}×{{ item.resultSize?.height }}
            </span>
            <span v-else-if="item.status === 'pending'" class="list-item-meta">
              {{ t('processing.pending') }}
            </span>
            <span v-else-if="item.status === 'processing'" class="list-item-meta processing-meta">
              <span class="mini-spinner"></span>
              {{ t('processing.itemProcessing') }}
            </span>
            <span v-else class="list-item-meta error">
              {{ item.error || t('processing.failed') }}
            </span>
          </div>
          <div v-if="item.status === 'done'" class="list-item-side">
            <button
              type="button"
              class="list-item-action"
              :title="t('processing.download')"
              :aria-label="t('processing.download')"
              @click.stop="downloadResult(item)"
              @keydown.stop
            >
              <Download aria-hidden="true" />
            </button>
            <button
              type="button"
              class="list-item-action"
              :class="{ copied: copiedId === item.id }"
              :title="copiedId === item.id ? t('processing.copied') : t('processing.copy')"
              :aria-label="copiedId === item.id ? t('processing.copied') : t('processing.copy')"
              @click.stop="copyToClipboard(item)"
              @keydown.stop
            >
              <Copy v-if="copiedId !== item.id" aria-hidden="true" />
              <Check v-else aria-hidden="true" />
            </button>
            <span class="list-item-check" aria-hidden="true">
              <Check :stroke-width="2.5" />
            </span>
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="!state.isProcessing && !state.isLoadingModel && state.isModelLoaded"
      class="empty-state"
    >
      <ImageIcon :stroke-width="1.5" />
      <p>{{ t('processing.uploadToStart') }}</p>
    </div>

    <div
      v-else-if="!state.isProcessing && !state.isLoadingModel && !state.isModelLoaded"
      class="empty-state"
    >
      <Layers :stroke-width="1.5" />
      <p>{{ t('processing.modelNotLoaded') }}</p>
    </div>

    <Teleport to="body">
      <div
        v-if="previewItem && previewItem.status === 'done'"
        class="preview-overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="previewItem.name"
        @click.self="closePreview"
      >
        <div class="preview-dialog">
          <div class="preview-header">
            <div class="preview-info">
              <span class="preview-name" :title="previewItem.name">{{ previewItem.name }}</span>
              <span class="preview-size">
                {{ previewItem.originalSize?.width }}×{{ previewItem.originalSize?.height }} →
                {{ previewItem.resultSize?.width }}×{{ previewItem.resultSize?.height }}
              </span>
            </div>
            <div class="preview-actions">
              <button
                class="preview-icon-btn"
                :title="t('processing.download')"
                :aria-label="t('processing.download')"
                @click="downloadResult(previewItem)"
              >
                <Download />
              </button>
              <button
                class="preview-icon-btn"
                :class="{ copied: previewCopied }"
                :title="previewCopied ? t('processing.copied') : t('processing.copy')"
                :aria-label="previewCopied ? t('processing.copied') : t('processing.copy')"
                @click="copyToClipboard(previewItem)"
              >
                <Copy v-if="!previewCopied" aria-hidden="true" />
                <Check v-else aria-hidden="true" />
              </button>
              <button
                class="preview-icon-btn"
                :title="t('processing.close')"
                :aria-label="t('processing.close')"
                @click="closePreview"
              >
                <X />
              </button>
            </div>
          </div>

          <div class="preview-body">
            <CompareSlider
              :key="previewItem.id"
              :original-url="previewItem.originalUrl"
              :result-url="previewItem.resultUrl ?? ''"
              height="100%"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.processing-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  height: 100%;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-dark);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 500;
  background: var(--color-gray);
  color: var(--color-gray-dark);
}

.status-badge.processing {
  background: rgba(212, 132, 62, 0.12);
  color: var(--color-primary);
}

.status-badge.success {
  background: rgba(78, 205, 196, 0.12);
  color: #2d9b93;
}

.status-badge.error {
  background: rgba(255, 107, 107, 0.12);
  color: #d44;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background: var(--color-gray);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}

.progress-indeterminate {
  width: 30%;
  animation: indeterminate 1.5s ease-in-out infinite;
}

@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(400%);
  }
}

.progress-text {
  font-size: 0.75rem;
  color: var(--color-gray-dark);
  text-align: right;
}

.error-section {
  padding: 1rem;
  background: rgba(255, 107, 107, 0.08);
  border-radius: var(--radius-md);
  color: #d44;
  font-size: 0.875rem;
}

.result-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 320px;
  overflow-y: auto;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-gray);
  border: var(--border-thin);
  border-radius: var(--radius-md);
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.list-item.pending {
  opacity: 0.7;
}

.list-item.processing {
  border-color: var(--color-primary);
}

.list-item.error {
  border-color: rgba(255, 107, 107, 0.5);
}

.list-item.done {
  cursor: pointer;
}

.list-item.done:hover {
  border-color: var(--color-primary);
}

.list-item.active {
  border-color: var(--color-primary);
  background: rgba(212, 132, 62, 0.08);
}

.list-item.done:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.list-item-thumb {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-card);
}

.list-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.list-item-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-item-meta {
  font-size: 0.6875rem;
  color: var(--color-gray-dark);
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.list-item-meta.processing-meta {
  color: var(--color-primary);
}

.list-item-meta.error {
  color: #d44;
}

.mini-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(212, 132, 62, 0.3);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.list-item-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--color-primary);
}

.list-item-check svg {
  width: 14px;
  height: 14px;
}

/* download / copy actions, left of the completion check */
.list-item-side {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.list-item-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  /* override global `button` padding, otherwise the icon gets squeezed to 0 width */
  padding: 0;
  line-height: 1;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-gray-dark);
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.15s ease;
}

.list-item-action:hover {
  background: var(--color-card);
  color: var(--color-primary);
}

.list-item-action:active {
  transform: scale(0.9);
}

.list-item-action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

.list-item-action.copied,
.list-item-action.copied:hover {
  background: var(--color-secondary);
  color: var(--color-light);
}

.list-item-action.copied svg {
  animation: preview-copy-pop 0.28s ease;
}

.list-item-action svg {
  width: 14px;
  height: 14px;
}

.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.65);
}

.preview-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: min(96vw, 1600px);
  height: min(92vh, 1100px);
  padding: 1rem;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.35);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
}

.preview-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.preview-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-size {
  font-size: 0.6875rem;
  color: var(--color-gray-dark);
}

.preview-actions {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
}

.preview-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  /* override global `button` padding, otherwise the icon gets squeezed to 0 width */
  padding: 0;
  line-height: 1;
  border-radius: var(--radius-md);
  background: var(--color-gray);
  color: var(--color-gray-dark);
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.15s ease;
}

.preview-icon-btn:hover {
  background: var(--color-border);
  color: var(--color-primary);
}

.preview-icon-btn:active {
  transform: scale(0.9);
}

/* copy succeeded: swap to the check icon and highlight the button */
.preview-icon-btn.copied,
.preview-icon-btn.copied:hover {
  background: var(--color-secondary);
  color: var(--color-light);
}

.preview-icon-btn.copied svg {
  animation: preview-copy-pop 0.28s ease;
}

@keyframes preview-copy-pop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  60% {
    transform: scale(1.12);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.preview-icon-btn svg {
  width: 16px;
  height: 16px;
}

.preview-body {
  flex: 1;
  min-height: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  padding: 2rem;
  color: var(--color-gray-dark);
}

.empty-state svg {
  width: 48px;
  height: 48px;
  margin-bottom: 1rem;
  opacity: 0.4;
}

.empty-state p {
  font-size: 0.875rem;
  font-weight: 500;
}
</style>
