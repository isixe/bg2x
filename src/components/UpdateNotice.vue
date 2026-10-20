<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { Download, X } from 'lucide-vue-next';
import { IS_DESKTOP } from '../lib/desktop';
import { useUpdateCheck } from '../composables/useUpdateCheck';
import { useSettingsStore } from '../store/stores';
import { WEB_DOWNLOAD_URL } from '../config/app';

const { t } = useI18n();
const route = useRoute();
const settingsStore = useSettingsStore();
const { status, latestVersion, checkForUpdate } = useUpdateCheck();

const visible = computed(
  () =>
    IS_DESKTOP &&
    route.name !== 'settings' &&
    status.value === 'available' &&
    settingsStore.dismissedUpdateVersion !== latestVersion.value,
);

onMounted(() => {
  if (IS_DESKTOP && settingsStore.checkUpdatesOnLaunch) void checkForUpdate();
});

function dismiss() {
  settingsStore.dismissUpdate(latestVersion.value);
}
</script>

<template>
  <Transition name="notice">
    <div v-if="visible" class="update-notice" role="status">
      <span class="notice-icon"><Download :size="16" /></span>
      <div class="notice-body">
        <span class="notice-title">{{ t('update.available', { version: latestVersion }) }}</span>
        <span class="notice-desc">{{ t('update.desc') }}</span>
      </div>
      <a class="notice-action" :href="WEB_DOWNLOAD_URL" target="_blank" rel="noopener noreferrer">
        {{ t('update.action') }}
      </a>
      <button
        type="button"
        class="notice-close"
        :title="t('update.dismiss')"
        :aria-label="t('update.dismiss')"
        @click="dismiss"
      >
        <X :size="14" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.update-notice {
  position: fixed;
  right: 1.25rem;
  bottom: 1.25rem;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  max-width: min(26rem, calc(100vw - 2.5rem));
  padding: 0.625rem 0.625rem 0.625rem 0.75rem;
  background: var(--color-card);
  border: var(--border-thin);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.notice-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  color: var(--color-primary);
  background: rgba(212, 132, 62, 0.12);
  border-radius: var(--radius-md);
}

.notice-body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.notice-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-dark);
}

.notice-desc {
  font-size: 0.75rem;
  color: var(--color-gray-dark);
}

.notice-action {
  flex-shrink: 0;
  padding: 0.375rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
  border-radius: var(--radius-md);
  transition: background 0.15s ease;
}

.notice-action:hover {
  background: rgba(212, 132, 62, 0.1);
}

.notice-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
  color: var(--color-gray-dark);
  background: none;
  border-radius: var(--radius-sm);
}

.notice-close:hover {
  background: var(--color-gray);
}

.notice-enter-active,
.notice-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.notice-enter-from,
.notice-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
