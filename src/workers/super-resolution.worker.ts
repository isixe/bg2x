/// <reference lib="webworker" />

import * as ort from 'onnxruntime-web';

ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;

type LoadModelMessage = {
  type: 'load-model';
  payload: { modelUrl: string; modelData?: ArrayBuffer };
};

type ProcessMessage = {
  type: 'process';
  payload: { imageData: ImageData; width: number; height: number; scale: number };
};

type WorkerMessage = LoadModelMessage | ProcessMessage;

let session: ort.InferenceSession | null = null;
let currentModelUrl: string | null = null;

self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'load-model':
      await loadModel(payload.modelUrl, payload.modelData);
      break;
    case 'process':
      await processImage(payload);
      break;
  }
};

async function loadModel(modelUrl: string, modelData?: ArrayBuffer) {
  try {
    if (session && currentModelUrl === modelUrl) {
      self.postMessage({ type: 'model-loaded' });
      return;
    }

    self.postMessage({
      type: 'progress',
      payload: { progress: 0, status: 'Loading model...' },
    });

    if (modelData) {
      session = await ort.InferenceSession.create(modelData, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    } else {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    }

    currentModelUrl = modelUrl;

    self.postMessage({
      type: 'model-loaded',
      payload: { modelUrl },
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
}) {
  const { imageData, width, height, scale } = payload;

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

    const results = await session.run({ [inputName]: inputTensor });
    const outputTensor = results[outputName];

    self.postMessage({
      type: 'progress',
      payload: { progress: 70, status: 'Postprocessing...' },
    });

    const outW = width * scale;
    const outH = height * scale;
    const outputData = postprocessOutput(outputTensor, outW, outH);

    self.postMessage({
      type: 'progress',
      payload: { progress: 90, status: 'Creating result...' },
    });

    const resultCanvas = new OffscreenCanvas(outW, outH);
    const ctx = resultCanvas.getContext('2d')!;
    const resultImageData = new ImageData(new Uint8ClampedArray(outputData), outW, outH);
    ctx.putImageData(resultImageData, 0, 0);

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
