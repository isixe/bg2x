<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ChevronDown, Download, ImagePlus, RotateCcw } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { MODEL_REGISTRY } from '../composables/useModelRegistry';
import type { DownloadFormat } from '../composables/useProcessingQueue';

const { t } = useI18n();

defineProps<{
  targetScale: number;
  gpu: boolean;
  modelId: string;
  isProcessing: boolean;
  gpuSupported: boolean;
  hasReprocessable: boolean;
  hasDownloadable: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:targetScale', value: number): void;
  (e: 'update:gpu', value: boolean): void;
  (e: 'update:modelId', value: string): void;
  (e: 'reprocess'): void;
  (e: 'process-new'): void;
  (e: 'download-all', format: DownloadFormat): void;
}>();

const SCALE_OPTIONS = [1, 2, 4];

const format = ref<DownloadFormat>('png');
const showFormatMenu = ref(false);

function pickFormat(value: DownloadFormat) {
  format.value = value;
  showFormatMenu.value = false;
}

function onDocumentClick() {
  showFormatMenu.value = false;
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onUnmounted(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
  <aside class="ops-panel">
    <h2 class="ops-title">{{ t('ops.title') }}</h2>

    <div class="ops-field">
      <label class="ops-label" for="ops-scale">{{ t('ops.scale') }}</label>
      <select
        id="ops-scale"
        class="ops-select"
        :value="targetScale"
        :disabled="isProcessing"
        @change="emit('update:targetScale', Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="s in SCALE_OPTIONS" :key="s" :value="s">
          {{ t('models.upscale', { scale: s }) }}
        </option>
      </select>
    </div>

    <button
      class="ops-btn secondary"
      :disabled="isProcessing || !hasReprocessable"
      @click="emit('reprocess')"
    >
      <RotateCcw :size="15" />
      <span>{{ t('ops.reprocess') }}</span>
    </button>

    <button class="ops-btn secondary" :disabled="isProcessing" @click="emit('process-new')">
      <ImagePlus :size="15" />
      <span>{{ t('ops.processNew') }}</span>
    </button>

    <div class="split-btn" @click.stop>
      <button
        class="ops-btn primary split-main"
        :disabled="isProcessing || !hasDownloadable"
        @click="emit('download-all', format)"
      >
        <Download :size="15" />
        <span>{{ t('ops.downloadAll') }}</span>
      </button>
      <button
        class="ops-btn primary split-toggle"
        :disabled="isProcessing || !hasDownloadable"
        :aria-expanded="showFormatMenu"
        :title="t('ops.format')"
        @click="showFormatMenu = !showFormatMenu"
      >
        <ChevronDown :size="14" />
      </button>
      <div v-if="showFormatMenu" class="format-menu" role="menu">
        <button
          v-for="f in ['png', 'jpeg', 'webp']"
          :key="f"
          class="format-option"
          :class="{ active: format === f }"
          role="menuitem"
          @click="pickFormat(f as DownloadFormat)"
        >
          {{ f.toUpperCase() }}
        </button>
      </div>
    </div>

    <div class="ops-field">
      <label class="ops-label" for="ops-model">{{ t('ops.model') }}</label>
      <select
        id="ops-model"
        class="ops-select"
        :value="modelId"
        :disabled="isProcessing"
        @change="emit('update:modelId', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="model in MODEL_REGISTRY" :key="model.id" :value="model.id">
          {{ model.name }}
        </option>
      </select>
    </div>

    <div class="ops-gpu">
      <span class="ops-label" :class="{ disabled: !gpuSupported }">{{ t('ops.gpu') }}</span>
      <label class="gpu-switch" :class="{ disabled: !gpuSupported || isProcessing }">
        <input
          type="checkbox"
          :checked="gpu"
          :disabled="!gpuSupported || isProcessing"
          @change="emit('update:gpu', ($event.target as HTMLInputElement).checked)"
        />
        <span class="gpu-slider" />
      </label>
    </div>
    <p v-if="!gpuSupported" class="gpu-hint">{{ t('ops.gpuUnsupported') }}</p>
  </aside>
</template>

<style scoped>
.ops-panel {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 1rem;
  min-width: 0;
  position: sticky;
  top: 5.5rem;
}

.ops-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-dark);
  margin: 0;
}

.ops-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.ops-label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-gray-dark);
}

.ops-label.disabled {
  opacity: 0.6;
}

.ops-select {
  width: 100%;
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

.ops-select:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.ops-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(212, 132, 62, 0.15);
}

.ops-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ops-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  width: 100%;
  padding: 0.5625rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: var(--radius-md);
}

.ops-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ops-btn.secondary {
  background: var(--color-gray);
  color: var(--color-dark);
}

.ops-btn.secondary:hover:not(:disabled) {
  background: #e5e0da;
}

.ops-btn.primary {
  background: var(--color-primary);
  color: #fff;
}

.ops-btn.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.split-btn {
  position: relative;
  display: flex;
}

.split-main {
  flex: 1;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.split-toggle {
  width: 2.25rem;
  padding: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
}

.format-menu {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  min-width: 100%;
  background: var(--color-card);
  border: var(--border-thin);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.format-option {
  padding: 0.45rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: left;
  background: transparent;
  color: var(--color-dark);
}

.format-option:hover {
  background: var(--color-gray);
}

.format-option.active {
  background: rgba(212, 132, 62, 0.1);
  color: var(--color-primary);
}

.ops-gpu {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-top: 0.25rem;
}

.gpu-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
}

.gpu-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.gpu-slider {
  position: absolute;
  inset: 0;
  background: var(--color-border);
  border-radius: 20px;
  transition: background 0.15s ease;
  cursor: pointer;
}

.gpu-slider::before {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  left: 2px;
  top: 2px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.15s ease;
}

.gpu-switch input:checked + .gpu-slider {
  background: var(--color-primary);
}

.gpu-switch input:checked + .gpu-slider::before {
  transform: translateX(16px);
}

.gpu-switch.disabled .gpu-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.gpu-hint {
  font-size: 0.6875rem;
  color: var(--color-gray-dark);
  margin: 0;
}
</style>
