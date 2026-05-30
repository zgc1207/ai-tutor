import crypto from 'node:crypto';
import { z } from 'zod';
import {
  getAuthOtpMaxAttempts,
  getAuthOtpMinIntervalSeconds,
  getAuthOtpTtlMinutes,
  isAuthOtpDevModeEnabled,
  isInternalTestInviteRequired,
  isMockLoginEnabled,
  validateInternalTestInvite,
} from '../lib/config.js';
import { deliverLoginOtp } from '../lib/otp-delivery.js';
import { prisma } from '../lib/prisma.js';

const loginSchema = z.object({
  phone: z.string().min(6).max(20),
  nickname: z.string().min(1).max(24),
  grade: z.string().min(1),
  gradeStage: z.enum(['primary', 'junior', 'senior']),
  consentAccepted: z.boolean(),
  policyVersion: z.string().min(1).default('internal-test-v1'),
  inviteCode: z.string().max(80).optional(),
});

const requestOtpSchema = z.object({
  phone: z.string().regex(/^1\d{10}$/),
  purpose: z.literal('login').default('login'),
  inviteCode: z.string().max(80).optional(),
});

const otpLoginSchema = loginSchema.extend({
  code: z.string().regex(/^\d{6}$/),
});

const SESSION_TTL_DAYS = 30;

function createSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function createOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp({ phone, code }) {
  return crypto
    .createHash('sha256')
    .update(`${phone}:${code}:${process.env.AUTH_OTP_SECRET || process.env.ADMIN_TOKEN || 'dev-auth-otp-secret'}`)
    .digest('hex');
}

function sessionExpiresAt() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt;
}

function getBearerToken(request) {
  const authorization = request.headers.authorization;
  if (!authorization || Array.isArray(authorization)) return '';
  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : '';
}

function otpExpiresAt() {
  return new Date(Date.now() + getAuthOtpTtlMinutes() * 60 * 1000);
}

async function createUserSession({ input }) {
  const acceptedAt = new Date();
  const user = await prisma.user.upsert({
    where: { phone: input.phone },
    update: {
      nickname: input.nickname,
      policyVersion: input.policyVersion,
      termsAcceptedAt: acceptedAt,
      privacyAcceptedAt: acceptedAt,
      minorNoticeAcceptedAt: acceptedAt,
    },
    create: {
      nickname: input.nickname,
      phone: input.phone,
      policyVersion: input.policyVersion,
      termsAcceptedAt: acceptedAt,
      privacyAcceptedAt: acceptedAt,
      minorNoticeAcceptedAt: acceptedAt,
    },
  });

  const profile = await prisma.studentProfile.upsert({
    where: { userId: user.id },
    update: { grade: input.grade, gradeStage: input.gradeStage },
    create: {
      userId: user.id,
      grade: input.grade,
      gradeStage: input.gradeStage,
    },
  });

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token: createSessionToken(),
      expiresAt: sessionExpiresAt(),
    },
  });

  return {
    userId: user.id,
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
    profile,
    inviteRequired: isInternalTestInviteRequired(),
  };
}

export async function authRoutes(app) {
  app.post('/otp/request', async (request, reply) => {
    const input = requestOtpSchema.parse(request.body);
    if (!validateInternalTestInvite(input.inviteCode)) {
      return reply.code(403).send({
        error: 'Internal test invite code required',
        code: 'INVITE_CODE_REQUIRED',
      });
    }

    const minIntervalSeconds = getAuthOtpMinIntervalSeconds();
    const latestOtp = await prisma.authOtp.findFirst({
      where: {
        phone: input.phone,
        purpose: input.purpose,
        createdAt: { gt: new Date(Date.now() - minIntervalSeconds * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (latestOtp) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((latestOtp.createdAt.getTime() + minIntervalSeconds * 1000 - Date.now()) / 1000),
      );
      return reply
        .code(429)
        .header('retry-after', String(retryAfterSeconds))
        .send({
          error: 'Verification code requested too frequently',
          code: 'OTP_REQUEST_TOO_FREQUENT',
          retryAfterSeconds,
        });
    }

    const code = createOtpCode();
    const otp = await prisma.authOtp.create({
      data: {
        phone: input.phone,
        purpose: input.purpose,
        codeHash: hashOtp({ phone: input.phone, code }),
        maxAttempts: getAuthOtpMaxAttempts(),
        expiresAt: otpExpiresAt(),
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    let delivery;
    try {
      delivery = await deliverLoginOtp({
        phone: input.phone,
        code,
        purpose: input.purpose,
        requestId: otp.id,
        expiresAt: otp.expiresAt,
      });
    } catch (error) {
      await prisma.authOtp.delete({ where: { id: otp.id } });
      throw error;
    }

    return reply.send({
      requestId: otp.id,
      expiresAt: otp.expiresAt,
      deliveryProvider: delivery.provider,
      delivered: delivery.delivered,
      devCode: isAuthOtpDevModeEnabled() ? code : undefined,
    });
  });

  app.post('/otp/login', async (request, reply) => {
    const input = otpLoginSchema.parse(request.body);
    if (!input.consentAccepted) {
      return reply.code(400).send({ error: 'Must accept user agreement and privacy policy before login' });
    }
    if (!validateInternalTestInvite(input.inviteCode)) {
      return reply.code(403).send({
        error: 'Internal test invite code required',
        code: 'INVITE_CODE_REQUIRED',
      });
    }

    const otp = await prisma.authOtp.findFirst({
      where: {
        phone: input.phone,
        purpose: 'login',
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      return reply.code(401).send({ error: 'Invalid or expired verification code', code: 'OTP_INVALID' });
    }

    if (otp.attempts >= otp.maxAttempts) {
      return reply.code(429).send({ error: 'Too many verification attempts', code: 'OTP_ATTEMPTS_EXCEEDED' });
    }

    const expectedHash = hashOtp({ phone: input.phone, code: input.code });
    if (otp.codeHash !== expectedHash) {
      await prisma.authOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      return reply.code(401).send({ error: 'Invalid or expired verification code', code: 'OTP_INVALID' });
    }

    const result = await createUserSession({ input });
    await prisma.authOtp.update({
      where: { id: otp.id },
      data: {
        consumedAt: new Date(),
        userId: result.userId,
      },
    });
    return reply.send(result);
  });

  app.post('/mock-login', async (request, reply) => {
    if (!isMockLoginEnabled()) {
      return reply.code(404).send({ error: 'Mock login is disabled' });
    }

    const input = loginSchema.parse(request.body);
    if (!input.consentAccepted) {
      return reply.code(400).send({ error: 'Must accept user agreement and privacy policy before login' });
    }
    if (!validateInternalTestInvite(input.inviteCode)) {
      return reply.code(403).send({
        error: 'Internal test invite code required',
        code: 'INVITE_CODE_REQUIRED',
      });
    }
    return reply.send(await createUserSession({ input }));
  });

  app.post('/logout', async request => {
    const token = request.headers['x-session-token'] || getBearerToken(request);
    if (!token || Array.isArray(token)) return { revoked: false };
    const updated = await prisma.session.updateMany({
      where: {
        token,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { revoked: updated.count > 0 };
  });
}
