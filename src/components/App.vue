<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { storeToRefs } from 'pinia';
import HomePage from './HomePage.vue';
import ImageUploader from './ImageUploader.vue';
import ProcessingPanel from './ProcessingPanel.vue';
import { getModelById, MODEL_REGISTRY } from '../composables/useModelRegistry';
import { useHistoryStore } from '../stores';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const historyStore = useHistoryStore();

const processingPanel = ref<InstanceType<typeof ProcessingPanel> | null>(null);
const selectedCount = ref(0);
const isProcessing = ref(false);
const selectedModelId = ref(MODEL_REGISTRY[0].id);

type ViewName = 'home' | 'upload' | 'history';

function getViewFromHash(): ViewName {
  if (typeof window === 'undefined') return 'home';
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'upload') return 'upload';
  if (hash === 'history') return 'history';
  return 'home';
}

const currentView = ref<ViewName>(getViewFromHash());

const selectedModel = computed(() => getModelById(selectedModelId.value) ?? MODEL_REGISTRY[0]);
const { records: historyRecords } = storeToRefs(historyStore);
const { addRecord, removeRecord, clearHistory } = historyStore;

function handleHashChange() {
  currentView.value = getViewFromHash();
}

function handleNavChange(e: Event) {
  const detail = (e as CustomEvent).detail;
  if (detail === 'home') location.hash = '#/';
  else if (detail === 'upload') location.hash = '#/upload';
  else if (detail === 'history') location.hash = '#/history';
  else if (detail === 'models') location.hash = '#/';
}

function handleNavigate(view: string) {
  if (view === 'upload') location.hash = '#/upload';
  else if (view === 'history') location.hash = '#/history';
  else location.hash = '#/';
}

onMounted(() => {
  window.addEventListener('nav-change', handleNavChange);
  window.addEventListener('hashchange', handleHashChange);
});

onUnmounted(() => {
  window.removeEventListener('nav-change', handleNavChange);
  window.removeEventListener('hashchange', handleHashChange);
});

function handleFilesSelected(files: File[]) {
  selectedCount.value += files.length;
  isProcessing.value = true;
  processingPanel.value?.processBatch(files);
}

function handleProcessingStart() {
  isProcessing.value = true;
}

function handleProcessingComplete() {
  isProcessing.value = false;
}

function handleProcessingError() {
  isProcessing.value = false;
}

async function handleResultReady(payload: {
  file: File;
  originalSize: { width: number; height: number };
  resultSize: { width: number; height: number };
  resultUrl: string;
}) {
  await addRecord({
    file: payload.file,
    originalSize: payload.originalSize,
    resultSize: payload.resultSize,
    modelId: selectedModel.value.id,
    modelName: selectedModel.value.name,
    resultUrl: payload.resultUrl,
  });
}

watch(selectedModelId, () => {
  if (processingPanel.value) {
    processingPanel.value.resetState?.();
  }
});
</script>

<template>
  <div class="app-wrapper">
    <!-- Home View -->
    <HomePage v-if="currentView === 'home'" @navigate="handleNavigate" />

    <!-- History View -->
    <div v-else-if="currentView === 'history'" class="history-view">
      <div class="history-panel">
        <div class="history-header">
          <h1 class="history-title">{{ t('history.title') }}</h1>
          <button v-if="historyRecords.length > 0" class="history-clear-btn" @click="clearHistory">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              width="14"
              height="14"
            >
              <polyline points="3,6 5,6 21,6" />
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              />
            </svg>
            {{ t('history.clearAll') }}
          </button>
        </div>

        <div v-if="historyRecords.length === 0" class="history-empty">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            width="48"
            height="48"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          <p>{{ t('history.noHistory') }}</p>
        </div>

        <div v-else class="history-list">
          <div v-for="record in historyRecords" :key="record.id" class="history-item">
            <img
              :src="record.originalDataUrl"
              :alt="record.originalFileName"
              class="history-thumb"
            />
            <div class="history-info">
              <span class="history-name">{{ record.originalFileName }}</span>
              <span class="history-meta">
                {{ record.originalSize.width }}×{{ record.originalSize.height }} →
                {{ record.resultSize.width }}×{{ record.resultSize.height }}
              </span>
              <span class="history-meta">{{ record.modelName }}</span>
            </div>
            <a
              v-if="record.resultDataUrl"
              :href="record.resultDataUrl"
              :download="record.originalFileName.replace(/(\.\w+)$/, '-upscaled$1')"
              class="history-download"
              :title="t('history.download')"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                width="16"
                height="16"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7,10 12,15 17,10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </a>
            <button
              class="history-delete"
              :title="t('history.delete')"
              @click="removeRecord(record.id)"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                width="14"
                height="14"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Upload View -->
    <template v-else>
      <div class="summary-bar">
        <span class="summary-text">
          {{ t('upload.selectedImages', { count: selectedCount }) }}
        </span>
        <div class="model-select-wrapper">
          <label class="model-select-label">{{ t('upload.model') }}</label>
          <select
            class="model-select"
            :value="selectedModelId"
            @change="selectedModelId = ($event.target as HTMLSelectElement).value"
          >
            <option v-for="model in MODEL_REGISTRY" :key="model.id" :value="model.id">
              {{ model.name }}
            </option>
          </select>
        </div>
      </div>

      <div class="content-area">
        <div class="panel upload-panel">
          <ImageUploader @files-selected="handleFilesSelected" />
        </div>

        <div class="panel processing-panel">
          <ProcessingPanel
            ref="processingPanel"
            :model-id="selectedModel.id"
            :model-url="selectedModel.url"
            :model-scale="selectedModel.scale"
            @processing-start="handleProcessingStart"
            @processing-complete="handleProcessingComplete"
            @processing-error="handleProcessingError"
            @result-ready="handleResultReady"
          />
        </div>
      </div>

      <div class="bottom-bar">
        <div class="bottom-left">
          <span class="selected-info">
            {{ t('upload.selectedItems') }}
            <strong>{{ t('upload.images', { count: selectedCount }) }}</strong>
          </span>
        </div>
        <div class="bottom-right">
          <button class="clean-btn" :disabled="selectedCount === 0 || isProcessing">
            {{ isProcessing ? t('upload.processing') : t('upload.upscale') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.app-wrapper {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-background);
}

.summary-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 2rem;
  background: var(--color-card);
  border-bottom: var(--border-thin);
}

.summary-text {
  font-size: 0.875rem;
  color: var(--color-gray-dark);
}

.summary-text strong {
  color: var(--color-primary);
  font-weight: 600;
}

.model-select-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
}

.model-select-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-gray-dark);
}

.model-select {
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  border: var(--border-thin);
  border-radius: var(--radius-md);
  background: var(--color-card);
  color: var(--color-dark);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6,9 12,15 18,9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
}

.model-select:hover {
  border-color: var(--color-primary);
}

.model-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(212, 132, 62, 0.15);
}

.content-area {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1.5rem 2rem;
  flex: 1;
}

.panel {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: var(--color-card);
  border-top: var(--border-thin);
}

.bottom-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.selected-info {
  font-size: 0.875rem;
  color: var(--color-gray-dark);
}

.selected-info strong {
  color: var(--color-dark);
  font-weight: 600;
}

.clean-btn {
  background: var(--color-primary);
  color: white;
  padding: 0.75rem 2rem;
  font-weight: 600;
  border-radius: var(--radius-md);
}

.clean-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.clean-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.history-view {
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem;
  overflow-y: auto;
}

.history-panel {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0;
}

.history-clear-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-gray-dark);
  background: var(--color-gray);
  border-radius: var(--radius-md);
}

.history-clear-btn:hover {
  background: #e5e0da;
  color: #dc2626;
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 1rem;
  color: var(--color-gray-dark);
  gap: 1rem;
}

.history-empty svg {
  opacity: 0.3;
}

.history-empty p {
  font-size: 0.875rem;
  font-weight: 500;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.15s ease;
}

.history-item:hover {
  box-shadow: var(--shadow-md);
}

.history-thumb {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-gray);
}

.history-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.history-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  font-size: 0.6875rem;
  color: var(--color-gray-dark);
}

.history-download {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--color-gray-dark);
  text-decoration: none;
  flex-shrink: 0;
}

.history-download:hover {
  background: rgba(22, 163, 74, 0.08);
  color: #16a34a;
}

.history-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  /* override global `button` padding, otherwise the icon gets squeezed to 0 width */
  padding: 0;
  line-height: 1;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-gray-dark);
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.history-item:hover .history-delete {
  opacity: 1;
}

.history-delete:hover {
  background: rgba(220, 38, 38, 0.08);
  color: #dc2626;
}

@media (max-width: 768px) {
  .summary-bar {
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .model-select-wrapper {
    margin-left: 0;
  }

  .bottom-bar {
    flex-direction: column;
    gap: 1rem;
  }

  .clean-btn {
    width: 100%;
  }
}
</style>
