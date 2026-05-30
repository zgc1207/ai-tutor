import { z } from 'zod';
import { getCurrentUserId } from '../lib/current-user.js';
import { getPlanByCode, getPaymentMode } from '../lib/entitlements.js';
import { createCheckoutSession, verifyPaymentSignature } from '../lib/payment-provider.js';
import { prisma } from '../lib/prisma.js';

const checkoutSchema = z.object({
  planCode: z.literal('plus'),
  guardianConfirmed: z.boolean(),
  refundNoticeAccepted: z.boolean(),
});

const webhookSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(['paid', 'failed', 'canceled', 'refunded']),
  providerOrderId: z.string().optional(),
  paidAt: z.string().datetime().optional(),
});

const cancelSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
});

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

async function activateSubscription({ userId, orderId, planCode, paidAt }) {
  const existingForOrder = await prisma.subscription.findFirst({
    where: { sourceOrderId: orderId },
  });
  if (existingForOrder) return existingForOrder;

  const startsAt = paidAt || new Date();
  const existing = await prisma.subscription.findFirst({
    where: {
      userId,
      planCode,
      status: 'active',
      expiresAt: { gt: startsAt },
    },
    orderBy: { expiresAt: 'desc' },
  });

  const base = existing?.expiresAt && existing.expiresAt > startsAt ? existing.expiresAt : startsAt;
  const expiresAt = addMonths(base, 1);

  return prisma.subscription.create({
    data: {
      userId,
      planCode,
      status: 'active',
      startsAt,
      expiresAt,
      sourceOrderId: orderId,
    },
  });
}

export async function billingRoutes(app) {
  app.get('/dev-checkout/:orderId', async (request, reply) => {
    if (getPaymentMode().provider !== 'dev') {
      return reply.code(404).send({ error: 'Not found' });
    }

    const order = await prisma.paymentOrder.findUnique({
      where: { id: request.params.orderId },
    });
    if (!order) return reply.code(404).send({ error: 'Payment order not found' });

    const paidAt = new Date();
    const updatedOrder = order.status === 'paid'
      ? order
      : await prisma.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: 'paid',
            providerOrderId: order.providerOrderId || `dev_${order.id}`,
            paidAt,
            rawPayload: { source: 'dev-checkout', orderId: order.id },
          },
        });

    const subscription = await activateSubscription({
      userId: order.userId,
      orderId: order.id,
      planCode: order.planCode,
      paidAt: updatedOrder.paidAt || paidAt,
    });

    return reply.type('text/html; charset=utf-8').send(`<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>开发支付完成</title></head>
<body style="font-family: system-ui, sans-serif; padding: 32px;">
  <h1>开发支付已完成</h1>
  <p>订单 ${updatedOrder.id} 已标记为 paid, Plus 有效期至 ${subscription.expiresAt.toISOString()}。</p>
  <p>回到原型“我的”页刷新即可看到 Plus 权益。</p>
</body>
</html>`);
  });

  app.get('/status', async (request) => {
    const userId = await getCurrentUserId(request);
    const now = new Date();
    const [activeSubscription, recentOrders] = await Promise.all([
      prisma.subscription.findFirst({
        where: {
          userId,
          status: 'active',
          startsAt: { lte: now },
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: 'desc' },
      }),
      prisma.paymentOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      payment: getPaymentMode(),
      activeSubscription,
      recentOrders,
    };
  });

  app.post('/cancel', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = cancelSchema.parse(request.body || {});
    const now = new Date();
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
      orderBy: { expiresAt: 'desc' },
    });
    if (!subscription) return reply.code(404).send({ error: 'Active subscription not found' });

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: input.cancelAtPeriodEnd
        ? { cancelAtPeriodEnd: true, canceledAt: now }
        : { status: 'canceled', cancelAtPeriodEnd: false, canceledAt: now, expiresAt: now },
    });

    return {
      canceled: true,
      subscription: updated,
      effectiveAt: updated.expiresAt,
    };
  });

  app.post('/checkout', async (request, reply) => {
    const userId = await getCurrentUserId(request);
    const input = checkoutSchema.parse(request.body || {});
    if (!input.guardianConfirmed || !input.refundNoticeAccepted) {
      return reply.code(422).send({
        error: 'Guardian confirmation and refund notice acceptance are required before payment.',
        code: 'billing_consent_required',
      });
    }

    const plan = getPlanByCode(input.planCode);
    if (!plan || !plan.priceCentsMonthly) {
      return reply.code(422).send({ error: 'Plan is not billable', code: 'plan_not_billable' });
    }

    const order = await prisma.paymentOrder.create({
      data: {
        userId,
        planCode: plan.code,
        amountCents: plan.priceCentsMonthly,
        currency: plan.currency || 'CNY',
        provider: getPaymentMode().provider,
        status: 'pending',
      },
    });

    const checkout = await createCheckoutSession(order);
    const updatedOrder = await prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        provider: checkout.provider,
        providerOrderId: checkout.providerOrderId,
        checkoutUrl: checkout.checkoutUrl,
      },
    });

    return reply.code(201).send({
      order: updatedOrder,
      checkoutUrl: updatedOrder.checkoutUrl,
    });
  });

  app.post('/webhook', async (request, reply) => {
    const payload = webhookSchema.parse(request.body || {});
    const signature = request.headers['x-payment-signature'];
    if (!verifyPaymentSignature(request.body || {}, signature)) {
      return reply.code(401).send({ error: 'Invalid payment signature' });
    }

    const order = await prisma.paymentOrder.findUnique({ where: { id: payload.orderId } });
    if (!order) return reply.code(404).send({ error: 'Payment order not found' });

    const paidAt = payload.paidAt ? new Date(payload.paidAt) : new Date();
    const updatedOrder = await prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: payload.status,
        providerOrderId: payload.providerOrderId || order.providerOrderId,
        paidAt: payload.status === 'paid' ? paidAt : order.paidAt,
        rawPayload: request.body || {},
      },
    });

    let subscription = null;
    if (payload.status === 'paid') {
      subscription = await activateSubscription({
        userId: order.userId,
        orderId: order.id,
        planCode: order.planCode,
        paidAt,
      });
    }

    if (payload.status === 'refunded' || payload.status === 'canceled') {
      await prisma.subscription.updateMany({
        where: { sourceOrderId: order.id, status: 'active' },
        data: {
          status: 'canceled',
          cancelAtPeriodEnd: false,
          canceledAt: new Date(),
          expiresAt: new Date(),
        },
      });
    }

    return {
      received: true,
      order: updatedOrder,
      subscription,
    };
  });
}
