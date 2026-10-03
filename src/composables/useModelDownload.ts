import type { FetchModelBytesOptions, ModelEntry } from '../type';

const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchModelBytes(
  model: ModelEntry,
  opts: FetchModelBytesOptions = {},
): Promise<ArrayBuffer> {
  const { signal, onProgress, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const urls = [...new Set([model.url, ...(model.urls ?? [])])];
  const errors: string[] = [];

  for (const url of urls) {
    try {
      return await fetchBytesFromUrl(url, { signal, onProgress, timeoutMs });
    } catch (err) {
      if (signal?.aborted) throw new DOMException('Download aborted', 'AbortError');
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  throw new Error(`All ${urls.length} mirror(s) failed: ${errors.join('; ')}`);
}

async function fetchBytesFromUrl(
  url: string,
  opts: { signal?: AbortSignal; onProgress?: (percent: number) => void; timeoutMs: number },
): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const contentLength = Number(resp.headers.get('content-length')) || 0;
    const reader = resp.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (contentLength > 0 && opts.onProgress) {
        opts.onProgress(Math.round((received / contentLength) * 100));
      }
    }

    const all = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    return all.buffer;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}
