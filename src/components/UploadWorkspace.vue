<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ImageUploader from './ImageUploader.vue';
import QueueList from './QueueList.vue';
import OpsPanel from './OpsPanel.vue';
import PreviewDialog from './PreviewDialog.vue';
import { useProcessingQueue } from '../composables/useProcessingQueue';
import type { DownloadFormat, ResultReadyPayload } from '../composables/useProcessingQueue';
import { getModelById, MODEL_REGISTRY } from '../composables/useModelRegistry';
import type { BatchItem } from '../type';

const props = defineProps<{
  selectedModelId: string;
}>();

const emit = defineEmits<{
  (e: 'update:selectedModelId', value: string): void;
  (e: 'result-ready', payload: ResultReadyPayload): void;
}>();

const { t } = useI18n();

const model = computed(() => getModelById(props.selectedModelId) ?? MODEL_REGISTRY[0]);
const targetScale = ref(MODEL_REGISTRY[0].scale);
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
  onResultReady: (payload) => emit('result-ready', payload),
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
</script>

<template>
  <div class="upload-workspace">
    <QueueList
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

    <section class="workspace-center">
      <ImageUploader @files-selected="processBatch" />

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

      <p v-else class="center-hint">
        {{ state.isModelLoaded ? t('processing.uploadToStart') : t('processing.modelNotLoaded') }}
      </p>

      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onFilePicked" />
    </section>

    <OpsPanel
      :target-scale="targetScale"
      :gpu="gpu"
      :model-id="selectedModelId"
      :is-processing="state.isProcessing"
      :gpu-supported="gpuSupported"
      :has-reprocessable="hasReprocessable"
      :has-downloadable="hasDownloadable"
      @update:target-scale="targetScale = $event"
      @update:gpu="gpu = $event"
      @update:model-id="emit('update:selectedModelId', $event)"
      @reprocess="reprocess()"
      @process-new="openFilePicker"
      @download-all="(format: DownloadFormat) => downloadBatch(format)"
    />

    <PreviewDialog v-if="previewItem" :item="previewItem" @close="closePreview" />
  </div>
</template>

<style scoped>
.upload-workspace {
  display: grid;
  grid-template-columns: minmax(240px, 280px) minmax(0, 1fr) minmax(220px, 250px);
  gap: 1.25rem;
  padding: 1.5rem 2rem;
  flex: 1;
  align-items: start;
}

.workspace-center {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-width: 0;
  /* Stretch the center column to the grid row height so the upload area
     fills the vertical space instead of collapsing to its content height. */
  align-self: stretch;
  min-height: 0;
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

@media (max-width: 1024px) {
  .upload-workspace {
    grid-template-columns: minmax(0, 1fr);
    padding: 1.25rem;
    /* Single column: let panels hug their content instead of stretching rows. */
    align-content: start;
  }

  .workspace-center {
    align-self: auto;
  }
}
</style>
