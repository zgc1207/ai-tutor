import { z } from 'zod';
import { getCurrentUserId } from '../lib/current-user.js';
import { prisma } from '../lib/prisma.js';
import { buildSafetyEventData, checkInputSafety } from '../lib/safety.js';

const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  category: z.enum(['bug', 'ai_quality', 'ux', 'content', 'other']).default('other'),
  content: z.string().min(2).max(1000),
  page: z.string().max(80).optional(),
});

export async function feedbackRoutes(app) {
  app.post('/', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = feedbackSchema.parse(request.body || {});
    const safety = checkInputSafety({ text: input.content, context: 'feedback' });
    await prisma.aiEvent.create({ data: buildSafetyEventData({ userId, result: safety }) });
    if (!safety.safe && ['personal_id', 'bank_card', 'address'].includes(safety.category)) {
      return reply.code(422).send({
        error: safety.message,
        category: safety.category,
        severity: safety.severity,
      });
    }

    return prisma.userFeedback.create({
      data: {
        userId,
        rating: input.rating,
        category: input.category,
        content: input.content,
        page: input.page,
      },
    });
  });
}
