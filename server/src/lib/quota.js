import { getCurrentUserPlan } from './entitlements.js';
import { prisma } from './prisma.js';

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function getUserDailyUsage(userId) {
  const since = startOfToday();
  const [questionCount, aiStepCount, plan] = await Promise.all([
    prisma.question.count({
      where: { userId, createdAt: { gte: since } },
    }),
    prisma.aiEvent.count({
      where: {
        userId,
        eventType: 'socratic_answer',
        createdAt: { gte: since },
      },
    }),
    getCurrentUserPlan(userId),
  ]);

  return {
    since,
    planCode: plan.code,
    questionCount,
    aiStepCount,
    questionLimit: plan.dailyQuestionLimit,
    aiStepLimit: plan.dailyAiStepLimit,
  };
}

export async function assertQuestionQuota(userId) {
  const usage = await getUserDailyUsage(userId);
  if (usage.questionCount >= usage.questionLimit) {
    return {
      allowed: false,
      type: 'daily_question_limit',
      message: `今日提问额度已用完 (${usage.questionCount}/${usage.questionLimit})。请明天再继续, 或联系管理员调整内测额度。`,
      usage,
    };
  }
  return { allowed: true, usage };
}

export async function assertAiStepQuota(userId) {
  const usage = await getUserDailyUsage(userId);
  if (usage.aiStepCount >= usage.aiStepLimit) {
    return {
      allowed: false,
      type: 'daily_ai_step_limit',
      message: `今日 AI 引导次数已用完 (${usage.aiStepCount}/${usage.aiStepLimit})。请明天再继续, 或联系管理员调整内测额度。`,
      usage,
    };
  }
  return { allowed: true, usage };
}

export function sendQuotaExceeded(reply, quota) {
  return reply.code(429).send({
    error: quota.message,
    code: quota.type,
    quota: {
      questionCount: quota.usage.questionCount,
      questionLimit: quota.usage.questionLimit,
      aiStepCount: quota.usage.aiStepCount,
      aiStepLimit: quota.usage.aiStepLimit,
    },
  });
}
