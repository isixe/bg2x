<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
  originalUrl: string;
  resultUrl: string;
  height?: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
const sliderPosition = ref(50);
const isDragging = ref(false);

const resultClipStyle = computed(() => ({
  clipPath: `inset(0 0 0 ${sliderPosition.value}%)`,
}));

const handleStyle = computed(() => ({
  left: `${sliderPosition.value}%`,
}));

function handleSliderMove(clientX: number) {
  const el = containerRef.value;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return;

  const percentage = ((clientX - rect.left) / rect.width) * 100;
  sliderPosition.value = Math.min(100, Math.max(0, percentage));
}

function startDrag(clientX: number) {
  isDragging.value = true;
  handleSliderMove(clientX);
}

function onMouseDown(e: MouseEvent) {
  startDrag(e.clientX);
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;
  handleSliderMove(e.clientX);
}

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  if (!touch) return;
  startDrag(touch.clientX);
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value) return;
  e.preventDefault();
  const touch = e.touches[0];
  if (touch) handleSliderMove(touch.clientX);
}

function stopDrag() {
  isDragging.value = false;
}

function onKeydown(e: KeyboardEvent) {
  const step = e.shiftKey ? 10 : 2;
  let next: number | null = null;

  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
    next = sliderPosition.value - step;
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
    next = sliderPosition.value + step;
  } else if (e.key === 'Home') {
    next = 0;
  } else if (e.key === 'End') {
    next = 100;
  }

  if (next !== null) {
    e.preventDefault();
    sliderPosition.value = Math.min(100, Math.max(0, next));
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', stopDrag);
  window.addEventListener('touchcancel', stopDrag);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', stopDrag);
  window.removeEventListener('touchcancel', stopDrag);
});
</script>

<template>
  <div
    ref="containerRef"
    class="compare"
    :style="{ height: props.height ?? '320px' }"
    @mousedown="onMouseDown"
    @touchstart="onTouchStart"
  >
    <div class="image-layer">
      <img :src="originalUrl" :alt="t('processing.original')" draggable="false" />
    </div>

    <div class="image-layer result-layer" :style="resultClipStyle">
      <img :src="resultUrl" :alt="t('processing.result')" draggable="false" />
    </div>

    <span class="compare-label label-original">{{ t('processing.original') }}</span>
    <span class="compare-label label-result">{{ t('processing.result') }}</span>

    <div
      class="slider"
      :style="handleStyle"
      role="slider"
      tabindex="0"
      :aria-label="t('processing.compareHandle')"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(sliderPosition)"
      aria-orientation="horizontal"
      @mousedown.stop="onMouseDown"
      @touchstart.stop="onTouchStart"
      @keydown="onKeydown"
    >
      <span class="slider-line"></span>
      <span class="slider-knob">
        <span class="grip"></span>
        <span class="grip"></span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.compare {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius-md);
  background-color: var(--color-gray);
  background-image:
    linear-gradient(45deg, #e6e0da 25%, transparent 25%),
    linear-gradient(-45deg, #e6e0da 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e6e0da 75%),
    linear-gradient(-45deg, transparent 75%, #e6e0da 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  cursor: ew-resize;
}

.image-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-layer img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
}

.result-layer {
  background-color: var(--color-gray);
  background-image:
    linear-gradient(45deg, #e6e0da 25%, transparent 25%),
    linear-gradient(-45deg, #e6e0da 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e6e0da 75%),
    linear-gradient(-45deg, transparent 75%, #e6e0da 75%);
  background-size: 20px 20px;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0;
}

.compare-label {
  position: absolute;
  top: 8px;
  z-index: 5;
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.5;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 999px;
  pointer-events: none;
}

.label-original {
  left: 8px;
}

.label-result {
  right: 8px;
}

.slider {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 10;
  width: 80px;
  transform: translateX(-50%);
  cursor: ew-resize;
  touch-action: none;
  outline: none;
}

.slider:focus-visible .slider-knob {
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.3),
    0 0 0 3px rgba(212, 132, 62, 0.55);
}

.slider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: #fff;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
}

.slider-knob {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 32px;
  height: 32px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.grip {
  width: 2px;
  height: 12px;
  background: #9ca3af;
  border-radius: 1px;
}
</style>
