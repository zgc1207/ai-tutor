import { getOpsHealthThresholds } from './config.js';
import { prisma } from './prisma.js';

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function ratio(part, total) {
  return total > 0 ? part / total : 0;
}

function average(items, selector) {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function buildCheck({ name, level, passed, observed, threshold, message }) {
  return {
    name,
    level,
    status: passed ? 'pass' : level,
    observed,
    threshold,
    message,
  };
}

export async function evaluateOpsHealth({ days = 7, env = process.env } = {}) {
  const windowDays = Math.min(Math.max(Math.floor(Number(days) || 7), 1), 30);
  const now = new Date();
  const since = daysAgo(windowDays);
  const thresholds = getOpsHealthThresholds(env);

  const [aiEvents, reviewTasks, feedback, questions, activeUsers] = await Promise.all([
    prisma.aiEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { success: true, costEstimate: true, latencyMs: true },
    }),
    prisma.reviewTask.findMany({
      where: {
        OR: [
          { dueAt: { gte: since, lte: now } },
          { answeredAt: { gte: since } },
        ],
      },
      select: { status: true, dueAt: true, answeredAt: true },
    }),
    prisma.userFeedback.findMany({
      where: { createdAt: { gte: since } },
      select: { rating: true },
    }),
    prisma.question.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count({
      where: {
        OR: [
          { questions: { some: { createdAt: { gte: since } } } },
          { aiEvents: { some: { createdAt: { gte: since } } } },
          { reviewTasks: { some: { answeredAt: { gte: since } } } },
        ],
      },
    }),
  ]);

  const aiFailures = aiEvents.filter(event => !event.success).length;
  const aiFailureRate = ratio(aiFailures, aiEvents.length);
  const totalAiCost = aiEvents.reduce((sum, event) => sum + Number(event.costEstimate || 0), 0);
  const dailyAiCost = totalAiCost / windowDays;
  const dueReviewTasks = reviewTasks.filter(task => task.dueAt >= since && task.dueAt <= now);
  const completedReviewTasks = dueReviewTasks.filter(task => task.status === 'done');
  const reviewCompletionRate = ratio(completedReviewTasks.length, dueReviewTasks.length);
  const ratingFeedback = feedback.filter(item => item.rating);
  const averageFeedbackRating = average(ratingFeedback, item => item.rating || 0);

  const checks = [
    buildCheck({
      name: 'ai.failureRate',
      level: 'fail',
      passed: aiFailureRate <= thresholds.maxAiFailureRate,
      observed: aiFailureRate,
      threshold: thresholds.maxAiFailureRate,
      message: 'AI 失败率超过阈值时应暂停扩量并排查模型、OCR 或 provider。',
    }),
    buildCheck({
      name: 'ai.dailyCost',
      level: 'warn',
      passed: dailyAiCost <= thresholds.maxDailyAiCost,
      observed: dailyAiCost,
      threshold: thresholds.maxDailyAiCost,
      message: 'AI 日均成本超过阈值时应检查配额、模型和异常重试。',
    }),
    buildCheck({
      name: 'learning.reviewCompletionRate',
      level: 'warn',
      passed: dueReviewTasks.length === 0 || reviewCompletionRate >= thresholds.minReviewCompletionRate,
      observed: reviewCompletionRate,
      threshold: thresholds.minReviewCompletionRate,
      message: '复习完成率过低时应观察提醒、题目难度和复习入口体验。',
    }),
    buildCheck({
      name: 'feedback.averageRating',
      level: 'warn',
      passed: ratingFeedback.length === 0 || averageFeedbackRating >= thresholds.minAverageFeedbackRating,
      observed: averageFeedbackRating,
      threshold: thresholds.minAverageFeedbackRating,
      message: '反馈评分偏低时应查看低分反馈和内容审核队列。',
    }),
  ];

  const failCount = checks.filter(check => check.status === 'fail').length;
  const warnCount = checks.filter(check => check.status === 'warn').length;

  return {
    ok: failCount === 0,
    status: failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass',
    generatedAt: now.toISOString(),
    window: {
      days: windowDays,
      since: since.toISOString(),
      until: now.toISOString(),
    },
    thresholds,
    summary: {
      activeUsers,
      questions,
      aiEvents: aiEvents.length,
      aiFailures,
      aiFailureRate,
      totalAiCost,
      dailyAiCost,
      dueReviewTasks: dueReviewTasks.length,
      completedReviewTasks: completedReviewTasks.length,
      reviewCompletionRate,
      feedbackCount: feedback.length,
      ratingCount: ratingFeedback.length,
      averageFeedbackRating,
    },
    checks,
    recommendedAction: failCount > 0
      ? 'pause_expansion'
      : warnCount > 0
        ? 'watch_and_investigate'
        : 'continue',
  };
}
