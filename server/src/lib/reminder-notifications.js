import { getPushProvider } from './config.js';
import { sendPushNotification } from './push-provider.js';
import { prisma } from './prisma.js';

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function minutesOfDay(time) {
  const [hour, minute] = String(time || '00:00').split(':').map(Number);
  return hour * 60 + minute;
}

function isQuietTime(time, start, end) {
  const current = minutesOfDay(time);
  const quietStart = minutesOfDay(start);
  const quietEnd = minutesOfDay(end);
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return current >= quietStart && current < quietEnd;
  return current >= quietStart || current < quietEnd;
}

function addHours(date, hours) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

export async function findReviewReminderCandidates({ reminderTime, now = new Date(), lookaheadHours = 24 }) {
  const dueUntil = addHours(now, lookaheadHours);
  const users = await prisma.user.findMany({
    where: {
      profile: {
        is: {
          reviewReminderEnabled: true,
          reviewReminderTime: reminderTime,
        },
      },
      deviceTokens: { some: { enabled: true } },
      reviewTasks: {
        some: {
          status: 'pending',
          dueAt: { lte: dueUntil },
        },
      },
    },
    include: {
      profile: true,
      deviceTokens: {
        where: { enabled: true },
        orderBy: { lastSeenAt: 'desc' },
      },
      reviewTasks: {
        where: {
          status: 'pending',
          dueAt: { lte: dueUntil },
        },
        select: { id: true },
      },
    },
  });

  return users.filter(user => !isQuietTime(
    reminderTime,
    user.profile.quietHoursStart,
    user.profile.quietHoursEnd,
  ));
}

export async function sendReviewReminders({ reminderTime, now = new Date(), dryRun = false }) {
  const candidates = await findReviewReminderCandidates({ reminderTime, now });
  const deliveries = [];

  for (const user of candidates) {
    const pendingCount = user.reviewTasks.length;
    const title = '今日复习提醒';
    const body = pendingCount > 1
      ? `有 ${pendingCount} 道错题复习待完成, 先做一小组就好。`
      : '有 1 道错题复习待完成, 花几分钟巩固一下。';
    const deviceToken = user.deviceTokens[0];
    const dedupeKey = `review_reminder:${user.id}:${dateKey(now)}:${reminderTime}`;

    const existing = await prisma.notificationDelivery.findUnique({
      where: { dedupeKey },
    });
    if (existing) {
      deliveries.push({ userId: user.id, skipped: true, reason: 'deduped', delivery: existing });
      continue;
    }

    if (dryRun) {
      deliveries.push({
        userId: user.id,
        skipped: true,
        reason: 'dry_run',
        pendingCount,
        deviceTokenId: deviceToken.id,
      });
      continue;
    }

    const result = await sendPushNotification({
      deviceToken,
      title,
      body,
      data: {
        type: 'review_reminder',
        pendingCount,
        url: '/review.html',
      },
    });

    const delivery = await prisma.notificationDelivery.create({
      data: {
        userId: user.id,
        deviceTokenId: deviceToken.id,
        type: 'review_reminder',
        title,
        body,
        provider: result.provider || getPushProvider(),
        status: result.status,
        dedupeKey,
        rawPayload: result.rawPayload || {},
        errorMessage: result.errorMessage || null,
      },
    });

    deliveries.push({ userId: user.id, pendingCount, delivery });
  }

  return {
    reminderTime,
    dryRun,
    candidateCount: candidates.length,
    deliveryCount: deliveries.filter(item => item.delivery && !item.skipped).length,
    deliveries,
  };
}
