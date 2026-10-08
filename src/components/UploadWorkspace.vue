<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Ban, ImagePlus, Trash2 } from 'lucide-vue-next';
import ImageUploader from './ImageUploader.vue';
import QueueList from './QueueList.vue';
import OpsPanel from './OpsPanel.vue';
import PreviewDialog from './PreviewDialog.vue';
import { useProcessingQueue } from '../composables/useProcessingQueue';
import type { DownloadFormat } from '../composables/useProcessingQueue';
import { getModelById, MODEL_REGISTRY } from '../composables/useModelRegistry';
import type { BatchItem } from '../type';
import { useHistoryStore, useModelStore } from '../store/stores';

const { t } = useI18n();

// Explicit name so <KeepAlive include="UploadWorkspace"> matches this route
// component even if the file is ever renamed.
defineOptions({ name: 'UploadWorkspace' });

const modelStore = useModelStore();
const historyStore = useHistoryStore();

const initialModel = getModelById(modelStore.defaultModelId) ?? MODEL_REGISTRY[0];
const selectedModelId = ref(initialModel.id);

const model = computed(() => getModelById(selectedModelId.value) ?? MODEL_REGISTRY[0]);
const targetScale = ref(2);
const gpu = ref(false);

const {
  state,
  activeId,
  previewItem,
  copiedId,
  selectedIds,
  selectedItems,
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
  selectItem,
  closePreview,
  downloadItem,
  downloadBatch,
  copyBatch,
  clearQueue,
} = useProcessingQueue({
  model,
  targetScale,
  gpu,
  onResultReady: async (payload) => {
    await historyStore.addRecord({
      file: payload.file,
      originalSize: payload.originalSize,
      resultSize: payload.resultSize,
      modelId: model.value.id,
      modelName: model.value.name,
      resultUrl: payload.resultUrl,
    });
  },
});

const fileInput = ref<HTMLInputElement | null>(null);

function openFilePicker() {
  fileInput.value?.click();
}

function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files?.length) {
    processBatch(Array.from(input.files));
  }
  input.value = '';
}

function onBatch(action: 'download' | 'copy' | 'reprocess') {
  const items = selectedItems.value;
  if (items.length === 0) return;
  if (action === 'download') {
    void downloadBatch('png', items);
  } else if (action === 'copy') {
    void copyBatch(items);
  } else {
    reprocess(items);
  }
}

const hasActiveItems = computed(() =>
  state.value.items.some((i) => i.status === 'pending' || i.status === 'processing'),
);

const settledCount = computed(
  () => state.value.items.filter((i) => i.status === 'done' || i.status === 'error').length,
);

// Above 1024px the actions panel docks to the right of the workspace; below
// that it stacks under the main column so it is always reachable inline.
// Initialise synchronously so the correct shell renders on the very first
// frame instead of only after mount.
const WIDE_QUERY = '(min-width: 1024px)';
const isWide = ref(
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(WIDE_QUERY).matches
    : false,
);

let wideMq: ReturnType<typeof window.matchMedia> | null = null;

function handleWideChange(e: { matches: boolean }) {
  isWide.value = e.matches;
}

onMounted(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  wideMq = window.matchMedia(WIDE_QUERY);
  isWide.value = wideMq.matches;
  wideMq.addEventListener('change', handleWideChange);
});

// This page is kept alive by <KeepAlive> so an in-flight batch keeps running in
// the worker while the user browses other routes. The preview dialog locks
// body scrolling; that lock must not follow us to other pages.
onActivated(() => {
  if (previewItem.value) document.body.style.overflow = 'hidden';
});

onDeactivated(() => {
  document.body.style.overflow = '';
});

onUnmounted(() => {
  wideMq?.removeEventListener('change', handleWideChange);
});
</script>

<template>
  <div class="upload-workspace">
    <main class="workspace-main">
      <div v-if="state.items.length > 0" class="workspace-toolbar">
        <div class="toolbar-left">
          <span class="toolbar-count">{{ t('upload.images', { count: state.items.length }) }}</span>
          <div
            v-if="state.items.length > 1 && state.isProcessing"
            class="batch-progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="overallProgress"
          >
            <div class="batch-progress-track">
              <div class="batch-progress-bar" :style="{ width: overallProgress + '%' }" />
            </div>
            <span class="batch-progress-label">
              {{ settledCount }}/{{ state.items.length }} · {{ overallProgress }}%
            </span>
          </div>
        </div>
        <div class="toolbar-right">
          <button
            type="button"
            class="toolbar-btn"
            :disabled="state.isProcessing"
            @click="clearQueue"
          >
            <Trash2 :size="15" />
            <span>{{ t('queue.clear') }}</span>
          </button>
          <button v-if="hasActiveItems" type="button" class="toolbar-btn" @click="cancelProcessing">
            <Ban :size="15" />
            <span>{{ t('queue.cancelAll') }}</span>
          </button>
          <button type="button" class="toolbar-btn" @click="openFilePicker">
            <ImagePlus :size="15" />
            <span>{{ t('ops.processNew') }}</span>
          </button>
        </div>
      </div>

      <div v-if="modelPhase && state.items.length > 0" class="model-loading">
        <span class="model-loading-spinner" aria-hidden="true" />
        <span>
          {{
            t(
              modelPhase === 'downloading'
                ? 'processing.downloadingModel'
                : 'processing.loadingModel',
            )
          }}
        </span>
      </div>

      <ImageUploader v-if="state.items.length === 0" @files-selected="processBatch" />
      <QueueList
        v-else
        :items="state.items"
        :selected-ids="selectedIds"
        :active-id="activeId"
        :copied-id="copiedId"
        :is-processing="state.isProcessing"
        :progress="state.progress"
        @toggle="toggleSelect"
        @select-all="toggleSelectAll"
        @preview="selectItem"
        @download="downloadItem"
        @copy="(item: BatchItem) => copyBatch([item])"
        @batch="onBatch"
        @cancel-item="cancelItem"
        @remove="removeItem"
      />

      <p v-if="state.items.length === 0" class="center-hint">
        {{ state.isModelLoaded ? t('processing.uploadToStart') : t('processing.modelNotLoaded') }}
      </p>

      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFilePicked" />
    </main>

    <aside :class="isWide ? 'ops-dock' : 'ops-inline'">
      <OpsPanel
        :target-scale="targetScale"
        :gpu="gpu"
        :model-id="selectedModelId"
        :is-processing="state.isProcessing"
        :gpu-supported="gpuSupported"
        :gpu-fallback="gpuFallback"
        :has-reprocessable="hasReprocessable"
        :has-downloadable="hasDownloadable"
        @update:target-scale="targetScale = $event"
        @update:gpu="gpu = $event"
        @update:model-id="selectedModelId = $event"
        @reprocess="reprocess()"
        @process-new="openFilePicker"
        @download-all="(format: DownloadFormat) => downloadBatch(format)"
      />
    </aside>

    <PreviewDialog v-if="previewItem" :item="previewItem" @close="closePreview" />
  </div>
</template>

<style scoped>
.upload-workspace {
  display: flex;
  gap: 1.25rem;
  padding: 1.5rem 2rem;
  flex: 1;
  align-items: flex-start;
}

.workspace-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  /* Stretch the main column to the row height so the upload area
     fills the vertical space instead of collapsing to its content height. */
  align-self: stretch;
  min-height: 0;
}

.workspace-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.25rem;
}

.toolbar-count {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-gray-dark);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.batch-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  max-width: 20rem;
}

.batch-progress-track {
  flex: 1;
  min-width: 0;
  height: 6px;
  border-radius: 999px;
  background: var(--color-border);
  overflow: hidden;
}

.batch-progress-bar {
  height: 100%;
  border-radius: inherit;
  background: var(--color-primary);
  transition: width 0.15s linear;
}

.batch-progress-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-gray-dark);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  background: var(--color-gray);
  color: var(--color-dark);
  border-radius: var(--radius-md);
}

.toolbar-btn:hover:not(:disabled) {
  background: var(--color-primary);
  color: #fff;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ops-dock {
  width: 250px;
  flex-shrink: 0;
  align-self: stretch;
}

.ops-inline {
  width: 100%;
  flex-shrink: 0;
}

/* The panel's own sticky offset belongs to the docked layout only. */
.ops-inline :deep(.ops-panel) {
  position: static;
  top: auto;
}

.model-loading {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  align-self: center;
  padding: 0.375rem 0.875rem;
  border-radius: 999px;
  background: var(--color-gray);
  color: var(--color-gray-dark);
  font-size: 0.75rem;
  font-weight: 500;
}

.model-loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: model-loading-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes model-loading-spin {
  to {
    transform: rotate(360deg);
  }
}

.center-hint {
  margin: 0;
  text-align: center;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-gray-dark);
  padding: 0.5rem 0;
}

@media (max-width: 1023px) {
  /* Stack the actions panel under the main column instead of hiding it
     behind a right-side overlay. Avoid stretching to the full viewport
     height so a short workspace doesn't leave a large empty area. */
  .upload-workspace {
    flex-direction: column;
    align-items: stretch;
    flex: none;
  }
}

@media (max-width: 1280px) {
  .upload-workspace {
    padding: 1.25rem;
  }
}

@media (max-width: 640px) {
  .upload-workspace {
    padding: 1rem;
  }

  /* The count and the action labels don't fit on one phone-width row, so stack
     them: the count on top, the wrapped action buttons on their own row. */
  .workspace-toolbar {
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
  }

  .toolbar-right {
    flex: 1 1 100%;
    flex-wrap: wrap;
    margin-left: 0;
    gap: 0.5rem;
  }

  .toolbar-btn {
    flex: 1 1 auto;
    justify-content: center;
    white-space: nowrap;
  }
}
</style>
