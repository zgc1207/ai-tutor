import { z } from 'zod';
import { extractTextFromImage } from '../ai/ocr-provider.js';
import { getCurrentUserId } from '../lib/current-user.js';
import { buildSafetyEventData, checkInputSafety } from '../lib/safety.js';
import { prisma } from '../lib/prisma.js';

const ocrSchema = z.object({
  imageUrl: z.string().url().optional(),
  imageData: z.string().max(5_000_000).optional(),
  mockText: z.string().max(2000).optional(),
}).refine(input => input.imageUrl || input.imageData || input.mockText, {
  message: 'imageUrl, imageData or mockText is required',
});

export async function ocrRoutes(app) {
  app.post('/extract', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = ocrSchema.parse(request.body || {});

    try {
      const result = await extractTextFromImage(input);
      const safety = checkInputSafety({ text: result.text, context: 'ocr' });
      await prisma.aiEvent.create({ data: buildSafetyEventData({ userId, result: safety }) });
      if (!safety.safe) {
        return reply.code(422).send({
          error: safety.message,
          category: safety.category,
          severity: safety.severity,
        });
      }

      return {
        text: result.text,
        confidence: result.confidence,
        imageUrl: input.imageUrl || null,
        provider: result.meta.provider,
        model: result.meta.model,
      };
    } catch (error) {
      return reply.code(502).send({ error: `OCR failed: ${error.message}` });
    }
  });
}
