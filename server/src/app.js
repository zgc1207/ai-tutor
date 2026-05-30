import cors from '@fastify/cors';
import Fastify from 'fastify';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { billingRoutes } from './routes/billing.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { deviceRoutes } from './routes/devices.js';
import { feedbackRoutes } from './routes/feedback.js';
import { knowledgeTreeRoutes } from './routes/knowledge-tree.js';
import { meRoutes } from './routes/me.js';
import { mistakeRoutes } from './routes/mistakes.js';
import { notificationRoutes } from './routes/notifications.js';
import { ocrRoutes } from './routes/ocr.js';
import { planRoutes } from './routes/plans.js';
import { questionRoutes } from './routes/questions.js';
import { reportRoutes } from './routes/reports.js';
import { reviewRoutes } from './routes/review.js';
import { uploadRoutes } from './routes/uploads.js';
import {
  areSecurityHeadersEnabled,
  getBodyLimitBytes,
  getConfigStatus,
  getCorsAllowedOrigins,
  getRateLimitConfig,
  loadEnvFile,
} from './lib/config.js';
import { prisma } from './lib/prisma.js';

function buildCorsOptions() {
  const allowedOrigins = getCorsAllowedOrigins();
  if (allowedOrigins.length === 0) return { origin: true };
  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'), false);
    },
  };
}

function registerSecurityHeaders(app) {
  if (!areSecurityHeadersEnabled()) return;
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    return payload;
  });
}

function requestClientKey(request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return request.ip || 'unknown';
}

function registerRateLimit(app) {
  const config = getRateLimitConfig();
  if (!config.enabled) return;

  const buckets = new Map();
  app.addHook('onRequest', async (request, reply) => {
    const now = Date.now();
    const key = requestClientKey(request);
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + config.windowMs });
      return;
    }

    current.count += 1;
    if (current.count <= config.max) return;

    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return reply
      .code(429)
      .header('retry-after', String(retryAfterSeconds))
      .send({
        error: 'Too many requests',
        code: 'rate_limit_exceeded',
        retryAfterSeconds,
      });
  });
}

export async function buildApp(options = {}) {
  loadEnvFile();
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: options.bodyLimit ?? getBodyLimitBytes(),
  });

  await app.register(cors, buildCorsOptions());
  registerRateLimit(app);
  registerSecurityHeaders(app);

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    request.log.error(error);
    reply.code(statusCode).send({
      error: statusCode === 500 ? 'Internal server error' : error.message,
    });
  });

  app.get('/health', async () => ({ ok: true }));

  app.get('/ready', async (request, reply) => {
    const config = getConfigStatus();
    const checks = {
      config,
      database: { ok: false },
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { ok: true };
    } catch (error) {
      checks.database = {
        ok: false,
        error: error.message,
      };
    }

    const ok = checks.config.ok && checks.database.ok;
    return reply.code(ok ? 200 : 503).send({ ok, checks });
  });

  await app.register(accountRoutes, { prefix: '/account' });
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(billingRoutes, { prefix: '/billing' });
  await app.register(dashboardRoutes, { prefix: '/dashboard' });
  await app.register(deviceRoutes, { prefix: '/devices' });
  await app.register(feedbackRoutes, { prefix: '/feedback' });
  await app.register(knowledgeTreeRoutes, { prefix: '/knowledge-tree' });
  await app.register(meRoutes, { prefix: '/me' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(ocrRoutes, { prefix: '/ocr' });
  await app.register(planRoutes, { prefix: '/plans' });
  await app.register(questionRoutes, { prefix: '/questions' });
  await app.register(reportRoutes, { prefix: '/reports' });
  await app.register(mistakeRoutes, { prefix: '/mistakes' });
  await app.register(reviewRoutes, { prefix: '/review-tasks' });
  await app.register(uploadRoutes, { prefix: '/uploads' });

  return app;
}
