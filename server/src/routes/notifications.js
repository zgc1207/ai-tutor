import { requireAdmin } from '../lib/admin-auth.js';
import { getPushProvider, isPushReady } from '../lib/config.js';
import { sendReviewReminders } from '../lib/reminder-notifications.js';
import { prisma } from '../lib/prisma.js';

function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

export async function notificationRoutes(app) {
  app.get('/status', async request => {
    requireAdmin(request);
    const [enabledDevices, deliveriesToday] = await Promise.all([
      prisma.deviceToken.count({ where: { enabled: true } }),
      prisma.notificationDelivery.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return {
      provider: getPushProvider(),
      ready: isPushReady(),
      enabledDevices,
      deliveriesToday,
    };
  });

  app.post('/review-reminders/run', async request => {
    requireAdmin(request);
    const reminderTime = String(request.body?.reminderTime || request.query?.time || currentTime());
    const dryRun = parseBoolean(request.body?.dryRun ?? request.query?.dryRun, false);
    return sendReviewReminders({ reminderTime, dryRun });
  });

  app.get('/deliveries', async request => {
    requireAdmin(request);
    const take = Math.min(Math.max(Number(request.query?.take || 50), 1), 100);
    return prisma.notificationDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { select: { id: true, nickname: true, phone: true } },
      },
    });
  });
}
