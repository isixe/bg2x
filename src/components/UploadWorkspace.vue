<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ImagePlus, SlidersHorizontal, X } from 'lucide-vue-next';
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

// Dock the actions panel whenever there is room; only collapse it into an
// overlay drawer (toggled from the workspace toolbar) on narrow screens.
// Initialise synchronously so the panel is present on the very first frame
// instead of appearing only after mount.
const WIDE_QUERY = '(min-width: 1024px)';
const isWide = ref(
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(WIDE_QUERY).matches
    : false,
);
const opsOpen = ref(false);

let wideMq: ReturnType<typeof window.matchMedia> | null = null;

function handleWideChange(e: { matches: boolean }) {
  isWide.value = e.matches;
}

function closeOps() {
  opsOpen.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') closeOps();
}

watch(isWide, (wide) => {
  if (wide) opsOpen.value = false;
});

watch(opsOpen, (open) => {
  if (typeof window === 'undefined') return;
  if (open) window.addEventListener('keydown', onKeydown);
  else window.removeEventListener('keydown', onKeydown);
});

onMounted(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  wideMq = window.matchMedia(WIDE_QUERY);
  isWide.value = wideMq.matches;
  wideMq.addEventListener('change', handleWideChange);
});

onUnmounted(() => {
  wideMq?.removeEventListener('change', handleWideChange);
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="upload-workspace">
    <main class="workspace-main">
      <div class="workspace-toolbar">
        <div class="toolbar-left">
          <span v-if="state.items.length > 0" class="toolbar-count">
            {{ t('upload.images', { count: state.items.length }) }}
          </span>
        </div>
        <div class="toolbar-right">
          <button
            v-if="state.items.length > 0"
            type="button"
            class="toolbar-btn"
            @click="openFilePicker"
          >
            <ImagePlus :size="15" />
            <span>{{ t('ops.processNew') }}</span>
          </button>
          <button
            v-if="!isWide"
            type="button"
            class="toolbar-icon-btn"
            :title="t('ops.title')"
            :aria-label="t('ops.title')"
            @click="opsOpen = true"
          >
            <SlidersHorizontal :size="18" />
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

    <aside v-if="isWide" class="ops-dock">
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

    <Teleport to="body">
      <Transition name="ops-drawer">
        <div v-if="!isWide && opsOpen" class="ops-overlay" @click.self="closeOps">
          <div class="ops-drawer" role="dialog" aria-modal="true" :aria-label="t('ops.title')">
            <button
              type="button"
              class="ops-drawer-close"
              :title="t('processing.close')"
              :aria-label="t('processing.close')"
              @click="closeOps"
            >
              <X :size="18" />
            </button>
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
          </div>
        </div>
      </Transition>
    </Teleport>

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

.toolbar-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  background: var(--color-gray);
  color: var(--color-gray-dark);
  border-radius: var(--radius-md);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.toolbar-icon-btn:hover {
  background: rgba(212, 132, 62, 0.1);
  color: var(--color-primary);
}

.ops-dock {
  width: 250px;
  flex-shrink: 0;
  align-self: stretch;
}

.ops-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  justify-content: flex-end;
  background: rgba(0, 0, 0, 0.4);
}

.ops-drawer {
  position: relative;
  width: min(88vw, 320px);
  height: 100%;
  padding: 1.25rem;
  overflow-y: auto;
  background: var(--color-card);
  box-shadow: var(--shadow-md);
}

.ops-drawer-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: auto;
  margin-bottom: 0.5rem;
  padding: 0;
  background: var(--color-gray);
  color: var(--color-gray-dark);
  border-radius: var(--radius-md);
}

.ops-drawer-close:hover {
  background: var(--color-border);
  color: var(--color-primary);
}

.ops-drawer-enter-active,
.ops-drawer-leave-active {
  transition: opacity 0.2s ease;
}

.ops-drawer-enter-active .ops-drawer,
.ops-drawer-leave-active .ops-drawer {
  transition: transform 0.2s ease;
}

.ops-drawer-enter-from,
.ops-drawer-leave-to {
  opacity: 0;
}

.ops-drawer-enter-from .ops-drawer,
.ops-drawer-leave-to .ops-drawer {
  transform: translateX(100%);
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
