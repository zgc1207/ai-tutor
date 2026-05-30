import { getCurrentUserId } from '../lib/current-user.js';
import { prisma } from '../lib/prisma.js';

export async function dashboardRoutes(app) {
  app.get('/', async request => {
    const userId = await getCurrentUserId(request);
    const [weakCount, learningCount, masteredCount, todayReviewCount, recentQuestions] = await Promise.all([
      prisma.errorRecord.count({ where: { userId, status: 'weak' } }),
      prisma.errorRecord.count({ where: { userId, status: 'learning' } }),
      prisma.errorRecord.count({ where: { userId, status: 'mastered' } }),
      prisma.reviewTask.count({
        where: {
          userId,
          status: 'pending',
          dueAt: { lte: new Date() },
        },
      }),
      prisma.question.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { subject: true },
      }),
    ]);

    return {
      progress: { weak: weakCount, learning: learningCount, mastered: masteredCount },
      todayReviewCount,
      recentQuestions,
    };
  });
}
