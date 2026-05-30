import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {
  getUploadStorageEndpoint,
  getUploadStorageProvider,
  getUploadStorageToken,
} from './config.js';
import { IMAGE_DIR, localImagePath } from './local-uploads.js';

export const IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function localPublicUrl(request, filename) {
  const proto = request.headers['x-forwarded-proto'] || 'http';
  const host = request.headers.host || 'localhost:3000';
  return `${proto}://${host}/uploads/images/${filename}`;
}

async function storeLocalImage({ request, bytes, contentType }) {
  await fs.mkdir(IMAGE_DIR, { recursive: true });
  const ext = IMAGE_TYPES[contentType];
  const filename = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const filepath = localImagePath(filename);
  await fs.writeFile(filepath, bytes);

  return {
    provider: 'local',
    filename,
    imageUrl: localPublicUrl(request, filename),
  };
}

async function storeHttpImage({ bytes, contentType }) {
  const endpoint = getUploadStorageEndpoint();
  if (!endpoint) {
    throw Object.assign(new Error('UPLOAD_STORAGE_ENDPOINT is required for http upload storage'), { statusCode: 500 });
  }

  const token = getUploadStorageToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      contentType,
      imageData: bytes.toString('base64'),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw Object.assign(new Error(`Upload storage failed: ${response.status} ${text}`), { statusCode: 502 });
  }

  const data = await response.json();
  if (!data.imageUrl) {
    throw Object.assign(new Error('Upload storage response must include imageUrl'), { statusCode: 502 });
  }

  return {
    provider: 'http',
    filename: data.filename || null,
    imageUrl: data.imageUrl,
  };
}

export async function storeImage({ request, bytes, contentType }) {
  const provider = getUploadStorageProvider();
  if (provider === 'local') {
    return storeLocalImage({ request, bytes, contentType });
  }
  if (provider === 'http') {
    return storeHttpImage({ bytes, contentType });
  }
  throw Object.assign(new Error(`Unsupported upload storage provider: ${provider}`), { statusCode: 500 });
}
