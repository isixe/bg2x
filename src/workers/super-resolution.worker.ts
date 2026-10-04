/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web';
import type { WorkerMessage } from '../type';

ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;

let session: ort.InferenceSession | null = null;
let currentModelUrl: string | null = null;
let currentGpu = false;
/** Source used to build the current session; kept so we can rebuild it on CPU if GPU inference fails. */
let currentSource: string | ArrayBuffer | null = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'load-model':
      await loadModel(payload.modelUrl, payload.modelData, payload.gpu ?? false);
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

async function loadModel(modelUrl: string, modelData?: ArrayBuffer, gpu = false) {
  try {
    if (session && currentModelUrl === modelUrl && currentGpu === gpu) {
      self.postMessage({ type: 'model-loaded', payload: { modelUrl, gpu } });
      return;
    }

    self.postMessage({
      type: 'progress',
      payload: { progress: 0, status: 'Loading model...' },
    });

    const source = modelData ?? modelUrl;
    let effectiveGpu = gpu;

    try {
      session = await createSession(source, gpu);
    } catch (gpuError) {
      if (!gpu) throw gpuError;
      session = await createSession(source, false);
      effectiveGpu = false;
    }

    currentSource = source;
    currentModelUrl = modelUrl;
    currentGpu = effectiveGpu;

    self.postMessage({
      type: 'model-loaded',
      payload: { modelUrl, gpu: effectiveGpu },
    });
  } catch (error) {
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
