<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  modelId: string;
  modelUrl: string;
  modelScale: number;
}>();

const emit = defineEmits<{
  (e: 'processing-complete'): void;
  (e: 'processing-start'): void;
  (
    e: 'result-ready',
    payload: {
      originalSize: { width: number; height: number };
      resultSize: { width: number; height: number };
      resultUrl: string;
    },
  ): void;
}>();

interface ProcessingState {
  isProcessing: boolean;
  isModelLoaded: boolean;
  isLoadingModel: boolean;
  progress: number;
  status: string;
  error: string | null;
  resultUrl: string | null;
  originalSize: { width: number; height: number } | null;
  upscaledSize: { width: number; height: number } | null;
}

const state: Ref<ProcessingState> = ref({
  isProcessing: false,
  isModelLoaded: false,
  isLoadingModel: false,
  progress: 0,
  status: 'Ready',
  error: null,
  resultUrl: null,
  originalSize: null,
  upscaledSize: null,
});

let worker: Worker | null = null;
let currentModelUrl: string | null = null;

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

        case 'complete':
          state.value.isProcessing = false;
          state.value.progress = 100;
          state.value.status = 'Complete';
          state.value.resultUrl = payload.resultUrl;
          state.value.upscaledSize = payload.size;
          emit('processing-complete');
          emit('result-ready', {
            originalSize: state.value.originalSize!,
            resultSize: payload.size,
            resultUrl: payload.resultUrl,
          });
          break;

        case 'error':
          state.value.isProcessing = false;
          state.value.isLoadingModel = false;
          state.value.error = payload.message;
          state.value.status = 'Error';
          break;

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
    };
  }
});

onUnmounted(() => {
  if (worker) {
    worker.terminate();
  }
});

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

async function processImage(file: File) {
  if (!worker) {
    state.value.error = 'Web Worker not supported';
    return;
  }

  if (!state.value.isModelLoaded || currentModelUrl !== props.modelUrl) {
    const { getCachedModel } = await import('../composables/useModelCache');
    const { getModelById } = await import('../composables/useModelRegistry');
    const { fetchModelBytes } = await import('../composables/useModelDownload');

    let modelData = await getCachedModel(props.modelUrl);
    if (!modelData) {
      const model = getModelById(props.modelId);
      if (!model) {
        state.value.error = `Unknown model: ${props.modelId}`;
        state.value.status = 'Error';
        return;
      }
      state.value.status = 'Downloading model...';
      modelData = await fetchModelBytes(model);
    }

    await loadModel(props.modelUrl, modelData);
    try {
      await waitForModelLoaded();
    } catch (err) {
      state.value.isLoadingModel = false;
      state.value.error = err instanceof Error ? err.message : 'Failed to load model';
      state.value.status = 'Error';
      return;
    }
  }

  state.value.isProcessing = true;
  state.value.progress = 0;
  state.value.status = 'Loading image...';
  state.value.error = null;
  state.value.resultUrl = null;
  state.value.upscaledSize = null;

  emit('processing-start');

  try {
    const img = await loadImage(file);
    state.value.originalSize = { width: img.width, height: img.height };

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
  } catch (err) {
    state.value.isProcessing = false;
    state.value.error = err instanceof Error ? err.message : 'Failed to load image';
    state.value.status = 'Error';
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
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

function downloadResult() {
  if (!state.value.resultUrl) return;

  const link = document.createElement('a');
  link.href = state.value.resultUrl;
  link.download = 'upscaled-image.png';
  link.click();
}

function copyToClipboard() {
  if (!state.value.resultUrl) return;

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
          state.value.status = 'Copied to clipboard!';
        } catch {
          state.value.error = 'Failed to copy to clipboard';
        }
      }
    }, 'image/png');
  };
  img.src = state.value.resultUrl;
}

function resetState() {
  state.value.isProcessing = false;
  state.value.progress = 0;
  state.value.status = 'Ready';
  state.value.error = null;
  state.value.resultUrl = null;
  state.value.originalSize = null;
  state.value.upscaledSize = null;
  state.value.isModelLoaded = false;
  currentModelUrl = null;
}

defineExpose({ processImage, loadModel, resetState });
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

    <div v-if="state.resultUrl" class="result-section">
      <div class="result-info">
        <div v-if="state.originalSize && state.upscaledSize" class="size-info">
          <span>{{ state.originalSize.width }}×{{ state.originalSize.height }}</span>
          <span class="arrow">→</span>
          <span>{{ state.upscaledSize.width }}×{{ state.upscaledSize.height }}</span>
        </div>
      </div>

      <img :src="state.resultUrl" alt="Upscaled result" class="result-image" />

      <div class="result-actions">
        <button class="download-btn" @click="downloadResult">
          {{ t('processing.download') }}
        </button>
        <button class="copy-btn" @click="copyToClipboard">
          {{ t('processing.copy') }}
        </button>
      </div>
    </div>

    <div
      v-else-if="!state.isProcessing && !state.isLoadingModel && state.isModelLoaded"
      class="empty-state"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21,15 16,10 5,21" />
      </svg>
      <p>{{ t('processing.uploadToStart') }}</p>
    </div>

    <div
      v-else-if="!state.isProcessing && !state.isLoadingModel && !state.isModelLoaded"
      class="empty-state"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
      <p>{{ t('processing.modelNotLoaded') }}</p>
    </div>
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

.result-info {
  display: flex;
  justify-content: center;
}

.size-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-gray-dark);
}

.size-info span:first-child,
.size-info span:last-child {
  font-weight: 600;
  color: var(--color-dark);
}

.arrow {
  color: var(--color-primary);
}

.result-image {
  width: 100%;
  max-height: 320px;
  object-fit: contain;
  border-radius: var(--radius-md);
  background: var(--color-gray);
}

.result-actions {
  display: flex;
  gap: 0.75rem;
}

.result-actions button {
  flex: 1;
}

.download-btn {
  background: var(--color-primary);
  color: white;
}

.download-btn:hover {
  background: var(--color-primary-hover);
}

.copy-btn {
  background: var(--color-gray);
  color: var(--color-dark);
}

.copy-btn:hover {
  background: var(--color-border);
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
