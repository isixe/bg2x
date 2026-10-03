<script setup lang="ts">
import { RouterView } from 'vue-router';
import AppHeader from './AppHeader.vue';
import { useThemeStore } from '../store/stores';

const themeStore = useThemeStore();
themeStore.applyToDocument();
</script>

<template>
  <div class="app-layout">
    <AppHeader />
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--color-background);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
