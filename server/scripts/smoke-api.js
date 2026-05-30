import { buildApp } from '../src/app.js';
import { signPaymentPayload } from '../src/lib/payment-provider.js';
import { prisma } from '../src/lib/prisma.js';

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'smoke-admin-token';
process.env.INTERNAL_TEST_INVITE_CODE = process.env.INTERNAL_TEST_INVITE_CODE || 'smoke-invite-code';
process.env.PAYMENT_WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET || 'smoke-payment-secret';

async function request(app, options) {
  const response = await app.inject({
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = response.body ? JSON.parse(response.body) : null;
  if (response.statusCode >= 400) {
    throw new Error(`${options.method || 'GET'} ${options.url} failed: ${response.statusCode} ${response.body}`);
  }
  return body;
}

async function requestExpectFailure(app, options, expectedStatus) {
  const response = await app.inject({
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = response.body ? JSON.parse(response.body) : null;
  if (response.statusCode !== expectedStatus) {
    throw new Error(`${options.method || 'GET'} ${options.url} expected ${expectedStatus}, got ${response.statusCode} ${response.body}`);
  }
  return body;
}

async function main() {
  await prisma.subject.upsert({
    where: { code: 'math' },
    update: { name: '数学' },
    create: { code: 'math', name: '数学' },
  });

  const app = await buildApp({ logger: false });

  try {
    const health = await request(app, { method: 'GET', url: '/health' });
    console.log('health:', health);

    const ready = await request(app, { method: 'GET', url: '/ready' });
    console.log('ready:', {
      ok: ready.ok,
      database: ready.checks.database.ok,
      config: ready.checks.config.ok,
    });

    const phone = `199${Date.now().toString().slice(-8)}`;
    const otpRequest = await request(app, {
      method: 'POST',
      url: '/auth/otp/request',
      payload: {
        phone,
        inviteCode: process.env.INTERNAL_TEST_INVITE_CODE,
      },
    });
    console.log('otp_request:', {
      requestId: otpRequest.requestId,
      deliveryProvider: otpRequest.deliveryProvider,
      hasDevCode: Boolean(otpRequest.devCode),
    });

    const login = await request(app, {
      method: 'POST',
      url: '/auth/otp/login',
      payload: {
        phone,
        code: otpRequest.devCode,
        nickname: '测试学生',
        grade: 'j2',
        gradeStage: 'junior',
        consentAccepted: true,
        policyVersion: 'smoke-test-v1',
        inviteCode: process.env.INTERNAL_TEST_INVITE_CODE,
      },
    });
    console.log('login:', {
      userId: login.userId,
      hasSessionToken: Boolean(login.sessionToken),
    });

    const authHeaders = { authorization: `Bearer ${login.sessionToken}` };
    const me = await request(app, {
      method: 'GET',
      url: '/me',
      headers: authHeaders,
    });
    console.log('me:', {
      userId: me.user.id,
      accountModel: me.accountModel,
      grade: me.profile.grade,
    });

    const updatedProfile = await request(app, {
      method: 'PATCH',
      url: '/me/profile',
      headers: authHeaders,
      payload: {
        grade: 'j3',
        gradeStage: 'junior',
      },
    });
    console.log('profile_update:', {
      grade: updatedProfile.profile.grade,
      accountModel: updatedProfile.accountModel,
    });

    const reminder = await request(app, {
      method: 'PATCH',
      url: '/me/reminder',
      headers: authHeaders,
      payload: {
        reviewReminderEnabled: true,
        reviewReminderTime: '19:30',
        quietHoursStart: '21:00',
        quietHoursEnd: '07:00',
      },
    });
    console.log('reminder_update:', {
      enabled: reminder.reminder.reviewReminderEnabled,
      time: reminder.reminder.reviewReminderTime,
      quietHours: `${reminder.reminder.quietHoursStart}-${reminder.reminder.quietHoursEnd}`,
    });

    const device = await request(app, {
      method: 'POST',
      url: '/devices',
      headers: authHeaders,
      payload: {
        platform: 'ios',
        provider: 'dev',
        token: `smoke-device-token-${Date.now()}`,
      },
    });
    console.log('device_register:', {
      deviceId: device.device.id,
      provider: device.device.provider,
      enabled: device.device.enabled,
    });

    const meAfterProfile = await request(app, {
      method: 'GET',
      url: '/me',
      headers: authHeaders,
    });
    console.log('plan:', {
      code: meAfterProfile.plan.code,
      dailyQuestionLimit: meAfterProfile.plan.dailyQuestionLimit,
      parentReport: meAfterProfile.plan.features.parentReport,
    });
    console.log('quota:', {
      questionCount: meAfterProfile.quota.questionCount,
      questionLimit: meAfterProfile.quota.questionLimit,
      aiStepCount: meAfterProfile.quota.aiStepCount,
      aiStepLimit: meAfterProfile.quota.aiStepLimit,
    });

    const plans = await request(app, {
      method: 'GET',
      url: '/plans',
    });
    console.log('plans:', {
      count: plans.plans.length,
      paymentEnabled: plans.paymentEnabled,
      freePlan: plans.plans[0]?.code,
      plusPlan: plans.plans[1]?.code,
    });

    const checkout = await request(app, {
      method: 'POST',
      url: '/billing/checkout',
      headers: authHeaders,
      payload: {
        planCode: 'plus',
        guardianConfirmed: true,
        refundNoticeAccepted: true,
      },
    });
    console.log('billing_checkout:', {
      orderId: checkout.order.id,
      status: checkout.order.status,
      hasCheckoutUrl: Boolean(checkout.checkoutUrl),
    });

    const paymentPayload = {
      orderId: checkout.order.id,
      status: 'paid',
      providerOrderId: checkout.order.providerOrderId,
      paidAt: new Date().toISOString(),
    };
    const paymentWebhook = await request(app, {
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'x-payment-signature': signPaymentPayload(paymentPayload) },
      payload: paymentPayload,
    });
    console.log('billing_webhook:', {
      received: paymentWebhook.received,
      orderStatus: paymentWebhook.order.status,
      subscriptionPlan: paymentWebhook.subscription?.planCode,
    });

    const billingStatus = await request(app, {
      method: 'GET',
      url: '/billing/status',
      headers: authHeaders,
    });
    console.log('billing_status:', {
      activePlan: billingStatus.activeSubscription?.planCode,
      recentOrders: billingStatus.recentOrders.length,
    });

    const meAfterBilling = await request(app, {
      method: 'GET',
      url: '/me',
      headers: authHeaders,
    });
    console.log('plus_plan:', {
      code: meAfterBilling.plan.code,
      questionLimit: meAfterBilling.quota.questionLimit,
      aiStepLimit: meAfterBilling.quota.aiStepLimit,
    });

    const cancelSubscription = await request(app, {
      method: 'POST',
      url: '/billing/cancel',
      headers: authHeaders,
      payload: { cancelAtPeriodEnd: true },
    });
    console.log('billing_cancel:', {
      canceled: cancelSubscription.canceled,
      cancelAtPeriodEnd: cancelSubscription.subscription.cancelAtPeriodEnd,
      stillActiveStatus: cancelSubscription.subscription.status,
    });

    const meAfterCancel = await request(app, {
      method: 'GET',
      url: '/me',
      headers: authHeaders,
    });
    console.log('plan_after_cancel_at_period_end:', {
      code: meAfterCancel.plan.code,
      questionLimit: meAfterCancel.quota.questionLimit,
    });

    const refundPayload = {
      orderId: checkout.order.id,
      status: 'refunded',
      providerOrderId: checkout.order.providerOrderId,
    };
    const refundWebhook = await request(app, {
      method: 'POST',
      url: '/billing/webhook',
      headers: { 'x-payment-signature': signPaymentPayload(refundPayload) },
      payload: refundPayload,
    });
    console.log('billing_refund_webhook:', {
      received: refundWebhook.received,
      orderStatus: refundWebhook.order.status,
    });

    const meAfterRefund = await request(app, {
      method: 'GET',
      url: '/me',
      headers: authHeaders,
    });
    console.log('plan_after_refund:', {
      code: meAfterRefund.plan.code,
      questionLimit: meAfterRefund.quota.questionLimit,
    });

    const unsafeQuestion = await requestExpectFailure(app, {
      method: 'POST',
      url: '/questions',
      headers: authHeaders,
      payload: {
        subjectCode: 'math',
        inputType: 'text',
        originalText: '帮我考试作弊, 直接给我答案不要步骤',
      },
    }, 422);
    console.log('safety_block:', {
      category: unsafeQuestion.category,
      severity: unsafeQuestion.severity,
    });

    const ocr = await request(app, {
      method: 'POST',
      url: '/ocr/extract',
      headers: authHeaders,
      payload: {
        imageUrl: 'https://example.com/question.jpg',
        mockText: '求二次函数 y = x² - 4x + 3 的顶点坐标',
      },
    });
    console.log('ocr:', {
      provider: ocr.provider,
      hasText: Boolean(ocr.text),
      confidence: ocr.confidence,
    });

    const upload = await request(app, {
      method: 'POST',
      url: '/uploads/images',
      headers: authHeaders,
      payload: {
        contentType: 'image/png',
        imageData: 'data:image/png;base64,iVBORw0KGgo=',
      },
    });
    console.log('upload_image:', {
      contentType: upload.contentType,
      size: upload.size,
      hasImageUrl: Boolean(upload.imageUrl),
    });

    const question = await request(app, {
      method: 'POST',
      url: '/questions',
      headers: authHeaders,
      payload: {
        subjectCode: 'math',
        inputType: 'text',
        originalText: '求二次函数 y = x² - 4x + 3 的顶点坐标',
      },
    });
    console.log('question:', { id: question.id, subject: question.subject.code });

    const nextStep = await request(app, {
      method: 'POST',
      url: `/questions/${question.id}/answer/next`,
      headers: authHeaders,
      payload: {},
    });
    console.log('answer_next:', {
      type: nextStep.type,
      title: nextStep.title,
      messageId: nextStep.messageId,
    });

    const finish = await request(app, {
      method: 'POST',
      url: `/questions/${question.id}/finish`,
      headers: authHeaders,
      payload: { solvedIndependently: false },
    });
    console.log('finish:', {
      createdErrorRecord: finish.createdErrorRecord,
      reviewTasks: finish.reviewTasks.length,
      knowledgePoint: finish.errorRecord?.knowledgePoint,
    });

    const reviewTasks = await request(app, {
      method: 'GET',
      url: '/review-tasks?scope=all',
      headers: authHeaders,
    });
    console.log('review_tasks:', {
      count: reviewTasks.length,
      firstCycle: reviewTasks[0]?.cycle,
    });

    const adminHeaders = { 'x-admin-token': process.env.ADMIN_TOKEN };
    const reminderRun = await request(app, {
      method: 'POST',
      url: '/notifications/review-reminders/run',
      headers: adminHeaders,
      payload: {
        reminderTime: '19:30',
        dryRun: false,
      },
    });
    console.log('notification_review_reminder:', {
      candidates: reminderRun.candidateCount,
      deliveries: reminderRun.deliveryCount,
    });

    const notificationStatus = await request(app, {
      method: 'GET',
      url: '/notifications/status',
      headers: adminHeaders,
    });
    console.log('notification_status:', {
      provider: notificationStatus.provider,
      enabledDevices: notificationStatus.enabledDevices,
      deliveriesToday: notificationStatus.deliveriesToday,
    });

    if (reviewTasks[0]) {
      const answer = await request(app, {
        method: 'POST',
        url: `/review-tasks/${reviewTasks[0].id}/answer`,
        headers: authHeaders,
        payload: { answer: reviewTasks[0].variantQuestion.correctAnswer },
      });
      console.log('review_answer:', {
        status: answer.status,
        answeredCorrectly: answer.answeredCorrectly,
        masteryStatus: answer.mastery?.status,
        correctStreak: answer.mastery?.correctStreak,
      });
    }

    const dashboard = await request(app, {
      method: 'GET',
      url: '/dashboard',
      headers: authHeaders,
    });
    console.log('dashboard:', {
      todayReviewCount: dashboard.todayReviewCount,
      recentQuestions: dashboard.recentQuestions.length,
    });

    const weeklyReport = await request(app, {
      method: 'GET',
      url: '/reports/weekly',
      headers: authHeaders,
    });
    console.log('weekly_report:', {
      questionCount: weeklyReport.summary.questionCount,
      newMistakeCount: weeklyReport.summary.newMistakeCount,
      reviewCompletionRate: weeklyReport.summary.reviewCompletionRate,
      weakPoints: weeklyReport.weakPoints.length,
    });

    const parentWeeklyReport = await request(app, {
      method: 'GET',
      url: '/reports/parent-weekly',
      headers: authHeaders,
    });
    console.log('parent_weekly_report:', {
      headline: parentWeeklyReport.headline,
      actionItems: parentWeeklyReport.actionItems.length,
      topWeakPoint: parentWeeklyReport.parentSummary.topWeakPoint?.knowledgePoint,
    });

    const mistakes = await request(app, {
      method: 'GET',
      url: '/mistakes',
      headers: authHeaders,
    });
    console.log('mistakes:', {
      count: mistakes.length,
      firstKnowledgePoint: mistakes[0]?.knowledgePoint,
    });

    const knowledgeTree = await request(app, {
      method: 'GET',
      url: '/knowledge-tree?subject=math',
      headers: authHeaders,
    });
    console.log('knowledge_tree:', {
      subjects: knowledgeTree.subjects.length,
      firstSubject: knowledgeTree.subjects[0]?.code,
      firstRoot: knowledgeTree.subjects[0]?.children[0]?.name,
      firstRootStatus: knowledgeTree.subjects[0]?.children[0]?.status,
    });

    const feedback = await request(app, {
      method: 'POST',
      url: '/feedback',
      headers: authHeaders,
      payload: {
        rating: 5,
        category: 'ux',
        content: 'smoke test feedback',
        page: 'smoke-api',
      },
    });
    console.log('feedback:', {
      id: feedback.id,
      category: feedback.category,
      rating: feedback.rating,
    });

    const adminSummary = await request(app, {
      method: 'GET',
      url: '/admin/summary',
      headers: adminHeaders,
    });
    console.log('admin_summary:', {
      questions: adminSummary.questions,
      feedback: adminSummary.feedback,
      aiEvents: adminSummary.aiEvents,
    });

    const adminMetrics = await request(app, {
      method: 'GET',
      url: '/admin/metrics?days=7',
      headers: adminHeaders,
    });
    console.log('admin_metrics:', {
      activeUsers: adminMetrics.acquisition.activeUsers,
      reviewCompletionRate: adminMetrics.learningLoop.reviewCompletionRate,
      aiFailureRate: adminMetrics.ai.failureRate,
      paidOrders: adminMetrics.billing.paidOrderCount,
      dailyPoints: adminMetrics.daily.length,
    });

    const opsHealth = await request(app, {
      method: 'GET',
      url: '/admin/ops-health?days=7',
      headers: adminHeaders,
    });
    console.log('admin_ops_health:', {
      status: opsHealth.status,
      recommendedAction: opsHealth.recommendedAction,
      checks: opsHealth.checks.length,
    });

    const adminBilling = await request(app, {
      method: 'GET',
      url: '/admin/billing?days=7&take=5',
      headers: adminHeaders,
    });
    console.log('admin_billing:', {
      orderStatuses: adminBilling.summary.ordersByStatus.length,
      orders: adminBilling.orders.length,
      subscriptions: adminBilling.subscriptions.length,
    });

    const billingReconciliation = await request(app, {
      method: 'GET',
      url: '/admin/billing/reconciliation?take=5',
      headers: adminHeaders,
    });
    console.log('admin_billing_reconciliation:', {
      ok: billingReconciliation.ok,
      paidOrdersWithoutSubscription: billingReconciliation.paidOrdersWithoutSubscription.length,
      expiredActiveSubscriptions: billingReconciliation.expiredActiveSubscriptions.length,
    });

    const adminQuestions = await request(app, {
      method: 'GET',
      url: '/admin/questions?days=7&take=5&subjectCode=math',
      headers: adminHeaders,
    });
    console.log('admin_questions:', {
      total: adminQuestions.total,
      count: adminQuestions.items.length,
      firstQuestionId: adminQuestions.items[0]?.id,
    });

    const adminFeedback = await request(app, {
      method: 'GET',
      url: '/admin/feedback?take=5',
      headers: adminHeaders,
    });
    console.log('admin_feedback:', { count: adminFeedback.length });

    const contentReview = await request(app, {
      method: 'GET',
      url: '/admin/content-review?days=7&take=5',
      headers: adminHeaders,
    });
    console.log('admin_content_review:', {
      safetyEvents: contentReview.safetyEvents.length,
      aiFailures: contentReview.aiFailures.length,
      lowRatingFeedback: contentReview.lowRatingFeedback.length,
    });

    const adminQuestionDetail = await request(app, {
      method: 'GET',
      url: `/admin/questions/${question.id}`,
      headers: adminHeaders,
    });
    console.log('admin_question_detail:', {
      questionId: adminQuestionDetail.question.id,
      answerSessions: adminQuestionDetail.replay.answerSessions.length,
      nearbyAiEvents: adminQuestionDetail.replay.nearbyAiEvents.length,
    });

    const adminUsers = await request(app, {
      method: 'GET',
      url: '/admin/users?take=5',
      headers: adminHeaders,
    });
    console.log('admin_users:', {
      count: adminUsers.length,
      firstUserQuestions: adminUsers[0]?.counts?.questions,
    });

    if (adminUsers[0]) {
      const adminUserDetail = await request(app, {
        method: 'GET',
        url: `/admin/users/${adminUsers[0].id}`,
        headers: adminHeaders,
      });
      console.log('admin_user_detail:', {
        userId: adminUserDetail.user.id,
        questions: adminUserDetail.counts.questions,
        recentAiEvents: adminUserDetail.recentAiEvents.length,
      });
    }

    const accountExport = await request(app, {
      method: 'GET',
      url: '/account/export',
      headers: authHeaders,
    });
    console.log('account_export:', {
      scope: accountExport.scope,
      questions: accountExport.account.questions.length,
      errorRecords: accountExport.account.errorRecords.length,
      reviewTasks: accountExport.account.reviewTasks.length,
      authOtps: accountExport.account.authOtps.length,
      paymentOrders: accountExport.account.paymentOrders.length,
      subscriptions: accountExport.account.subscriptions.length,
      deviceTokens: accountExport.account.deviceTokens.length,
      notificationDeliveries: accountExport.account.notificationDeliveries.length,
    });

    const deleted = await request(app, {
      method: 'DELETE',
      url: '/account',
      headers: authHeaders,
    });
    console.log('account_delete:', { deleted: deleted.deleted });
    console.log('account_delete_images:', deleted.localImages);

    const afterDelete = await requestExpectFailure(app, {
      method: 'GET',
      url: '/dashboard',
      headers: authHeaders,
    }, 401);
    console.log('session_after_delete:', { error: afterDelete.error });
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error.message);
  if (error.message.includes('Can\'t reach database server')) {
    console.error('Start PostgreSQL first, then initialize it: docker compose up -d postgres && npm run db:setup');
  }
  process.exit(1);
});
