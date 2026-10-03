import { MODELS } from '../config/models';
import type { ModelEntry } from '../type';

export const MODEL_REGISTRY: ModelEntry[] = MODELS;

export function getModelById(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}
