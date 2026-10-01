import type { ModelEntry } from '../config/models';
import { MODELS } from '../config/models';

export type { ModelEntry };

export const MODEL_REGISTRY: ModelEntry[] = MODELS;

export function getModelById(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

const DEFAULT_MODEL_KEY = 'super-resolution-default-model';

export function getDefaultModel(): ModelEntry {
  if (typeof window === 'undefined') return MODEL_REGISTRY[0];
  try {
    const saved = localStorage.getItem(DEFAULT_MODEL_KEY);
    if (saved) {
      const found = MODEL_REGISTRY.find((m) => m.id === saved);
      if (found) return found;
    }
  } catch {}
  return MODEL_REGISTRY[0];
}

export function setDefaultModel(id: string): void {
  try {
    localStorage.setItem(DEFAULT_MODEL_KEY, id);
  } catch {}
}
