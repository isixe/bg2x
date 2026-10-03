<script setup lang="ts">
import ModelsSection from './ModelsSection.vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Image as ImageIcon, Upload } from 'lucide-vue-next';

const router = useRouter();
const { t } = useI18n();

function goToUpload() {
  router.push({ name: 'upload' });
}
</script>

<template>
  <div class="home-view">
    <div class="home-content">
      <!-- Welcome Section -->
      <div class="welcome-section">
        <div class="welcome-icon">
          <ImageIcon :stroke-width="1.5" />
        </div>
        <h1 class="welcome-title">{{ t('home.title') }}</h1>
        <p class="welcome-desc">{{ t('home.desc') }}</p>
        <button class="welcome-cta" @click="goToUpload">
          <Upload :size="18" />
          {{ t('home.getStarted') }}
        </button>
      </div>

      <!-- Models Section -->
      <ModelsSection show-more />
    </div>
  </div>
</template>

<style scoped>
.home-view {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 2rem;
  overflow-y: auto;
}

.home-content {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Welcome Section */
.welcome-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem 1rem 1rem;
}

.welcome-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(212, 132, 62, 0.1);
  border-radius: 16px;
  margin-bottom: 1.25rem;
}

.welcome-icon svg {
  width: 36px;
  height: 36px;
  color: var(--color-primary);
}

.welcome-title {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-dark);
  margin: 0 0 0.5rem;
}

.welcome-desc {
  font-size: 0.9375rem;
  color: var(--color-gray-dark);
  margin: 0 0 1.5rem;
  max-width: 420px;
  line-height: 1.6;
}

.welcome-cta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: var(--color-primary);
  color: white;
  font-size: 0.9375rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  transition: all 0.2s ease;
}

.welcome-cta:hover {
  background: var(--color-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
</style>
