import { requireAdmin } from '../lib/admin-auth.js';
import { evaluateOpsHealth } from '../lib/ops-health.js';
import { prisma } from '../lib/prisma.js';

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function clampWindowDays(value) {
  const days = Number(value || 7);
  if (!Number.isFinite(days)) return 7;
  return Math.min(Math.max(Math.floor(days), 1), 90);
}

function clampTake(value, fallback = 50) {
  const take = Number(value || fallback);
  if (!Number.isFinite(take)) return fallback;
  return Math.min(Math.max(Math.floor(take), 1), 100);
}

function average(items, selector) {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function ratio(part, total) {
  return total > 0 ? part / total : 0;
}

function uniqueCount(items, selector) {
  return new Set(items.map(selector).filter(Boolean)).size;
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function buildDailySeries({ since, days, questions, reviewTasks, aiEvents, feedback }) {
  const buckets = new Map();
  for (let index = 0; index < days; index++) {
    const date = new Date(since);
    date.setDate(date.getDate() + index);
    buckets.set(dayKey(date), {
      date: dayKey(date),
      questions: 0,
      dueReviews: 0,
      completedReviews: 0,
      feedback: 0,
      aiEvents: 0,
      aiFailures: 0,
      aiCostEstimate: 0,
    });
  }

  for (const question of questions) {
    const bucket = buckets.get(dayKey(question.createdAt));
    if (bucket) bucket.questions++;
  }
  for (const task of reviewTasks) {
    const dueBucket = buckets.get(dayKey(task.dueAt));
    if (dueBucket) dueBucket.dueReviews++;
    if (task.answeredAt) {
      const answeredBucket = buckets.get(dayKey(task.answeredAt));
      if (answeredBucket) answeredBucket.completedReviews++;
    }
  }
  for (const event of aiEvents) {
    const bucket = buckets.get(dayKey(event.createdAt));
    if (!bucket) continue;
    bucket.aiEvents++;
    if (!event.success) bucket.aiFailures++;
    bucket.aiCostEstimate += Number(event.costEstimate || 0);
  }
  for (const item of feedback) {
    const bucket = buckets.get(dayKey(item.createdAt));
    if (bucket) bucket.feedback++;
  }

  return [...buckets.values()];
}

const QUESTION_STATUSES = new Set(['started', 'guiding', 'solved', 'abandoned']);
const INPUT_TYPES = new Set(['text', 'image', 'voice']);
const PAYMENT_ORDER_STATUSES = new Set(['pending', 'paid', 'failed', 'canceled', 'refunded']);
const SUBSCRIPTION_STATUSES = new Set(['active', 'expired', 'canceled']);

export async function adminRoutes(app) {
  app.get('/summary', async request => {
    requireAdmin(request);
    const windowDays = clampWindowDays(request.query?.days);
    const since = daysAgo(windowDays);
    const [
      users,
      questions,
      reviewTasks,
      feedback,
      aiEvents,
      errorRecords,
      paymentOrders,
      activeSubscriptions,
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.question.count({ where: { createdAt: { gte: since } } }),
      prisma.reviewTask.findMany({ where: { createdAt: { gte: since } } }),
      prisma.userFeedback.count({ where: { createdAt: { gte: since } } }),
      prisma.aiEvent.findMany({ where: { createdAt: { gte: since } } }),
      prisma.errorRecord.count({ where: { createdAt: { gte: since } } }),
      prisma.paymentOrder.findMany({ where: { createdAt: { gte: since } } }),
      prisma.subscription.count({
        where: {
          status: 'active',
          startsAt: { lte: new Date() },
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    const aiFailures = aiEvents.filter(event => !event.success).length;
    const aiCost = aiEvents.reduce((sum, event) => sum + Number(event.costEstimate || 0), 0);
    const paidOrders = paymentOrders.filter(order => order.status === 'paid');
    const paidAmountCents = paidOrders.reduce((sum, order) => sum + order.amountCents, 0);

    return {
      windowDays,
      newUsers: users,
      questions,
      errorRecords,
      reviewTasks: reviewTasks.length,
      completedReviewTasks: reviewTasks.filter(task => task.status === 'done').length,
      feedback,
      aiEvents: aiEvents.length,
      aiFailures,
      aiFailureRate: aiEvents.length ? aiFailures / aiEvents.length : 0,
      avgAiLatencyMs: average(aiEvents, event => event.latencyMs),
      totalAiCostEstimate: aiCost,
      paymentOrders: paymentOrders.length,
      paidOrders: paidOrders.length,
      paidAmountCents,
      activeSubscriptions,
    };
  });

  app.get('/metrics', async request => {
    requireAdmin(request);
    const windowDays = clampWindowDays(request.query?.days);
    const now = new Date();
    const since = daysAgo(windowDays);
    const retentionCohortStart = daysAgo(windowDays * 2);
    const retentionCohortEnd = since;

    const [
      totalUsers,
      newUsers,
      questions,
      reviewTasks,
      feedback,
      aiEvents,
      paymentOrders,
      subscriptions,
      retentionCohortUsers,
      retentionActivityQuestions,
      retentionActivityReviews,
      retentionActivityAiEvents,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.question.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, userId: true, subjectId: true, createdAt: true },
      }),
      prisma.reviewTask.findMany({
        where: {
          OR: [
            { dueAt: { gte: since, lte: now } },
            { answeredAt: { gte: since } },
          ],
        },
        select: {
          id: true,
          userId: true,
          status: true,
          answeredCorrectly: true,
          dueAt: true,
          answeredAt: true,
          createdAt: true,
        },
      }),
      prisma.userFeedback.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, userId: true, rating: true, category: true, createdAt: true },
      }),
      prisma.aiEvent.findMany({
        where: { createdAt: { gte: since } },
        select: {
          id: true,
          userId: true,
          eventType: true,
          success: true,
          latencyMs: true,
          costEstimate: true,
          createdAt: true,
        },
      }),
      prisma.paymentOrder.findMany({
        where: { createdAt: { gte: since } },
        select: { id: true, userId: true, status: true, amountCents: true, createdAt: true },
      }),
      prisma.subscription.findMany({
        where: {
          OR: [
            { createdAt: { gte: since } },
            { canceledAt: { gte: since } },
            { expiresAt: { gte: since, lte: now } },
          ],
        },
        select: {
          id: true,
          userId: true,
          status: true,
          cancelAtPeriodEnd: true,
          canceledAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        where: {
          createdAt: {
            gte: retentionCohortStart,
            lt: retentionCohortEnd,
          },
        },
        select: { id: true },
      }),
      prisma.question.findMany({
        where: { createdAt: { gte: retentionCohortEnd } },
        select: { userId: true },
      }),
      prisma.reviewTask.findMany({
        where: { answeredAt: { gte: retentionCohortEnd } },
        select: { userId: true },
      }),
      prisma.aiEvent.findMany({
        where: { createdAt: { gte: retentionCohortEnd } },
        select: { userId: true },
      }),
    ]);

    const dueReviewTasks = reviewTasks.filter(task => task.dueAt >= since && task.dueAt <= now);
    const completedReviewTasks = dueReviewTasks.filter(task => task.status === 'done');
    const answeredReviewTasks = reviewTasks.filter(task => task.answeredAt);
    const correctReviewTasks = answeredReviewTasks.filter(task => task.answeredCorrectly);
    const aiFailures = aiEvents.filter(event => !event.success);
    const aiCost = aiEvents.reduce((sum, event) => sum + Number(event.costEstimate || 0), 0);
    const paidOrders = paymentOrders.filter(order => order.status === 'paid');
    const refundedOrders = paymentOrders.filter(order => order.status === 'refunded');
    const activeSubscriptions = subscriptions.filter(item => item.status === 'active' && item.expiresAt > now);
    const cancelAtPeriodEndSubscriptions = activeSubscriptions.filter(item => item.cancelAtPeriodEnd);
    const activeUserIds = new Set([
      ...questions.map(item => item.userId),
      ...answeredReviewTasks.map(item => item.userId),
      ...feedback.map(item => item.userId),
      ...aiEvents.map(item => item.userId),
    ].filter(Boolean));
    const retentionActivityUserIds = new Set([
      ...retentionActivityQuestions.map(item => item.userId),
      ...retentionActivityReviews.map(item => item.userId),
      ...retentionActivityAiEvents.map(item => item.userId),
    ].filter(Boolean));
    const retainedUsers = retentionCohortUsers.filter(user => retentionActivityUserIds.has(user.id)).length;

    return {
      generatedAt: now.toISOString(),
      window: {
        days: windowDays,
        since: since.toISOString(),
        until: now.toISOString(),
      },
      acquisition: {
        totalUsers,
        newUsers,
        activeUsers: activeUserIds.size,
        questionUsers: uniqueCount(questions, item => item.userId),
      },
      retention: {
        cohort: {
          since: retentionCohortStart.toISOString(),
          until: retentionCohortEnd.toISOString(),
          users: retentionCohortUsers.length,
        },
        retainedUsers,
        retentionRate: ratio(retainedUsers, retentionCohortUsers.length),
      },
      learningLoop: {
        questionCount: questions.length,
        dueReviewCount: dueReviewTasks.length,
        completedReviewCount: completedReviewTasks.length,
        reviewCompletionRate: ratio(completedReviewTasks.length, dueReviewTasks.length),
        answeredReviewCount: answeredReviewTasks.length,
        reviewCorrectRate: ratio(correctReviewTasks.length, answeredReviewTasks.length),
      },
      satisfaction: {
        feedbackCount: feedback.length,
        averageRating: average(feedback, item => item.rating || 0),
        ratingCount: feedback.filter(item => item.rating).length,
      },
      ai: {
        eventCount: aiEvents.length,
        failureCount: aiFailures.length,
        failureRate: ratio(aiFailures.length, aiEvents.length),
        averageLatencyMs: average(aiEvents, event => event.latencyMs),
        totalCostEstimate: aiCost,
        byEventType: Object.values(aiEvents.reduce((acc, event) => {
          const current = acc[event.eventType] || {
            eventType: event.eventType,
            count: 0,
            failures: 0,
            averageLatencyMs: 0,
            totalCostEstimate: 0,
          };
          current.count++;
          if (!event.success) current.failures++;
          current.averageLatencyMs += event.latencyMs;
          current.totalCostEstimate += Number(event.costEstimate || 0);
          acc[event.eventType] = current;
          return acc;
        }, {})).map(item => ({
          ...item,
          failureRate: ratio(item.failures, item.count),
          averageLatencyMs: ratio(item.averageLatencyMs, item.count),
        })),
      },
      billing: {
        orderCount: paymentOrders.length,
        paidOrderCount: paidOrders.length,
        refundedOrderCount: refundedOrders.length,
        paidAmountCents: paidOrders.reduce((sum, order) => sum + order.amountCents, 0),
        refundedAmountCents: refundedOrders.reduce((sum, order) => sum + order.amountCents, 0),
        activeSubscriptions: activeSubscriptions.length,
        cancelAtPeriodEndSubscriptions: cancelAtPeriodEndSubscriptions.length,
      },
      daily: buildDailySeries({ since, days: windowDays, questions, reviewTasks, aiEvents, feedback }),
    };
  });

  app.get('/ops-health', async request => {
    requireAdmin(request);
    return evaluateOpsHealth({ days: clampWindowDays(request.query?.days) });
  });

  app.get('/billing', async request => {
    requireAdmin(request);
    const take = clampTake(request.query?.take);
    const since = daysAgo(clampWindowDays(request.query?.days));
    const orderWhere = { createdAt: { gte: since } };
    if (request.query?.userId) orderWhere.userId = String(request.query.userId);
    if (request.query?.status && PAYMENT_ORDER_STATUSES.has(request.query.status)) {
      orderWhere.status = request.query.status;
    }

    const subscriptionWhere = request.query?.userId ? { userId: String(request.query.userId) } : {};
    if (request.query?.subscriptionStatus && SUBSCRIPTION_STATUSES.has(request.query.subscriptionStatus)) {
      subscriptionWhere.status = request.query.subscriptionStatus;
    }

    const [orders, subscriptions, orderStatusCounts] = await Promise.all([
      prisma.paymentOrder.findMany({
        where: orderWhere,
        orderBy: { createdAt: 'desc' },
        take,
        include: { user: { select: { id: true, phone: true, nickname: true } } },
      }),
      prisma.subscription.findMany({
        where: subscriptionWhere,
        orderBy: { createdAt: 'desc' },
        take,
        include: { user: { select: { id: true, phone: true, nickname: true } } },
      }),
      prisma.paymentOrder.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { amountCents: true },
      }),
    ]);

    return {
      windowDays: clampWindowDays(request.query?.days),
      filters: {
        userId: request.query?.userId || null,
        status: request.query?.status || null,
        subscriptionStatus: request.query?.subscriptionStatus || null,
      },
      summary: {
        ordersByStatus: orderStatusCounts.map(item => ({
          status: item.status,
          count: item._count._all,
          amountCents: item._sum.amountCents || 0,
        })),
      },
      orders,
      subscriptions,
    };
  });

  app.get('/billing/reconciliation', async request => {
    requireAdmin(request);
    const now = new Date();
    const take = clampTake(request.query?.take, 20);
    const [subscriptionOrderRefs, activeSubscriptionOrderRefs, paidOrderRefs] = await Promise.all([
      prisma.subscription.findMany({ select: { sourceOrderId: true } }),
      prisma.subscription.findMany({ where: { status: 'active' }, select: { sourceOrderId: true } }),
      prisma.paymentOrder.findMany({ where: { status: 'paid' }, select: { id: true } }),
    ]);
    const subscriptionOrderIds = subscriptionOrderRefs.map(item => item.sourceOrderId).filter(Boolean);
    const activeSubscriptionOrderIds = activeSubscriptionOrderRefs.map(item => item.sourceOrderId).filter(Boolean);
    const paidOrderIds = paidOrderRefs.map(item => item.id);
    const [
      paidOrdersWithoutSubscription,
      activeSubscriptionsWithoutPaidOrder,
      refundedOrdersWithActiveSubscription,
      expiredActiveSubscriptions,
    ] = await Promise.all([
      prisma.paymentOrder.findMany({
        where: {
          status: 'paid',
          NOT: { id: { in: subscriptionOrderIds } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.subscription.findMany({
        where: {
          status: 'active',
          OR: [
            { sourceOrderId: null },
            { NOT: { sourceOrderId: { in: paidOrderIds } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      prisma.paymentOrder.findMany({
        where: {
          status: 'refunded',
          id: { in: activeSubscriptionOrderIds },
        },
        orderBy: { updatedAt: 'desc' },
        take,
      }),
      prisma.subscription.findMany({
        where: {
          status: 'active',
          expiresAt: { lte: now },
        },
        orderBy: { expiresAt: 'desc' },
        take,
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      ok: paidOrdersWithoutSubscription.length === 0
        && activeSubscriptionsWithoutPaidOrder.length === 0
        && refundedOrdersWithActiveSubscription.length === 0
        && expiredActiveSubscriptions.length === 0,
      paidOrdersWithoutSubscription,
      activeSubscriptionsWithoutPaidOrder,
      refundedOrdersWithActiveSubscription,
      expiredActiveSubscriptions,
    };
  });

  app.get('/users', async request => {
    requireAdmin(request);
    const take = clampTake(request.query?.take);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        profile: true,
        questions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, createdAt: true, subject: { select: { code: true, name: true } } },
        },
        aiEvents: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, eventType: true, success: true, createdAt: true },
        },
        _count: {
          select: {
            sessions: true,
            questions: true,
            errorRecords: true,
            reviewTasks: true,
            feedback: true,
            aiEvents: true,
            paymentOrders: true,
            subscriptions: true,
          },
        },
      },
    });

    return users.map(user => ({
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      role: user.role,
      profile: user.profile,
      createdAt: user.createdAt,
      policyVersion: user.policyVersion,
      termsAcceptedAt: user.termsAcceptedAt,
      counts: user._count,
      lastQuestionAt: user.questions[0]?.createdAt || null,
      lastAiEvent: user.aiEvents[0] || null,
    }));
  });

  app.get('/users/:id', async (request, reply) => {
    requireAdmin(request);
    const user = await prisma.user.findUnique({
      where: { id: request.params.id },
      include: {
        profile: true,
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
          },
        },
        questions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { subject: true },
        },
        errorRecords: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { subject: true, knowledgeNode: true },
        },
        reviewTasks: {
          orderBy: { dueAt: 'desc' },
          take: 10,
          include: { errorRecord: { include: { subject: true } } },
        },
        feedback: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        aiEvents: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        paymentOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            sessions: true,
            questions: true,
            errorRecords: true,
            reviewTasks: true,
            feedback: true,
            aiEvents: true,
            paymentOrders: true,
            subscriptions: true,
          },
        },
      },
    });
    if (!user) return reply.code(404).send({ error: 'User not found' });

    return {
      user: {
        id: user.id,
        phone: user.phone,
        nickname: user.nickname,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        policyVersion: user.policyVersion,
        termsAcceptedAt: user.termsAcceptedAt,
        privacyAcceptedAt: user.privacyAcceptedAt,
        minorNoticeAcceptedAt: user.minorNoticeAcceptedAt,
      },
      profile: user.profile,
      counts: user._count,
      sessions: user.sessions,
      recentQuestions: user.questions,
      recentErrorRecords: user.errorRecords,
      recentReviewTasks: user.reviewTasks,
      recentFeedback: user.feedback,
      recentAiEvents: user.aiEvents,
      recentPaymentOrders: user.paymentOrders,
      recentSubscriptions: user.subscriptions,
    };
  });

  app.get('/feedback', async request => {
    requireAdmin(request);
    const take = clampTake(request.query?.take);
    return prisma.userFeedback.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { id: true, nickname: true, phone: true } } },
    });
  });

  app.get('/ai-events', async request => {
    requireAdmin(request);
    const take = clampTake(request.query?.take);
    return prisma.aiEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { user: { select: { id: true, nickname: true } } },
    });
  });

  app.get('/content-review', async request => {
    requireAdmin(request);
    const take = clampTake(request.query?.take);
    const since = daysAgo(clampWindowDays(request.query?.days));
    const [safetyEvents, aiFailures, lowRatingFeedback, recentContentFeedback] = await Promise.all([
      prisma.aiEvent.findMany({
        where: {
          eventType: 'safety_check',
          success: false,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take,
        include: { user: { select: { id: true, nickname: true, phone: true } } },
      }),
      prisma.aiEvent.findMany({
        where: {
          success: false,
          eventType: { not: 'safety_check' },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take,
        include: { user: { select: { id: true, nickname: true, phone: true } } },
      }),
      prisma.userFeedback.findMany({
        where: {
          rating: { lte: 2 },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take,
        include: { user: { select: { id: true, nickname: true, phone: true } } },
      }),
      prisma.userFeedback.findMany({
        where: {
          category: { in: ['ai_quality', 'content'] },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take,
        include: { user: { select: { id: true, nickname: true, phone: true } } },
      }),
    ]);

    return {
      windowDays: clampWindowDays(request.query?.days),
      safetyEvents: safetyEvents.map(event => ({
        id: event.id,
        type: 'safety_event',
        severity: event.errorMessage?.split(':')[1] || 'unknown',
        category: event.errorMessage?.split(':')[0] || 'unknown',
        user: event.user,
        createdAt: event.createdAt,
      })),
      aiFailures: aiFailures.map(event => ({
        id: event.id,
        type: 'ai_failure',
        eventType: event.eventType,
        provider: event.provider,
        model: event.model,
        promptVersion: event.promptVersion,
        errorMessage: event.errorMessage,
        user: event.user,
        createdAt: event.createdAt,
      })),
      lowRatingFeedback,
      recentContentFeedback,
    };
  });

  app.get('/questions', async request => {
    requireAdmin(request);
    const take = clampTake(request.query?.take);
    const where = {
      createdAt: { gte: daysAgo(clampWindowDays(request.query?.days)) },
    };

    if (request.query?.userId) where.userId = String(request.query.userId);
    if (request.query?.status && QUESTION_STATUSES.has(request.query.status)) {
      where.status = request.query.status;
    }
    if (request.query?.inputType && INPUT_TYPES.has(request.query.inputType)) {
      where.inputType = request.query.inputType;
    }
    if (request.query?.subjectCode) {
      where.subject = { code: String(request.query.subjectCode) };
    }
    const keyword = String(request.query?.q || '').trim();
    if (keyword) {
      where.OR = [
        { originalText: { contains: keyword, mode: 'insensitive' } },
        { ocrText: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.question.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          user: { select: { id: true, nickname: true, phone: true, profile: true } },
          subject: true,
          errorRecords: {
            take: 3,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              knowledgePoint: true,
              status: true,
              correctStreak: true,
              createdAt: true,
            },
          },
          answerSessions: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              currentStep: true,
              finalAnswerRevealed: true,
              solvedIndependently: true,
              createdAt: true,
              updatedAt: true,
              _count: { select: { messages: true } },
            },
          },
          _count: {
            select: {
              answerSessions: true,
              errorRecords: true,
            },
          },
        },
      }),
      prisma.question.count({ where }),
    ]);

    return {
      total,
      take,
      filters: {
        days: clampWindowDays(request.query?.days),
        userId: request.query?.userId || null,
        subjectCode: request.query?.subjectCode || null,
        status: request.query?.status || null,
        inputType: request.query?.inputType || null,
        q: keyword || null,
      },
      items: items.map(question => ({
        id: question.id,
        user: question.user,
        subject: question.subject,
        inputType: question.inputType,
        status: question.status,
        title: question.originalText || question.ocrText || '未命名题目',
        hasImage: Boolean(question.imageUrl),
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
        counts: question._count,
        latestAnswerSession: question.answerSessions[0] || null,
        errorRecords: question.errorRecords,
      })),
    };
  });

  app.get('/questions/:id', async (request, reply) => {
    requireAdmin(request);
    const question = await prisma.question.findUnique({
      where: { id: request.params.id },
      include: {
        user: { select: { id: true, nickname: true, phone: true, profile: true } },
        subject: true,
        answerSessions: {
          orderBy: { createdAt: 'desc' },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        },
        errorRecords: {
          include: {
            subject: true,
            knowledgeNode: true,
            reviewTasks: { orderBy: { dueAt: 'asc' } },
          },
        },
      },
    });
    if (!question) return reply.code(404).send({ error: 'Question not found' });

    const aiEvents = await prisma.aiEvent.findMany({
      where: {
        userId: question.userId,
        createdAt: {
          gte: new Date(question.createdAt.getTime() - 5 * 60 * 1000),
          lte: new Date(question.updatedAt.getTime() + 30 * 60 * 1000),
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return {
      question,
      replay: {
        answerSessions: question.answerSessions,
        errorRecords: question.errorRecords,
        nearbyAiEvents: aiEvents,
      },
    };
  });
}
