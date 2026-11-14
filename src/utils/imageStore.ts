// blob: URL 只在该文档内有效，浏览器在内存压力或长时间挂起后会丢弃其底层数据，
// 再次访问就得到 net::ERR_FILE_NOT_FOUND。这里把图片字节放到 IndexedDB（磁盘）里，
// 内存只留最近几张做 LRU，避免队列里图片很多时把堆撑爆。
//
// 同一份字节可能同时被队列和历史记录引用，因此记录带 scope：
// session 会按时间与配额淘汰；history 由调用方决定生命周期（关闭持久化时每次启动清空）。

const DB_NAME = 'super-resolution-image-store';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FORGET_DELAY_MS = 30 * 1000;
const MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const MAX_MEMORY_ENTRIES = 6;
const HISTORY_EVICT_RATIO = 0.1;

export type ImageScope = 'session' | 'history';

// 上传拿到的 File 只是磁盘上的句柄：用户在资源管理器里删掉源文件后，
// 这个句柄、由它派生出的 blob: URL、以及写进 IndexedDB 的记录都读不出字节。
// 所以拿到文件的第一时间就把字节复制成真正的 Blob，之后全靠这份副本。
export const SOURCE_FILE_MISSING = 'source_file_missing';

export class SourceFileMissingError extends Error {
  constructor() {
    super(SOURCE_FILE_MISSING);
    this.name = 'SourceFileMissingError';
  }
}

export async function snapshotImageBlob(source: Blob): Promise<Blob> {
  if (typeof File === 'undefined' || !(source instanceof File)) {
    return source;
  }

  try {
    const buffer = await source.arrayBuffer();
    return new Blob([buffer], { type: source.type || 'application/octet-stream' });
  } catch {
    throw new SourceFileMissingError();
  }
}

// 内存/IndexedDB 里可能躺着早期写入的 File 句柄，读不出来就当作没命中，继续往下找。
async function materializeBlob(blob: Blob): Promise<Blob | null> {
  if (typeof File === 'undefined' || !(blob instanceof File)) {
    return blob;
  }

  try {
    return await snapshotImageBlob(blob);
  } catch {
    return null;
  }
}

interface StoredImage {
  key: string;
  blob: Blob;
  scope: ImageScope;
  createdAt: number;
}

const memoryBlobs = new Map<string, Blob>();
let memoryBytes = 0;
// 重建出来的新 URL 指回原始 key，避免连续失效后找不到同一份字节。
const urlOrigins = new Map<string, string>();
const healedUrls = new Map<string, string>();
const pendingForget = new Map<string, ReturnType<typeof setTimeout>>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

async function runTransaction(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => void,
): Promise<boolean> {
  const db = await openDB();
  if (!db) {
    return false;
  }

  return new Promise<boolean>((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, mode);
      work(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function readBlobFromDB(key: string): Promise<Blob | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise<Blob | null>((resolve) => {
    try {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        const record = request.result as StoredImage | undefined;
        resolve(record?.blob ?? null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function dropKeyHandles(key: string): void {
  const blob = memoryBlobs.get(key);
  if (blob) {
    memoryBlobs.delete(key);
    memoryBytes -= blob.size;
  }

  const pending = pendingForget.get(key);
  if (pending) {
    clearTimeout(pending);
    pendingForget.delete(key);
  }

  const healed = healedUrls.get(key);
  if (healed) {
    URL.revokeObjectURL(healed);
    healedUrls.delete(key);
  }

  for (const [url, origin] of urlOrigins) {
    if (origin === key) {
      urlOrigins.delete(url);
    }
  }
  urlOrigins.delete(key);
}

interface EvictOptions {
  scope: ImageScope;
  ratio: number;
  maxAgeMs?: number;
  skipKey?: string;
}

let historyEvictionHandler: ((keys: string[]) => void) | null = null;

// 历史图片被淘汰后，元数据必须同步消失，否则列表里会留下点不开的空记录。
export function setHistoryImagesEvictedHandler(handler: ((keys: string[]) => void) | null): void {
  historyEvictionHandler = handler;
}

export function historyRecordIdFromKey(key: string): string {
  const separator = key.indexOf(':');
  return separator === -1 ? key : key.slice(0, separator);
}

export async function hasImageKey(key: string): Promise<boolean> {
  return (await readBlobFromDB(key)) !== null;
}

async function evictRecords(options: EvictOptions): Promise<number> {
  const db = await openDB();
  if (!db) return 0;

  const deadline = options.maxAgeMs === undefined ? null : Date.now() - options.maxAgeMs;
  // 历史记录按三张图算一组：淘汰时不能只删掉同一组里的某一张。
  const skipRecordId =
    options.scope === 'history' && options.skipKey ? historyRecordIdFromKey(options.skipKey) : null;

  return new Promise<number>((resolve) => {
    const candidates: StoredImage[] = [];
    const removedKeys: string[] = [];
    let settled = false;

    const finish = (count: number) => {
      if (settled) return;
      settled = true;
      if (options.scope === 'history' && removedKeys.length > 0) {
        historyEvictionHandler?.([...removedKeys]);
      }
      resolve(count);
    };

    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          const matched = candidates
            .filter(
              (record) =>
                record.key !== options.skipKey &&
                (skipRecordId === null || historyRecordIdFromKey(record.key) !== skipRecordId),
            )
            .sort((a, b) => a.createdAt - b.createdAt);
          const dropCount =
            deadline === null
              ? Math.max(1, Math.ceil(matched.length * options.ratio))
              : matched.length;
          for (const record of matched.slice(0, dropCount)) {
            store.delete(record.key);
            dropKeyHandles(record.key);
            removedKeys.push(record.key);
          }
          return;
        }
        const record = cursor.value as StoredImage;
        if (record.scope === options.scope && (deadline === null || record.createdAt < deadline)) {
          candidates.push(record);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => finish(removedKeys.length);
      transaction.onerror = () => finish(removedKeys.length);
      transaction.onabort = () => finish(removedKeys.length);
    } catch {
      finish(0);
    }
  });
}

export function pruneImageStore(maxAgeMs = DEFAULT_MAX_AGE_MS): Promise<number> {
  return evictRecords({ scope: 'session', ratio: 0, maxAgeMs });
}

async function writeBlobToDB(key: string, blob: Blob, scope: ImageScope): Promise<boolean> {
  const record: StoredImage = { key, blob, scope, createdAt: Date.now() };
  if (await runTransaction('readwrite', (store) => store.put(record))) {
    return true;
  }

  // 配额写满时先丢掉过期 session，再按批次淘汰，最后才动历史记录。
  await pruneImageStore();
  if (await runTransaction('readwrite', (store) => store.put(record))) {
    return true;
  }

  for (let round = 0; round < 8; round += 1) {
    const freedSession = await evictRecords({ scope: 'session', ratio: 0.25, skipKey: key });
    if (freedSession === 0) {
      const freedHistory = await evictRecords({
        scope: 'history',
        ratio: HISTORY_EVICT_RATIO,
        skipKey: key,
      });
      if (freedHistory === 0) {
        break;
      }
    }
    if (await runTransaction('readwrite', (store) => store.put(record))) {
      return true;
    }
  }
  return false;
}

// 同一个 key 的落盘只做一次：调用方可能同时需要「异步确认写入成功」和「后台落盘」，
// 重复 put 会把几十 MB 的字节写两遍。
const pendingWrites = new Map<string, Promise<boolean>>();

function persistBlobToDB(key: string, blob: Blob, scope: ImageScope): Promise<boolean> {
  const inFlight = pendingWrites.get(key);
  if (inFlight) {
    return inFlight;
  }

  const task = writeBlobToDB(key, blob, scope);
  pendingWrites.set(key, task);
  const settle = () => {
    if (pendingWrites.get(key) === task) {
      pendingWrites.delete(key);
    }
  };
  task.then(settle, settle);
  return task;
}

function resolveKey(url: string): string {
  return urlOrigins.get(url) ?? url;
}

function rememberInMemory(key: string, blob: Blob): void {
  const previous = memoryBlobs.get(key);
  if (previous) {
    memoryBytes -= previous.size;
    memoryBlobs.delete(key);
  }

  memoryBlobs.set(key, blob);
  memoryBytes += blob.size;

  for (const [oldKey, oldBlob] of memoryBlobs) {
    if (memoryBlobs.size <= MAX_MEMORY_ENTRIES && memoryBytes <= MAX_MEMORY_BYTES) {
      break;
    }
    if (oldKey === key) {
      continue;
    }
    memoryBlobs.delete(oldKey);
    memoryBytes -= oldBlob.size;
  }
}

function takeFromMemory(key: string): Blob | null {
  const blob = memoryBlobs.get(key);
  if (!blob) {
    return null;
  }
  memoryBlobs.delete(key);
  memoryBlobs.set(key, blob);
  return blob;
}

export function rememberImageBlob(key: string, blob: Blob, scope: ImageScope = 'session'): void {
  const pending = pendingForget.get(key);
  if (pending) {
    clearTimeout(pending);
    pendingForget.delete(key);
  }

  rememberInMemory(key, blob);
  void persistBlobToDB(key, blob, scope);
}

export function createRememberedImageUrl(blob: Blob, scope: ImageScope = 'session'): string {
  const url = URL.createObjectURL(blob);
  rememberImageBlob(url, blob, scope);
  return url;
}

// 等待字节真正写进 IndexedDB 后再返回结果，调用方才有依据决定能否撤销活 URL。
export function persistImageBlob(
  key: string,
  blob: Blob,
  scope: ImageScope = 'session',
): Promise<boolean> {
  rememberImageBlob(key, blob, scope);
  return persistBlobToDB(key, blob, scope);
}

// 只释放内存里的活 URL 与 JS 句柄，IndexedDB 里的字节保留：
// 之后 preview / 处理流程仍能用同一个 key 把图片重新取回来。
// 注意与 forgetImageBlob 的区别：那个会连 IndexedDB 记录一起删掉。
export function releaseImageUrl(url: string | null | undefined): void {
  if (!url || !url.startsWith('blob:')) {
    return;
  }

  const key = resolveKey(url);

  const pending = pendingForget.get(key);
  if (pending) {
    clearTimeout(pending);
    pendingForget.delete(key);
  }

  URL.revokeObjectURL(url);

  const healed = healedUrls.get(key);
  if (healed && healed !== url) {
    URL.revokeObjectURL(healed);
  }
  healedUrls.delete(key);

  const blob = memoryBlobs.get(key);
  if (blob) {
    memoryBlobs.delete(key);
    memoryBytes -= blob.size;
  }

  urlOrigins.delete(url);
}

export async function getImageBlob(url: string): Promise<Blob> {
  const key = resolveKey(url);

  const cached = takeFromMemory(key);
  if (cached) {
    const materialized = await materializeBlob(cached);
    if (materialized) {
      return materialized;
    }
  }

  const stored = await readBlobFromDB(key);
  if (stored) {
    const materialized = await materializeBlob(stored);
    if (materialized) {
      rememberInMemory(key, materialized);
      return materialized;
    }
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new SourceFileMissingError();
    }

    const blob = await response.blob();
    rememberImageBlob(key, blob);
    return blob;
  } catch {
    throw new SourceFileMissingError();
  }
}

export async function renewImageUrl(url: string): Promise<string | null> {
  try {
    const blob = await getImageBlob(url);
    const origin = resolveKey(url);
    const previous = healedUrls.get(origin);
    if (previous) {
      URL.revokeObjectURL(previous);
    }

    const nextUrl = URL.createObjectURL(blob);
    urlOrigins.set(nextUrl, origin);
    healedUrls.set(origin, nextUrl);
    return nextUrl;
  } catch {
    return null;
  }
}

// 撤销 URL 后可能还有在途读取，延迟删缓存，避免自己制造新的 ERR_FILE_NOT_FOUND。
export function forgetImageBlob(url: string | null | undefined): void {
  if (!url || !url.startsWith('blob:')) {
    return;
  }

  const key = resolveKey(url);
  const existing = pendingForget.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    pendingForget.delete(key);
    dropKeyHandles(key);
    void runTransaction('readwrite', (store) => store.delete(key));
  }, FORGET_DELAY_MS);

  pendingForget.set(key, timer);
}

export async function deleteImageKey(key: string): Promise<void> {
  dropKeyHandles(key);
  await runTransaction('readwrite', (store) => store.delete(key));
}

export type HistoryImagePart = 'original' | 'result' | 'thumb';

export function historyImageKey(recordId: string, part: HistoryImagePart): string {
  return `${recordId}:${part}`;
}

export async function deleteHistoryImages(recordId: string): Promise<void> {
  const parts: HistoryImagePart[] = ['original', 'result', 'thumb'];
  await Promise.all(parts.map((part) => deleteImageKey(historyImageKey(recordId, part))));
}

export async function clearHistoryScope(): Promise<void> {
  await evictRecords({ scope: 'history', ratio: 1 });
}

// 把已有 URL 指向新的 key（同一份字节挂到历史记录名下），
// 队列与历史列表各自持有的 URL 就都落到同一条记录上，不再存两份。
export async function rekeyImage(
  fromUrl: string,
  toKey: string,
  scope: ImageScope,
): Promise<boolean> {
  const originKey = resolveKey(fromUrl);
  const inMemory = memoryBlobs.get(originKey);
  const blob = inMemory ?? (await readBlobFromDB(originKey));
  if (!blob) {
    return false;
  }

  if (originKey !== toKey) {
    if (inMemory) {
      memoryBlobs.delete(originKey);
      memoryBytes -= inMemory.size;
    }
    rememberInMemory(toKey, blob);
    urlOrigins.set(originKey, toKey);
  }
  urlOrigins.set(fromUrl, toKey);

  return runTransaction('readwrite', (store) => {
    store.put({ key: toKey, blob, scope, createdAt: Date.now() } satisfies StoredImage);
    if (originKey !== toKey) {
      store.delete(originKey);
    }
  });
}

// 彻底清空图片库：内存句柄、活 URL、待删除定时器与 IndexedDB 记录一并清掉。
// 只作用于本模块的 'images' store，绝不碰模型库（super-resolution-models）与 localStorage 里的设置。
export async function clearImageStore(): Promise<void> {
  for (const timer of pendingForget.values()) {
    clearTimeout(timer);
  }
  pendingForget.clear();

  for (const healed of healedUrls.values()) {
    URL.revokeObjectURL(healed);
  }
  healedUrls.clear();
  urlOrigins.clear();
  memoryBlobs.clear();
  memoryBytes = 0;

  await runTransaction('readwrite', (store) => store.clear());
}
