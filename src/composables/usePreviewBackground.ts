import { computed, ref } from 'vue';
import type { PreviewBackground } from '../type';
import { useSettingsStore, useThemeStore } from '../store/stores';
import { getPreviewBackgroundStyle, isLightPreviewBackground } from '../utils/previewBackground';

const backgroundImageUrl = ref<string | null>(null);

export function usePreviewBackground() {
  const settingsStore = useSettingsStore();
  const themeStore = useThemeStore();

  const hasImage = computed(() => backgroundImageUrl.value !== null);

  const activeBackground = computed<PreviewBackground>(() =>
    settingsStore.previewBackground === 'image' && !backgroundImageUrl.value
      ? 'transparent'
      : settingsStore.previewBackground,
  );

  const style = computed(() =>
    getPreviewBackgroundStyle(
      settingsStore.previewBackground,
      settingsStore.previewBackgroundColor,
      themeStore.isDark,
      backgroundImageUrl.value,
    ),
  );

  const isLight = computed(() =>
    isLightPreviewBackground(
      settingsStore.previewBackground,
      settingsStore.previewBackgroundColor,
      themeStore.isDark,
    ),
  );

  function releaseImage() {
    if (!backgroundImageUrl.value) return;
    URL.revokeObjectURL(backgroundImageUrl.value);
    backgroundImageUrl.value = null;
  }

  function setImage(file: File) {
    releaseImage();
    backgroundImageUrl.value = URL.createObjectURL(file);
    settingsStore.setPreviewBackground('image');
  }

  function clearImage() {
    releaseImage();
    if (settingsStore.previewBackground === 'image') {
      settingsStore.setPreviewBackground('transparent');
    }
  }

  return { activeBackground, hasImage, isLight, style, setImage, clearImage };
}
