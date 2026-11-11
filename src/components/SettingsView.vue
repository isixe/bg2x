<script setup lang="ts">
import { computed, ref } from 'vue';
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
  Wrench,
  RefreshCw,
  Tag,
  Gauge,
} from 'lucide-vue-next';
import { resetAllSettings, useLocaleStore, useSettingsStore } from '../store/stores';
import type { ExportMode, LocaleCode } from '../store/stores';
import Select from './ui/select/Select.vue';
import SelectContent from './ui/select/SelectContent.vue';
import SelectItem from './ui/select/SelectItem.vue';
import SelectTrigger from './ui/select/SelectTrigger.vue';
import SelectValue from './ui/select/SelectValue.vue';
import { APP_NAME, APP_VERSION, GITHUB_URL, LICENSE, WEB_DOWNLOAD_URL } from '../config/app';
import { RELATED_PROJECTS } from '../config/related';
import { IS_DESKTOP } from '../lib/desktop';
import { useUpdateCheck } from '../composables/useUpdateCheck';
import { CONCURRENCY_OPTIONS, GPU_CONCURRENCY } from '../config/concurrency';

type SettingsTab = 'general' | 'performance' | 'about' | 'related';

interface SettingsTabItem {
  id: SettingsTab;
  icon: Component;
  label: string;
}

const { t } = useI18n();
const localeStore = useLocaleStore();
const settingsStore = useSettingsStore();
const { status: updateStatus, latestVersion, checkForUpdate } = useUpdateCheck();

const updateResult = computed(() => {
  if (updateStatus.value === 'latest') return t('settings.upToDate', { version: APP_VERSION });
  if (updateStatus.value === 'failed') return t('settings.checkFailed');
  if (updateStatus.value === 'available')
    return t('update.available', { version: latestVersion.value });
  return '';
});

const activeTab = ref<SettingsTab>('general');

const tabs: SettingsTabItem[] = [
  { id: 'general', icon: Settings, label: 'settings.tabGeneral' },
  { id: 'performance', icon: Gauge, label: 'settings.tabPerformance' },
  { id: 'related', icon: Layers, label: 'settings.tabRelated' },
  { id: 'about', icon: Info, label: 'settings.tabAbout' },
];

const RELATED_ICONS: Record<string, Component> = {
  bgx: Eraser,
  imageDash: Images,
  picnook: Wrench,
};

const failedLogos = ref<Record<string, boolean>>({});

function onLogoError(i18nKey: string) {
  failedLogos.value[i18nKey] = true;
}

function onLanguageChange(value: string) {
  localeStore.setLocale(value as LocaleCode);
}

function onExportModeChange(value: string) {
  settingsStore.setExportMode(value as ExportMode);
}

function onConcurrencyChange(value: string) {
  settingsStore.setConcurrency(Number(value));
}

const showResetConfirm = ref(false);

function confirmReset() {
  showResetConfirm.value = false;
  resetAllSettings();
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
          <h2 class="section-title">{{ t('settings.exportSection') }}</h2>
          <div class="setting-list">
            <div class="setting-item">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.exportMode') }}</span>
                <span class="setting-desc">{{ t('settings.exportModeDesc') }}</span>
              </div>
              <Select
                :model-value="settingsStore.exportMode"
                @update:model-value="onExportModeChange"
              >
                <SelectTrigger class="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aggregate">{{ t('settings.exportModeAggregate') }}</SelectItem>
                  <SelectItem value="source">{{ t('settings.exportModeSource') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="setting-item setting-item-stacked">
              <div class="setting-row">
                <div class="setting-info">
                  <span class="setting-label">{{ t('settings.suffixEnabled') }}</span>
                  <span class="setting-desc">{{ t('settings.suffixEnabledDesc') }}</span>
                </div>
                <label class="toggle-switch">
                  <input v-model="settingsStore.filenameSuffixEnabled" type="checkbox" />
                  <span class="toggle-slider"></span>
                </label>
              </div>
              <div class="suffix-control">
                <span class="setting-label">{{ t('settings.suffixLabel') }}</span>
                <input
                  v-model="settingsStore.filenameSuffix"
                  type="text"
                  class="text-input"
                  :placeholder="t('settings.suffixPlaceholder')"
                  :disabled="!settingsStore.filenameSuffixEnabled"
                />
              </div>
            </div>
          </div>
        </div>

        <div v-if="IS_DESKTOP" class="settings-section">
          <h2 class="section-title">{{ t('settings.updateSection') }}</h2>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">{{ t('settings.checkUpdates') }}</span>
              <span class="setting-desc">{{ t('settings.checkUpdatesDesc') }}</span>
            </div>
            <label class="toggle-switch">
              <input v-model="settingsStore.checkUpdatesOnLaunch" type="checkbox" />
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

        <div class="settings-section">
          <h2 class="section-title">{{ t('settings.resetSection') }}</h2>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">{{ t('settings.resetAll') }}</span>
              <span class="setting-desc">{{ t('settings.resetAllDesc') }}</span>
            </div>
            <button type="button" class="btn-reset" @click="showResetConfirm = true">
              {{ t('settings.resetAll') }}
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'performance'" class="settings-panel">
        <div class="settings-section">
          <h2 class="section-title">{{ t('settings.concurrencySection') }}</h2>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">{{ t('settings.concurrency') }}</span>
              <span class="setting-desc">{{ t('settings.concurrencyDesc') }}</span>
            </div>
            <Select
              :model-value="String(settingsStore.concurrency)"
              @update:model-value="onConcurrencyChange"
            >
              <SelectTrigger class="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="value in CONCURRENCY_OPTIONS"
                  :key="value"
                  :value="String(value)"
                >
                  {{ value }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">{{ t('settings.gpuConcurrency') }}</span>
              <span class="setting-desc">{{ t('settings.gpuConcurrencyDesc') }}</span>
            </div>
            <span class="setting-value">{{ GPU_CONCURRENCY }}</span>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'about'" class="settings-panel">
        <div class="about-card">
          <img class="about-logo" src="/favicon.png" :alt="APP_NAME" />
          <div class="about-body">
            <h2 class="about-name">{{ APP_NAME }}</h2>
            <p class="about-desc">{{ t('settings.aboutDesc') }}</p>
          </div>
        </div>

        <div class="link-list">
          <a class="link-item" :href="GITHUB_URL" target="_blank" rel="noopener noreferrer">
            <Github class="link-icon" />
            <span class="link-label">{{ t('settings.viewOnGithub') }}</span>
            <ExternalLink class="link-ext" />
          </a>
          <div class="version-card">
            <div class="version-head" :class="{ 'is-web': !IS_DESKTOP }">
              <Tag class="link-icon" />
              <div class="version-info">
                <span class="version-label">{{ t('settings.version') }}</span>
                <span class="version-value">v{{ APP_VERSION }}</span>
              </div>
              <button
                v-if="IS_DESKTOP"
                type="button"
                class="btn-check"
                :disabled="updateStatus === 'checking'"
                @click="checkForUpdate()"
              >
                <RefreshCw :size="14" :class="{ spinning: updateStatus === 'checking' }" />
                {{ updateStatus === 'checking' ? t('settings.checking') : t('settings.checkNow') }}
              </button>
            </div>
            <a
              v-if="updateStatus === 'available'"
              class="check-result is-update"
              :href="WEB_DOWNLOAD_URL"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ updateResult }}
            </a>
            <span v-else-if="updateResult" class="check-result">{{ updateResult }}</span>
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
              <img
                v-if="!failedLogos[project.i18nKey]"
                class="related-logo"
                :src="project.favicon"
                :alt="project.name"
                loading="lazy"
                crossorigin="anonymous"
                referrerpolicy="no-referrer"
                @error="onLogoError(project.i18nKey)"
              />
              <component :is="RELATED_ICONS[project.i18nKey] ?? Layers" v-else />
            </span>
            <span class="related-body">
              <span class="related-name">{{ project.name }}</span>
              <span class="related-desc">{{ t(`settings.relatedItems.${project.i18nKey}`) }}</span>
            </span>
            <ExternalLink class="related-ext" />
          </a>
        </div>
      </section>

      <Teleport to="body">
        <div
          v-if="showResetConfirm"
          class="reset-overlay"
          role="alertdialog"
          aria-modal="true"
          :aria-label="t('settings.resetConfirmTitle')"
          @click.self="showResetConfirm = false"
        >
          <div class="reset-dialog">
            <span class="reset-dialog-title">{{ t('settings.resetConfirmTitle') }}</span>
            <span class="reset-dialog-desc">{{ t('settings.resetConfirmDesc') }}</span>
            <div class="reset-dialog-actions">
              <button type="button" class="btn-cancel" @click="showResetConfirm = false">
                {{ t('settings.resetCancel') }}
              </button>
              <button type="button" class="btn-confirm" @click="confirmReset">
                {{ t('settings.resetConfirm') }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>
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

.setting-item + .setting-item {
  margin-top: 0.75rem;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  margin-right: 1rem;
}

.setting-value {
  min-width: 2.5rem;
  text-align: center;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-gray-dark);
}

.setting-item-stacked {
  flex-direction: column;
  align-items: stretch;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.suffix-control {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.75rem;
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

.setting-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.text-input {
  width: 160px;
  flex-shrink: 0;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-dark);
  background: var(--color-gray);
  border: var(--border-thin);
  border-radius: var(--radius-md);
  transition: border-color 0.15s ease;
}

.text-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.text-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.version-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-card);
  border: var(--border-thin);
  border-radius: var(--radius-md);
}

.version-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.version-info {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.version-head.is-web .version-info {
  justify-content: space-between;
}

.version-label {
  font-size: 0.875rem;
  color: var(--color-dark);
}

.version-value {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-gray-dark);
}

.btn-check {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-gray-dark);
  background: none;
  border: var(--border-thin);
  border-radius: var(--radius-md);
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.btn-check:hover:not(:disabled) {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn-check:disabled {
  cursor: default;
  opacity: 0.7;
}

.btn-check .spinning {
  animation: check-spin 0.9s linear infinite;
}

@keyframes check-spin {
  to {
    transform: rotate(360deg);
  }
}

.check-result {
  padding-left: 1.875rem;
  font-size: 0.75rem;
  color: var(--color-gray-dark);
}

.check-result.is-update {
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: none;
}

.check-result.is-update:hover {
  text-decoration: underline;
}

@media (prefers-reduced-motion: reduce) {
  .btn-check .spinning {
    animation: none;
  }
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

.about-name {
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0 0 0.5rem;
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
  color: var(--color-primary);
}

.related-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.related-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--radius-md);
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

.btn-reset {
  flex-shrink: 0;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-destructive);
  background: none;
  border: var(--border-thin);
  border-radius: var(--radius-md);
  transition:
    color 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.btn-reset:hover {
  color: var(--color-destructive-foreground);
  background: var(--color-destructive);
  border-color: var(--color-destructive);
}

.reset-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.5);
}

.reset-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: min(92vw, 400px);
  padding: 1.25rem;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.35);
}

.reset-dialog-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-dark);
}

.reset-dialog-desc {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--color-gray-dark);
}

.reset-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.btn-cancel,
.btn-confirm {
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border: var(--border-thin);
  border-radius: var(--radius-md);
  transition:
    color 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease;
}

.btn-cancel {
  color: var(--color-dark);
  background: var(--color-gray);
  border-color: var(--color-border);
}

.btn-cancel:hover {
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn-confirm {
  color: var(--color-destructive-foreground);
  background: var(--color-destructive);
  border-color: var(--color-destructive);
}

.btn-confirm:hover {
  opacity: 0.9;
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
