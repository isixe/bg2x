import { MODELS, MODEL_GROUPS } from '../config/models';
import type { ModelEntry } from '../type';

export const MODEL_REGISTRY: ModelEntry[] = MODELS;

export interface ModelGroupView {
  key: string;
  descKey?: string;
  models: ModelEntry[];
}

export function getModelById(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function sortModelsByFavorites(favoriteIds: string[]): ModelEntry[] {
  const favorites = new Set(favoriteIds);
  return [...MODELS].sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
}

export function groupModelsForDisplay(favoriteIds: string[]): ModelGroupView[] {
  const favorites = new Set(favoriteIds);
  const groups: ModelGroupView[] = [];

  const favoriteModels = sortModelsByFavorites(favoriteIds).filter((m) => favorites.has(m.id));
  if (favoriteModels.length > 0) {
    groups.push({ key: 'models.favorites', models: favoriteModels });
  }

  for (const group of MODEL_GROUPS) {
    const models = MODELS.filter((m) => m.group === group.id && !favorites.has(m.id));
    if (models.length > 0) {
      groups.push({ key: group.nameKey, descKey: group.descKey, models });
    }
  }

  return groups;
}
