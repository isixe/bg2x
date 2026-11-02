import type { BatchInput } from '../type';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'avif'];

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const dot = file.name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.includes(file.name.slice(dot + 1).toLowerCase());
}

/**
 * The top-level folder name is dropped so an exported ZIP mirrors the selected
 * folder's contents rather than nesting everything under the folder itself.
 */
export function relativePathWithinFolder(file: File): string | null {
  const rel = file.webkitRelativePath;
  if (!rel) return null;
  const segments = rel.split('/').filter(Boolean);
  if (segments.length > 1) segments.shift();
  return segments.join('/') || null;
}

export function filesToBatchInputs(files: File[]): BatchInput[] {
  const inputs: BatchInput[] = [];
  for (const file of files) {
    if (!isImageFile(file)) continue;
    inputs.push({ file, relativePath: relativePathWithinFolder(file) });
  }
  return inputs;
}
