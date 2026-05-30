import {
  getDailyAiStepLimit,
  getDailyQuestionLimit,
  getPaymentProvider,
  getPlusDailyAiStepLimit,
  getPlusPriceCentsMonthly,
  getPlusDailyQuestionLimit,
} from './config.js';
import { prisma } from './prisma.js';

export function getPlans() {
  return [
    {
      code: 'free',
      name: '内测免费版',
      priceCnyMonthly: 0,
      dailyQuestionLimit: getDailyQuestionLimit(),
      dailyAiStepLimit: getDailyAiStepLimit(),
      features: {
        aiSocraticAnswer: true,
        mistakeBook: true,
        reviewTasks: true,
        weeklyReport: true,
        parentReport: 'weekly_basic',
        priorityAi: false,
      },
      note: '适合小规模内测, 用于验证答疑、错题和复习闭环。',
    },
    {
      code: 'plus',
      name: 'Plus 订阅版',
      priceCnyMonthly: getPlusPriceCentsMonthly() / 100,
      priceCentsMonthly: getPlusPriceCentsMonthly(),
      currency: 'CNY',
      dailyQuestionLimit: getPlusDailyQuestionLimit(),
      dailyAiStepLimit: getPlusDailyAiStepLimit(),
      features: {
        aiSocraticAnswer: true,
        mistakeBook: true,
        reviewTasks: true,
        weeklyReport: true,
        parentReport: 'weekly_detailed',
        priorityAi: true,
      },
      note: '上线前需按渠道补齐真实支付、退款和监护人确认流程。',
    },
  ];
}

export function getPlanByCode(planCode) {
  return getPlans().find(plan => plan.code === planCode) || null;
}

export function getPaymentMode() {
  const provider = getPaymentProvider();
  return {
    provider,
    enabled: ['dev', 'http'].includes(provider),
    productionReady: provider === 'http',
  };
}

export async function getCurrentUserPlan(userId) {
  if (!userId) return getPlans()[0];
  const now = new Date();
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      planCode: 'plus',
      status: 'active',
      startsAt: { lte: now },
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: 'desc' },
  });
  return subscription ? getPlanByCode('plus') : getPlanByCode('free');
}
