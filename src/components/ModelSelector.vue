<script setup lang="ts">
import { MODEL_REGISTRY } from '../composables/useModelRegistry';

defineProps<{
  selectedModelId: string;
}>();

const emit = defineEmits<{
  (e: 'update:selectedModelId', id: string): void;
}>();

function selectModel(id: string) {
  emit('update:selectedModelId', id);
}
</script>

<template>
  <div class="model-selector">
    <label class="selector-label">Model</label>
    <div class="model-options">
      <button
        v-for="model in MODEL_REGISTRY"
        :key="model.id"
        class="model-option"
        :class="{ active: model.id === selectedModelId }"
        @click="selectModel(model.id)"
      >
        <span class="model-name">{{ model.name }}</span>
        <span class="model-desc">{{ model.description }}</span>
        <span class="model-scale">{{ model.scale }}x</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.model-selector {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.selector-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-gray-dark);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.model-options {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.model-option {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 0.125rem 0.5rem;
  padding: 0.625rem 0.75rem;
  background: var(--color-gray);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.model-option:hover {
  background: var(--color-border);
}

.model-option.active {
  border-color: var(--color-primary);
  background: rgba(212, 132, 62, 0.08);
}

.model-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-dark);
}

.model-desc {
  font-size: 0.6875rem;
  color: var(--color-gray-dark);
  grid-column: 1;
}

.model-scale {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-primary);
  grid-row: 1 / 3;
  align-self: center;
}
</style>
