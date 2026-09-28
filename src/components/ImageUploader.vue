<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const emit = defineEmits<{
  (e: 'files-selected', files: File[]): void;
}>();

const isDragging = ref(false);

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave() {
  isDragging.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;

  const files = Array.from(e.dataTransfer?.files || []);
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));

  if (imageFiles.length > 0) {
    emit('files-selected', imageFiles);
  }
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));

  if (imageFiles.length > 0) {
    emit('files-selected', imageFiles);
  }

  input.value = '';
}
</script>

<template>
  <div class="uploader">
    <div
      class="drop-zone"
      :class="{ 'is-dragging': isDragging }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div class="drop-zone-content">
        <svg
          class="upload-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17,8 12,3 7,8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p class="drop-text">{{ t('upload.dragDrop') }}</p>
        <p class="drop-subtext">{{ t('upload.orClick') }}</p>
        <input type="file" class="file-input" accept="image/*" multiple @change="handleFileInput" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.uploader {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.drop-zone {
  flex: 1;
  border: 2px dashed var(--color-border);
  background: var(--color-gray);
  padding: 2.5rem 1.5rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: var(--radius-lg);
  position: relative;
}

.drop-zone:hover,
.drop-zone.is-dragging {
  background: rgba(212, 132, 62, 0.08);
  border-color: var(--color-primary);
}

.drop-zone-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.upload-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 0.5rem;
  color: var(--color-gray-dark);
}

.drop-zone:hover .upload-icon,
.drop-zone.is-dragging .upload-icon {
  color: var(--color-primary);
}

.drop-text {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-dark);
}

.drop-subtext {
  font-size: 0.8125rem;
  color: var(--color-gray-dark);
}

.file-input {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
