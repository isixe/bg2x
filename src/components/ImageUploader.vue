<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const emit = defineEmits<{
  (e: 'image-selected', file: File): void;
  (e: 'images-selected', files: File[]): void;
}>();

const isDragging = ref(false);
const selectedFiles = ref<File[]>([]);
const previews = ref<string[]>([]);

const hasImages = computed(() => selectedFiles.value.length > 0);
const imageCount = computed(() => selectedFiles.value.length);

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
    addFiles(imageFiles);
  }
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  const imageFiles = files.filter((f) => f.type.startsWith('image/'));

  if (imageFiles.length > 0) {
    addFiles(imageFiles);
  }
}

function addFiles(files: File[]) {
  selectedFiles.value = [...selectedFiles.value, ...files];

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      previews.value.push(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  });

  if (files.length === 1) {
    emit('image-selected', files[0]);
  } else {
    emit('images-selected', files);
  }
}

function removeFile(index: number) {
  selectedFiles.value.splice(index, 1);
  previews.value.splice(index, 1);
}

function clearAll() {
  selectedFiles.value = [];
  previews.value = [];
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

    <div v-if="hasImages" class="preview-section">
      <div class="preview-header">
        <h3>{{ t('upload.selectedImages', { count: imageCount }) }}</h3>
        <button class="clear-btn" @click="clearAll">{{ t('upload.clearAll') }}</button>
      </div>

      <div class="preview-grid">
        <div v-for="(preview, index) in previews" :key="index" class="preview-item">
          <img :src="preview" :alt="`Preview ${index + 1}`" />
          <button class="remove-btn" @click="removeFile(index)">×</button>
          <div class="file-info">
            <span class="file-name">{{ selectedFiles[index].name }}</span>
            <span class="file-size">{{ formatFileSize(selectedFiles[index].size) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.uploader {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  height: 100%;
}

.drop-zone {
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

.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.preview-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-dark);
}

.clear-btn {
  background: var(--color-gray);
  color: var(--color-dark);
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: var(--radius-sm);
}

.clear-btn:hover {
  background: var(--color-border);
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  flex: 1;
  overflow-y: auto;
}

.preview-item {
  position: relative;
  background: var(--color-gray);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.preview-item:hover {
  box-shadow: var(--shadow-md);
}

.preview-item img {
  width: 100%;
  height: 100px;
  object-fit: cover;
  display: block;
}

.remove-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 1rem;
  line-height: 1;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.preview-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: var(--color-primary);
}

.file-info {
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  background: var(--color-card);
}

.file-name {
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-dark);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 0.625rem;
  color: var(--color-gray-dark);
}
</style>
