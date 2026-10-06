<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { Apple, Download, ExternalLink, Monitor, Package, Terminal } from 'lucide-vue-next';
import { GITHUB_LATEST_RELEASE_API, GITHUB_RELEASES_URL } from '../config/app';

const { t } = useI18n();

type OsKey = 'windows' | 'macos' | 'linux' | 'unknown';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface DownloadFile {
  key: string;
  labelKey: string;
  url: string;
  size: number;
  icon: Component;
}

const loading = ref(true);
const failed = ref(false);
const version = ref('');
const releaseUrl = ref(GITHUB_RELEASES_URL);
const files = ref<DownloadFile[]>([]);
const os = ref<OsKey>('unknown');

function detectOs(): OsKey {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();
  if (ua.includes('win') || platform.includes('win')) return 'windows';
  if (ua.includes('mac') || platform.includes('mac')) return 'macos';
  if (ua.includes('linux') || ua.includes('x11') || platform.includes('linux')) return 'linux';
  return 'unknown';
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFiles(assets: ReleaseAsset[]): DownloadFile[] {
  const pick = (pattern: RegExp) => assets.find((asset) => pattern.test(asset.name));
  const result: DownloadFile[] = [];
  const add = (key: string, labelKey: string, icon: Component, asset?: ReleaseAsset) => {
    if (!asset) return;
    result.push({ key, labelKey, icon, url: asset.browser_download_url, size: asset.size });
  };
  add('windows', 'action.downloadWindows', Monitor, pick(/\.exe$/i));
  add('macos', 'action.downloadMacos', Apple, pick(/\.dmg$/i) ?? pick(/\.zip$/i));
  add('linux', 'action.downloadLinux', Terminal, pick(/\.AppImage$/i));
  add('debian', 'action.downloadDebian', Package, pick(/\.deb$/i));
  return result;
}

async function loadRelease() {
  loading.value = true;
  failed.value = false;
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      assets?: ReleaseAsset[];
    };
    version.value = data.tag_name ?? '';
    if (data.html_url) releaseUrl.value = data.html_url;
    files.value = buildFiles(data.assets ?? []);
  } catch {
    failed.value = true;
    files.value = [];
  } finally {
    loading.value = false;
  }
}

const recommended = computed(() => {
  if (os.value === 'unknown') return null;
  return files.value.find((file) => file.key === os.value) ?? null;
});

const others = computed(() => files.value.filter((file) => file.key !== recommended.value?.key));

onMounted(() => {
  os.value = detectOs();
  loadRelease();
});
</script>

<template>
  <div class="download-page">
    <header class="download-header">
      <h1 class="download-title">{{ t('download.title') }}</h1>
      <p class="download-subtitle">{{ t('download.subtitle') }}</p>
    </header>

    <div v-if="loading" class="download-state">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ t('download.loading') }}</span>
    </div>

    <div v-else-if="failed" class="download-state">
      <p class="download-error">{{ t('download.error') }}</p>
      <div class="state-actions">
        <button type="button" class="btn-secondary" @click="loadRelease">
          {{ t('download.retry') }}
        </button>
        <a class="btn-secondary" :href="releaseUrl" target="_blank" rel="noopener noreferrer">
          {{ t('download.viewAll') }}
        </a>
      </div>
    </div>

    <template v-else>
      <p v-if="version" class="download-version">
        {{ t('download.version') }} <span class="version-tag">{{ version }}</span>
      </p>

      <a
        v-if="recommended"
        class="recommend-card"
        :href="recommended.url"
        rel="noopener noreferrer"
      >
        <span class="recommend-icon">
          <component :is="recommended.icon" />
        </span>
        <span class="recommend-body">
          <span class="recommend-tag">{{ t('download.recommended') }}</span>
          <span class="recommend-label">{{ t(recommended.labelKey) }}</span>
        </span>
        <span v-if="formatSize(recommended.size)" class="item-size">
          {{ formatSize(recommended.size) }}
        </span>
        <Download class="item-arrow" />
      </a>
      <p v-else class="download-note">{{ t('download.noDetection') }}</p>

      <section v-if="others.length" class="other-section">
        <h2 class="other-title">{{ t('download.otherPlatforms') }}</h2>
        <div class="download-list">
          <a
            v-for="file in others"
            :key="file.key"
            class="download-item"
            :href="file.url"
            rel="noopener noreferrer"
          >
            <span class="item-icon">
              <component :is="file.icon" />
            </span>
            <span class="item-label">{{ t(file.labelKey) }}</span>
            <span v-if="formatSize(file.size)" class="item-size">{{ formatSize(file.size) }}</span>
            <Download class="item-arrow" />
          </a>
        </div>
      </section>

      <a class="all-releases" :href="releaseUrl" target="_blank" rel="noopener noreferrer">
        {{ t('download.viewAll') }}
        <ExternalLink class="all-icon" />
      </a>
    </template>
  </div>
</template>

<style scoped>
.download-page {
  flex: 1;
  overflow-y: auto;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: 2.5rem 2rem;
}

.download-header {
  margin-bottom: 2rem;
}

.download-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0 0 0.375rem;
}

.download-subtitle {
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--color-gray-dark);
  margin: 0;
}

.download-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 1rem;
  color: var(--color-gray-dark);
  font-size: 0.875rem;
}

.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--color-gray);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: download-spin 0.8s linear infinite;
}

@keyframes download-spin {
  to {
    transform: rotate(360deg);
  }
}

.download-error {
  margin: 0;
}

.state-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  padding: 0.5rem 0.875rem;
  background: var(--color-card);
  border: var(--border-thin);
  border-radius: var(--radius-md);
  color: var(--color-dark);
  font-size: 0.8125rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}

.btn-secondary:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.download-version {
  font-size: 0.8125rem;
  color: var(--color-gray-dark);
  margin: 0 0 1rem;
}

.version-tag {
  font-weight: 600;
  color: var(--color-primary);
}

.recommend-card {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  background: rgba(212, 132, 62, 0.1);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  text-decoration: none;
  transition:
    background 0.15s ease,
    transform 0.15s ease;
}

.recommend-card:hover {
  background: rgba(212, 132, 62, 0.16);
  transform: translateY(-1px);
}

.recommend-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: var(--color-card);
  color: var(--color-primary);
}

.recommend-icon :deep(svg) {
  width: 22px;
  height: 22px;
}

.recommend-body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
}

.recommend-tag {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-primary);
}

.recommend-label {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-dark);
}

.download-note {
  font-size: 0.8125rem;
  color: var(--color-gray-dark);
  margin: 0;
}

.other-section {
  margin-top: 2rem;
}

.other-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-gray-dark);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.75rem;
}

.download-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.download-item {
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

.download-item:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background: rgba(212, 132, 62, 0.1);
  color: var(--color-primary);
}

.item-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.item-label {
  flex: 1;
  min-width: 0;
}

.item-size {
  font-size: 0.75rem;
  color: var(--color-gray-dark);
}

.item-arrow {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-gray-dark);
}

.all-releases {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 1.5rem;
  color: var(--color-gray-dark);
  font-size: 0.8125rem;
  text-decoration: none;
}

.all-releases:hover {
  color: var(--color-primary);
}

.all-icon {
  width: 14px;
  height: 14px;
}

@media (max-width: 768px) {
  .download-page {
    padding: 1.5rem 1rem;
  }
}
</style>
