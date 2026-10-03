<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useLocaleStore, useSettingsStore } from '../store/stores';
import type { LocaleCode } from '../store/stores';
import Select from './ui/select/Select.vue';
import SelectContent from './ui/select/SelectContent.vue';
import SelectItem from './ui/select/SelectItem.vue';
import SelectTrigger from './ui/select/SelectTrigger.vue';
import SelectValue from './ui/select/SelectValue.vue';

const { t } = useI18n();
const localeStore = useLocaleStore();
const settingsStore = useSettingsStore();

function onLanguageChange(value: string) {
  localeStore.setLocale(value as LocaleCode);
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-header">
      <h1>{{ t('settings.title') }}</h1>
      <p class="settings-subtitle">{{ t('settings.subtitle') }}</p>
    </div>

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
  </div>
</template>

<style scoped>
.settings-page {
  flex: 1;
  overflow-y: auto;
  max-width: 640px;
  margin: 0 auto;
  padding: 2.5rem 2rem;
  width: 100%;
}

.settings-header {
  margin-bottom: 2.5rem;
}

.settings-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0 0 0.375rem;
}

.settings-subtitle {
  font-size: 0.875rem;
  color: var(--color-gray-dark);
  margin: 0;
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

@media (max-width: 768px) {
  .settings-page {
    padding: 1.5rem 1rem;
  }
}
</style>
