import crypto from 'node:crypto';
import {
  getPaymentEndpoint,
  getPaymentProvider,
  getPaymentToken,
  getPaymentWebhookSecret,
} from './config.js';

export function signPaymentPayload(payload, secret = getPaymentWebhookSecret()) {
  if (!secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

export function verifyPaymentSignature(payload, signature, secret = getPaymentWebhookSecret()) {
  if (!secret || !signature) return false;
  const expected = signPaymentPayload(payload, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(signature));
  return expectedBuffer.length === actualBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function createCheckoutSession(order) {
  const provider = getPaymentProvider();
  if (provider === 'dev') {
    return {
      provider,
      providerOrderId: `dev_${order.id}`,
      checkoutUrl: `/billing/dev-checkout/${order.id}`,
    };
  }

  if (provider !== 'http') {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }

  const endpoint = getPaymentEndpoint();
  if (!endpoint) throw new Error('PAYMENT_PROVIDER_ENDPOINT is required when PAYMENT_PROVIDER=http');

  const headers = { 'content-type': 'application/json' };
  const token = getPaymentToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      orderId: order.id,
      userId: order.userId,
      planCode: order.planCode,
      amountCents: order.amountCents,
      currency: order.currency,
      description: 'AI 家庭教师 Plus 月度订阅',
    }),
  });

  if (!response.ok) {
    throw new Error(`Payment provider failed with ${response.status}`);
  }

  const body = await response.json();
  if (!body.checkoutUrl) {
    throw new Error('Payment provider response missing checkoutUrl');
  }

  return {
    provider,
    providerOrderId: body.providerOrderId || null,
    checkoutUrl: body.checkoutUrl,
  };
}
