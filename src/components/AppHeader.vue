<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Clock,
  Home,
  Layers,
  Settings,
  Upload,
  Sun,
  Moon,
  Languages,
  Github,
} from 'lucide-vue-next';
import { useLocaleStore, useModelCacheStore, useThemeStore } from '../store/stores';
import type { LocaleCode } from '../store/stores';
import DropdownMenu from './ui/dropdown-menu/DropdownMenu.vue';
import DropdownMenuContent from './ui/dropdown-menu/DropdownMenuContent.vue';
import DropdownMenuItem from './ui/dropdown-menu/DropdownMenuItem.vue';
import DropdownMenuTrigger from './ui/dropdown-menu/DropdownMenuTrigger.vue';

const LOCALE_OPTIONS: { value: LocaleCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
];

const { t } = useI18n();
const route = useRoute();
const localeStore = useLocaleStore();
const themeStore = useThemeStore();
const modelCacheStore = useModelCacheStore();

const navItems = computed(() => {
  const items = [
    { name: 'home', to: { name: 'home' }, icon: Home, label: 'nav.home' },
    { name: 'upload', to: { name: 'upload' }, icon: Upload, label: 'nav.upload' },
    { name: 'models', to: { name: 'models' }, icon: Layers, label: 'nav.models' },
    { name: 'history', to: { name: 'history' }, icon: Clock, label: 'nav.history' },
    { name: 'settings', to: { name: 'settings' }, icon: Settings, label: 'nav.settings' },
  ] as const;
  return items.filter((item) => item.name !== 'home' || !modelCacheStore.hasCachedModels);
});

const modelRequiredVisible = ref(false);
let modelRequiredTimer: ReturnType<typeof setTimeout> | undefined;

function showModelRequired() {
  modelRequiredVisible.value = true;
  if (modelRequiredTimer) clearTimeout(modelRequiredTimer);
  modelRequiredTimer = setTimeout(() => (modelRequiredVisible.value = false), 3000);
}

onUnmounted(() => {
  if (modelRequiredTimer) clearTimeout(modelRequiredTimer);
});

const themeActionKey = computed(() =>
  themeStore.isDark ? 'action.theme.light' : 'action.theme.dark',
);

function isActive(name: string) {
  return route.name === name;
}

function setLocale(value: string) {
  localeStore.setLocale(value as LocaleCode);
}

watch(
  () => localeStore.locale,
  (lang) => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  },
  { immediate: true },
);
</script>

<template>
  <header class="app-header">
    <RouterLink :to="{ name: 'home' }" class="header-logo">
      <img src="/favicon.png" alt="bg2x" class="logo-img" />
      <span class="logo-text">bg2x</span>
    </RouterLink>
    <div class="header-end">
      <nav class="header-nav" aria-label="Main">
        <template v-for="item in navItems" :key="item.name">
          <button
            v-if="item.name === 'upload' && !modelCacheStore.hasCachedModels"
            type="button"
            class="nav-item"
            :title="t(item.label)"
            :aria-label="t(item.label)"
            @click="showModelRequired"
          >
            <component :is="item.icon" />
          </button>
          <RouterLink
            v-else
            :to="item.to"
            class="nav-item"
            :class="{ active: isActive(item.name) }"
            :title="t(item.label)"
            :aria-label="t(item.label)"
          >
            <component :is="item.icon" />
          </RouterLink>
        </template>
      </nav>
      <div class="header-actions">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <button
              type="button"
              class="icon-btn"
              :title="t('action.language')"
              :aria-label="t('action.language')"
            >
              <Languages />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="min-w-[8rem]">
            <DropdownMenuItem
              v-for="opt in LOCALE_OPTIONS"
              :key="opt.value"
              :class="{ 'font-semibold text-primary': localeStore.locale === opt.value }"
              @select="setLocale(opt.value)"
            >
              {{ opt.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          class="icon-btn theme-btn"
          :title="t(themeActionKey)"
          :aria-label="t(themeActionKey)"
          @click="themeStore.toggle()"
        >
          <Moon class="icon-moon" />
          <Sun class="icon-sun" />
        </button>
        <a
          class="icon-btn"
          href="https://github.com/isixe/bg2x"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('action.github')"
          :aria-label="t('action.github')"
        >
          <Github />
        </a>
      </div>
    </div>

    <Transition name="header-toast">
      <div v-if="modelRequiredVisible" class="header-toast" role="status">
        {{ t('models.downloadRequired') }}
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  height: 56px;
  padding: 0 1.5rem;
  background: var(--color-sidebar, #faf5ee);
  border-bottom: var(--border-thin);
}

.header-logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.9375rem;
  min-width: 0;
}

.logo-img {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  object-fit: contain;
}

.logo-text {
  color: var(--color-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-end {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding-left: 0.5rem;
  margin-left: 0.25rem;
  border-left: var(--border-thin);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  /* override the global `button` fill/padding so it reads as an icon button */
  padding: 0;
  background: transparent;
  text-decoration: none;
  color: var(--color-gray-dark);
  border-radius: var(--radius-md);
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.icon-btn :global(svg) {
  width: 18px;
  height: 18px;
}

.icon-btn:hover {
  background: rgba(212, 132, 62, 0.1);
  color: var(--color-primary);
}

.theme-btn :global(.icon-sun) {
  display: none;
}

html.dark .theme-btn :global(.icon-sun) {
  display: block;
}

html.dark .theme-btn :global(.icon-moon) {
  display: none;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  /* override the global `button` fill/padding so the upload entry reads as an icon */
  padding: 0;
  background: transparent;
  border-radius: var(--radius-md);
  color: var(--color-gray-dark);
  text-decoration: none;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.nav-item svg {
  width: 18px;
  height: 18px;
}

.nav-item:hover {
  background: rgba(212, 132, 62, 0.1);
  color: var(--color-primary);
}

.nav-item.active {
  background: var(--color-primary);
  color: #fff;
}

.header-toast {
  position: fixed;
  top: 68px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  padding: 0.5rem 0.875rem;
  background: var(--color-dark);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  pointer-events: none;
}

.header-toast-enter-active,
.header-toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.header-toast-enter-from,
.header-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -0.5rem);
}

@media (max-width: 640px) {
  .app-header {
    padding: 0 1rem;
  }

  .logo-text {
    display: none;
  }
}
</style>
