import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_ENV = ['DATABASE_URL'];
const DEFAULT_DAILY_QUESTION_LIMIT = 50;
const DEFAULT_DAILY_AI_STEP_LIMIT = 150;
const DEFAULT_PLUS_DAILY_QUESTION_LIMIT = 200;
const DEFAULT_PLUS_DAILY_AI_STEP_LIMIT = 600;
const DEFAULT_UPLOAD_RETENTION_DAYS = 30;
const DEFAULT_AI_EVENT_RETENTION_DAYS = 180;
const DEFAULT_EXPIRED_SESSION_RETENTION_DAYS = 30;
const DEFAULT_NOTIFICATION_RETENTION_DAYS = 180;
const DEFAULT_DISABLED_DEVICE_TOKEN_RETENTION_DAYS = 180;
const DEFAULT_AUTH_OTP_TTL_MINUTES = 10;
const DEFAULT_AUTH_OTP_MAX_ATTEMPTS = 5;
const DEFAULT_AUTH_OTP_RETENTION_DAYS = 7;
const DEFAULT_AUTH_OTP_MIN_INTERVAL_SECONDS = 60;
const DEFAULT_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 300;
const DEFAULT_PLUS_PRICE_CENTS_MONTHLY = 2900;
const DEFAULT_OPS_MAX_AI_FAILURE_RATE = 0.08;
const DEFAULT_OPS_MAX_DAILY_AI_COST = 100;
const DEFAULT_OPS_MIN_REVIEW_COMPLETION_RATE = 0.5;
const DEFAULT_OPS_MIN_AVERAGE_FEEDBACK_RATING = 3.5;

export function loadEnvFile(filePath = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

export function getConfigStatus(env = process.env) {
  const missing = REQUIRED_ENV.filter(key => !env[key]);
  const warnings = [];

  if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN === 'change-me') {
    warnings.push('ADMIN_TOKEN should be set to a non-default value before internal testing');
  }

  if (env.LLM_PROVIDER && env.LLM_PROVIDER !== 'mock' && !env.LLM_API_KEY) {
    warnings.push('LLM_API_KEY is empty, AI routes will fall back only if provider code allows it');
  }

  if (isInternalTestInviteRequired(env) && isLegacyUserIdAuthEnabled(env)) {
    warnings.push('ALLOW_LEGACY_USER_ID_AUTH should be false in invited internal testing and production');
  }

  return {
    ok: missing.length === 0,
    missing,
    warnings,
    llmProvider: env.LLM_PROVIDER || 'mock',
    llmModel: env.LLM_MODEL || 'mock-socratic',
    ocrProvider: env.OCR_PROVIDER || 'mock',
    corsAllowedOrigins: getCorsAllowedOrigins(env),
    bodyLimitBytes: getBodyLimitBytes(env),
    rateLimit: getRateLimitConfig(env),
    dailyQuestionLimit: getDailyQuestionLimit(env),
    dailyAiStepLimit: getDailyAiStepLimit(env),
    plusDailyQuestionLimit: getPlusDailyQuestionLimit(env),
    plusDailyAiStepLimit: getPlusDailyAiStepLimit(env),
    plusPriceCentsMonthly: getPlusPriceCentsMonthly(env),
    paymentProvider: getPaymentProvider(env),
    paymentEndpointConfigured: Boolean(getPaymentEndpoint(env)),
    paymentWebhookSecretConfigured: Boolean(getPaymentWebhookSecret(env)),
    paymentReady: isPaymentReady(env),
    pushProvider: getPushProvider(env),
    pushEndpointConfigured: Boolean(getPushEndpoint(env)),
    pushTokenConfigured: Boolean(getPushToken(env)),
    pushReady: isPushReady(env),
    opsThresholds: getOpsHealthThresholds(env),
    uploadRetentionDays: getUploadRetentionDays(env),
    uploadStorageProvider: getUploadStorageProvider(env),
    uploadStorageEndpointConfigured: Boolean(getUploadStorageEndpoint(env)),
    aiEventRetentionDays: getAiEventRetentionDays(env),
    expiredSessionRetentionDays: getExpiredSessionRetentionDays(env),
    notificationRetentionDays: getNotificationRetentionDays(env),
    disabledDeviceTokenRetentionDays: getDisabledDeviceTokenRetentionDays(env),
    authOtpTtlMinutes: getAuthOtpTtlMinutes(env),
    authOtpMaxAttempts: getAuthOtpMaxAttempts(env),
    authOtpRetentionDays: getAuthOtpRetentionDays(env),
    authOtpMinIntervalSeconds: getAuthOtpMinIntervalSeconds(env),
    authOtpDevModeEnabled: isAuthOtpDevModeEnabled(env),
    authOtpDeliveryProvider: getAuthOtpDeliveryProvider(env),
    authOtpDeliveryEndpointConfigured: Boolean(getAuthOtpDeliveryEndpoint(env)),
    securityHeadersEnabled: areSecurityHeadersEnabled(env),
    publicUploadAccessEnabled: isPublicUploadAccessEnabled(env),
    legacyUserIdAuthEnabled: isLegacyUserIdAuthEnabled(env),
    mockLoginEnabled: isMockLoginEnabled(env),
    internalTestInviteRequired: isInternalTestInviteRequired(env),
  };
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCorsAllowedOrigins(env = process.env) {
  return String(env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

export function getDailyQuestionLimit(env = process.env) {
  return positiveInt(env.DAILY_QUESTION_LIMIT, DEFAULT_DAILY_QUESTION_LIMIT);
}

export function getBodyLimitBytes(env = process.env) {
  return positiveInt(env.BODY_LIMIT_BYTES, DEFAULT_BODY_LIMIT_BYTES);
}

export function getRateLimitConfig(env = process.env) {
  return {
    enabled: String(env.RATE_LIMIT_ENABLED || 'true').toLowerCase() !== 'false',
    windowMs: positiveInt(env.RATE_LIMIT_WINDOW_MS, DEFAULT_RATE_LIMIT_WINDOW_MS),
    max: positiveInt(env.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
  };
}

export function getDailyAiStepLimit(env = process.env) {
  return positiveInt(env.DAILY_AI_STEP_LIMIT, DEFAULT_DAILY_AI_STEP_LIMIT);
}

export function getPlusDailyQuestionLimit(env = process.env) {
  return positiveInt(env.PLUS_DAILY_QUESTION_LIMIT, DEFAULT_PLUS_DAILY_QUESTION_LIMIT);
}

export function getPlusDailyAiStepLimit(env = process.env) {
  return positiveInt(env.PLUS_DAILY_AI_STEP_LIMIT, DEFAULT_PLUS_DAILY_AI_STEP_LIMIT);
}

export function getPlusPriceCentsMonthly(env = process.env) {
  return positiveInt(env.PLUS_PRICE_CENTS_MONTHLY, DEFAULT_PLUS_PRICE_CENTS_MONTHLY);
}

export function getPaymentProvider(env = process.env) {
  return String(env.PAYMENT_PROVIDER || 'dev');
}

export function getPaymentEndpoint(env = process.env) {
  return String(env.PAYMENT_PROVIDER_ENDPOINT || '').trim();
}

export function getPaymentToken(env = process.env) {
  return String(env.PAYMENT_PROVIDER_TOKEN || '').trim();
}

export function getPaymentWebhookSecret(env = process.env) {
  return String(env.PAYMENT_WEBHOOK_SECRET || '').trim();
}

export function isPaymentReady(env = process.env) {
  return String(env.PAYMENT_READY || 'false').toLowerCase() === 'true';
}

export function getPushProvider(env = process.env) {
  return String(env.PUSH_PROVIDER || 'dev');
}

export function getPushEndpoint(env = process.env) {
  return String(env.PUSH_ENDPOINT || '').trim();
}

export function getPushToken(env = process.env) {
  return String(env.PUSH_TOKEN || '').trim();
}

export function isPushReady(env = process.env) {
  return String(env.PUSH_READY || 'false').toLowerCase() === 'true';
}

export function getOpsHealthThresholds(env = process.env) {
  return {
    maxAiFailureRate: positiveNumber(env.OPS_MAX_AI_FAILURE_RATE, DEFAULT_OPS_MAX_AI_FAILURE_RATE),
    maxDailyAiCost: positiveNumber(env.OPS_MAX_DAILY_AI_COST, DEFAULT_OPS_MAX_DAILY_AI_COST),
    minReviewCompletionRate: positiveNumber(env.OPS_MIN_REVIEW_COMPLETION_RATE, DEFAULT_OPS_MIN_REVIEW_COMPLETION_RATE),
    minAverageFeedbackRating: positiveNumber(env.OPS_MIN_AVERAGE_FEEDBACK_RATING, DEFAULT_OPS_MIN_AVERAGE_FEEDBACK_RATING),
  };
}

export function getUploadRetentionDays(env = process.env) {
  return positiveInt(env.UPLOAD_RETENTION_DAYS, DEFAULT_UPLOAD_RETENTION_DAYS);
}

export function getUploadStorageProvider(env = process.env) {
  return String(env.UPLOAD_STORAGE_PROVIDER || 'local');
}

export function getUploadStorageEndpoint(env = process.env) {
  return String(env.UPLOAD_STORAGE_ENDPOINT || '').trim();
}

export function getUploadStorageToken(env = process.env) {
  return String(env.UPLOAD_STORAGE_TOKEN || '').trim();
}

export function getAiEventRetentionDays(env = process.env) {
  return positiveInt(env.AI_EVENT_RETENTION_DAYS, DEFAULT_AI_EVENT_RETENTION_DAYS);
}

export function getExpiredSessionRetentionDays(env = process.env) {
  return positiveInt(env.EXPIRED_SESSION_RETENTION_DAYS, DEFAULT_EXPIRED_SESSION_RETENTION_DAYS);
}

export function getNotificationRetentionDays(env = process.env) {
  return positiveInt(env.NOTIFICATION_RETENTION_DAYS, DEFAULT_NOTIFICATION_RETENTION_DAYS);
}

export function getDisabledDeviceTokenRetentionDays(env = process.env) {
  return positiveInt(env.DISABLED_DEVICE_TOKEN_RETENTION_DAYS, DEFAULT_DISABLED_DEVICE_TOKEN_RETENTION_DAYS);
}

export function getAuthOtpTtlMinutes(env = process.env) {
  return positiveInt(env.AUTH_OTP_TTL_MINUTES, DEFAULT_AUTH_OTP_TTL_MINUTES);
}

export function getAuthOtpMaxAttempts(env = process.env) {
  return positiveInt(env.AUTH_OTP_MAX_ATTEMPTS, DEFAULT_AUTH_OTP_MAX_ATTEMPTS);
}

export function getAuthOtpRetentionDays(env = process.env) {
  return positiveInt(env.AUTH_OTP_RETENTION_DAYS, DEFAULT_AUTH_OTP_RETENTION_DAYS);
}

export function getAuthOtpMinIntervalSeconds(env = process.env) {
  return positiveInt(env.AUTH_OTP_MIN_INTERVAL_SECONDS, DEFAULT_AUTH_OTP_MIN_INTERVAL_SECONDS);
}

export function isAuthOtpDevModeEnabled(env = process.env) {
  return String(env.AUTH_OTP_DEV_MODE || 'true').toLowerCase() !== 'false';
}

export function getAuthOtpDeliveryProvider(env = process.env) {
  return String(env.AUTH_OTP_DELIVERY_PROVIDER || 'dev');
}

export function getAuthOtpDeliveryEndpoint(env = process.env) {
  return String(env.AUTH_OTP_DELIVERY_ENDPOINT || '').trim();
}

export function getAuthOtpDeliveryToken(env = process.env) {
  return String(env.AUTH_OTP_DELIVERY_TOKEN || '').trim();
}

export function isPublicUploadAccessEnabled(env = process.env) {
  return String(env.ALLOW_PUBLIC_UPLOAD_ACCESS || 'true').toLowerCase() !== 'false';
}

export function areSecurityHeadersEnabled(env = process.env) {
  return String(env.SECURITY_HEADERS_ENABLED || 'true').toLowerCase() !== 'false';
}

export function isLegacyUserIdAuthEnabled(env = process.env) {
  return String(env.ALLOW_LEGACY_USER_ID_AUTH || 'true').toLowerCase() !== 'false';
}

export function isMockLoginEnabled(env = process.env) {
  return String(env.ALLOW_MOCK_LOGIN || 'true').toLowerCase() !== 'false';
}

export function isInternalTestInviteRequired(env = process.env) {
  return Boolean(env.INTERNAL_TEST_INVITE_CODE);
}

export function validateInternalTestInvite(code, env = process.env) {
  const expected = env.INTERNAL_TEST_INVITE_CODE;
  if (!expected) return true;
  return String(code || '').trim() === expected;
}

export function assertConfig(env = process.env) {
  const status = getConfigStatus(env);
  if (!status.ok) {
    throw new Error(`Missing required env: ${status.missing.join(', ')}`);
  }
  return status;
}
