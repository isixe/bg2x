import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from './i18n';

export const useLocaleStore = defineStore(
  'locale',
  () => {
    const locale = ref<string>(i18n.global.locale.value);

    function setLocale(lang: string) {
      locale.value = lang;
      i18n.global.locale.value = lang as 'en' | 'zh' | 'ja';
    }

    const localeLabel = computed(() => {
      const labels: Record<string, string> = { en: 'English', zh: '中文', ja: '日本語' };
      return labels[locale.value] ?? locale.value;
    });

    return { locale, setLocale, localeLabel };
  },
  { persist: { key: 'super-resolution-locale' } },
);

export interface HistoryRecord {
  id: string;
  timestamp: number;
  originalFileName: string;
  originalSize: { width: number; height: number };
  resultSize: { width: number; height: number };
  modelId: string;
  modelName: string;
  originalDataUrl: string;
  resultDataUrl: string;
  resultBlobUrl?: string;
}

const MAX_RECORDS = 50;

const HISTORY_PERSIST_FLAG = 'history-persist';

function isHistoryPersistEnabled(): boolean {
  try {
    return localStorage.getItem(HISTORY_PERSIST_FLAG) === 'true';
  } catch {
    return false;
  }
}

const conditionalHistoryStorage = {
  getItem(key: string): string | null {
    if (!isHistoryPersistEnabled()) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    if (!isHistoryPersistEnabled()) return;
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
        resultBlobUrl: params.resultUrl,
      };

      records.value.unshift(record);
      if (records.value.length > MAX_RECORDS) {
        records.value = records.value.slice(0, MAX_RECORDS);
      }

      return record;
    }

    function removeRecord(id: string) {
      records.value = records.value.filter((r) => r.id !== id);
    }

    function clearHistory() {
      records.value = [];
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

    function setDefaultModel(id: string) {
      defaultModelId.value = id;
    }

    return { defaultModelId, setDefaultModel };
  },
  { persist: { key: 'super-resolution-default-model' } },
);
