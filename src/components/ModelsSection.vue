<script setup lang="ts">
import { computed, reactive, onMounted, onUnmounted } from 'vue';
import { MODEL_REGISTRY, sortModelsByFavorites } from '../composables/useModelRegistry';
import type { ModelEntry, ModelState } from '../type';
import { cacheModel, deleteCachedModel } from '../composables/useModelCache';
import { fetchModelBytes } from '../composables/useModelDownload';
import { useModelCacheStore, useModelStore } from '../store/stores';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Check, ChevronRight, Download, Star, Trash2 } from 'lucide-vue-next';

withDefaults(
  defineProps<{
    showMore?: boolean;
    showFavorites?: boolean;
  }>(),
  {
    showFavorites: true,
  },
);

const router = useRouter();
const { t } = useI18n();
const modelStore = useModelStore();
const modelCacheStore = useModelCacheStore();

const modelStates = reactive<Record<string, ModelState>>({});
const defaultModelId = computed(() => modelStore.defaultModelId);
const favoriteIds = computed(() => modelStore.favoriteModelIds);

const groups = computed(() => {
  const sorted = sortModelsByFavorites(favoriteIds.value);
  const favorites = sorted.filter((m) => favoriteIds.value.includes(m.id));
  if (favorites.length === 0) return [{ key: '', models: sorted }];
  return [
    { key: 'models.favorites', models: favorites },
    { key: 'models.others', models: sorted.filter((m) => !favoriteIds.value.includes(m.id)) },
  ];
});

onMounted(async () => {
  for (const model of MODEL_REGISTRY) {
    modelStates[model.id] = {
      cached: false,
      downloading: false,
      progress: 0,
      error: null,
      abortController: null,
    };
  }
  await modelCacheStore.refresh();
  for (const model of MODEL_REGISTRY) {
    modelStates[model.id].cached = modelCacheStore.cachedModelIds.includes(model.id);
  }
});

onUnmounted(() => {
  for (const model of MODEL_REGISTRY) {
    modelStates[model.id].abortController?.abort();
  }
});

async function downloadModel(model: ModelEntry) {
  const state = modelStates[model.id];
  if (state.downloading || state.cached) return;

  state.downloading = true;
  state.progress = 0;
  state.error = null;
  const controller = new AbortController();
  state.abortController = controller;

  try {
    const buffer = await fetchModelBytes(model, {
      signal: controller.signal,
      onProgress: (p) => (state.progress = p),
    });

    await cacheModel(model.url, buffer);
    modelCacheStore.setCached(model.id, true);
    state.cached = true;
    state.progress = 100;
    modelStore.setDefaultModel(model.id);
  } catch (err: unknown) {
    if (err instanceof Error && err.name !== 'AbortError') {
      state.error = err.message || 'Download failed';
    }
  } finally {
    state.downloading = false;
    state.abortController = null;
  }
}

async function removeModel(model: ModelEntry) {
  const state = modelStates[model.id];
  if (state.downloading) return;
  await deleteCachedModel(model.url);
  modelCacheStore.setCached(model.id, false);
  state.cached = false;
  state.progress = 0;
}

function selectModel(model: ModelEntry) {
  const state = modelStates[model.id];
  if (state?.downloading) return;
  if (state?.cached) modelStore.setDefaultModel(model.id);
  else downloadModel(model);
}

function toggleFavorite(model: ModelEntry) {
  modelStore.toggleFavorite(model.id);
}

function isFavorite(model: ModelEntry) {
  return modelStore.isFavorite(model.id);
}

function isSelected(model: ModelEntry) {
  return defaultModelId.value === model.id && modelStates[model.id]?.cached === true;
}

function goToModels() {
  router.push({ name: 'models' });
}
</script>

<template>
  <div class="models-section">
    <div class="section-header">
      <h2 class="section-title">{{ t('models.title') }}</h2>
      <span class="section-hint">{{ t('models.downloadBeforeUse') }}</span>
      <button v-if="showMore" class="section-more" @click="goToModels">
        {{ t('models.more') }}
        <ChevronRight :size="14" />
      </button>
    </div>

    <div v-for="group in groups" :key="group.key" class="model-group">
      <span v-if="group.key" class="group-label">{{ t(group.key) }}</span>
      <div class="model-list">
        <div
          v-for="model in group.models"
          :key="model.id"
          class="model-card"
          :class="{ 'is-selected': isSelected(model) }"
          role="button"
          tabindex="0"
          @click="selectModel(model)"
          @keydown.enter.prevent="selectModel(model)"
          @keydown.space.prevent="selectModel(model)"
        >
          <button
            v-if="showFavorites"
            class="btn-fav"
            :class="{ 'is-active': isFavorite(model) }"
            :title="isFavorite(model) ? t('models.removeFavorite') : t('models.addFavorite')"
            @click.stop="toggleFavorite(model)"
          >
            <Star :size="16" :fill="isFavorite(model) ? 'currentColor' : 'none'" />
          </button>

          <div class="model-card-main">
            <div class="model-info">
              <div class="model-name-row">
                <span class="model-name" :title="model.name">{{ model.name }}</span>
                <span class="badge-size">{{ t('models.sizeApprox', { size: model.sizeMB }) }}</span>
                <span v-if="modelStates[model.id]?.cached" class="badge-cached">{{
                  t('home.ready')
                }}</span>
                <span v-else-if="modelStates[model.id]?.downloading" class="badge-downloading">{{
                  t('home.downloading')
                }}</span>
              </div>
              <p class="model-desc">{{ t(model.descKey) }}</p>
              <div class="model-meta">
                <span class="meta-item">{{ t('models.upscale', { scale: model.scale }) }}</span>
                <span v-if="model.maxSize" class="meta-item">{{
                  t('models.maxSize', { size: model.maxSize })
                }}</span>
              </div>
            </div>

            <div class="model-actions">
              <button
                v-if="!modelStates[model.id]?.cached && !modelStates[model.id]?.downloading"
                class="btn-download"
                @click.stop="downloadModel(model)"
              >
                <Download :size="16" />
                {{ t('home.downloadModel') }}
              </button>
              <button
                v-else-if="modelStates[model.id]?.downloading"
                class="btn-cancel"
                @click.stop="modelStates[model.id].abortController?.abort()"
              >
                {{ t('home.cancel') }}
              </button>
              <button
                v-else
                class="btn-remove"
                :title="t('home.removeModel')"
                @click.stop="removeModel(model)"
              >
                <Trash2 :size="14" />
              </button>
              <span v-if="isSelected(model)" class="model-check" :title="t('models.selected')">
                <Check :size="16" />
              </span>
            </div>
          </div>

          <div
            v-if="
              modelStates[model.id]?.downloading ||
              (modelStates[model.id]?.progress > 0 && modelStates[model.id]?.progress < 100)
            "
            class="model-progress"
          >
            <div class="progress-track">
              <div
                class="progress-fill"
                :style="{ width: (modelStates[model.id]?.progress ?? 0) + '%' }"
              ></div>
            </div>
            <span class="progress-text">{{ modelStates[model.id]?.progress ?? 0 }}%</span>
          </div>

          <div v-if="modelStates[model.id]?.error" class="model-error">
            {{ modelStates[model.id].error }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.models-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.section-title {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0;
}

.section-hint {
  font-size: 0.8125rem;
  color: var(--color-gray-dark);
}

.section-more {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  margin-left: auto;
  align-self: center;
  padding: 0.25rem 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-primary);
  background: none;
  border-radius: var(--radius-md);
  transition: background 0.15s ease;
}

.section-more:hover {
  background: rgba(212, 132, 62, 0.1);
}

.model-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.group-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--color-gray-dark);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.model-card {
  position: relative;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 2px solid transparent;
  cursor: pointer;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.model-card:hover {
  box-shadow: var(--shadow-md);
}

.model-card:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.model-card.is-selected {
  border-color: var(--color-primary);
}

.model-card-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
  /* reserve the top-right corner for the absolutely positioned favorite button */
  padding-right: 3.25rem;
  gap: 1.5rem;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
  min-width: 0;
}

.model-name {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-dark);
}

.badge-size {
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-gray-dark);
}

.badge-cached {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #16a34a;
  background: #dcfce7;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.badge-downloading {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-primary);
  background: rgba(212, 132, 62, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.model-desc {
  font-size: 0.8125rem;
  color: var(--color-gray-dark);
  margin: 0 0 0.375rem;
  overflow-wrap: anywhere;
}

.model-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.meta-item {
  font-size: 0.75rem;
  color: var(--color-gray-dark);
}

.model-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-fav {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  /* override global `button` padding, otherwise the icon gets squeezed to 0 width */
  padding: 0;
  line-height: 1;
  background: none;
  color: var(--color-gray-dark);
  border-radius: var(--radius-md);
  transition: all 0.15s ease;
}

.btn-fav:hover {
  background: rgba(212, 132, 62, 0.1);
  color: var(--color-primary);
}

.btn-fav.is-active {
  color: var(--color-primary);
}

.model-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  color: white;
  background: var(--color-primary);
  border-radius: 9999px;
}

.btn-download {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  background: var(--color-primary);
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: var(--radius-md);
}

.btn-download:hover {
  background: var(--color-primary-hover);
}

.btn-cancel {
  padding: 0.5rem 1rem;
  background: var(--color-gray);
  color: var(--color-gray-dark);
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: var(--radius-md);
}

.btn-cancel:hover {
  background: #e5e0da;
}

.btn-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  /* override global `button` padding, otherwise the icon gets squeezed to 0 width */
  padding: 0;
  line-height: 1;
  background: none;
  color: var(--color-gray-dark);
  border-radius: var(--radius-md);
}

.btn-remove:hover {
  background: rgba(220, 38, 38, 0.08);
  color: #dc2626;
}

.model-progress {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 1.25rem 1rem;
}

.progress-track {
  flex: 1;
  height: 6px;
  background: var(--color-gray);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 9999px;
  transition: width 0.15s ease;
}

.progress-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-primary);
  min-width: 3ch;
  text-align: right;
}

.model-error {
  padding: 0.5rem 1.25rem 0.75rem;
  font-size: 0.8125rem;
  color: #dc2626;
}

@media (max-width: 560px) {
  .section-header {
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
  }

  .section-hint {
    flex: 1 1 auto;
    min-width: 0;
  }

  .model-card-main {
    flex-wrap: wrap;
    align-items: flex-start;
    padding: 1rem;
    gap: 0.75rem;
  }

  .model-info {
    flex: 1 1 100%;
    min-width: 0;
  }

  /* keep the model name clear of the favorite button pinned to the top-right */
  .model-name-row {
    padding-right: 1.75rem;
  }

  /* Move the action row below the info so it never squeezes the text. */
  .model-actions {
    flex: 1 1 100%;
    justify-content: flex-end;
  }
}
</style>
