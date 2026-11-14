import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../locales/i18n';
import type {
  HistoryRecord,
  KeyboardMode,
  PreviewBackground,
  PreviewBackgroundPosition,
} from '../type';
import { MODEL_REGISTRY } from '../composables/useModelRegistry';
import { isModelCached } from '../composables/useModelCache';
import { DEFAULT_BATCH_CONCURRENCY, clampBatchConcurrency } from '../config/concurrency';
import {
  clearHistoryScope,
  clearImageStore,
  deleteHistoryImages,
  getImageBlob,
  historyImageKey,
  persistImageBlob,
  rekeyImage,
} from '../utils/imageStore';
import { createThumbnailBlob } from '../utils/thumbnail';

export type LocaleCode = 'en' | 'zh' | 'ja';
export type ThemeMode = 'light' | 'dark';
export type ExportMode = 'aggregate' | 'source';

// Pick the initial UI language from the browser on first visit. A language the
// user chose manually is restored from persistence and takes precedence.
function detectLocale(): LocaleCode {
  if (typeof navigator === 'undefined') return 'en';
  const candidates = [navigator.language, ...(navigator.languages ?? [])].filter(Boolean);
  for (const lang of candidates) {
    const lower = lang.toLowerCase();
    if (lower.startsWith('zh')) return 'zh';
    if (lower.startsWith('ja')) return 'ja';
  }
  return 'en';
}

export const useLocaleStore = defineStore(
  'locale',
  () => {
    const locale = ref<string>(detectLocale());

    function setLocale(lang: LocaleCode) {
      locale.value = lang;
      i18n.global.locale.value = lang;
    }

    const localeLabel = computed(() => {
      const labels: Record<string, string> = { en: 'English', zh: '中文', ja: '日本語' };
      return labels[locale.value] ?? locale.value;
    });

    return { locale, setLocale, localeLabel };
  },
  { persist: { key: 'super-resolution-locale' } },
);

function detectSystemTheme(): ThemeMode {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useThemeStore = defineStore(
  'theme',
  () => {
    const theme = ref<ThemeMode>(detectSystemTheme());
    const isDark = computed(() => theme.value === 'dark');

    function applyToDocument() {
      if (typeof document === 'undefined') return;
      document.documentElement.classList.toggle('dark', theme.value === 'dark');
    }

    function setTheme(value: ThemeMode) {
      theme.value = value;
      applyToDocument();
    }

    function toggle() {
      setTheme(theme.value === 'dark' ? 'light' : 'dark');
    }

    return { theme, isDark, setTheme, toggle, applyToDocument };
  },
  { persist: { key: 'super-resolution-theme' } },
);

export const useSettingsStore = defineStore(
  'settings',
  () => {
    const hasVisited = ref(false);
    const historyPersist = ref(false);
    const checkUpdatesOnLaunch = ref(true);
    const dismissedUpdateVersion = ref('');
    const exportMode = ref<ExportMode>('source');
    const filenameSuffixEnabled = ref(true);
    const filenameSuffix = ref('-upscaled');
    const concurrency = ref(DEFAULT_BATCH_CONCURRENCY);
    const preloadWarmup = ref(true);
    const previewBackground = ref<PreviewBackground>('mask');
    const previewBackgroundColor = ref('#808080');
    const previewBackgroundPosition = ref<PreviewBackgroundPosition>('left');
    const keyboardMode = ref<KeyboardMode>('arrows');
    // Bumped when the persisted shape changes so we can migrate old values.
    const settingsVersion = ref(1);

    function markVisited() {
      hasVisited.value = true;
    }

    function setHistoryPersist(enabled: boolean) {
      historyPersist.value = enabled;
    }

    function setExportMode(mode: ExportMode) {
      exportMode.value = mode;
    }

    function setConcurrency(value: number) {
      concurrency.value = clampBatchConcurrency(value);
    }

    function setPreviewBackground(mode: PreviewBackground) {
      previewBackground.value = mode;
    }

    function setPreviewBackgroundColor(color: string) {
      previewBackgroundColor.value = color;
    }

    function setPreviewBackgroundPosition(position: PreviewBackgroundPosition) {
      previewBackgroundPosition.value = position;
    }

    function setKeyboardMode(mode: KeyboardMode) {
      keyboardMode.value = mode;
    }

    function dismissUpdate(version: string) {
      dismissedUpdateVersion.value = version;
    }

    return {
      hasVisited,
      markVisited,
      historyPersist,
      setHistoryPersist,
      checkUpdatesOnLaunch,
      dismissedUpdateVersion,
      dismissUpdate,
      exportMode,
      setExportMode,
      filenameSuffixEnabled,
      filenameSuffix,
      concurrency,
      setConcurrency,
      preloadWarmup,
      previewBackground,
      setPreviewBackground,
      previewBackgroundColor,
      setPreviewBackgroundColor,
      previewBackgroundPosition,
      setPreviewBackgroundPosition,
      keyboardMode,
      setKeyboardMode,
      settingsVersion,
    };
  },
  {
    persist: {
      key: 'super-resolution-settings',
      afterHydrate: ({ store }) => {
        // v1 persisted only the custom text and prepended "-" in code. v2 makes
        // the leading separator part of the editable value, so migrate once.
        if (store.settingsVersion < 2) {
          const suffix = store.filenameSuffix.trim();
          if (suffix && !suffix.startsWith('-')) {
            store.filenameSuffix = `-${suffix}`;
          }
          store.settingsVersion = 2;
        }
        if ((store.previewBackground as string) === 'transparent') {
          store.previewBackground = 'mask';
        }
        store.concurrency = clampBatchConcurrency(store.concurrency);
      },
    },
  },
);

const MAX_RECORDS = 50;

// History records are only persisted while the user keeps the "persist history"
// setting enabled; the flag itself lives in the pinia settings store.
const conditionalHistoryStorage = {
  getItem(key: string): string | null {
    if (!useSettingsStore().historyPersist) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (!useSettingsStore().historyPersist) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage unavailable or quota exceeded - keep state in memory only
    }
  },
};

async function moveIntoHistoryScope(fromUrl: string, key: string): Promise<boolean> {
  if (await rekeyImage(fromUrl, key, 'history')) return true;
  try {
    const blob = await getImageBlob(fromUrl);
    return await persistImageBlob(key, blob, 'history');
  } catch {
    return false;
  }
}

async function persistHistoryThumbnail(recordId: string, source: Blob): Promise<boolean> {
  const thumbnail = await createThumbnailBlob(source);
  if (!thumbnail) return false;
  return persistImageBlob(historyImageKey(recordId, 'thumb'), thumbnail, 'history');
}

export const useHistoryStore = defineStore(
  'history',
  () => {
    const records = ref<HistoryRecord[]>([]);

    async function addRecord(params: {
      file: File;
      sourceBlob: Blob;
      originalUrl: string;
      resultUrl: string;
      originalSize: { width: number; height: number };
      resultSize: { width: number; height: number };
      modelId: string;
      modelName: string;
    }): Promise<HistoryRecord> {
      const record: HistoryRecord = {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        originalFileName: params.file.name,
        originalSize: params.originalSize,
        resultSize: params.resultSize,
        modelId: params.modelId,
        modelName: params.modelName,
      };

      if (useSettingsStore().historyPersist) {
        const originalKey = historyImageKey(record.id, 'original');
        const original =
          (await moveIntoHistoryScope(params.originalUrl, originalKey)) ||
          (await persistImageBlob(originalKey, params.sourceBlob, 'history'));
        const result = await moveIntoHistoryScope(
          params.resultUrl,
          historyImageKey(record.id, 'result'),
        );
        record.hasCache = original && result;
        record.hasThumbnail = await persistHistoryThumbnail(record.id, params.sourceBlob);
      }

      records.value.unshift(record);
      if (records.value.length > MAX_RECORDS) {
        const dropped = records.value.slice(MAX_RECORDS);
        records.value = records.value.slice(0, MAX_RECORDS);
        dropped.forEach((r) => void deleteHistoryImages(r.id));
      }

      return record;
    }

    function removeRecord(id: string) {
      records.value = records.value.filter((r) => r.id !== id);
      void deleteHistoryImages(id);
    }

    function clearHistory() {
      records.value = [];
      void clearHistoryScope();
    }

    function formatTimestamp(ts: number): string {
      const d = new Date(ts);
      const now = new Date();
      const diff = now.getTime() - d.getTime();

      if (diff < 60_000) return 'Just now';
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    return { records, addRecord, removeRecord, clearHistory, formatTimestamp };
  },
  {
    persist: {
      key: 'image-super-resolution-history',
      storage: conditionalHistoryStorage,
    },
  },
);

export const useModelStore = defineStore(
  'model',
  () => {
    const defaultModelId = ref<string>('real-esrgan-animevideov3');
    const favoriteModelIds = ref<string[]>([]);

    function setDefaultModel(id: string) {
      defaultModelId.value = id;
    }

    function toggleFavorite(id: string) {
      const ids = new Set(favoriteModelIds.value);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      favoriteModelIds.value = [...ids];
    }

    function isFavorite(id: string) {
      return favoriteModelIds.value.includes(id);
    }

    return { defaultModelId, setDefaultModel, favoriteModelIds, toggleFavorite, isFavorite };
  },
  { persist: { key: 'super-resolution-default-model' } },
);

// Tracks which models currently exist in the IndexedDB cache. This is the
// single source of truth for "does the user have a usable model yet" - the
// router uses it to gate the upload workspace, and the header reacts to it.
export const useModelCacheStore = defineStore('model-cache', () => {
  const cachedModelIds = ref<string[]>([]);
  const isReady = ref(false);

  const hasCachedModels = computed(() => cachedModelIds.value.length > 0);

  async function refresh() {
    const cached: string[] = [];
    await Promise.all(
      MODEL_REGISTRY.map(async (model) => {
        if (await isModelCached(model.id)) cached.push(model.id);
      }),
    );
    cachedModelIds.value = cached;
    isReady.value = true;
  }

  function setCached(id: string, cached: boolean) {
    const ids = new Set(cachedModelIds.value);
    if (cached) ids.add(id);
    else ids.delete(id);
    cachedModelIds.value = [...ids];
  }

  return { cachedModelIds, isReady, hasCachedModels, refresh, setCached };
});

// Persisted localStorage keys owned by the app stores.
const PERSISTED_KEYS = [
  'super-resolution-locale',
  'super-resolution-theme',
  'super-resolution-settings',
  'super-resolution-default-model',
  'image-super-resolution-history',
] as const;

// "Restore defaults": drop every persisted preference, wipe the history image
// cache, then reload so each store re-initializes from its default values.
// Downloaded models are intentionally kept to avoid forcing a re-download.
export function resetAllSettings(): void {
  for (const key of PERSISTED_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // storage unavailable - nothing to clear
    }
  }
  void clearImageStore();
  if (typeof window !== 'undefined') window.location.reload();
}
