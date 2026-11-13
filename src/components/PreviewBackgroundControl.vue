<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight, Image as ImageIcon, X } from 'lucide-vue-next';
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
    :title="t('preview.background')"
    @mousedown.stop
    @touchstart.stop
    @click.stop
  >
    <span class="control-hint" aria-hidden="true">
      <ChevronRight class="hint-icon" :stroke-width="3" />
    </span>

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
        class="swatch swatch-action"
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
        class="swatch swatch-action"
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

.pos-left {
  top: 0;
  bottom: 0;
  left: 0;
  width: 12px;
  align-items: center;
}

.pos-right {
  top: 0;
  bottom: 0;
  right: 0;
  width: 12px;
  align-items: center;
  justify-content: flex-end;
}

.pos-top {
  top: 0;
  left: 0;
  right: 0;
  height: 12px;
  align-items: flex-start;
  justify-content: center;
}

.pos-bottom {
  bottom: 0;
  left: 0;
  right: 0;
  height: 12px;
  align-items: flex-end;
  justify-content: center;
}

.control-hint {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(4px);
  pointer-events: none;
  opacity: 1;
  transition: opacity 0.2s ease;
}

.background-control:not(.is-light) .control-hint {
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
}

.background-control.is-light .control-hint {
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.5);
}

.pos-left .control-hint {
  left: 0;
  top: 50%;
  width: 14px;
  height: 44px;
  border-radius: 0 999px 999px 0;
  transform: translateY(-50%);
}

.pos-right .control-hint {
  right: 0;
  top: 50%;
  width: 14px;
  height: 44px;
  border-radius: 999px 0 0 999px;
  transform: translateY(-50%);
}

.pos-top .control-hint {
  top: 0;
  left: 50%;
  width: 44px;
  height: 14px;
  border-radius: 0 0 999px 999px;
  transform: translateX(-50%);
}

.pos-bottom .control-hint {
  bottom: 0;
  left: 50%;
  width: 44px;
  height: 14px;
  border-radius: 999px 999px 0 0;
  transform: translateX(-50%);
}

.pos-right .hint-icon {
  transform: rotate(180deg);
}

.pos-top .hint-icon {
  transform: rotate(90deg);
}

.pos-bottom .hint-icon {
  transform: rotate(-90deg);
}

.hint-icon {
  width: 10px;
  height: 10px;
}

.background-control:hover .control-hint,
.background-control:focus-within .control-hint {
  opacity: 0;
}

.control-panel {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(4px);
  transition: transform 0.2s ease-out;
}

.background-control:not(.is-light) .control-panel {
  background: rgba(255, 255, 255, 0.2);
}

.background-control.is-light .control-panel {
  background: rgba(0, 0, 0, 0.1);
}

.pos-left .control-panel,
.pos-right .control-panel {
  flex-direction: column;
}

.pos-top .control-panel,
.pos-bottom .control-panel {
  flex-direction: row;
}

.pos-left .control-panel {
  transform: translateX(calc(-100% - 8px));
}

.pos-right .control-panel {
  transform: translateX(calc(100% + 8px));
}

.pos-top .control-panel {
  transform: translateY(calc(-100% - 8px));
}

.pos-bottom .control-panel {
  transform: translateY(calc(100% + 8px));
}

.background-control:hover .control-panel,
.background-control:focus-within .control-panel {
  transform: translate(0);
}

.background-control.pos-left:hover .control-panel,
.background-control.pos-left:focus-within .control-panel {
  transform: translateX(12px);
}

.background-control.pos-right:hover .control-panel,
.background-control.pos-right:focus-within .control-panel {
  transform: translateX(-12px);
}

.background-control.pos-top:hover .control-panel,
.background-control.pos-top:focus-within .control-panel {
  transform: translateY(12px);
}

.background-control.pos-bottom:hover .control-panel,
.background-control.pos-bottom:focus-within .control-panel {
  transform: translateY(-12px);
}

.swatch {
  position: relative;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.swatch:hover {
  transform: scale(1.1);
}

.swatch:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}

.swatch.selected {
  outline: 2px solid #6366f1;
  outline-offset: 1px;
}

.swatch-transparent {
  background-color: #fff;
  border-color: rgba(0, 0, 0, 0.15);
  background-image:
    linear-gradient(45deg, #cbd5e1 25%, transparent 25%),
    linear-gradient(-45deg, #cbd5e1 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #cbd5e1 75%),
    linear-gradient(-45deg, transparent 75%, #cbd5e1 75%);
  background-size: 5px 5px;
  background-position:
    0 0,
    0 2.5px,
    2.5px -2.5px,
    -2.5px 0;
}

.swatch-black {
  background-color: #000;
  border-color: rgba(255, 255, 255, 0.25);
}

.swatch-white {
  background-color: #fff;
  border-color: rgba(0, 0, 0, 0.15);
}

.swatch-custom {
  overflow: hidden;
  border-color: rgba(0, 0, 0, 0.15);
}

/* plain icons: reset the global `button` chip background */
.swatch-action {
  background: transparent;
}

.swatch-action:hover {
  background: transparent;
}

.background-control:not(.is-light) .swatch-action {
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.background-control.is-light .swatch-action {
  border-color: rgba(0, 0, 0, 0.15);
  color: rgba(0, 0, 0, 0.7);
}

.color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 50%;
  opacity: 0;
  cursor: pointer;
}

.swatch-icon {
  width: 12px;
  height: 12px;
}

.file-input {
  display: none;
}

@media (hover: none) {
  .background-control .control-panel {
    transform: translate(0);
  }

  .background-control .control-hint {
    opacity: 0;
  }
}
</style>
