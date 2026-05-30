import {
  getConfigStatus,
  isLegacyUserIdAuthEnabled,
  isMockLoginEnabled,
  isPublicUploadAccessEnabled,
  loadEnvFile,
} from '../src/lib/config.js';

loadEnvFile();

const profileArgIndex = process.argv.findIndex(arg => arg === '--profile' || arg === '-p');
const profile = profileArgIndex >= 0 ? process.argv[profileArgIndex + 1] : process.env.DEPLOY_PROFILE || 'internal';
const allowedProfiles = new Set(['internal', 'production']);

function requirement(name, passed, message) {
  return { name, status: passed ? 'pass' : 'fail', message };
}

if (!allowedProfiles.has(profile)) {
  console.error(`Unsupported deploy profile: ${profile}. Use internal or production.`);
  process.exit(1);
}

const status = getConfigStatus();
const env = process.env;
const checks = [
  requirement('config.requiredEnv', status.ok, status.missing.length ? `Missing: ${status.missing.join(', ')}` : 'Required env is present.'),
  requirement('adminToken.nonDefault', Boolean(env.ADMIN_TOKEN && env.ADMIN_TOKEN !== 'change-me'), 'ADMIN_TOKEN must be set to a non-default value.'),
  requirement('invite.required', Boolean(env.INTERNAL_TEST_INVITE_CODE), 'INTERNAL_TEST_INVITE_CODE must be set before inviting users.'),
  requirement('legacyUserIdAuth.disabled', !isLegacyUserIdAuthEnabled(env), 'ALLOW_LEGACY_USER_ID_AUTH must be false.'),
  requirement('llm.realProvider', Boolean(env.LLM_PROVIDER && env.LLM_PROVIDER !== 'mock'), 'LLM_PROVIDER must be a real provider.'),
  requirement('llm.apiKey', Boolean(env.LLM_API_KEY), 'LLM_API_KEY must be set for internal testing and production.'),
  requirement('server.bodyLimit', status.bodyLimitBytes >= 7 * 1024 * 1024, 'BODY_LIMIT_BYTES must be at least 7340032 bytes to support 5MB base64 image uploads.'),
  requirement('server.securityHeaders', status.securityHeadersEnabled, 'SECURITY_HEADERS_ENABLED must be true.'),
  requirement('server.rateLimitEnabled', status.rateLimit.enabled, 'RATE_LIMIT_ENABLED must be true.'),
  requirement('server.rateLimitWindow', status.rateLimit.windowMs > 0, 'RATE_LIMIT_WINDOW_MS must be positive.'),
  requirement('server.rateLimitMax', status.rateLimit.max > 0, 'RATE_LIMIT_MAX must be positive.'),
  requirement('quotas.questionLimit', status.dailyQuestionLimit > 0, 'DAILY_QUESTION_LIMIT must be positive.'),
  requirement('quotas.aiStepLimit', status.dailyAiStepLimit > 0, 'DAILY_AI_STEP_LIMIT must be positive.'),
  requirement('billing.plusPrice', status.plusPriceCentsMonthly > 0, 'PLUS_PRICE_CENTS_MONTHLY must be positive.'),
  requirement('billing.paymentProviderKnown', ['dev', 'http'].includes(status.paymentProvider), 'PAYMENT_PROVIDER must be dev or http.'),
  requirement('push.providerKnown', ['dev', 'http'].includes(status.pushProvider), 'PUSH_PROVIDER must be dev or http.'),
  requirement('ops.maxAiFailureRate', status.opsThresholds.maxAiFailureRate > 0 && status.opsThresholds.maxAiFailureRate <= 1, 'OPS_MAX_AI_FAILURE_RATE must be in (0, 1].'),
  requirement('ops.minReviewCompletionRate', status.opsThresholds.minReviewCompletionRate > 0 && status.opsThresholds.minReviewCompletionRate <= 1, 'OPS_MIN_REVIEW_COMPLETION_RATE must be in (0, 1].'),
  requirement('ops.minAverageFeedbackRating', status.opsThresholds.minAverageFeedbackRating > 0 && status.opsThresholds.minAverageFeedbackRating <= 5, 'OPS_MIN_AVERAGE_FEEDBACK_RATING must be in (0, 5].'),
  requirement('ops.maxDailyAiCost', status.opsThresholds.maxDailyAiCost > 0, 'OPS_MAX_DAILY_AI_COST must be positive.'),
  requirement('uploads.retention', status.uploadRetentionDays > 0, 'UPLOAD_RETENTION_DAYS must be positive.'),
  requirement('uploads.storageProviderKnown', ['local', 'http'].includes(status.uploadStorageProvider), 'UPLOAD_STORAGE_PROVIDER must be local or http.'),
  requirement('retention.aiEvents', status.aiEventRetentionDays > 0, 'AI_EVENT_RETENTION_DAYS must be positive.'),
  requirement('retention.sessions', status.expiredSessionRetentionDays > 0, 'EXPIRED_SESSION_RETENTION_DAYS must be positive.'),
  requirement('retention.notifications', status.notificationRetentionDays > 0, 'NOTIFICATION_RETENTION_DAYS must be positive.'),
  requirement('retention.deviceTokens', status.disabledDeviceTokenRetentionDays > 0, 'DISABLED_DEVICE_TOKEN_RETENTION_DAYS must be positive.'),
  requirement('auth.otpSecret', Boolean(env.AUTH_OTP_SECRET || env.ADMIN_TOKEN), 'AUTH_OTP_SECRET should be set; ADMIN_TOKEN fallback is allowed only for internal testing.'),
  requirement('auth.otpTtl', status.authOtpTtlMinutes > 0, 'AUTH_OTP_TTL_MINUTES must be positive.'),
  requirement('auth.otpMaxAttempts', status.authOtpMaxAttempts > 0, 'AUTH_OTP_MAX_ATTEMPTS must be positive.'),
  requirement('auth.otpMinInterval', status.authOtpMinIntervalSeconds > 0, 'AUTH_OTP_MIN_INTERVAL_SECONDS must be positive.'),
  requirement('auth.otpDeliveryProviderKnown', ['dev', 'http'].includes(status.authOtpDeliveryProvider), 'AUTH_OTP_DELIVERY_PROVIDER must be dev or http.'),
  requirement('retention.authOtps', status.authOtpRetentionDays > 0, 'AUTH_OTP_RETENTION_DAYS must be positive.'),
];

if (profile === 'production') {
  checks.push(
    requirement('ocr.realProvider', Boolean(env.OCR_PROVIDER && env.OCR_PROVIDER !== 'mock'), 'OCR_PROVIDER must be a real provider in production.'),
    requirement('ocr.endpointOrKey', Boolean(env.OCR_ENDPOINT || env.OCR_API_KEY), 'OCR endpoint or API key must be configured in production.'),
    requirement('auth.realProviderPlanned', env.PRODUCTION_AUTH_READY === 'true', 'Set PRODUCTION_AUTH_READY=true only after mock-login is replaced or gated for production.'),
    requirement('auth.otpDevModeDisabled', !status.authOtpDevModeEnabled, 'AUTH_OTP_DEV_MODE must be false in production.'),
    requirement('auth.otpDeliveryProvider', status.authOtpDeliveryProvider === 'http', 'AUTH_OTP_DELIVERY_PROVIDER must be http in production.'),
    requirement('auth.otpDeliveryEndpoint', status.authOtpDeliveryEndpointConfigured, 'AUTH_OTP_DELIVERY_ENDPOINT must be configured in production.'),
    requirement('auth.otpDeliveryToken', Boolean(env.AUTH_OTP_DELIVERY_TOKEN), 'AUTH_OTP_DELIVERY_TOKEN must be configured in production.'),
    requirement('auth.otpSecretRequired', Boolean(env.AUTH_OTP_SECRET), 'AUTH_OTP_SECRET must be set explicitly in production.'),
    requirement('auth.mockLoginDisabled', !isMockLoginEnabled(env), 'ALLOW_MOCK_LOGIN must be false in production.'),
    requirement('uploads.publicAccessDisabled', !isPublicUploadAccessEnabled(env), 'ALLOW_PUBLIC_UPLOAD_ACCESS must be false in production.'),
    requirement('uploads.storageProvider', status.uploadStorageProvider === 'http', 'UPLOAD_STORAGE_PROVIDER must be http in production.'),
    requirement('uploads.storageEndpoint', status.uploadStorageEndpointConfigured, 'UPLOAD_STORAGE_ENDPOINT must be configured in production.'),
    requirement('uploads.storageToken', Boolean(env.UPLOAD_STORAGE_TOKEN), 'UPLOAD_STORAGE_TOKEN must be configured in production.'),
    requirement('billing.paymentProvider', status.paymentProvider === 'http', 'PAYMENT_PROVIDER must be http in production.'),
    requirement('billing.paymentEndpoint', status.paymentEndpointConfigured, 'PAYMENT_PROVIDER_ENDPOINT must be configured in production.'),
    requirement('billing.paymentToken', Boolean(env.PAYMENT_PROVIDER_TOKEN), 'PAYMENT_PROVIDER_TOKEN must be configured in production.'),
    requirement('billing.webhookSecret', status.paymentWebhookSecretConfigured, 'PAYMENT_WEBHOOK_SECRET must be configured in production.'),
    requirement('billing.paymentReady', status.paymentReady, 'Set PAYMENT_READY=true only after real payment, refund, and reconciliation flows are configured.'),
    requirement('push.provider', status.pushProvider === 'http', 'PUSH_PROVIDER must be http in production.'),
    requirement('push.endpoint', status.pushEndpointConfigured, 'PUSH_ENDPOINT must be configured in production.'),
    requirement('push.token', status.pushTokenConfigured, 'PUSH_TOKEN must be configured in production.'),
    requirement('push.ready', status.pushReady, 'Set PUSH_READY=true only after real mobile push delivery is configured and tested.'),
    requirement('cors.allowedOrigins', status.corsAllowedOrigins.length > 0 && !status.corsAllowedOrigins.includes('*'), 'CORS_ALLOWED_ORIGINS must list production origins and cannot be * in production.'),
    requirement('uploads.objectStorageReady', env.OBJECT_STORAGE_READY === 'true', 'Set OBJECT_STORAGE_READY=true only after image uploads use object storage or signed uploads.'),
    requirement('transport.httpsReady', env.HTTPS_READY === 'true', 'Set HTTPS_READY=true only after HTTPS is enforced end to end.'),
  );
}

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  profile,
  failCount,
  config: status,
  checks,
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
