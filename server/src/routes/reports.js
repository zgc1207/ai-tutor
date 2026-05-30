import { getCurrentUserId } from '../lib/current-user.js';
import { prisma } from '../lib/prisma.js';

function subjectStats(subjects, items, valueFn) {
  return subjects.map(subject => ({
    subject: subject.code,
    subjectName: subject.name,
    value: items.filter(item => item.subjectId === subject.id).reduce((sum, item) => sum + valueFn(item), 0),
  })).filter(item => item.value > 0);
}

function percent(value) {
  return Math.round((value || 0) * 100);
}

async function buildWeeklyReport(userId) {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 7);

  const [
    user,
    subjects,
    questions,
    errorRecords,
    reviewTasks,
    weakPoints,
    aiEvents,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    }),
    prisma.subject.findMany({ orderBy: { code: 'asc' } }),
    prisma.question.findMany({
      where: { userId, createdAt: { gte: since } },
      include: { subject: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.errorRecord.findMany({
      where: { userId, createdAt: { gte: since } },
      include: { subject: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.reviewTask.findMany({
      where: { userId, dueAt: { gte: since, lte: now } },
      include: { errorRecord: { include: { subject: true } } },
      orderBy: { dueAt: 'asc' },
    }),
    prisma.errorRecord.findMany({
      where: { userId, status: { in: ['weak', 'learning'] } },
      include: { subject: true, knowledgeNode: true },
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 6,
    }),
    prisma.aiEvent.findMany({
      where: { userId, createdAt: { gte: since } },
    }),
  ]);

  const completedReviewTasks = reviewTasks.filter(task => task.status === 'done');
  const correctReviewTasks = completedReviewTasks.filter(task => task.answeredCorrectly);
  const totalCost = aiEvents.reduce((sum, event) => sum + Number(event.costEstimate || 0), 0);

  return {
    generatedAt: now.toISOString(),
    range: {
      since: since.toISOString(),
      until: now.toISOString(),
      days: 7,
    },
    student: {
      nickname: user?.nickname || '',
      grade: user?.profile?.grade || '',
      gradeStage: user?.profile?.gradeStage || '',
      reminder: user?.profile ? {
        reviewReminderEnabled: user.profile.reviewReminderEnabled,
        reviewReminderTime: user.profile.reviewReminderTime,
        quietHoursStart: user.profile.quietHoursStart,
        quietHoursEnd: user.profile.quietHoursEnd,
      } : null,
    },
    summary: {
      questionCount: questions.length,
      newMistakeCount: errorRecords.length,
      dueReviewCount: reviewTasks.length,
      completedReviewCount: completedReviewTasks.length,
      reviewCompletionRate: reviewTasks.length ? completedReviewTasks.length / reviewTasks.length : 0,
      reviewCorrectRate: completedReviewTasks.length ? correctReviewTasks.length / completedReviewTasks.length : 0,
      aiEventCount: aiEvents.length,
      aiCostEstimate: totalCost,
    },
    subjectBreakdown: {
      questions: subjectStats(subjects, questions, () => 1),
      mistakes: subjectStats(subjects, errorRecords, () => 1),
      reviews: subjects.map(subject => ({
        subject: subject.code,
        subjectName: subject.name,
        value: reviewTasks.filter(task => task.errorRecord.subjectId === subject.id).length,
        completed: completedReviewTasks.filter(task => task.errorRecord.subjectId === subject.id).length,
      })).filter(item => item.value > 0),
    },
    weakPoints: weakPoints.map(record => ({
      id: record.id,
      subject: record.subject.code,
      subjectName: record.subject.name,
      knowledgePoint: record.knowledgePoint,
      errorReason: record.errorReason,
      status: record.status,
      knowledgeNode: record.knowledgeNode?.name || null,
      updatedAt: record.updatedAt,
    })),
    recentQuestions: questions.slice(0, 5).map(question => ({
      id: question.id,
      subject: question.subject.code,
      subjectName: question.subject.name,
      title: question.originalText || question.ocrText || '未命名题目',
      status: question.status,
      createdAt: question.createdAt,
    })),
    suggestions: [
      reviewTasks.length && completedReviewTasks.length < reviewTasks.length
        ? '本周还有复习任务未完成, 建议优先完成到期变式题。'
        : '本周复习完成情况稳定, 可以继续保持固定复习时间。',
      weakPoints.length
        ? `优先巩固「${weakPoints[0].knowledgePoint}」, 这是当前最需要关注的薄弱点。`
        : '当前没有明显薄弱点, 可以增加综合题或跨知识点练习。',
      errorRecords.length > questions.length * 0.5 && questions.length > 0
        ? '新错题占比较高, 建议放慢答题节奏, 先复述题目条件再动笔。'
        : '新错题占比可控, 可以继续用错题复习形成稳定闭环。',
    ],
  };
}

export async function reportRoutes(app) {
  app.get('/weekly', async request => {
    const userId = await getCurrentUserId(request);
    return buildWeeklyReport(userId);
  });

  app.get('/parent-weekly', async request => {
    const userId = await getCurrentUserId(request);
    const report = await buildWeeklyReport(userId);
    const topWeakPoint = report.weakPoints[0] || null;
    const reviewPercent = percent(report.summary.reviewCompletionRate);
    const mistakePressure = report.summary.questionCount > 0
      ? report.summary.newMistakeCount / report.summary.questionCount
      : 0;

    return {
      generatedAt: report.generatedAt,
      range: report.range,
      student: report.student,
      headline: report.summary.questionCount > 0
        ? `${report.student.nickname || '孩子'}本周提问 ${report.summary.questionCount} 次, 新增错题 ${report.summary.newMistakeCount} 个, 复习完成率 ${reviewPercent}%。`
        : '本周还没有形成足够学习数据, 建议先完成几次真实提问和复习。',
      parentSummary: {
        learningActivity: report.summary.questionCount >= 5 ? '学习互动较稳定' : '学习互动偏少',
        reviewHabit: report.summary.reviewCompletionRate >= 0.8 ? '复习习惯较稳定' : '复习完成度需要关注',
        mistakeTrend: mistakePressure > 0.5 ? '新错题占比较高' : '新错题占比可控',
        topWeakPoint: topWeakPoint ? {
          subjectName: topWeakPoint.subjectName,
          knowledgePoint: topWeakPoint.knowledgePoint,
          errorReason: topWeakPoint.errorReason,
          status: topWeakPoint.status,
        } : null,
      },
      actionItems: [
        report.summary.dueReviewCount > report.summary.completedReviewCount
          ? `陪孩子先完成剩余 ${report.summary.dueReviewCount - report.summary.completedReviewCount} 个到期复习任务。`
          : '保持当前复习节奏, 不需要额外加压。',
        topWeakPoint
          ? `本周沟通重点: 让孩子用自己的话讲清「${topWeakPoint.knowledgePoint}」为什么出错。`
          : '可以鼓励孩子尝试综合题, 观察是否能独立拆解条件。',
        report.student.reminder?.reviewReminderEnabled
          ? `当前复习提醒时间为 ${report.student.reminder.reviewReminderTime}, 夜间 ${report.student.reminder.quietHoursStart}-${report.student.reminder.quietHoursEnd} 免打扰。`
          : '当前复习提醒已关闭, 如复习完成率下降, 可重新打开提醒。',
      ],
      guardrails: [
        '关注孩子是否能说明思路, 不只看最终答案。',
        '如果连续多次反馈 AI 跑偏, 请通过反馈入口提交具体题目。',
        '学习报告只展示当前登录账号对应的单个学生数据。',
      ],
      sourceReport: report,
    };
  });
}
