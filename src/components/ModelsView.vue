<script setup lang="ts">
import ModelsSection from './ModelsSection.vue';
</script>

<template>
  <div class="models-view">
    <div class="models-panel">
      <ModelsSection />
    </div>
  </div>
</template>

<style scoped>
.models-view {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem;
  overflow-y: auto;
}

.models-panel {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

@media (max-width: 768px) {
  .models-view {
    padding: 1rem;
  }
}
</style>
