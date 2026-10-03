import { createRouter, createWebHistory, createMemoryHistory } from 'vue-router';
import HomePage from '../components/HomePage.vue';
import UploadWorkspace from '../components/UploadWorkspace.vue';
import HistoryView from '../components/HistoryView.vue';
import ModelsView from '../components/ModelsView.vue';
import SettingsView from '../components/SettingsView.vue';
import { pinia } from '../store/pinia';
import { useSettingsStore } from '../store/stores';

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

// The welcome page is only shown on the very first visit. On later visits an
// entry to the root path goes straight to the upload workspace, while the other
// routes are always honored.
let initialResolutionDone = false;

router.beforeEach((to) => {
  if (initialResolutionDone) return true;
  initialResolutionDone = true;

  const settings = useSettingsStore(pinia);
  if (to.name === 'home' && settings.hasVisited) {
    return { name: 'upload' };
  }
  if (!settings.hasVisited) {
    settings.markVisited();
  }
  return true;
});
