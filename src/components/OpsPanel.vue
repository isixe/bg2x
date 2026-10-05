<script setup lang="ts">
import { computed, ref } from 'vue';
import { ChevronDown, Download, ImagePlus, RotateCcw, Star } from 'lucide-vue-next';
import { SelectItemText } from 'reka-ui';
import { useI18n } from 'vue-i18n';
import { sortModelsByFavorites } from '../composables/useModelRegistry';
import { useModelStore } from '../store/stores';
import type { DownloadFormat } from '../composables/useProcessingQueue';
import DropdownMenu from './ui/dropdown-menu/DropdownMenu.vue';
import DropdownMenuContent from './ui/dropdown-menu/DropdownMenuContent.vue';
import DropdownMenuItem from './ui/dropdown-menu/DropdownMenuItem.vue';
import DropdownMenuTrigger from './ui/dropdown-menu/DropdownMenuTrigger.vue';
import Select from './ui/select/Select.vue';
import SelectContent from './ui/select/SelectContent.vue';
import SelectItem from './ui/select/SelectItem.vue';
import SelectTrigger from './ui/select/SelectTrigger.vue';
import SelectValue from './ui/select/SelectValue.vue';

const { t } = useI18n();

defineProps<{
  targetScale: number;
  gpu: boolean;
  modelId: string;
  isProcessing: boolean;
  gpuSupported: boolean;
  gpuFallback: boolean;
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
const FORMATS: DownloadFormat[] = ['png', 'jpeg', 'webp'];

const format = ref<DownloadFormat>('png');
const modelStore = useModelStore();
const sortedModels = computed(() => sortModelsByFavorites(modelStore.favoriteModelIds));

function pickFormat(value: DownloadFormat) {
  format.value = value;
}
</script>

<template>
  <aside class="ops-panel">
    <h2 class="ops-title">{{ t('ops.title') }}</h2>

    <div class="ops-field">
      <label class="ops-label">{{ t('ops.scale') }}</label>
      <Select
        :model-value="String(targetScale)"
        :disabled="isProcessing"
        @update:model-value="emit('update:targetScale', Number($event))"
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in SCALE_OPTIONS" :key="s" :value="String(s)">
            {{ t('models.upscale', { scale: s }) }}
          </SelectItem>
        </SelectContent>
      </Select>
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

    <div class="split-btn">
      <button
        class="ops-btn primary split-main"
        :disabled="isProcessing || !hasDownloadable"
        @click="emit('download-all', format)"
      >
        <Download :size="15" />
        <span>{{ t('ops.downloadAll') }}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="ops-btn primary split-toggle"
            :disabled="isProcessing || !hasDownloadable"
            :title="t('ops.format')"
          >
            <ChevronDown :size="14" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent class="min-w-[7rem]">
          <DropdownMenuItem
            v-for="f in FORMATS"
            :key="f"
            :class="{ 'font-semibold text-primary': format === f }"
            @select="pickFormat(f)"
          >
            {{ f.toUpperCase() }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="ops-field">
      <label class="ops-label">{{ t('ops.model') }}</label>
      <Select
        :model-value="modelId"
        :disabled="isProcessing"
        @update:model-value="emit('update:modelId', $event)"
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="model in sortedModels"
            :key="model.id"
            :value="model.id"
            raw
            class="items-start gap-2 py-2 pr-8"
          >
            <button
              type="button"
              class="model-fav"
              :class="{ 'is-active': modelStore.isFavorite(model.id) }"
              :title="
                modelStore.isFavorite(model.id)
                  ? t('models.removeFavorite')
                  : t('models.addFavorite')
              "
              @pointerdown.stop
              @pointerup.stop
              @click.stop="modelStore.toggleFavorite(model.id)"
            >
              <Star :size="15" :fill="modelStore.isFavorite(model.id) ? 'currentColor' : 'none'" />
            </button>
            <span class="model-item-body">
              <SelectItemText class="model-item-title">
                {{ model.name }}
                <span class="model-item-size">{{
                  t('models.sizeApprox', { size: model.sizeMB })
                }}</span>
              </SelectItemText>
              <span class="model-item-desc">{{ t(model.descKey) }}</span>
              <span class="model-item-output">
                {{ t('models.upscale', { scale: model.scale })
                }}<template v-if="model.maxSize">
                  · {{ t('models.maxSize', { size: model.maxSize }) }}</template
                >
              </span>
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
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
    <p v-else-if="gpuFallback" class="gpu-hint">{{ t('ops.gpuFallbackHint') }}</p>
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

.model-fav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
  margin-top: 1px;
  background: none;
  color: var(--color-gray-dark);
  border-radius: var(--radius-md);
  transition: color 0.15s ease;
}

.model-fav:hover {
  color: var(--color-primary);
}

.model-fav.is-active {
  color: var(--color-primary);
}

.model-item-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.model-item-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-dark);
  white-space: normal;
}

.model-item-size {
  font-weight: 500;
  color: var(--color-gray-dark);
}

.model-item-desc {
  font-size: 0.75rem;
  color: var(--color-gray-dark);
  white-space: normal;
}

.model-item-output {
  font-size: 0.6875rem;
  color: var(--color-gray-dark);
}
</style>
