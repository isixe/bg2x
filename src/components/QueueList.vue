<script setup lang="ts">
import { Check, Copy, Download, Layers, RotateCcw } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import type { BatchItem } from '../type';

const { t } = useI18n();

defineProps<{
  items: BatchItem[];
  selectedIds: number[];
  activeId: number | null;
  copiedId: number | null;
  isProcessing: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', id: number): void;
  (e: 'select-all'): void;
  (e: 'preview', item: BatchItem): void;
  (e: 'download', item: BatchItem): void;
  (e: 'copy', item: BatchItem): void;
  (e: 'batch', action: 'download' | 'copy' | 'reprocess'): void;
}>();
</script>

<template>
  <section class="queue-panel">
    <div class="queue-header">
      <label class="queue-select-all">
        <input
          type="checkbox"
          :checked="items.length > 0 && selectedIds.length === items.length"
          :disabled="items.length === 0"
          @change="emit('select-all')"
        />
        <span class="queue-title">{{ t('queue.title') }}</span>
      </label>
      <span v-if="selectedIds.length > 0" class="queue-selected">
        {{ t('queue.selected', { count: selectedIds.length }) }}
      </span>
    </div>

    <div v-if="items.length === 0" class="queue-empty">
      <Layers :size="32" :stroke-width="1.5" />
      <p>{{ t('queue.empty') }}</p>
    </div>

    <div v-else class="queue-list" role="list">
      <div
        v-for="item in items"
        :key="item.id"
        class="queue-item"
        :class="{
          done: item.status === 'done',
          processing: item.status === 'processing',
          pending: item.status === 'pending',
          error: item.status === 'error',
          active: activeId === item.id,
        }"
        role="listitem"
      >
        <input
          type="checkbox"
          class="queue-check"
          :checked="selectedIds.includes(item.id)"
          @change="emit('toggle', item.id)"
          @click.stop
        />
        <img
          class="queue-thumb"
          :src="item.resultUrl ?? item.originalUrl"
          :alt="item.name"
          role="button"
          tabindex="0"
          :title="item.status === 'done' ? t('processing.clickToCompare') : item.name"
          @click="emit('preview', item)"
          @keydown.enter.prevent="emit('preview', item)"
        />
        <div class="queue-info">
          <span class="queue-name" :title="item.name">{{ item.name }}</span>
          <span class="queue-meta">
            <template v-if="item.status === 'pending'">{{ t('processing.pending') }}</template>
            <template v-else-if="item.status === 'processing'">
              {{ t('processing.itemProcessing') }}
            </template>
            <template v-else-if="item.status === 'error'">{{ t('processing.failed') }}</template>
            <template v-else-if="item.resultSize">
              {{ item.resultSize.width }}×{{ item.resultSize.height }}
            </template>
          </span>
        </div>
        <span v-if="item.status === 'processing'" class="queue-spinner" aria-hidden="true" />
        <Check v-else-if="item.status === 'done'" class="queue-done-icon" :size="16" />
        <span
          v-else-if="item.status === 'error'"
          class="queue-error-dot"
          :title="item.error ?? ''"
        />
        <div v-if="item.status === 'done'" class="queue-actions">
          <button
            class="queue-action"
            :title="t('processing.download')"
            @click.stop="emit('download', item)"
          >
            <Download :size="14" />
          </button>
          <button
            class="queue-action"
            :class="{ copied: copiedId === item.id }"
            :title="copiedId === item.id ? t('processing.copied') : t('processing.copy')"
            @click.stop="emit('copy', item)"
          >
            <Check v-if="copiedId === item.id" :size="14" />
            <Copy v-else :size="14" />
          </button>
        </div>
      </div>
    </div>

    <div v-if="selectedIds.length > 0" class="queue-batch">
      <button
        class="batch-btn"
        :title="t('queue.download')"
        :disabled="isProcessing"
        @click="emit('batch', 'download')"
      >
        <Download :size="14" />
        <span>{{ t('queue.download') }}</span>
      </button>
      <button
        class="batch-btn"
        :title="t('queue.copy')"
        :disabled="isProcessing"
        @click="emit('batch', 'copy')"
      >
        <Copy :size="14" />
        <span>{{ t('queue.copy') }}</span>
      </button>
      <button
        class="batch-btn"
        :title="t('queue.reprocess')"
        :disabled="isProcessing"
        @click="emit('batch', 'reprocess')"
      >
        <RotateCcw :size="14" />
        <span>{{ t('queue.reprocess') }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.queue-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem;
  min-width: 0;
}

.queue-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.queue-select-all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  min-width: 0;
}

.queue-select-all input {
  accent-color: var(--color-primary);
  cursor: pointer;
}

.queue-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-dark);
}

.queue-selected {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-primary);
  white-space: nowrap;
}

.queue-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 0.5rem;
  color: var(--color-gray-dark);
}

.queue-empty svg {
  opacity: 0.3;
}

.queue-empty p {
  font-size: 0.8125rem;
  font-weight: 500;
  text-align: center;
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.queue-item:hover {
  background: var(--color-gray);
}

.queue-item.active {
  border-color: var(--color-primary);
  background: rgba(212, 132, 62, 0.06);
}

.queue-item.error {
  background: rgba(220, 38, 38, 0.04);
}

.queue-check {
  accent-color: var(--color-primary);
  cursor: pointer;
  flex-shrink: 0;
}

.queue-thumb {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  background: var(--color-gray);
}

.queue-item.done .queue-thumb {
  cursor: pointer;
}

.queue-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.queue-name {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-meta {
  font-size: 0.6875rem;
  color: var(--color-gray-dark);
}

.queue-item.error .queue-meta {
  color: #dc2626;
}

.queue-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: queue-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes queue-spin {
  to {
    transform: rotate(360deg);
  }
}

.queue-done-icon {
  color: #16a34a;
  flex-shrink: 0;
}

.queue-error-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #dc2626;
  flex-shrink: 0;
}

.queue-actions {
  display: flex;
  gap: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.queue-item:hover .queue-actions,
.queue-item.active .queue-actions {
  opacity: 1;
}

.queue-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  line-height: 1;
  border-radius: var(--radius-sm);
  background: var(--color-gray);
  color: var(--color-gray-dark);
}

.queue-action:hover {
  background: var(--color-primary);
  color: #fff;
}

.queue-action.copied {
  background: #16a34a;
  color: #fff;
}

.queue-batch {
  display: flex;
  gap: 0.375rem;
  padding-top: 0.75rem;
  border-top: var(--border-thin);
  flex-wrap: wrap;
}

.batch-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex: 1;
  justify-content: center;
  min-width: 0;
  padding: 0.5rem 0.375rem;
  font-size: 0.6875rem;
  font-weight: 600;
  background: var(--color-gray);
  color: var(--color-dark);
  border-radius: var(--radius-md);
  white-space: nowrap;
}

.batch-btn:hover:not(:disabled) {
  background: var(--color-primary);
  color: #fff;
}

.batch-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
