import type { App } from 'vue';
import { i18n } from '../locales/i18n';
import { pinia } from '../store/pinia';
import { router } from '../router/router';
import { useHistoryStore, useLocaleStore, useSettingsStore } from '../store/stores';
import type { LocaleCode } from '../store/stores';
import { pruneImageStore } from '../utils/imageStore';

export default (app: App) => {
  app.use(pinia);
  app.use(i18n);
  app.use(router);

  // "Persist history" is off by default: history records and their cached images
  // live for the current session only, so wipe the previous session's blobs on entry.
  const settingsStore = useSettingsStore(pinia);
  const historyStore = useHistoryStore(pinia);
  if (settingsStore.historyPersist) {
    void historyStore.reconcileHistory();
  } else {
    historyStore.clearHistory();
  }

  void pruneImageStore();

  // Rehydrate the persisted locale into vue-i18n before the app renders.
  const localeStore = useLocaleStore(pinia);
  i18n.global.locale.value = localeStore.locale as LocaleCode;
};
