import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import HomePage from '../components/HomePage.vue';
import UploadWorkspace from '../components/UploadWorkspace.vue';
import HistoryView from '../components/HistoryView.vue';
import ModelsView from '../components/ModelsView.vue';
import SettingsView from '../components/SettingsView.vue';
import { pinia } from '../store/pinia';
import { useModelCacheStore, useSettingsStore } from '../store/stores';

export const router = createRouter({
  history: typeof window === 'undefined' ? createMemoryHistory() : createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/upload', name: 'upload', component: UploadWorkspace },
    { path: '/history', name: 'history', component: HistoryView },
    { path: '/models', name: 'models', component: ModelsView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/:pathMatch(.*)*', redirect: { name: 'home' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  // Client-only SPA: never redirect during SSR so the static shells prerender
  // without touching IndexedDB.
  if (typeof window === 'undefined') return true;

  const settings = useSettingsStore(pinia);
  if (!settings.hasVisited) settings.markVisited();

  const modelCache = useModelCacheStore(pinia);
  if (!modelCache.isReady) {
    await modelCache.refresh();
  }

  if (modelCache.hasCachedModels) {
    if (to.name === 'home') return { name: 'upload' };
  } else if (to.name === 'upload') {
    return { name: 'home' };
  }
  return true;
});
