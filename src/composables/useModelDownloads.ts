import { reactive } from 'vue';
import type { ModelEntry, ModelState } from '../type';
import { MODEL_REGISTRY } from './useModelRegistry';
import { cacheModel, deleteCachedModel, getCachedModel } from './useModelCache';
import { fetchModelBytes } from './useModelDownload';
import { useModelCacheStore } from '../store/stores';

export const modelDownloadStates = reactive<Record<string, ModelState>>({});

const inflightDownloads = new Map<string, Promise<ArrayBuffer>>();

function ensureState(model: ModelEntry): ModelState {
  let state = modelDownloadStates[model.id];
  if (!state) {
    state = {
      cached: false,
      downloading: false,
      progress: 0,
      error: null,
      abortController: null,
    };
    modelDownloadStates[model.id] = state;
  }
  return state;
}

function ensureAllStates(): void {
  for (const model of MODEL_REGISTRY) ensureState(model);
}

export async function refreshModelDownloadStates(): Promise<void> {
  ensureAllStates();
  const modelCacheStore = useModelCacheStore();
  if (!modelCacheStore.isReady) await modelCacheStore.refresh();

  for (const model of MODEL_REGISTRY) {
    const state = ensureState(model);
    if (state.downloading) continue;
    state.cached = modelCacheStore.cachedModelIds.includes(model.id);
    if (state.cached) state.progress = 100;
  }
}

export async function downloadModel(model: ModelEntry): Promise<ArrayBuffer> {
  const existing = inflightDownloads.get(model.id);
  if (existing) return existing;

  const task = runDownload(model);
  inflightDownloads.set(model.id, task);
  try {
    return await task;
  } finally {
    inflightDownloads.delete(model.id);
  }
}

async function runDownload(model: ModelEntry): Promise<ArrayBuffer> {
  const state = ensureState(model);

  if (state.cached) {
    const cached = await getCachedModel(model.id);
    if (cached) return cached;
    state.cached = false;
  }

  state.downloading = true;
  state.progress = 0;
  state.error = null;
  const controller = new AbortController();
  state.abortController = controller;

  try {
    const buffer = await fetchModelBytes(model, {
      signal: controller.signal,
      onProgress: (percent) => {
        state.progress = percent;
      },
    });

    await cacheModel(model.id, buffer);
    useModelCacheStore().setCached(model.id, true);
    state.cached = true;
    state.progress = 100;
    return buffer;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      state.progress = 0;
    } else {
      state.error = err instanceof Error ? err.message : 'Download failed';
    }
    throw err;
  } finally {
    state.downloading = false;
    state.abortController = null;
  }
}

export function cancelModelDownload(id: string): void {
  modelDownloadStates[id]?.abortController?.abort();
}

export async function removeCachedModel(model: ModelEntry): Promise<void> {
  const state = ensureState(model);
  if (state.downloading) return;

  await deleteCachedModel(model.id);
  useModelCacheStore().setCached(model.id, false);
  state.cached = false;
  state.progress = 0;
  state.error = null;
}
