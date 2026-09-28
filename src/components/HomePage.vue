<script setup lang="ts">
import { computed, reactive, onMounted, onUnmounted } from 'vue';
import { MODEL_REGISTRY, type ModelEntry } from '../composables/useModelRegistry';
import { isModelCached, cacheModel, deleteCachedModel } from '../composables/useModelCache';
import { fetchModelBytes } from '../composables/useModelDownload';
import { useModelStore } from '../stores';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{
  (e: 'navigate', view: string): void;
}>();

const { t } = useI18n();
const modelStore = useModelStore();

interface ModelState {
  cached: boolean;
  downloading: boolean;
  progress: number;
  error: string | null;
  abortController: AbortController | null;
}

const modelStates = reactive<Record<string, ModelState>>({});
const defaultModelId = computed(() => modelStore.defaultModelId);

onMounted(async () => {
  for (const model of MODEL_REGISTRY) {
    modelStates[model.id] = {
      cached: false,
      downloading: false,
      progress: 0,
      error: null,
      abortController: null,
    };
    modelStates[model.id].cached = await isModelCached(model.url);
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
    state.cached = true;
    state.progress = 100;
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
  state.cached = false;
  state.progress = 0;
}

function handleSetDefault(model: ModelEntry) {
  modelStore.setDefaultModel(model.id);
}

function goToUpload() {
  emit('navigate', 'upload');
}
</script>

<template>
  <div class="home-view">
    <div class="home-content">
      <!-- Welcome Section -->
      <div class="welcome-section">
        <div class="welcome-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21,15 16,10 5,21" />
          </svg>
        </div>
        <h1 class="welcome-title">{{ t('home.title') }}</h1>
        <p class="welcome-desc">{{ t('home.desc') }}</p>
        <button class="welcome-cta" @click="goToUpload">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            width="18"
            height="18"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17,8 12,3 7,8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {{ t('home.getStarted') }}
        </button>
      </div>

      <!-- Models Section -->
      <div class="models-section">
        <div class="section-header">
          <h2 class="section-title">{{ t('models.title') }}</h2>
          <span class="section-hint">{{ t('models.downloadBeforeUse') }}</span>
        </div>

        <div class="model-list">
          <div v-for="model in MODEL_REGISTRY" :key="model.id" class="model-card">
            <div class="model-card-main">
              <div class="model-info">
                <div class="model-name-row">
                  <span class="model-name">{{ model.name }}</span>
                  <span v-if="defaultModelId === model.id" class="badge-default">{{
                    t('home.default')
                  }}</span>
                  <span v-else-if="modelStates[model.id]?.cached" class="badge-cached">{{
                    t('home.ready')
                  }}</span>
                  <span v-else-if="modelStates[model.id]?.downloading" class="badge-downloading">{{
                    t('home.downloading')
                  }}</span>
                </div>
                <p class="model-desc">{{ model.description }}</p>
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
                  @click="downloadModel(model)"
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
                  {{ t('home.downloadModel') }}
                </button>
                <button
                  v-else-if="modelStates[model.id]?.downloading"
                  class="btn-cancel"
                  @click="modelStates[model.id].abortController?.abort()"
                >
                  {{ t('home.cancel') }}
                </button>
                <template v-else>
                  <button
                    v-if="defaultModelId !== model.id"
                    class="btn-set-default"
                    :title="t('home.default')"
                    @click="handleSetDefault(model)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      width="14"
                      height="14"
                    >
                      <polygon
                        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
                      />
                    </svg>
                  </button>
                  <button class="btn-select" @click="goToUpload">
                    {{ t('home.useModel') }}
                  </button>
                  <button
                    class="btn-remove"
                    :title="t('home.removeModel')"
                    @click="removeModel(model)"
                  >
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
                  </button>
                </template>
              </div>
            </div>

            <!-- Progress bar -->
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

            <!-- Error message -->
            <div v-if="modelStates[model.id]?.error" class="model-error">
              {{ modelStates[model.id].error }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-view {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem;
  overflow-y: auto;
}

.home-content {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Welcome Section */
.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem 1rem 1rem;
}

.welcome-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(212, 132, 62, 0.1);
  border-radius: 16px;
  margin-bottom: 1.25rem;
}

.welcome-icon svg {
  width: 36px;
  height: 36px;
  color: var(--color-primary);
}

.welcome-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0 0 0.5rem;
}

.welcome-desc {
  font-size: 0.9375rem;
  color: var(--color-gray-dark);
  margin: 0 0 1.5rem;
  max-width: 420px;
  line-height: 1.6;
}

.welcome-cta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--color-primary);
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.welcome-cta:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

/* Models Section */
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

.model-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.model-card {
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 2px solid transparent;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.model-card:hover {
  box-shadow: var(--shadow-md);
}

.model-card-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
  gap: 1.5rem;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.model-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-dark);
}

.badge-cached {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #16a34a;
  background: #dcfce7;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.badge-downloading {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-primary);
  background: rgba(212, 132, 62, 0.1);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.badge-default {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--color-primary);
  background: rgba(212, 132, 62, 0.12);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.model-desc {
  font-size: 0.8125rem;
  color: var(--color-gray-dark);
  margin: 0 0 0.375rem;
}

.model-meta {
  display: flex;
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

.btn-select {
  padding: 0.5rem 1.25rem;
  background: var(--color-primary);
  color: white;
  font-size: 0.8125rem;
  font-weight: 600;
  border-radius: var(--radius-md);
}

.btn-select:hover {
  background: var(--color-primary-hover);
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

.btn-set-default {
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

.btn-set-default:hover {
  background: rgba(212, 132, 62, 0.1);
  color: var(--color-primary);
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
</style>
