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
      <!-- Keep the upload workspace alive across route changes so an in-flight
           batch keeps processing in its Web Worker and restores exactly as left. -->
      <RouterView v-slot="{ Component }">
        <KeepAlive include="UploadWorkspace">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
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
