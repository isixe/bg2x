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

let session: ort.InferenceSession | null = null;
let currentModelId: string | null = null;
let currentGpu = false;
/** Source used to build the current session; kept so we can rebuild it on CPU if GPU inference fails. */
let currentSource: string | ArrayBuffer | null = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'load-model':
      await loadModel(payload.modelId, payload.modelData, payload.gpu ?? false);
      break;
    case 'process':
      await processImage(payload);
      break;
  }
};

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

    self.postMessage({
      type: 'progress',
      payload: { progress: 0, status: 'Loading model...' },
    });

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

    self.postMessage({
      type: 'progress',
      payload: { progress: 10, status: 'Preprocessing...' },
    });

    const inputTensor = preprocessImage(imageData);

    self.postMessage({
      type: 'progress',
      payload: { progress: 30, status: 'Running inference...' },
    });

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    let outputTensor: ort.Tensor;
    try {
      const results = await session.run({ [inputName]: inputTensor });
      outputTensor = results[outputName];
    } catch (inferenceError) {
      // WebGPU can fail at runtime (e.g. a kernel cannot allocate its output)
      // even when the session was created successfully. Rebuild on WASM and
      // retry the same inference once before surfacing a hard error.
      if (!currentGpu || !currentSource) throw inferenceError;

      self.postMessage({
        type: 'gpu-fallback',
        payload: { message: `GPU inference failed, falling back to CPU: ${inferenceError}` },
      });
      self.postMessage({
        type: 'progress',
        payload: { progress: 30, status: 'GPU failed, retrying on CPU...' },
      });

      session = await createSession(currentSource, false);
      currentGpu = false;

      const retryInput = preprocessImage(imageData);
      const retryResults = await session.run({ [inputName]: retryInput });
      outputTensor = retryResults[outputName];
    }

    self.postMessage({
      type: 'progress',
      payload: { progress: 70, status: 'Postprocessing...' },
    });

    const nativeW = width * scale;
    const nativeH = height * scale;
    const outputData = postprocessOutput(outputTensor, nativeW, nativeH);

    self.postMessage({
      type: 'progress',
      payload: { progress: 90, status: 'Creating result...' },
    });

    const nativeCanvas = new OffscreenCanvas(nativeW, nativeH);
    const nativeCtx = nativeCanvas.getContext('2d')!;
    nativeCtx.putImageData(
      new ImageData(new Uint8ClampedArray(outputData), nativeW, nativeH),
      0,
      0,
    );

    const outW = width * targetScale;
    const outH = height * targetScale;

    let resultCanvas: OffscreenCanvas | HTMLCanvasElement = nativeCanvas;
    if (outW !== nativeW || outH !== nativeH) {
      const scaledCanvas = new OffscreenCanvas(outW, outH);
      const scaledCtx = scaledCanvas.getContext('2d')!;
      scaledCtx.imageSmoothingEnabled = true;
      scaledCtx.imageSmoothingQuality = 'high';
      scaledCtx.drawImage(nativeCanvas, 0, 0, outW, outH);
      resultCanvas = scaledCanvas;
    }

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
    self.postMessage({
      type: 'error',
      payload: { message: `Processing failed: ${error}` },
    });
  }
}

function preprocessImage(imageData: ImageData): ort.Tensor {
  const { data, width, height } = imageData;

  const float32Data = new Float32Array(3 * height * width);

  for (let i = 0; i < height * width; i++) {
    float32Data[i] = data[i * 4] / 255.0;
    float32Data[height * width + i] = data[i * 4 + 1] / 255.0;
    float32Data[2 * height * width + i] = data[i * 4 + 2] / 255.0;
  }

  return new ort.Tensor('float32', float32Data, [1, 3, height, width]);
}

function postprocessOutput(
  tensor: ort.Tensor,
  outputWidth: number,
  outputHeight: number,
): Uint8ClampedArray {
  const data = tensor.data as Float32Array;
  const output = new Uint8ClampedArray(outputWidth * outputHeight * 4);

  for (let i = 0; i < outputWidth * outputHeight; i++) {
    output[i * 4] = Math.min(255, Math.max(0, data[i] * 255));
    output[i * 4 + 1] = Math.min(255, Math.max(0, data[outputWidth * outputHeight + i] * 255));
    output[i * 4 + 2] = Math.min(255, Math.max(0, data[2 * outputWidth * outputHeight + i] * 255));
    output[i * 4 + 3] = 255;
  }

  return output;
}
