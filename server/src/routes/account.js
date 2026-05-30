import { getCurrentUserId } from '../lib/current-user.js';
import { deleteLocalImagesFromUrls } from '../lib/local-uploads.js';
import { prisma } from '../lib/prisma.js';

async function findAccountExport(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      questions: {
        orderBy: { createdAt: 'desc' },
        include: {
          subject: true,
          answerSessions: {
            orderBy: { createdAt: 'desc' },
            include: { messages: { orderBy: { createdAt: 'asc' } } },
          },
        },
      },
      errorRecords: {
        orderBy: { createdAt: 'desc' },
        include: {
          subject: true,
          knowledgeNode: true,
          reviewTasks: { orderBy: { dueAt: 'asc' } },
        },
      },
      reviewTasks: {
        orderBy: { dueAt: 'asc' },
        include: {
          errorRecord: {
            include: { subject: true, knowledgeNode: true },
          },
        },
      },
      feedback: { orderBy: { createdAt: 'desc' } },
      aiEvents: { orderBy: { createdAt: 'desc' } },
      paymentOrders: { orderBy: { createdAt: 'desc' } },
      subscriptions: { orderBy: { createdAt: 'desc' } },
      deviceTokens: {
        orderBy: { lastSeenAt: 'desc' },
        select: {
          id: true,
          platform: true,
          provider: true,
          enabled: true,
          lastSeenAt: true,
          createdAt: true,
        },
      },
      notificationDeliveries: { orderBy: { createdAt: 'desc' } },
      authOtps: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          purpose: true,
          attempts: true,
          maxAttempts: true,
          expiresAt: true,
          consumedAt: true,
          userId: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function accountRoutes(app) {
  app.get('/export', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const account = await findAccountExport(userId);
    if (!account) return reply.code(404).send({ error: 'User not found' });

    return {
      exportedAt: new Date().toISOString(),
      scope: 'single-student-account',
      account,
    };
  });

  app.delete('/', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) return reply.code(404).send({ error: 'User not found' });

    const imageQuestions = await prisma.question.findMany({
      where: {
        userId,
        imageUrl: { not: null },
      },
      select: { imageUrl: true },
    });
    const imageUrls = imageQuestions.map(question => question.imageUrl).filter(Boolean);

    await prisma.$transaction([
      prisma.reviewTask.deleteMany({ where: { userId } }),
      prisma.errorRecord.deleteMany({ where: { userId } }),
      prisma.answerMessage.deleteMany({
        where: { session: { userId } },
      }),
      prisma.answerSession.deleteMany({ where: { userId } }),
      prisma.question.deleteMany({ where: { userId } }),
      prisma.aiEvent.deleteMany({ where: { userId } }),
      prisma.userFeedback.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.authOtp.deleteMany({
        where: {
          OR: [
            { userId },
            { phone: existing.phone },
          ],
        },
      }),
      prisma.paymentOrder.deleteMany({ where: { userId } }),
      prisma.subscription.deleteMany({ where: { userId } }),
      prisma.notificationDelivery.deleteMany({ where: { userId } }),
      prisma.deviceToken.deleteMany({ where: { userId } }),
      prisma.studentProfile.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    try {
      const localImages = await deleteLocalImagesFromUrls(imageUrls);
      return { deleted: true, userId, localImages };
    } catch (error) {
      request.log?.warn?.({ error }, 'account deleted but local image cleanup failed');
      return {
        deleted: true,
        userId,
        localImages: {
          requested: imageUrls.length,
          cleanupFailed: true,
        },
      };
    }
  });
}
