<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { Clock, Download, Trash2, X } from 'lucide-vue-next';
import PreviewDialog from './PreviewDialog.vue';
import { useHistoryStore } from '../store/stores';
import { getImageBlob, historyImageKey, releaseImageUrl } from '../utils/imageStore';
import type { HistoryRecord, PreviewItem } from '../type';

const { t } = useI18n();
const historyStore = useHistoryStore();
const { records: historyRecords } = storeToRefs(historyStore);
const { removeRecord, clearHistory } = historyStore;

const historyPreview = ref<PreviewItem | null>(null);
const thumbUrls = ref<Record<string, string>>({});

let createdUrls: string[] = [];
let previewToken = 0;

function revokeCreatedUrls() {
  createdUrls.forEach((url) => releaseImageUrl(url));
  createdUrls = [];
}

function releaseThumbUrls() {
  Object.values(thumbUrls.value).forEach((url) => releaseImageUrl(url));
  thumbUrls.value = {};
}

async function loadThumbnail(record: HistoryRecord) {
  if (thumbUrls.value[record.id]) return;
  const blob = await getImageBlob(historyImageKey(record.id, 'thumb')).catch(() => null);
  if (!blob) {
    // 缩略图读不出来说明这条记录的缓存已经没了：元数据一并清掉，不留空条目。
    removeRecord(record.id);
    return;
  }
  if (!historyRecords.value.some((entry) => entry.id === record.id)) return;
  thumbUrls.value[record.id] = URL.createObjectURL(blob);
}

const recordIdKey = computed(() => historyRecords.value.map((record) => record.id).join('|'));

watch(
  recordIdKey,
  () => {
    const alive = new Set(historyRecords.value.map((record) => record.id));
    for (const [id, url] of Object.entries(thumbUrls.value)) {
      if (alive.has(id)) continue;
      releaseImageUrl(url);
      delete thumbUrls.value[id];
    }
    historyRecords.value.forEach((record) => {
      void loadThumbnail(record);
    });
  },
  { immediate: true },
);

function closePreview() {
  previewToken += 1;
  revokeCreatedUrls();
  historyPreview.value = null;
}

async function openHistoryPreview(record: HistoryRecord) {
  const token = (previewToken += 1);
  revokeCreatedUrls();

  const [original, result] = await Promise.all([
    getImageBlob(historyImageKey(record.id, 'original')).catch(() => null),
    getImageBlob(historyImageKey(record.id, 'result')).catch(() => null),
  ]);
  if (token !== previewToken) return;

  // 预览必须由 IndexedDB 里的原图与结果重建；缺任何一张就整条记录作废。
  if (!original || !result) {
    removeRecord(record.id);
    return;
  }

  const originalUrl = URL.createObjectURL(original);
  const resultUrl = URL.createObjectURL(result);
  createdUrls.push(originalUrl, resultUrl);

  historyPreview.value = {
    id: record.id,
    name: record.originalFileName,
    originalUrl,
    resultUrl,
    originalSize: record.originalSize,
    resultSize: record.resultSize,
  };
}

const historyPreviewIndex = computed(() =>
  historyPreview.value
    ? historyRecords.value.findIndex((record) => record.id === historyPreview.value?.id)
    : -1,
);
const canPreviewPrev = computed(() => historyPreviewIndex.value > 0);
const canPreviewNext = computed(
  () =>
    historyPreviewIndex.value >= 0 && historyPreviewIndex.value < historyRecords.value.length - 1,
);

function previewStep(delta: 1 | -1) {
  const index = historyPreviewIndex.value;
  if (index < 0) return;
  const next = historyRecords.value[index + delta];
  if (next) void openHistoryPreview(next);
}

async function downloadRecord(record: HistoryRecord) {
  const blob = await getImageBlob(historyImageKey(record.id, 'result')).catch(() => null);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = record.originalFileName.replace(/(\.\w+)$/, '-upscaled$1');
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => releaseImageUrl(url), 30_000);
}

onUnmounted(() => {
  revokeCreatedUrls();
  releaseThumbUrls();
});
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
          <img
            v-if="thumbUrls[record.id]"
            :src="thumbUrls[record.id]"
            :alt="record.originalFileName"
            class="history-thumb"
          />
          <div v-else class="history-thumb" />
          <div class="history-info">
            <span class="history-name">{{ record.originalFileName }}</span>
            <span class="history-meta">
              {{ record.originalSize.width }}×{{ record.originalSize.height }} →
              {{ record.resultSize.width }}×{{ record.resultSize.height }}
            </span>
            <span class="history-meta">{{ record.modelName }}</span>
          </div>
          <button
            type="button"
            class="history-download"
            :title="t('history.download')"
            @click.stop="downloadRecord(record)"
          >
            <Download :size="16" />
          </button>
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

    <PreviewDialog
      v-if="historyPreview"
      :item="historyPreview"
      :has-prev="canPreviewPrev"
      :has-next="canPreviewNext"
      @close="closePreview"
      @prev="previewStep(-1)"
      @next="previewStep(1)"
    />
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
  padding: 0;
  line-height: 1;
  border: none;
  background: transparent;
  cursor: pointer;
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

.history-item:hover .history-delete,
.history-item:focus-within .history-delete {
  opacity: 1;
}

.history-delete:hover {
  background: rgba(220, 38, 38, 0.08);
  color: #dc2626;
}

/* touch devices have no hover, so the delete button must stay visible */
@media (hover: none) {
  .history-delete {
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .history-view {
    padding: 1rem;
  }
}
</style>
