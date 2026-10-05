import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue';

interface Point {
  x: number;
  y: number;
}

interface PinchStart {
  distance: number;
  midX: number;
  midY: number;
  scale: number;
  tx: number;
  ty: number;
}

export interface PanZoomOptions {
  minScale?: number;
  maxScale?: number;
  wheelSensitivity?: number;
}

// Requires the target element to use transform-origin: 0 0.
export function usePanZoom(containerRef: Ref<HTMLElement | null>, options: PanZoomOptions = {}) {
  const minScale = options.minScale ?? 1;
  const maxScale = options.maxScale ?? 8;
  const wheelSensitivity = options.wheelSensitivity ?? 0.0015;

  const scale = ref(1);
  const tx = ref(0);
  const ty = ref(0);
  const isPanning = ref(false);

  const transform = computed(
    () => `translate3d(${tx.value}px, ${ty.value}px, 0) scale(${scale.value})`,
  );

  const pointers = new Map<number, Point>();
  let panStart: Point = { x: 0, y: 0 };
  let panOrigin: Point = { x: 0, y: 0 };
  let pinchStart: PinchStart | null = null;

  function measure(): DOMRect | null {
    return containerRef.value?.getBoundingClientRect() ?? null;
  }

  function clampScale(value: number): number {
    return Math.min(maxScale, Math.max(minScale, value));
  }

  function zoomAt(anchorX: number, anchorY: number, nextScale: number) {
    const clamped = clampScale(nextScale);
    const ratio = clamped / scale.value;
    tx.value = anchorX - (anchorX - tx.value) * ratio;
    ty.value = anchorY - (anchorY - ty.value) * ratio;
    scale.value = clamped;
  }

  function onWheel(event: WheelEvent) {
    const rect = measure();
    if (!rect) return;
    event.preventDefault();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const factor = Math.exp(-event.deltaY * wheelSensitivity);
    zoomAt(anchorX, anchorY, scale.value * factor);
  }

  function beginPan(point: Point) {
    panStart = point;
    panOrigin = { x: tx.value, y: ty.value };
    isPanning.value = true;
  }

  function beginPinch() {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    pinchStart = {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      scale: scale.value,
      tx: tx.value,
      ty: ty.value,
    };
    isPanning.value = false;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    containerRef.value?.setPointerCapture?.(event.pointerId);

    if (pointers.size === 2) {
      beginPinch();
    } else if (pointers.size === 1) {
      beginPan({ x: event.clientX, y: event.clientY });
    }
  }

  function onPointerMove(event: PointerEvent) {
    const tracked = pointers.get(event.pointerId);
    if (!tracked) return;
    tracked.x = event.clientX;
    tracked.y = event.clientY;

    if (pointers.size >= 2) {
      if (!pinchStart) return;
      const [a, b] = [...pointers.values()];
      if (!a || !b) return;
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const nextScale = clampScale(pinchStart.scale * (distance / (pinchStart.distance || 1)));
      const ratio = nextScale / pinchStart.scale;
      tx.value = midX - ratio * (pinchStart.midX - pinchStart.tx);
      ty.value = midY - ratio * (pinchStart.midY - pinchStart.ty);
      scale.value = nextScale;
      return;
    }

    if (pointers.size === 1 && isPanning.value) {
      tx.value = panOrigin.x + (event.clientX - panStart.x);
      ty.value = panOrigin.y + (event.clientY - panStart.y);
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    containerRef.value?.releasePointerCapture?.(event.pointerId);

    if (pointers.size === 0) {
      isPanning.value = false;
      pinchStart = null;
      return;
    }

    // Dropping from a pinch back to a single finger continues as a pan.
    pinchStart = null;
    const [remaining] = [...pointers.values()];
    if (remaining) beginPan(remaining);
  }

  onMounted(() => {
    const el = containerRef.value;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  });

  onUnmounted(() => {
    const el = containerRef.value;
    el?.removeEventListener('wheel', onWheel);
    el?.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    pointers.clear();
  });

  return { scale, tx, ty, isPanning, transform, onWheel };
}
