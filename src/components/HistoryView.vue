<script setup lang="ts">
import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { Clock, Download, Trash2, X } from 'lucide-vue-next';
import PreviewDialog from './PreviewDialog.vue';
import { useHistoryStore } from '../store/stores';
import type { HistoryRecord, PreviewItem } from '../type';

const { t } = useI18n();
const historyStore = useHistoryStore();
const { records: historyRecords } = storeToRefs(historyStore);
const { removeRecord, clearHistory } = historyStore;

const historyPreview = ref<PreviewItem | null>(null);

function openHistoryPreview(record: HistoryRecord) {
  historyPreview.value = {
    id: record.id,
    name: record.originalFileName,
    originalUrl: record.originalDataUrl,
    resultUrl: record.resultBlobUrl ?? record.resultDataUrl,
    originalSize: record.originalSize,
    resultSize: record.resultSize,
  };
}
</script>

<template>
  <div class="history-view">
    <div class="history-panel">
      <div class="history-header">
        <h1 class="history-title">{{ t('history.title') }}</h1>
        <button v-if="historyRecords.length > 0" class="history-clear-btn" @click="clearHistory">
          <Trash2 :size="14" />
          {{ t('history.clearAll') }}
        </button>
      </div>

      <div v-if="historyRecords.length === 0" class="history-empty">
        <Clock :size="48" :stroke-width="1.5" />
        <p>{{ t('history.noHistory') }}</p>
      </div>

      <div v-else class="history-list">
        <div
          v-for="record in historyRecords"
          :key="record.id"
          class="history-item"
          role="button"
          tabindex="0"
          @click="openHistoryPreview(record)"
          @keydown.enter.prevent="openHistoryPreview(record)"
          @keydown.space.prevent="openHistoryPreview(record)"
        >
          <img :src="record.originalDataUrl" :alt="record.originalFileName" class="history-thumb" />
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
            @click.stop
          >
            <Download :size="16" />
          </a>
          <button
            class="history-delete"
            :title="t('history.delete')"
            @click.stop="removeRecord(record.id)"
          >
            <X :size="14" />
          </button>
        </div>
      </div>
    </div>

    <PreviewDialog v-if="historyPreview" :item="historyPreview" @close="historyPreview = null" />
  </div>
</template>

<style scoped>
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
  cursor: pointer;
}

.history-item:hover {
  box-shadow: var(--shadow-md);
}

.history-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
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
  .history-view {
    padding: 1rem;
  }
}
</style>
