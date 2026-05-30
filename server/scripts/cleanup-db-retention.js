import {
  getAiEventRetentionDays,
  getAuthOtpRetentionDays,
  getDisabledDeviceTokenRetentionDays,
  getExpiredSessionRetentionDays,
  getNotificationRetentionDays,
  loadEnvFile,
} from '../src/lib/config.js';
import { prisma } from '../src/lib/prisma.js';

loadEnvFile();

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function cleanupDbRetention() {
  const aiEventRetentionDays = getAiEventRetentionDays();
  const expiredSessionRetentionDays = getExpiredSessionRetentionDays();
  const authOtpRetentionDays = getAuthOtpRetentionDays();
  const notificationRetentionDays = getNotificationRetentionDays();
  const disabledDeviceTokenRetentionDays = getDisabledDeviceTokenRetentionDays();
  const aiEventCutoff = daysAgo(aiEventRetentionDays);
  const expiredSessionCutoff = daysAgo(expiredSessionRetentionDays);
  const authOtpCutoff = daysAgo(authOtpRetentionDays);
  const notificationCutoff = daysAgo(notificationRetentionDays);
  const disabledDeviceTokenCutoff = daysAgo(disabledDeviceTokenRetentionDays);
  const now = new Date();

  const [
    expiredSubscriptions,
    aiEvents,
    expiredSessions,
    revokedSessions,
    authOtps,
    notificationDeliveries,
    disabledDeviceTokens,
  ] = await prisma.$transaction([
    prisma.subscription.updateMany({
      where: {
        status: 'active',
        expiresAt: { lte: now },
      },
      data: { status: 'expired' },
    }),
    prisma.aiEvent.deleteMany({
      where: { createdAt: { lt: aiEventCutoff } },
    }),
    prisma.session.deleteMany({
      where: { expiresAt: { lt: expiredSessionCutoff } },
    }),
    prisma.session.deleteMany({
      where: {
        revokedAt: {
          not: null,
          lt: expiredSessionCutoff,
        },
      },
    }),
    prisma.authOtp.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: authOtpCutoff } },
          {
            consumedAt: {
              not: null,
              lt: authOtpCutoff,
            },
          },
        ],
      },
    }),
    prisma.notificationDelivery.deleteMany({
      where: { createdAt: { lt: notificationCutoff } },
    }),
    prisma.deviceToken.deleteMany({
      where: {
        enabled: false,
        updatedAt: { lt: disabledDeviceTokenCutoff },
      },
    }),
  ]);

  console.log(JSON.stringify({
    aiEventRetentionDays,
    expiredSessionRetentionDays,
    authOtpRetentionDays,
    notificationRetentionDays,
    disabledDeviceTokenRetentionDays,
    cutoffs: {
      aiEventsBefore: aiEventCutoff.toISOString(),
      sessionsBefore: expiredSessionCutoff.toISOString(),
      authOtpsBefore: authOtpCutoff.toISOString(),
      notificationDeliveriesBefore: notificationCutoff.toISOString(),
      disabledDeviceTokensBefore: disabledDeviceTokenCutoff.toISOString(),
    },
    updated: {
      expiredSubscriptions: expiredSubscriptions.count,
    },
    deleted: {
      aiEvents: aiEvents.count,
      expiredSessions: expiredSessions.count,
      revokedSessions: revokedSessions.count,
      authOtps: authOtps.count,
      notificationDeliveries: notificationDeliveries.count,
      disabledDeviceTokens: disabledDeviceTokens.count,
    },
  }, null, 2));
}

cleanupDbRetention()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
