import { getPaymentMode, getPlans } from '../lib/entitlements.js';

export async function planRoutes(app) {
  app.get('/', async () => {
    const payment = getPaymentMode();
    return {
      plans: getPlans(),
      billingStatus: payment.productionReady ? 'provider_ready' : 'dev_provider',
      paymentEnabled: payment.enabled,
      payment,
      notes: [
        'Plus 权益已接入订单、订阅和配额; 生产发布必须使用真实支付 provider。',
        '涉及未成年人付费时, checkout 已要求监护人确认和退款须知确认。',
      ],
    };
  });
}
