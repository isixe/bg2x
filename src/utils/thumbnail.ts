const THUMBNAIL_MAX_EDGE = 256;
const THUMBNAIL_TYPE = 'image/webp';
const THUMBNAIL_QUALITY = 0.82;

// 生成缩略图必然要解码一次原图，串行化处理：批量导入几十张图时，
// 同时解码会在同一瞬间叠出几百 MB 的位图。
let tail: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function encode(bitmap: ImageBitmap): Promise<Blob | null> | Blob | null {
  if (bitmap.width === 0 || bitmap.height === 0) {
    return null;
  }

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(bitmap, 0, 0);
    return canvas.convertToBlob({ type: THUMBNAIL_TYPE, quality: THUMBNAIL_QUALITY });
  }

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(bitmap, 0, 0);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), THUMBNAIL_TYPE, THUMBNAIL_QUALITY);
  });
}

// 交给 createImageBitmap 的 resizeWidth 让解码器在解码阶段就缩小，
// 避免为了一张 32px 的列表缩略图把 4000×3000 的位图整个展开。
export function createThumbnailBlob(
  source: Blob,
  maxEdge = THUMBNAIL_MAX_EDGE,
): Promise<Blob | null> {
  return serialize(async () => {
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(source, { resizeWidth: maxEdge, resizeQuality: 'medium' });
      return await encode(bitmap);
    } catch {
      return null;
    } finally {
      bitmap?.close();
    }
  });
}
