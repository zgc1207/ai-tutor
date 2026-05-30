import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { isPublicUploadAccessEnabled } from '../lib/config.js';
import { getCurrentUserId } from '../lib/current-user.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, storeImage } from '../lib/image-storage.js';
import { localImagePath } from '../lib/local-uploads.js';

const uploadImageSchema = z.object({
  imageData: z.string().min(1),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});

function decodeImageData(value) {
  const base64 = value.includes(',') ? value.split(',').pop() : value;
  return Buffer.from(base64, 'base64');
}

export async function uploadRoutes(app) {
  app.post('/images', async (request, reply) => {
    await getCurrentUserId(request);
    const input = uploadImageSchema.parse(request.body || {});
    const bytes = decodeImageData(input.imageData);
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
      return reply.code(413).send({ error: 'Image size must be between 1 byte and 5MB' });
    }

    const stored = await storeImage({
      request,
      bytes,
      contentType: input.contentType,
    });

    return {
      filename: stored.filename,
      storageProvider: stored.provider,
      contentType: input.contentType,
      size: bytes.length,
      imageUrl: stored.imageUrl,
    };
  });

  app.get('/images/:filename', async (request, reply) => {
    if (!isPublicUploadAccessEnabled()) {
      await getCurrentUserId(request);
    }

    const filename = path.basename(request.params.filename);
    const filepath = localImagePath(filename);
    const ext = path.extname(filename).slice(1);
    const contentType = Object.entries(IMAGE_TYPES).find(([, value]) => value === ext)?.[0];
    if (!contentType) return reply.code(404).send({ error: 'Image not found' });

    try {
      const bytes = await fs.readFile(filepath);
      return reply.header('cache-control', 'private, max-age=86400').type(contentType).send(bytes);
    } catch {
      return reply.code(404).send({ error: 'Image not found' });
    }
  });
}
