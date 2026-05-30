import { z } from 'zod';
import { getCurrentUserId } from '../lib/current-user.js';
import { prisma } from '../lib/prisma.js';

const registerDeviceSchema = z.object({
  platform: z.enum(['ios', 'android', 'web', 'unknown']).default('unknown'),
  provider: z.enum(['expo', 'apns', 'fcm', 'web', 'dev']).default('dev'),
  token: z.string().min(8).max(2048),
});

export async function deviceRoutes(app) {
  app.get('/', async (request) => {
    const userId = await getCurrentUserId(request);
    return prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        platform: true,
        provider: true,
        enabled: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  });

  app.post('/', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = registerDeviceSchema.parse(request.body || {});
    const device = await prisma.deviceToken.upsert({
      where: {
        provider_token: {
          provider: input.provider,
          token: input.token,
        },
      },
      update: {
        userId,
        platform: input.platform,
        enabled: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        platform: input.platform,
        provider: input.provider,
        token: input.token,
        enabled: true,
      },
    });

    return reply.code(201).send({
      device: {
        id: device.id,
        platform: device.platform,
        provider: device.provider,
        enabled: device.enabled,
        lastSeenAt: device.lastSeenAt,
      },
    });
  });

  app.delete('/:id', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const existing = await prisma.deviceToken.findFirst({
      where: { id: request.params.id, userId },
    });
    if (!existing) return reply.code(404).send({ error: 'Device token not found' });
    const updated = await prisma.deviceToken.update({
      where: { id: existing.id },
      data: { enabled: false },
    });
    return { disabled: true, deviceId: updated.id };
  });
}
