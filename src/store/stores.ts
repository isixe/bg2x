import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../locales/i18n';
import type { HistoryRecord } from '../type';
import { MODEL_REGISTRY } from '../composables/useModelRegistry';
import { isModelCached } from '../composables/useModelCache';
import {
  putHistoryImages,
  deleteHistoryImages,
  clearAllHistoryImages,
} from '../composables/useHistoryCache';

export type LocaleCode = 'en' | 'zh' | 'ja';
export type ThemeMode = 'light' | 'dark';

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

    function markVisited() {
      hasVisited.value = true;
    }

    function setHistoryPersist(enabled: boolean) {
      historyPersist.value = enabled;
    }

    return { hasVisited, markVisited, historyPersist, setHistoryPersist };
  },
  { persist: { key: 'super-resolution-settings' } },
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

async function createThumbnail(dataUrl: string, maxSize = 120): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function fileToThumbnail(file: File, maxSize = 120): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      resolve(await createThumbnail(dataUrl, maxSize));
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

export const useHistoryStore = defineStore(
  'history',
  () => {
    const records = ref<HistoryRecord[]>([]);

    async function addRecord(params: {
      file: File;
      originalSize: { width: number; height: number };
      resultSize: { width: number; height: number };
      modelId: string;
      modelName: string;
      resultUrl: string;
    }): Promise<HistoryRecord> {
      const originalThumb = await fileToThumbnail(params.file);
      const resultThumb = await createThumbnail(params.resultUrl);

      const record: HistoryRecord = {
        id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        originalFileName: params.file.name,
        originalSize: params.originalSize,
        resultSize: params.resultSize,
        modelId: params.modelId,
        modelName: params.modelName,
        originalDataUrl: originalThumb,
        resultDataUrl: resultThumb,
      };

      // Keep the full-resolution original/result in IndexedDB so the history
      // compare view stays sharp; the thumbs above stay as the fast fallback.
      try {
        const resultBlob = await (await fetch(params.resultUrl)).blob();
        await putHistoryImages(record.id, { original: params.file, result: resultBlob });
        record.hasCache = true;
      } catch {
        record.hasCache = false;
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
      void clearAllHistoryImages();
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
