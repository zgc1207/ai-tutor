import { z } from 'zod';
import { getCurrentUserId } from '../lib/current-user.js';
import { getCurrentUserPlan } from '../lib/entitlements.js';
import { prisma } from '../lib/prisma.js';
import { getUserDailyUsage } from '../lib/quota.js';

const profileSchema = z.object({
  grade: z.string().min(1),
  gradeStage: z.enum(['primary', 'junior', 'senior']),
  targetSubjects: z.array(z.string()).optional(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const reminderSchema = z.object({
  reviewReminderEnabled: z.boolean(),
  reviewReminderTime: timeSchema,
  quietHoursStart: timeSchema.default('21:00'),
  quietHoursEnd: timeSchema.default('07:00'),
});

export async function meRoutes(app) {
  app.get('/', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });
    const [quota, plan] = await Promise.all([
      getUserDailyUsage(userId),
      getCurrentUserPlan(userId),
    ]);

    return {
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        role: user.role,
        policyVersion: user.policyVersion,
        termsAcceptedAt: user.termsAcceptedAt,
        privacyAcceptedAt: user.privacyAcceptedAt,
        minorNoticeAcceptedAt: user.minorNoticeAcceptedAt,
        createdAt: user.createdAt,
      },
      profile: user.profile,
      accountModel: 'single-student',
      plan,
      quota,
    };
  });

  app.patch('/profile', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = profileSchema.parse(request.body || {});
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    const profile = await prisma.studentProfile.upsert({
      where: { userId },
      update: {
        grade: input.grade,
        gradeStage: input.gradeStage,
        ...(input.targetSubjects ? { targetSubjects: input.targetSubjects } : {}),
      },
      create: {
        userId,
        grade: input.grade,
        gradeStage: input.gradeStage,
        targetSubjects: input.targetSubjects || [],
      },
    });

    return {
      profile,
      accountModel: 'single-student',
    };
  });

  app.patch('/reminder', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = reminderSchema.parse(request.body || {});
    const profile = await prisma.studentProfile.findUnique({ where: { userId } });
    if (!profile) return reply.code(404).send({ error: 'Student profile not found' });

    const updated = await prisma.studentProfile.update({
      where: { userId },
      data: input,
    });

    return {
      profile: updated,
      reminder: {
        reviewReminderEnabled: updated.reviewReminderEnabled,
        reviewReminderTime: updated.reviewReminderTime,
        quietHoursStart: updated.quietHoursStart,
        quietHoursEnd: updated.quietHoursEnd,
      },
    };
  });
}
