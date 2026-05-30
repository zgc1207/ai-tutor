import { z } from 'zod';
import { generateVariantQuestion } from '../ai/llm-provider.js';
import { getCurrentUserId } from '../lib/current-user.js';
import { prisma } from '../lib/prisma.js';
import { buildReviewSchedule } from '../lib/review.js';

const answerSchema = z.object({
  answer: z.string().min(1),
});

function recordAiEvent({ userId, eventType, meta, success = true, errorMessage = null }) {
  return prisma.aiEvent.create({
    data: {
      userId,
      eventType,
      provider: meta.provider,
      model: meta.model,
      promptVersion: meta.promptVersion,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      latencyMs: meta.latencyMs,
      costEstimate: meta.costEstimate,
      success,
      errorMessage,
    },
  });
}

export async function reviewRoutes(app) {
  app.get('/', async request => {
    const userId = await getCurrentUserId(request);
    const includeUpcoming = request.query?.includeUpcoming === '1' || request.query?.scope === 'all';
    return prisma.reviewTask.findMany({
      where: {
        userId,
        status: 'pending',
        ...(includeUpcoming ? {} : { dueAt: { lte: new Date() } }),
      },
      orderBy: { dueAt: 'asc' },
      include: { errorRecord: { include: { subject: true } } },
    });
  });

  app.get('/today', async request => {
    const userId = await getCurrentUserId(request);
    return prisma.reviewTask.findMany({
      where: {
        userId,
        status: 'pending',
        dueAt: { lte: new Date() },
      },
      orderBy: { dueAt: 'asc' },
      include: { errorRecord: { include: { subject: true } } },
    });
  });

  app.post('/:id/answer', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = answerSchema.parse(request.body);
    const task = await prisma.reviewTask.findFirst({
      where: { id: request.params.id, userId },
      include: { errorRecord: true },
    });
    if (!task) return reply.code(404).send({ error: 'Review task not found' });

    const correctAnswer = task.variantQuestion?.correctAnswer;
    const answeredCorrectly = correctAnswer ? input.answer === correctAnswer : null;
    const answeredAt = new Date();

    if (answeredCorrectly === null) {
      const updatedTask = await prisma.reviewTask.update({
        where: { id: task.id },
        data: {
          status: 'done',
          answeredCorrectly,
          answeredAt,
        },
        include: { errorRecord: true },
      });
      return {
        ...updatedTask,
        mastery: {
          correctStreak: updatedTask.errorRecord.correctStreak,
          status: updatedTask.errorRecord.status,
          mastered: updatedTask.errorRecord.status === 'mastered',
          reset: false,
          newReviewTasks: [],
        },
      };
    }

    if (answeredCorrectly) {
      const nextStreak = task.errorRecord.correctStreak + 1;
      const nextStatus = nextStreak >= 2 ? 'mastered' : 'learning';
      const [updatedTask, updatedErrorRecord] = await prisma.$transaction([
        prisma.reviewTask.update({
          where: { id: task.id },
          data: {
            status: 'done',
            answeredCorrectly,
            answeredAt,
          },
        }),
        prisma.errorRecord.update({
          where: { id: task.errorRecordId },
          data: {
            correctStreak: nextStreak,
            status: nextStatus,
          },
        }),
      ]);

      return {
        ...updatedTask,
        errorRecord: updatedErrorRecord,
        mastery: {
          correctStreak: updatedErrorRecord.correctStreak,
          status: updatedErrorRecord.status,
          mastered: updatedErrorRecord.status === 'mastered',
          reset: false,
          newReviewTasks: [],
        },
      };
    }

    const resetErrorRecord = {
      ...task.errorRecord,
      correctStreak: 0,
      status: 'weak',
    };
    const newTaskInputs = [];
    try {
      for (const schedule of buildReviewSchedule(answeredAt)) {
        const variantResult = await generateVariantQuestion({
          errorRecord: resetErrorRecord,
          cycle: schedule.cycle,
        });
        await recordAiEvent({ userId, eventType: 'generate_variant', meta: variantResult.meta });
        newTaskInputs.push({
          userId,
          errorRecordId: resetErrorRecord.id,
          cycle: schedule.cycle,
          dueAt: schedule.dueAt,
          variantQuestion: variantResult.variant,
        });
      }
    } catch (error) {
      await prisma.aiEvent.create({
        data: {
          userId,
          eventType: 'generate_variant',
          provider: process.env.LLM_PROVIDER || 'mock',
          model: process.env.LLM_MODEL || 'mock-socratic',
          promptVersion: 'variant-v1',
          success: false,
          errorMessage: error.message,
        },
      });
      return reply.code(502).send({ error: `Reset review schedule failed: ${error.message}` });
    }

    const [updatedTask, updatedErrorRecord, , ...newReviewTasks] = await prisma.$transaction([
      prisma.reviewTask.update({
        where: { id: task.id },
        data: {
          status: 'done',
          answeredCorrectly,
          answeredAt,
        },
      }),
      prisma.errorRecord.update({
        where: { id: task.errorRecordId },
        data: {
          correctStreak: 0,
          status: 'weak',
        },
      }),
      prisma.reviewTask.updateMany({
        where: {
          userId,
          errorRecordId: task.errorRecordId,
          status: 'pending',
          NOT: { id: task.id },
        },
        data: { status: 'reset' },
      }),
      ...newTaskInputs.map(data => prisma.reviewTask.create({ data })),
    ]);

    return {
      ...updatedTask,
      errorRecord: updatedErrorRecord,
      mastery: {
        correctStreak: updatedErrorRecord.correctStreak,
        status: updatedErrorRecord.status,
        mastered: false,
        reset: true,
        newReviewTasks,
      },
    };
  });
}
