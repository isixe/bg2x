import type { App } from 'vue';
import { i18n } from '../locales/i18n';
import { pinia } from '../store/pinia';
import { router } from '../router/router';
import { useLocaleStore } from '../store/stores';
import type { LocaleCode } from '../store/stores';

export default (app: App) => {
  app.use(pinia);
  app.use(i18n);
  app.use(router);

  // Rehydrate the persisted locale into vue-i18n before the app renders.
  const localeStore = useLocaleStore(pinia);
  i18n.global.locale.value = localeStore.locale as LocaleCode;
};
