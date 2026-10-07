import type { App } from 'vue';
import { i18n } from '../locales/i18n';
import { pinia } from '../store/pinia';
import { router } from '../router/router';
import { useLocaleStore, useSettingsStore } from '../store/stores';
import type { LocaleCode } from '../store/stores';
import { clearAllHistoryImages } from '../composables/useHistoryCache';

export default (app: App) => {
  app.use(pinia);
  app.use(i18n);
  app.use(router);

  // History is transient while "persist history" is off: drop any full-resolution
  // image cache left in IndexedDB from a previous session on entry.
  const settingsStore = useSettingsStore(pinia);
  if (!settingsStore.historyPersist) {
    void clearAllHistoryImages();
  }

  // Rehydrate the persisted locale into vue-i18n before the app renders.
  const localeStore = useLocaleStore(pinia);
  i18n.global.locale.value = localeStore.locale as LocaleCode;
};
