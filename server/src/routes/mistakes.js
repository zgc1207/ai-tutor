import { getCurrentUserId } from '../lib/current-user.js';
import { prisma } from '../lib/prisma.js';

export async function mistakeRoutes(app) {
  app.get('/', async request => {
    const userId = await getCurrentUserId(request);
    return prisma.errorRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { question: true, subject: true, knowledgeNode: true },
    });
  });
}
