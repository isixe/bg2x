<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, Copy, Download, X } from 'lucide-vue-next';
import CompareSlider from './CompareSlider.vue';
import { copyImage } from '../composables/useCopyImage';

const { t } = useI18n();

const props = defineProps<{
  item: {
    id: number | string;
    name: string;
    originalUrl: string;
    resultUrl: string | null;
    originalSize?: { width: number; height: number } | null;
    resultSize?: { width: number; height: number } | null;
  };
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const COPIED_DURATION = 1800;
const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

function resetCopied() {
  if (copiedTimer) {
    clearTimeout(copiedTimer);
    copiedTimer = null;
  }
  copied.value = false;
}

function download() {
  if (!props.item.resultUrl) return;
  const link = document.createElement('a');
  link.href = props.item.resultUrl;
  link.download = props.item.name
    ? props.item.name.replace(/(\.\w+)$/, '-upscaled$1')
    : 'upscaled-image.png';
  link.click();
}

async function copy() {
  if (!props.item.resultUrl) return;
  const ok = await copyImage(props.item.resultUrl);
  if (!ok) return;
  resetCopied();
  copied.value = true;
  copiedTimer = setTimeout(() => {
    copied.value = false;
    copiedTimer = null;
  }, COPIED_DURATION);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  document.body.style.overflow = 'hidden';
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
  resetCopied();
});
</script>

<template>
  <Teleport to="body">
    <div
      class="preview-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="item.name"
      @click.self="emit('close')"
    >
      <div class="preview-dialog">
        <div class="preview-header">
          <div class="preview-info">
            <span class="preview-name" :title="item.name">{{ item.name }}</span>
            <span class="preview-size">
              {{ item.originalSize?.width }}×{{ item.originalSize?.height }} →
              {{ item.resultSize?.width }}×{{ item.resultSize?.height }}
            </span>
          </div>
          <div class="preview-actions">
            <button
              class="preview-icon-btn"
              :title="t('processing.download')"
              :aria-label="t('processing.download')"
              @click="download"
            >
              <Download />
            </button>
            <button
              class="preview-icon-btn"
              :class="{ copied: copied }"
              :title="copied ? t('processing.copied') : t('processing.copy')"
              :aria-label="copied ? t('processing.copied') : t('processing.copy')"
              @click="copy"
            >
              <Copy v-if="!copied" aria-hidden="true" />
              <Check v-else aria-hidden="true" />
            </button>
            <button
              class="preview-icon-btn"
              :title="t('processing.close')"
              :aria-label="t('processing.close')"
              @click="emit('close')"
            >
              <X />
            </button>
          </div>
        </div>

        <div class="preview-body">
          <CompareSlider
            :key="item.id"
            :original-url="item.originalUrl"
            :result-url="item.resultUrl ?? ''"
            height="100%"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.65);
}

.preview-dialog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: min(96vw, 1600px);
  height: min(92vh, 1100px);
  padding: 1rem;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.35);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-shrink: 0;
}

.preview-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.preview-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-dark);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-size {
  font-size: 0.6875rem;
  color: var(--color-gray-dark);
}

.preview-actions {
  display: flex;
  gap: 0.375rem;
  flex-shrink: 0;
}

.preview-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  /* override global `button` padding, otherwise the icon gets squeezed to 0 width */
  padding: 0;
  line-height: 1;
  border-radius: var(--radius-md);
  background: var(--color-gray);
  color: var(--color-gray-dark);
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.15s ease;
}

.preview-icon-btn:hover {
  background: var(--color-border);
  color: var(--color-primary);
}

.preview-icon-btn:active {
  transform: scale(0.9);
}

.preview-icon-btn:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}

/* copy succeeded: swap to the check icon and highlight the button */
.preview-icon-btn.copied,
.preview-icon-btn.copied:hover {
  background: var(--color-secondary);
  color: var(--color-light);
}

.preview-icon-btn.copied svg {
  animation: dialog-copy-pop 0.28s ease;
}

@keyframes dialog-copy-pop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  60% {
    transform: scale(1.12);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.preview-icon-btn svg {
  width: 16px;
  height: 16px;
}

.preview-body {
  flex: 1;
  min-height: 0;
}
</style>
