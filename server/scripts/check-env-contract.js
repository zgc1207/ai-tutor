import fs from 'node:fs';
import path from 'node:path';

const SERVER_DIR = process.cwd();
const ENV_EXAMPLE_PATH = path.join(SERVER_DIR, '.env.example');
const DEPLOY_CHECK_PATH = path.join(SERVER_DIR, 'scripts', 'check-deploy-config.js');

const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'PORT',
  'BODY_LIMIT_BYTES',
  'SECURITY_HEADERS_ENABLED',
  'RATE_LIMIT_ENABLED',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX',
  'CORS_ALLOWED_ORIGINS',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_TIMEOUT_MS',
  'LLM_MAX_OUTPUT_TOKENS',
  'LLM_READY',
  'OCR_PROVIDER',
  'OCR_API_KEY',
  'OCR_ENDPOINT',
  'ADMIN_TOKEN',
  'INTERNAL_TEST_INVITE_CODE',
  'AUTH_OTP_SECRET',
  'AUTH_OTP_DEV_MODE',
  'AUTH_OTP_DELIVERY_PROVIDER',
  'AUTH_OTP_DELIVERY_ENDPOINT',
  'AUTH_OTP_DELIVERY_TOKEN',
  'AUTH_OTP_TTL_MINUTES',
  'AUTH_OTP_MAX_ATTEMPTS',
  'AUTH_OTP_RETENTION_DAYS',
  'AUTH_OTP_MIN_INTERVAL_SECONDS',
  'ALLOW_LEGACY_USER_ID_AUTH',
  'ALLOW_MOCK_LOGIN',
  'PRODUCTION_AUTH_READY',
  'OBJECT_STORAGE_READY',
  'HTTPS_READY',
  'DAILY_QUESTION_LIMIT',
  'DAILY_AI_STEP_LIMIT',
  'PLUS_DAILY_QUESTION_LIMIT',
  'PLUS_DAILY_AI_STEP_LIMIT',
  'PLUS_PRICE_CENTS_MONTHLY',
  'PAYMENT_PROVIDER',
  'PAYMENT_PROVIDER_ENDPOINT',
  'PAYMENT_PROVIDER_TOKEN',
  'PAYMENT_WEBHOOK_SECRET',
  'PAYMENT_READY',
  'PUSH_PROVIDER',
  'PUSH_ENDPOINT',
  'PUSH_TOKEN',
  'PUSH_READY',
  'OPS_MAX_AI_FAILURE_RATE',
  'OPS_MAX_DAILY_AI_COST',
  'OPS_MIN_REVIEW_COMPLETION_RATE',
  'OPS_MIN_AVERAGE_FEEDBACK_RATING',
  'UPLOAD_RETENTION_DAYS',
  'UPLOAD_STORAGE_PROVIDER',
  'UPLOAD_STORAGE_ENDPOINT',
  'UPLOAD_STORAGE_TOKEN',
  'AI_EVENT_RETENTION_DAYS',
  'EXPIRED_SESSION_RETENTION_DAYS',
  'NOTIFICATION_RETENTION_DAYS',
  'DISABLED_DEVICE_TOKEN_RETENTION_DAYS',
  'ALLOW_PUBLIC_UPLOAD_ACCESS',
];

const SAFE_EXAMPLE_DEFAULTS = {
  ADMIN_TOKEN: 'change-me',
  LLM_API_KEY: '',
  LLM_READY: 'false',
  OCR_PROVIDER: 'mock',
  PAYMENT_PROVIDER: 'dev',
  PAYMENT_READY: 'false',
  PUSH_PROVIDER: 'dev',
  PUSH_READY: 'false',
  PRODUCTION_AUTH_READY: 'false',
  OBJECT_STORAGE_READY: 'false',
  HTTPS_READY: 'false',
  AUTH_OTP_DELIVERY_PROVIDER: 'dev',
  UPLOAD_STORAGE_PROVIDER: 'local',
  ALLOW_PUBLIC_UPLOAD_ACCESS: 'true',
};

const DEPLOY_CHECK_REQUIRED_SNIPPETS = [
  'ADMIN_TOKEN',
  'INTERNAL_TEST_INVITE_CODE',
  'ALLOW_LEGACY_USER_ID_AUTH',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_READY',
  'BODY_LIMIT_BYTES',
  'SECURITY_HEADERS_ENABLED',
  'RATE_LIMIT_ENABLED',
  'DAILY_QUESTION_LIMIT',
  'DAILY_AI_STEP_LIMIT',
  'PAYMENT_PROVIDER',
  'PUSH_PROVIDER',
  'OPS_MAX_AI_FAILURE_RATE',
  'UPLOAD_RETENTION_DAYS',
  'AUTH_OTP_SECRET',
  'AUTH_OTP_DELIVERY_PROVIDER',
  'OCR_PROVIDER',
  'PRODUCTION_AUTH_READY',
  'AUTH_OTP_DEV_MODE',
  'ALLOW_MOCK_LOGIN',
  'ALLOW_PUBLIC_UPLOAD_ACCESS',
  'UPLOAD_STORAGE_PROVIDER',
  'PAYMENT_READY',
  'PUSH_READY',
  'CORS_ALLOWED_ORIGINS',
  'OBJECT_STORAGE_READY',
  'HTTPS_READY',
];

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function parseEnvExample(source) {
  const values = new Map();
  const duplicates = [];

  for (const line of source.split(/\r?\n/)) {
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

    if (values.has(key)) duplicates.push(key);
    values.set(key, value);
  }

  return { values, duplicates };
}

const envSource = fs.readFileSync(ENV_EXAMPLE_PATH, 'utf8');
const deployCheckSource = fs.readFileSync(DEPLOY_CHECK_PATH, 'utf8');
const { values, duplicates } = parseEnvExample(envSource);
const checks = [];

const missingKeys = REQUIRED_ENV_KEYS.filter(key => !values.has(key));
checks.push(missingKeys.length
  ? fail('env.example.requiredKeys', { missingKeys })
  : pass('env.example.requiredKeys', { keys: REQUIRED_ENV_KEYS.length }));

checks.push(duplicates.length
  ? fail('env.example.duplicates', { duplicates })
  : pass('env.example.duplicates'));

const unsafeDefaults = Object.entries(SAFE_EXAMPLE_DEFAULTS)
  .filter(([key, expected]) => values.get(key) !== expected)
  .map(([key, expected]) => ({
    key,
    expected,
    actual: values.get(key),
  }));
checks.push(unsafeDefaults.length
  ? fail('env.example.safeDefaults', { unsafeDefaults })
  : pass('env.example.safeDefaults'));

const numericKeys = [
  'BODY_LIMIT_BYTES',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX',
  'LLM_TIMEOUT_MS',
  'LLM_MAX_OUTPUT_TOKENS',
  'AUTH_OTP_TTL_MINUTES',
  'AUTH_OTP_MAX_ATTEMPTS',
  'AUTH_OTP_RETENTION_DAYS',
  'AUTH_OTP_MIN_INTERVAL_SECONDS',
  'DAILY_QUESTION_LIMIT',
  'DAILY_AI_STEP_LIMIT',
  'PLUS_DAILY_QUESTION_LIMIT',
  'PLUS_DAILY_AI_STEP_LIMIT',
  'PLUS_PRICE_CENTS_MONTHLY',
  'UPLOAD_RETENTION_DAYS',
  'AI_EVENT_RETENTION_DAYS',
  'EXPIRED_SESSION_RETENTION_DAYS',
  'NOTIFICATION_RETENTION_DAYS',
  'DISABLED_DEVICE_TOKEN_RETENTION_DAYS',
];
const invalidNumbers = numericKeys
  .filter(key => !Number.isFinite(Number(values.get(key))) || Number(values.get(key)) <= 0)
  .map(key => ({ key, value: values.get(key) }));
checks.push(invalidNumbers.length
  ? fail('env.example.positiveNumbers', { invalidNumbers })
  : pass('env.example.positiveNumbers', { keys: numericKeys.length }));

const missingDeployChecks = DEPLOY_CHECK_REQUIRED_SNIPPETS.filter(snippet => !deployCheckSource.includes(snippet));
checks.push(missingDeployChecks.length
  ? fail('env.deployCheck.coverage', { missingDeployChecks })
  : pass('env.deployCheck.coverage', { keys: DEPLOY_CHECK_REQUIRED_SNIPPETS.length }));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  envExample: path.relative(SERVER_DIR, ENV_EXAMPLE_PATH),
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  checks,
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
