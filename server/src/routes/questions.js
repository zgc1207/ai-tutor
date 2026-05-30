import { z } from 'zod';
import {
  extractErrorRecord,
  generateSocraticStep,
  generateVariantQuestion,
} from '../ai/llm-provider.js';
import { getCurrentUserId } from '../lib/current-user.js';
import { prisma } from '../lib/prisma.js';
import { assertAiStepQuota, assertQuestionQuota, sendQuotaExceeded } from '../lib/quota.js';
import { buildReviewSchedule } from '../lib/review.js';
import { buildSafetyEventData, checkInputSafety } from '../lib/safety.js';

const createQuestionSchema = z.object({
  subjectCode: z.string().min(1),
  inputType: z.enum(['text', 'image', 'voice']),
  originalText: z.string().optional(),
  imageUrl: z.string().url().optional(),
  ocrText: z.string().optional(),
});

const finishQuestionSchema = z.object({
  solvedIndependently: z.boolean().default(false),
  forceCreateErrorRecord: z.boolean().default(false),
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

async function findKnowledgeNode({ subjectId, knowledgePoint }) {
  const nodes = await prisma.knowledgeNode.findMany({
    where: { subjectId },
  });
  return nodes
    .sort((a, b) => Number(Boolean(b.parentId)) - Number(Boolean(a.parentId)) || b.name.length - a.name.length)
    .find(node => (
    knowledgePoint.includes(node.name) || node.name.includes(knowledgePoint)
  )) || null;
}

export async function questionRoutes(app) {
  app.post('/', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = createQuestionSchema.parse(request.body);
    const quota = await assertQuestionQuota(userId);
    if (!quota.allowed) return sendQuotaExceeded(reply, quota);

    const safety = checkInputSafety({
      text: [input.originalText, input.ocrText].filter(Boolean).join('\n'),
      context: 'question',
    });
    await prisma.aiEvent.create({ data: buildSafetyEventData({ userId, result: safety }) });
    if (!safety.safe) {
      return reply.code(422).send({
        error: safety.message,
        category: safety.category,
        severity: safety.severity,
      });
    }

    const subject = await prisma.subject.findUniqueOrThrow({
      where: { code: input.subjectCode },
    });

    return prisma.question.create({
      data: {
        userId,
        subjectId: subject.id,
        inputType: input.inputType,
        originalText: input.originalText,
        imageUrl: input.imageUrl,
        ocrText: input.ocrText,
        answerSessions: {
          create: { userId },
        },
      },
      include: { answerSessions: true, subject: true },
    });
  });

  app.post('/:id/answer/next', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const quota = await assertAiStepQuota(userId);
    if (!quota.allowed) return sendQuotaExceeded(reply, quota);

    const question = await prisma.question.findFirst({
      where: { id: request.params.id, userId },
      include: {
        answerSessions: { orderBy: { createdAt: 'desc' }, take: 1 },
        subject: true,
        user: { include: { profile: true } },
      },
    });
    if (!question) return reply.code(404).send({ error: 'Question not found' });

    const session = question.answerSessions[0] || await prisma.answerSession.create({
      data: { questionId: question.id, userId },
    });

    try {
      const result = await generateSocraticStep({
        question,
        profile: question.user.profile,
      });

      const [message] = await prisma.$transaction([
        prisma.answerMessage.create({
          data: {
            sessionId: session.id,
            role: 'assistant',
            messageType: result.step.type,
            content: result.step.content,
            structuredPayload: result.step,
          },
        }),
        prisma.answerSession.update({
          where: { id: session.id },
          data: { currentStep: { increment: 1 } },
        }),
        prisma.question.update({
          where: { id: question.id },
          data: { status: 'guiding' },
        }),
        recordAiEvent({ userId, eventType: 'socratic_answer', meta: result.meta }),
      ]);

      return { ...result.step, messageId: message.id };
    } catch (error) {
      await prisma.aiEvent.create({
        data: {
          userId,
          eventType: 'socratic_answer',
          provider: process.env.LLM_PROVIDER || 'mock',
          model: process.env.LLM_MODEL || 'mock-socratic',
          promptVersion: 'socratic-v1',
          success: false,
          errorMessage: error.message,
        },
      });
      return reply.code(502).send({ error: 'AI answer failed' });
    }
  });

  app.post('/:id/finish', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = finishQuestionSchema.parse(request.body || {});
    const question = await prisma.question.findFirst({
      where: { id: request.params.id, userId },
      include: {
        answerSessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        },
        subject: true,
      },
    });
    if (!question) return reply.code(404).send({ error: 'Question not found' });

    await prisma.question.update({
      where: { id: question.id },
      data: { status: input.solvedIndependently ? 'solved' : 'guiding' },
    });

    if (input.solvedIndependently && !input.forceCreateErrorRecord) {
      return { createdErrorRecord: false, reviewTasks: [] };
    }

    const existing = await prisma.errorRecord.findFirst({
      where: { userId, questionId: question.id },
      include: { reviewTasks: true },
    });
    if (existing) {
      return {
        createdErrorRecord: false,
        errorRecord: existing,
        reviewTasks: existing.reviewTasks,
      };
    }

    try {
      const session = question.answerSessions[0];
      const extractionResult = await extractErrorRecord({
        question,
        messages: session?.messages || [],
      });
      await recordAiEvent({ userId, eventType: 'extract_error', meta: extractionResult.meta });

      if (!extractionResult.extraction.shouldCreateErrorRecord && !input.forceCreateErrorRecord) {
        return { createdErrorRecord: false, reviewTasks: [] };
      }

      const knowledgeNode = await findKnowledgeNode({
        subjectId: question.subjectId,
        knowledgePoint: extractionResult.extraction.knowledgePoint,
      });
      const errorRecord = await prisma.errorRecord.create({
        data: {
          userId,
          questionId: question.id,
          subjectId: question.subjectId,
          knowledgeNodeId: knowledgeNode?.id,
          knowledgePoint: extractionResult.extraction.knowledgePoint,
          errorReason: extractionResult.extraction.errorReason,
          status: extractionResult.extraction.status,
        },
      });

      const reviewTasks = [];
      for (const schedule of buildReviewSchedule()) {
        const variantResult = await generateVariantQuestion({
          errorRecord,
          cycle: schedule.cycle,
        });
        await recordAiEvent({ userId, eventType: 'generate_variant', meta: variantResult.meta });
        const task = await prisma.reviewTask.create({
          data: {
            userId,
            errorRecordId: errorRecord.id,
            cycle: schedule.cycle,
            dueAt: schedule.dueAt,
            variantQuestion: variantResult.variant,
          },
        });
        reviewTasks.push(task);
      }

      return {
        createdErrorRecord: true,
        errorRecord,
        reviewTasks,
      };
    } catch (error) {
      return reply.code(502).send({ error: `Finish question failed: ${error.message}` });
    }
  });
}
