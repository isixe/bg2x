<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Image as ImageIcon, X } from 'lucide-vue-next';
import { usePreviewBackground } from '../composables/usePreviewBackground';
import { useSettingsStore } from '../store/stores';
import type { PreviewBackground } from '../type';

const { t } = useI18n();
const settingsStore = useSettingsStore();
const { activeBackground, hasImage, isLight, setImage, clearImage } = usePreviewBackground();

const fileInput = ref<HTMLInputElement | null>(null);

const SWATCHES = [
  { mode: 'transparent', label: 'preview.backgroundTransparent' },
  { mode: 'black', label: 'preview.backgroundBlack' },
  { mode: 'white', label: 'preview.backgroundWhite' },
] as const;

function pick(mode: PreviewBackground) {
  settingsStore.setPreviewBackground(mode);
}

function onColorInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  settingsStore.setPreviewBackgroundColor(value);
  settingsStore.setPreviewBackground('custom');
}

function onImageChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) setImage(file);
  input.value = '';
}
</script>

<template>
  <div
    class="background-control"
    :class="[`pos-${settingsStore.previewBackgroundPosition}`, { 'is-light': isLight }]"
    role="group"
    :aria-label="t('preview.background')"
    @mousedown.stop
    @touchstart.stop
    @click.stop
  >
    <div class="control-panel">
      <button
        v-for="swatch in SWATCHES"
        :key="swatch.mode"
        type="button"
        class="swatch"
        :class="[`swatch-${swatch.mode}`, { selected: activeBackground === swatch.mode }]"
        :aria-pressed="activeBackground === swatch.mode"
        :aria-label="t(swatch.label)"
        :title="t(swatch.label)"
        @click="pick(swatch.mode)"
      ></button>

      <label
        class="swatch swatch-custom"
        :class="{ selected: activeBackground === 'custom' }"
        :title="t('preview.backgroundCustom')"
        :style="{ backgroundColor: settingsStore.previewBackgroundColor }"
        @click="pick('custom')"
      >
        <input
          type="color"
          class="color-input"
          :value="settingsStore.previewBackgroundColor"
          :aria-label="t('preview.backgroundCustom')"
          @input="onColorInput"
        />
      </label>

      <button
        type="button"
        class="swatch swatch-icon-btn"
        :class="{ selected: activeBackground === 'image' }"
        :aria-pressed="activeBackground === 'image'"
        :aria-label="t('preview.backgroundImage')"
        :title="t('preview.backgroundImage')"
        @click="fileInput?.click()"
      >
        <ImageIcon class="swatch-icon" />
      </button>

      <button
        v-if="hasImage"
        type="button"
        class="swatch swatch-icon-btn"
        :aria-label="t('preview.backgroundImageClear')"
        :title="t('preview.backgroundImageClear')"
        @click="clearImage"
      >
        <X class="swatch-icon" />
      </button>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="file-input"
        @change="onImageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.background-control {
  position: absolute;
  z-index: 30;
  display: flex;
}

.pos-top {
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
}

.pos-bottom {
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
}

.pos-left {
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
}

.pos-right {
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
}

.control-panel {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.5);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
  opacity: 0.45;
  transition: opacity 0.2s ease;
}

.background-control:hover .control-panel,
.background-control:focus-within .control-panel {
  opacity: 1;
}

.background-control.is-light .control-panel {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.6);
}

.swatch {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 50%;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}

.swatch:hover {
  transform: scale(1.12);
}

.swatch.selected {
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.9);
}

.swatch-transparent {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 75%, #cbd5e1 75%),
    linear-gradient(45deg, #cbd5e1 25%, transparent 25%, transparent 75%, #cbd5e1 75%);
  background-size: 6px 6px;
  background-position:
    0 0,
    3px 3px;
}

.swatch-black {
  background-color: #000;
}

.swatch-white {
  background-color: #fff;
}

.swatch-custom {
  overflow: hidden;
}

.swatch-icon-btn {
  background-color: rgba(255, 255, 255, 0.75);
  color: #374151;
}

.color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  opacity: 0;
  cursor: pointer;
}

.swatch-icon {
  width: 11px;
  height: 11px;
}

.file-input {
  display: none;
}
</style>
