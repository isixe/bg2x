<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ImagePlus } from 'lucide-vue-next';
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
  gpuSupported,
  gpuFallback,
  processBatch,
  reprocess,
  toggleSelect,
  toggleSelectAll,
  selectItem,
  closePreview,
  downloadItem,
  downloadBatch,
  copyBatch,
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

const showStatus = computed(
  () => state.value.items.length > 0 || state.value.isLoadingModel || state.value.isProcessing,
);

const statusClass = computed(() => {
  if (state.value.error) return 'error';
  if (state.value.isProcessing || state.value.isLoadingModel) return 'active';
  if (state.value.status === 'Complete') return 'done';
  return '';
});

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
        </div>
        <div class="toolbar-right">
          <button type="button" class="toolbar-btn" @click="openFilePicker">
            <ImagePlus :size="15" />
            <span>{{ t('ops.processNew') }}</span>
          </button>
        </div>
      </div>

      <ImageUploader v-if="state.items.length === 0" @files-selected="processBatch" />
      <QueueList
        v-else
        :items="state.items"
        :selected-ids="selectedIds"
        :active-id="activeId"
        :copied-id="copiedId"
        :is-processing="state.isProcessing"
        @toggle="toggleSelect"
        @select-all="toggleSelectAll"
        @preview="selectItem"
        @download="downloadItem"
        @copy="(item: BatchItem) => copyBatch([item])"
        @batch="onBatch"
      />

      <div v-if="showStatus" class="status-card">
        <div class="status-row">
          <span class="status-badge" :class="statusClass">
            <span class="status-dot" />
            {{ state.status }}
          </span>
          <span v-if="state.progress > 0 && !state.isLoadingModel" class="status-pct">
            {{ state.progress }}%
          </span>
        </div>
        <div class="progress-track">
          <div
            class="progress-bar"
            :class="{ indeterminate: state.isLoadingModel }"
            :style="state.isLoadingModel ? undefined : { width: `${state.progress}%` }"
          />
        </div>
        <p v-if="state.error" class="status-error">{{ state.error }}</p>
      </div>

      <p v-else-if="state.items.length === 0" class="center-hint">
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

.toolbar-btn:hover {
  background: var(--color-primary);
  color: #fff;
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

.status-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-gray-dark);
}

.status-badge.active {
  color: var(--color-primary);
}

.status-badge.done {
  color: #16a34a;
}

.status-badge.error {
  color: #dc2626;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.status-pct {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-gray-dark);
  font-variant-numeric: tabular-nums;
}

.progress-track {
  height: 6px;
  border-radius: 3px;
  background: var(--color-gray);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: 3px;
  background: var(--color-primary);
  transition: width 0.2s ease;
}

.progress-bar.indeterminate {
  width: 40%;
  animation: status-indeterminate 1.2s ease-in-out infinite;
}

@keyframes status-indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}

.status-error {
  margin: 0;
  font-size: 0.75rem;
  color: #dc2626;
  word-break: break-word;
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
}
</style>
