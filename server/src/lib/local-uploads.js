import fs from 'node:fs/promises';
import path from 'node:path';

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
export const IMAGE_DIR = path.join(UPLOAD_ROOT, 'images');

export function localImagePath(filename) {
  return path.join(IMAGE_DIR, path.basename(filename));
}

export function localImageFilenameFromUrl(value) {
  if (!value) return null;

  let pathname = value;
  try {
    pathname = new URL(value).pathname;
  } catch {
    // Treat non-URL values as paths, then validate the expected route prefix below.
  }

  const prefix = '/uploads/images/';
  if (!pathname.startsWith(prefix)) return null;

  const filename = path.basename(pathname.slice(prefix.length));
  return filename || null;
}

export async function deleteLocalImagesFromUrls(urls) {
  const filenames = new Set(urls.map(localImageFilenameFromUrl).filter(Boolean));
  const result = {
    requested: urls.length,
    matched: filenames.size,
    deleted: 0,
    missing: 0,
  };

  for (const filename of filenames) {
    try {
      await fs.unlink(localImagePath(filename));
      result.deleted += 1;
    } catch (error) {
      if (error.code === 'ENOENT') {
        result.missing += 1;
      } else {
        throw error;
      }
    }
  }

  return result;
}
