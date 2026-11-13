<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePanZoom } from '../composables/usePanZoom';
import { useSettingsStore } from '../store/stores';

const { t } = useI18n();
const settingsStore = useSettingsStore();

defineProps<{
  originalUrl: string;
  resultUrl: string;
  height?: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
const { isPanning, transform } = usePanZoom(containerRef, { minScale: 0.25 });

const sliderPosition = ref(50);
const isDragging = ref(false);

const containerClass = computed(() => ({
  panning: isPanning.value,
}));

const resultClipStyle = computed(() => ({
  clipPath: `inset(0 0 0 ${sliderPosition.value}%)`,
}));

const handleStyle = computed(() => ({
  left: `${sliderPosition.value}%`,
}));

function blockPropagation(event: Event) {
  event.stopPropagation();
}

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

const SLIDER_HOLD_SPEED = 50;
const DOUBLE_PRESS_MS = 350;

let slideDirection = 0;
let slideFrame: number | null = null;
let lastFrameAt = 0;
let lastKey = '';
let lastKeyAt = 0;

function clampPosition(value: number) {
  sliderPosition.value = Math.min(100, Math.max(0, value));
}

function stepSlide(timestamp: number) {
  if (slideDirection === 0) {
    slideFrame = null;
    return;
  }
  if (lastFrameAt) {
    const delta = ((timestamp - lastFrameAt) / 1000) * SLIDER_HOLD_SPEED * slideDirection;
    clampPosition(sliderPosition.value + delta);
  }
  lastFrameAt = timestamp;
  slideFrame = window.requestAnimationFrame(stepSlide);
}

function startSliding(direction: number) {
  slideDirection = direction;
  if (slideFrame !== null) return;
  lastFrameAt = 0;
  slideFrame = window.requestAnimationFrame(stepSlide);
}

function stopSliding() {
  slideDirection = 0;
  if (slideFrame !== null) {
    window.cancelAnimationFrame(slideFrame);
    slideFrame = null;
  }
  lastFrameAt = 0;
}

function isDoublePress(key: string) {
  const now = window.performance.now();
  const repeated = key === lastKey && now - lastKeyAt < DOUBLE_PRESS_MS;
  lastKey = key;
  lastKeyAt = now;
  return repeated;
}

function isEditableTarget(target: unknown) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

function sliderKeys() {
  return settingsStore.keyboardMode === 'wasd'
    ? { left: 'a', right: 'd' }
    : { left: 'arrowleft', right: 'arrowright' };
}

function onKeydown(e: KeyboardEvent) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (isEditableTarget(e.target)) return;

  const key = e.key.toLowerCase();
  const { left, right } = sliderKeys();

  if (key === left || key === right) {
    e.preventDefault();
    const direction = key === left ? -1 : 1;
    if (e.repeat) {
      startSliding(direction);
      return;
    }
    if (isDoublePress(key)) {
      stopSliding();
      clampPosition(direction === -1 ? 0 : 100);
      return;
    }
    startSliding(direction);
    return;
  }

  if (key === 'home' || key === 'end') {
    e.preventDefault();
    stopSliding();
    clampPosition(key === 'home' ? 0 : 100);
  }
}

function onKeyup(e: KeyboardEvent) {
  const key = e.key.toLowerCase();
  const { left, right } = sliderKeys();
  if ((key === left && slideDirection === -1) || (key === right && slideDirection === 1)) {
    stopSliding();
  }
}

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', stopDrag);
  window.addEventListener('touchcancel', stopDrag);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keyup', onKeyup);
  window.addEventListener('blur', stopSliding);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend', stopDrag);
  window.removeEventListener('touchcancel', stopDrag);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('keyup', onKeyup);
  window.removeEventListener('blur', stopSliding);
  stopSliding();
});
</script>

<template>
  <div
    ref="containerRef"
    class="compare"
    :class="containerClass"
    :style="{ height: height ?? '320px' }"
  >
    <div class="image-layer" :style="{ transform }">
      <img :src="originalUrl" :alt="t('processing.original')" draggable="false" />
    </div>

    <div class="result-clip" :style="resultClipStyle">
      <div class="image-layer" :style="{ transform }">
        <img :src="resultUrl" :alt="t('processing.result')" draggable="false" />
      </div>
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
      @pointerdown="blockPropagation"
      @mousedown.stop="onMouseDown"
      @touchstart.stop="onTouchStart"
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
  /* no checkerboard: the dialog's semi-transparent mask shows through */
  background: transparent;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  cursor: grab;
}

.compare.panning {
  cursor: grabbing;
}

.image-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: 0 0;
  will-change: transform;
}

.image-layer img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  -webkit-user-drag: none;
}

.result-clip {
  position: absolute;
  inset: 0;
  /* transparent so the mask reads identically on both sides of the split */
  background: transparent;
}

/* labels sit at the bottom so they never collide with the preview header
   (which is absolutely positioned in the top-right corner) */
.compare-label {
  position: absolute;
  bottom: 8px;
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
