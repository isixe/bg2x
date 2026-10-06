<script setup lang="ts">
import { ref } from 'vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Settings,
  Info,
  Layers,
  ExternalLink,
  Github,
  Scale,
  Eraser,
  Images,
} from 'lucide-vue-next';
import { useLocaleStore, useSettingsStore } from '../store/stores';
import type { LocaleCode } from '../store/stores';
import Select from './ui/select/Select.vue';
import SelectContent from './ui/select/SelectContent.vue';
import SelectItem from './ui/select/SelectItem.vue';
import SelectTrigger from './ui/select/SelectTrigger.vue';
import SelectValue from './ui/select/SelectValue.vue';
import { APP_NAME, APP_VERSION, GITHUB_URL, LICENSE } from '../config/app';
import { RELATED_PROJECTS } from '../config/related';

type SettingsTab = 'general' | 'about' | 'related';

interface SettingsTabItem {
  id: SettingsTab;
  icon: Component;
  label: string;
}

const { t } = useI18n();
const localeStore = useLocaleStore();
const settingsStore = useSettingsStore();

const activeTab = ref<SettingsTab>('general');

const tabs: SettingsTabItem[] = [
  { id: 'general', icon: Settings, label: 'settings.tabGeneral' },
  { id: 'related', icon: Layers, label: 'settings.tabRelated' },
  { id: 'about', icon: Info, label: 'settings.tabAbout' },
];

const RELATED_ICONS: Record<string, Component> = {
  bgx: Eraser,
  imageDash: Images,
};

function onLanguageChange(value: string) {
  localeStore.setLocale(value as LocaleCode);
}
</script>

<template>
  <div class="settings-page">
    <aside class="settings-nav">
      <h1 class="settings-title">{{ t('settings.title') }}</h1>
      <nav class="settings-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="settings-tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" class="tab-icon" />
          <span>{{ t(tab.label) }}</span>
        </button>
      </nav>
    </aside>

    <div class="settings-content">
      <section v-if="activeTab === 'general'" class="settings-panel">
        <div class="settings-section">
          <h2 class="section-title">{{ t('settings.historySection') }}</h2>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">{{ t('settings.persistHistory') }}</span>
              <span class="setting-desc">{{ t('settings.persistHistoryDesc') }}</span>
            </div>
            <label class="toggle-switch">
              <input v-model="settingsStore.historyPersist" type="checkbox" />
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-section">
          <h2 class="section-title">{{ t('settings.language') }}</h2>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">{{ t('settings.language') }}</span>
              <span class="setting-desc">{{ t('settings.languageDesc') }}</span>
            </div>
            <Select :model-value="localeStore.locale" @update:model-value="onLanguageChange">
              <SelectTrigger class="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ja">日本語</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'about'" class="settings-panel">
        <div class="about-card">
          <img class="about-logo" src="/favicon.png" :alt="APP_NAME" />
          <div class="about-body">
            <div class="about-head">
              <h2 class="about-name">{{ APP_NAME }}</h2>
              <span class="about-version">v{{ APP_VERSION }}</span>
            </div>
            <p class="about-desc">{{ t('settings.aboutDesc') }}</p>
          </div>
        </div>

        <div class="link-list">
          <a class="link-item" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer">
            <Github class="link-icon" />
            <span class="link-label">{{ t('settings.viewOnGithub') }}</span>
            <ExternalLink class="link-ext" />
          </a>
          <div class="link-item static">
            <Info class="link-icon" />
            <span class="link-label">{{ t('settings.version') }}</span>
            <span class="link-value">{{ APP_VERSION }}</span>
          </div>
          <div class="link-item static">
            <Scale class="link-icon" />
            <span class="link-label">{{ t('settings.license') }}</span>
            <span class="link-value">{{ LICENSE }}</span>
          </div>
        </div>
      </section>

      <section v-else class="settings-panel">
        <p class="panel-desc">{{ t('settings.relatedDesc') }}</p>
        <div class="related-list">
          <a
            v-for="project in RELATED_PROJECTS"
            :key="project.name"
            class="related-item"
            :href="project.url"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="related-icon">
              <component :is="RELATED_ICONS[project.i18nKey] ?? Layers" />
            </span>
            <span class="related-body">
              <span class="related-name">{{ project.name }}</span>
              <span class="related-desc">{{ t(`settings.relatedItems.${project.i18nKey}`) }}</span>
            </span>
            <ExternalLink class="related-ext" />
          </a>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  flex: 1;
  display: flex;
  min-height: 0;
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
}

.settings-nav {
  width: 200px;
  flex-shrink: 0;
  padding: 2.5rem 1rem 2.5rem 2rem;
  border-right: var(--border-thin);
}

.settings-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0 0 1.5rem 0.75rem;
}

.settings-tabs {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.settings-tab {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: none;
  background: transparent;
  color: var(--color-gray-dark);
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.settings-tab:hover {
  background: rgba(212, 132, 62, 0.08);
  color: var(--color-dark);
}

.settings-tab.active {
  background: rgba(212, 132, 62, 0.12);
  color: var(--color-primary);
}

.settings-tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.tab-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.settings-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 2.5rem 2rem;
}

.settings-panel {
  max-width: 640px;
}

.settings-section {
  margin-bottom: 2rem;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-gray-dark);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 1rem;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  background: var(--color-card);
  border: var(--border-thin);
  border-radius: var(--radius-md);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  margin-right: 1rem;
}

.setting-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-dark);
}

.setting-desc {
  font-size: 0.75rem;
  color: var(--color-gray-dark);
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--color-gray);
  border-radius: 12px;
  transition: background 0.2s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.toggle-switch input:checked + .toggle-slider {
  background: var(--color-primary);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(20px);
}

.about-card {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  padding: 1.25rem;
  background: var(--color-card);
  border: var(--border-thin);
  border-radius: var(--radius-md);
  margin-bottom: 1.5rem;
}

.about-logo {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.about-body {
  min-width: 0;
}

.about-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.about-name {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0;
}

.about-version {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-primary);
  background: rgba(212, 132, 62, 0.12);
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
}

.about-desc {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--color-gray-dark);
  margin: 0;
}

.link-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-card);
  border: var(--border-thin);
  border-radius: var(--radius-md);
  color: var(--color-dark);
  text-decoration: none;
  font-size: 0.875rem;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

a.link-item:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.link-icon {
  width: 18px;
  height: 18px;
  color: var(--color-gray-dark);
  flex-shrink: 0;
}

.link-label {
  flex: 1;
}

.link-value {
  color: var(--color-gray-dark);
  font-size: 0.8125rem;
}

.link-ext {
  width: 14px;
  height: 14px;
  color: var(--color-gray-dark);
}

.panel-desc {
  font-size: 0.875rem;
  color: var(--color-gray-dark);
  margin: 0 0 1.25rem;
}

.related-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.related-item {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.875rem 1rem;
  background: var(--color-card);
  border: var(--border-thin);
  border-radius: var(--radius-md);
  text-decoration: none;
  transition: border-color 0.15s ease;
}

.related-item:hover {
  border-color: var(--color-primary);
}

.related-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: rgba(212, 132, 62, 0.1);
  color: var(--color-primary);
}

.related-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.related-body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
}

.related-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-dark);
}

.related-item:hover .related-name {
  color: var(--color-primary);
}

.related-desc {
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--color-gray-dark);
  margin: 0;
}

.related-ext {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-gray-dark);
}

@media (max-width: 768px) {
  .settings-page {
    flex-direction: column;
  }

  .settings-nav {
    width: 100%;
    padding: 1.5rem 1rem 0.5rem;
    border-right: none;
    border-bottom: var(--border-thin);
  }

  .settings-title {
    margin-left: 0.25rem;
  }

  .settings-tabs {
    flex-direction: row;
    overflow-x: auto;
    gap: 0.375rem;
  }

  .settings-tab {
    width: auto;
    flex-shrink: 0;
    padding: 0.5rem 0.75rem;
  }

  .settings-content {
    padding: 1.25rem 1rem;
  }
}
</style>
