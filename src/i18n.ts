import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';

function getDefaultLocale(): string {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem('super-resolution-locale');
    if (saved === 'zh' || saved === 'en' || saved === 'ja') return saved;
  } catch {}
  return 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: { en, zh, ja },
});
