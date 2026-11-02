<script setup lang="ts">
import { FolderOpen, Upload } from 'lucide-vue-next';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BatchInput } from '../type';
import { filesToBatchInputs, isImageFile } from '../lib/batchInput';

const { t } = useI18n();

const emit = defineEmits<{
  (e: 'files-selected', inputs: BatchInput[]): void;
}>();

const isDragging = ref(false);
const folderInput = ref<HTMLInputElement | null>(null);

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave() {
  isDragging.value = false;
}

function openFolderPicker() {
  folderInput.value?.click();
}

function readFileEntry(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

function readDirectoryEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const reader = dir.createReader();
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        },
        () => resolve(all),
      );
    };
    readBatch();
  });
}

async function walkDirectory(dir: FileSystemDirectoryEntry, prefix: string, out: BatchInput[]) {
  const children = await readDirectoryEntries(dir);
  for (const child of children) {
    if (child.isDirectory) {
      await walkDirectory(child as FileSystemDirectoryEntry, `${prefix}${child.name}/`, out);
    } else if (child.isFile) {
      const file = await readFileEntry(child as FileSystemFileEntry);
      if (file && isImageFile(file)) out.push({ file, relativePath: `${prefix}${file.name}` });
    }
  }
}

async function collectFromEntries(entries: FileSystemEntry[]): Promise<BatchInput[]> {
  const out: BatchInput[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      await walkDirectory(entry as FileSystemDirectoryEntry, '', out);
    } else if (entry.isFile) {
      const file = await readFileEntry(entry as FileSystemFileEntry);
      if (file && isImageFile(file)) out.push({ file, relativePath: null });
    }
  }
  return out;
}

async function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;

  const dt = e.dataTransfer;
  if (!dt) return;

  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry();
    if (entry) entries.push(entry);
  }

  const inputs =
    entries.length > 0
      ? await collectFromEntries(entries)
      : filesToBatchInputs(Array.from(dt.files || []), false);

  if (inputs.length > 0) emit('files-selected', inputs);
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const inputs = filesToBatchInputs(Array.from(input.files || []), false);
  if (inputs.length > 0) emit('files-selected', inputs);
  input.value = '';
}

function handleFolderInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const inputs = filesToBatchInputs(Array.from(input.files || []), true);
  if (inputs.length > 0) emit('files-selected', inputs);
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
        <Upload class="upload-icon" />
        <p class="drop-text">{{ t('upload.dragDrop') }}</p>
        <p class="drop-subtext">{{ t('upload.orClick') }}</p>
      </div>
      <input type="file" class="file-input" accept="image/*" multiple @change="handleFileInput" />
    </div>
    <button type="button" class="folder-btn" @click="openFolderPicker">
      <FolderOpen :size="15" />
      <span>{{ t('upload.selectFolder') }}</span>
    </button>
    <input
      ref="folderInput"
      type="file"
      webkitdirectory
      multiple
      hidden
      @change="handleFolderInput"
    />
  </div>
</template>

<style scoped>
.uploader {
  display: flex;
  flex-direction: column;
  /* Grow to fill the remaining height of the center column. */
  flex: 1;
  min-height: 0;
  gap: 0.75rem;
}

.drop-zone {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
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

/* Cover the whole drop zone (not just the centered text) so a click anywhere
   opens the picker. Sits above .drop-zone-content to catch the clicks. */
.file-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  opacity: 0;
  cursor: pointer;
}

.folder-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  align-self: center;
  padding: 0.5rem 0.875rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-dark);
  background: var(--color-gray);
  border-radius: var(--radius-md);
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.folder-btn:hover {
  background: var(--color-primary);
  color: #fff;
}

@media (max-width: 1023px) {
  /* Keep the empty state compact instead of letting the dropzone stretch
     across the whole viewport height. */
  .uploader {
    flex: none;
  }

  .drop-zone {
    flex: none;
    height: 240px;
    padding: 1.5rem 1.25rem;
  }
}
</style>
