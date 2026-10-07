/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web';
import type { WorkerMessage } from '../type';

// numThreads > 1 deadlocks InferenceSession.create() forever under Electron's
// app:// (Emscripten pthread pool race, microsoft/onnxruntime#26858): A/B tested
// 8 threads => stuck, 1 thread => loads. Browsers keep full multithreading.
const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron');
ort.env.wasm.numThreads = isElectron ? 1 : navigator.hardwareConcurrency || 4;
// Fail wasm backend init instead of hanging forever (0 = no timeout).
ort.env.wasm.initTimeout = 30_000;
console.log(
  `[worker] init numThreads=${ort.env.wasm.numThreads} electron=${isElectron} isolated=${typeof self !== 'undefined' && self.crossOriginIsolated}`,
);

// ── Tiling ────────────────────────────────────────────────────────────────────
// The whole image used to go through a single tensor, which blows past the
// wasm32 int32 tensor limits (SafeIntOnOverflow in safeint.h) for anything
// bigger than ~0.5MP and pins the GPU with a huge allocation. We now run the
// network over overlapping tiles and blend them back, so each inference stays
// small and safe regardless of input size. TILE_SIZE is a multiple of 64 (the
// granularity Swin2SR needs) so tiles stay aligned; the overlap is feathered so
// the seams are invisible.
const TILE_SIZE = 256;
// 16px of source overlap is enough for the feathered blend to hide seams while
// roughly halving the re-computed border pixels versus a 32px overlap
// ((256/240)² ≈ 1.14 vs (256/224)² ≈ 1.31 → ~13% fewer pixels overall).
const TILE_OVERLAP = 16;
const TILE_STEP = TILE_SIZE - TILE_OVERLAP;

// Rebuild the session on CPU if a single tile's inference does not settle in
// this window — guards against a dead GPU kernel / lost device that would
// otherwise leave the promise pending forever.
const INFER_TIMEOUT_MS = 300_000;

// The stitched native output is one RGBA buffer plus a canvas. Beyond these
// bounds browsers either refuse the canvas or OOM, so fail with a clear message
// instead of a cryptic runtime crash.
const MAX_OUTPUT_DIMENSION = 16_384;
const MAX_OUTPUT_PIXELS = 200_000_000;

class AbortError extends Error {
  constructor() {
    super('Processing aborted');
    this.name = 'AbortError';
  }
}

let session: ort.InferenceSession | null = null;
let currentModelId: string | null = null;
let currentGpu = false;
/** Source used to build the current session; kept so we can rebuild it on CPU if GPU inference fails. */
let currentSource: string | ArrayBuffer | null = null;

/** Set by an `abort` message; checked between tiles so cancellation is prompt. */
let abortRequested = false;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const message = e.data;

  switch (message.type) {
    case 'load-model':
      await loadModel(
        message.payload.modelId,
        message.payload.modelData,
        message.payload.gpu ?? false,
      );
      break;
    case 'process':
      await processImage(message.payload);
      break;
    case 'abort':
      abortRequested = true;
      break;
  }
};

function postProgress(progress: number, status: string) {
  self.postMessage({ type: 'progress', payload: { progress, status } });
}

async function createSession(source: string | ArrayBuffer, gpu: boolean) {
  const executionProviders = gpu ? ['webgpu'] : ['wasm'];

  if (typeof source === 'string') {
    return ort.InferenceSession.create(source, {
      executionProviders,
      graphOptimizationLevel: 'all',
    });
  }
  return ort.InferenceSession.create(new Uint8Array(source), {
    executionProviders,
    graphOptimizationLevel: 'all',
  });
}

async function loadModel(modelId: string, modelData: ArrayBuffer, gpu = false) {
  try {
    if (session && currentModelId === modelId && currentGpu === gpu) {
      self.postMessage({ type: 'model-loaded', payload: { modelId, gpu } });
      return;
    }

    postProgress(0, 'Loading model...');

    const source = modelData;
    let effectiveGpu = gpu;
    const t0 = performance.now();
    console.log(
      `[worker] createSession start gpu=${gpu} bytes=${source instanceof ArrayBuffer ? source.byteLength : 'url'}`,
    );

    try {
      session = await createSession(source, gpu);
    } catch (gpuError) {
      console.warn(`[worker] gpu session failed (${(performance.now() - t0) | 0}ms): ${gpuError}`);
      if (!gpu) throw gpuError;
      session = await createSession(source, false);
      effectiveGpu = false;
    }

    currentSource = source;
    currentModelId = modelId;
    currentGpu = effectiveGpu;

    console.log(
      `[worker] model loaded in ${(performance.now() - t0).toFixed(0)}ms gpu=${effectiveGpu}`,
    );
    self.postMessage({
      type: 'model-loaded',
      payload: { modelId, gpu: effectiveGpu },
    });
  } catch (error) {
    console.error(`[worker] model load failed: ${error}`);
    self.postMessage({
      type: 'error',
      payload: { message: `Failed to load model: ${error}` },
    });
  }
}

function assertOutputSize(w: number, h: number) {
  if (w > MAX_OUTPUT_DIMENSION || h > MAX_OUTPUT_DIMENSION || w * h > MAX_OUTPUT_PIXELS) {
    throw new Error(
      `Image too large: output would be ${w}×${h}px, exceeding the ` +
        `${MAX_OUTPUT_DIMENSION}px / ${Math.round(MAX_OUTPUT_PIXELS / 1_000_000)}MP limit`,
    );
  }
}

async function processImage(payload: {
  imageData: ImageData;
  width: number;
  height: number;
  scale: number;
  targetScale?: number;
}) {
  const { imageData, width, height, scale } = payload;
  const targetScale = payload.targetScale ?? scale;

  try {
    if (!session) {
      throw new Error('Model not loaded');
    }

    abortRequested = false;

    // When the requested output is smaller than the model's native scale, shrink
    // each tile right after inference and blend in that smaller space instead of
    // stitching a full native-size image and resampling it at the very end. The
    // stitched buffer shrinks by (scale / targetScale)² — e.g. 4× for 4x→2x.
    const rawFactor = scale / targetScale;
    const downsample = targetScale < scale && Number.isInteger(rawFactor);
    const blendScale = downsample ? targetScale : scale;
    const blendW = width * blendScale;
    const blendH = height * blendScale;
    const outW = width * targetScale;
    const outH = height * targetScale;
    assertOutputSize(blendW, blendH);
    if (outW !== blendW || outH !== blendH) assertOutputSize(outW, outH);

    postProgress(5, 'Preprocessing...');

    const outData = new Uint8ClampedArray(blendW * blendH * 4);

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const tilesX = Math.max(1, Math.ceil((width - TILE_OVERLAP) / TILE_STEP));
    const tilesY = Math.max(1, Math.ceil((height - TILE_OVERLAP) / TILE_STEP));
    const totalTiles = tilesX * tilesY;
    // Reused across tiles: safe because we always await the run before refilling.
    const tileBuffer = new Float32Array(3 * TILE_SIZE * TILE_SIZE);
    // Per-axis blend weights: tile 0 is full-weight, later tiles ramp in. Built
    // once per job and shared by every tile instead of reallocated per tile.
    const weights = buildBlendWeights(blendScale);

    let done = 0;
    for (let ty = 0; ty < tilesY; ty++) {
      const ay = ty === 0 ? weights.full : weights.ramp;
      for (let tx = 0; tx < tilesX; tx++) {
        if (abortRequested) throw new AbortError();

        const x0 = tx * TILE_STEP;
        const y0 = ty * TILE_STEP;

        postProgress(
          10 + Math.round((done / totalTiles) * 70),
          `Running inference... (${done + 1}/${totalTiles})`,
        );

        const refill = () => extractTile(imageData, x0, y0, tileBuffer);
        refill();
        const tileTensor = new ort.Tensor('float32', tileBuffer, [1, 3, TILE_SIZE, TILE_SIZE]);
        const tileOut = await runWithFallback(inputName, outputName, tileTensor, refill);
        const tileData = downsample
          ? downsampleTile(tileOut, TILE_SIZE * scale, rawFactor)
          : tileOut;
        const ax = tx === 0 ? weights.full : weights.ramp;
        blendTile(outData, tileData, x0, y0, blendW, blendH, blendScale, ax, ay);

        done++;
      }
    }

    postProgress(85, 'Postprocessing...');

    const stitchedImageData = new ImageData(outData, blendW, blendH);
    let resultCanvas: OffscreenCanvas | HTMLCanvasElement = new OffscreenCanvas(blendW, blendH);
    resultCanvas.getContext('2d')!.putImageData(stitchedImageData, 0, 0);

    if (outW !== blendW || outH !== blendH) {
      const scaledCanvas = new OffscreenCanvas(outW, outH);
      const scaledCtx = scaledCanvas.getContext('2d')!;
      scaledCtx.imageSmoothingEnabled = true;
      scaledCtx.imageSmoothingQuality = 'high';
      scaledCtx.drawImage(resultCanvas, 0, 0, outW, outH);
      resultCanvas = scaledCanvas;
    }

    postProgress(92, 'Creating result...');

    const blob = await resultCanvas.convertToBlob({ type: 'image/png' });
    const resultUrl = URL.createObjectURL(blob);

    self.postMessage({
      type: 'complete',
      payload: {
        resultUrl,
        size: { width: outW, height: outH },
      },
    });
  } catch (error) {
    if (error instanceof AbortError) {
      self.postMessage({ type: 'aborted', payload: { message: 'Processing cancelled' } });
    } else {
      self.postMessage({
        type: 'error',
        payload: { message: `Processing failed: ${error}` },
      });
    }
  } finally {
    abortRequested = false;
  }
}

/** Reject if `promise` does not settle within `ms` (used to fence dead GPU runs). */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Run one tile. If the active session is on GPU and the run throws or fails to
 * settle (lost device / stuck kernel), rebuild the session on WASM and retry the
 * same tile once before surfacing a hard error.
 */
async function runWithFallback(
  inputName: string,
  outputName: string,
  tensor: ort.Tensor,
  refill: () => void,
): Promise<Float32Array> {
  try {
    const results = await withTimeout(
      session!.run({ [inputName]: tensor }),
      INFER_TIMEOUT_MS,
      'Inference',
    );
    return results[outputName].data as Float32Array;
  } catch (error) {
    if (abortRequested) throw new AbortError();
    if (!currentGpu || !currentSource) throw error;

    self.postMessage({
      type: 'gpu-fallback',
      payload: { message: `GPU inference failed, falling back to CPU: ${error}` },
    });
    postProgress(10, 'GPU failed, retrying on CPU...');

    session = await createSession(currentSource, false);
    currentGpu = false;

    // The aborted GPU run may have partially written to the shared buffer.
    refill();
    const retry = await withTimeout(
      session.run({ [inputName]: tensor }),
      INFER_TIMEOUT_MS,
      'Inference',
    );
    return retry[outputName].data as Float32Array;
  }
}

/** Copy the TILE_SIZE×TILE_SIZE window at (x0, y0) into `out`, replicating edge pixels. */
function extractTile(imageData: ImageData, x0: number, y0: number, out: Float32Array) {
  const { data, width, height } = imageData;
  const plane = TILE_SIZE * TILE_SIZE;
  const inv = 1 / 255;

  // Interior tiles never read outside the image, so skip the per-pixel clamp.
  if (x0 + TILE_SIZE <= width && y0 + TILE_SIZE <= height) {
    for (let ly = 0; ly < TILE_SIZE; ly++) {
      let si = ((y0 + ly) * width + x0) * 4;
      let di = ly * TILE_SIZE;
      const diEnd = di + TILE_SIZE;
      for (; di < diEnd; di++, si += 4) {
        out[di] = data[si] * inv;
        out[plane + di] = data[si + 1] * inv;
        out[2 * plane + di] = data[si + 2] * inv;
      }
    }
    return;
  }

  for (let ly = 0; ly < TILE_SIZE; ly++) {
    const sy = Math.min(height - 1, Math.max(0, y0 + ly));
    const rowBase = sy * width;
    const outRow = ly * TILE_SIZE;
    for (let lx = 0; lx < TILE_SIZE; lx++) {
      const sx = Math.min(width - 1, Math.max(0, x0 + lx));
      const si = (rowBase + sx) * 4;
      const di = outRow + lx;
      out[di] = data[si] * inv;
      out[plane + di] = data[si + 1] * inv;
      out[2 * plane + di] = data[si + 2] * inv;
    }
  }
}

/**
 * Precompute the per-axis blend weights once per job. Only two profiles exist:
 * the first tile on an axis contributes fully (`full`), every later tile ramps
 * linearly across the overlap (`ramp`). Both axes share the same profile.
 */
function buildBlendWeights(blendScale: number) {
  const ow = TILE_SIZE * blendScale;
  const overlap = TILE_OVERLAP * blendScale;
  const full = new Float32Array(ow).fill(1);
  const ramp = new Float32Array(ow);
  for (let o = 0; o < ow; o++) {
    ramp[o] = Math.min(1, o / overlap);
  }
  return { full, ramp };
}

/** Box-filter one tile's RGB planes from (ow×ow) down to (ow/factor)². */
function downsampleTile(src: Float32Array, ow: number, factor: number): Float32Array {
  const owT = ow / factor;
  const planeSrc = ow * ow;
  const planeDst = owT * owT;
  const dst = new Float32Array(3 * planeDst);
  const inv = 1 / (factor * factor);

  for (let y = 0; y < owT; y++) {
    const sy0 = y * factor;
    for (let x = 0; x < owT; x++) {
      const sx0 = x * factor;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < factor; dy++) {
        let si = (sy0 + dy) * ow + sx0;
        for (let dx = 0; dx < factor; dx++, si++) {
          r += src[si];
          g += src[planeSrc + si];
          b += src[2 * planeSrc + si];
        }
      }
      const di = y * owT + x;
      dst[di] = r * inv;
      dst[planeDst + di] = g * inv;
      dst[2 * planeDst + di] = b * inv;
    }
  }
  return dst;
}

/**
 * Blend a tile's network output into the final buffer. Where tiles overlap the
 * contribution is feathered back in (linear ramp across TILE_OVERLAP), the first
 * tile along each axis always contributing fully. `ax`/`ay` are the precomputed
 * per-axis weights; `blendScale` maps source pixels to the destination buffer,
 * which is the native scale unless the output was downsampled first.
 */
function blendTile(
  out: Uint8ClampedArray,
  tile: Float32Array,
  x0: number,
  y0: number,
  destW: number,
  destH: number,
  blendScale: number,
  ax: Float32Array,
  ay: Float32Array,
) {
  const ow = TILE_SIZE * blendScale;
  const plane = ow * ow;
  const baseX = x0 * blendScale;
  const baseY = y0 * blendScale;

  for (let oy = 0; oy < ow; oy++) {
    const gy = baseY + oy;
    if (gy >= destH) break;
    const aY = ay[oy];
    const tileRow = oy * ow;
    for (let ox = 0; ox < ow; ox++) {
      const gx = baseX + ox;
      if (gx >= destW) break;

      const ti = tileRow + ox;
      const r = tile[ti] * 255;
      const g = tile[plane + ti] * 255;
      const b = tile[2 * plane + ti] * 255;
      const di = (gy * destW + gx) * 4;

      const a = aY * ax[ox];
      if (a >= 1) {
        out[di] = r;
        out[di + 1] = g;
        out[di + 2] = b;
      } else {
        const inv = 1 - a;
        out[di] = out[di] * inv + r * a;
        out[di + 1] = out[di + 1] * inv + g * a;
        out[di + 2] = out[di + 2] * inv + b * a;
      }
      out[di + 3] = 255;
    }
  }
}
