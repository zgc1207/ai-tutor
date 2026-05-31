import fs from 'node:fs';
import path from 'node:path';
import { getConfigStatus, loadEnvFile } from '../src/lib/config.js';

loadEnvFile();

const ROOT_DIR = path.resolve(process.cwd(), '..');
const SERVER_DIR = process.cwd();

const REQUIRED_SCRIPTS = [
  'config:check',
  'runtime:check',
  'deploy:check',
  'db:setup',
  'db:check',
  'smoke:api',
  'verify:db',
  'verify:static',
  'prototype:check',
  'mobile:check',
  'uploads:cleanup',
  'retention:cleanup',
  'reminders:run',
  'ops:check',
  'eval:ai',
  'ai:check',
];

const REQUIRED_DOCS = [
  '产品定位.md',
  '技术演进路线.md',
  '上线推进计划.md',
  '产品与技术上线蓝图.md',
  '内测准备清单.md',
  '用户协议草案.md',
  '隐私政策草案.md',
  '未成年人使用说明.md',
  '合规上架检查清单.md',
  '部署前检查清单.md',
];

const REQUIRED_ROUTES = [
  'src/routes/auth.js',
  'src/routes/me.js',
  'src/routes/questions.js',
  'src/routes/review.js',
  'src/routes/reports.js',
  'src/routes/uploads.js',
  'src/routes/ocr.js',
  'src/routes/billing.js',
  'src/routes/devices.js',
  'src/routes/notifications.js',
  'src/routes/account.js',
  'src/routes/admin.js',
];

const REQUIRED_WORKFLOWS = [
  '.github/workflows/server-static.yml',
  '.github/workflows/server-smoke.yml',
];

const REQUIRED_MOBILE_FILES = [
  'mobile/package.json',
  'mobile/app.json',
  'mobile/eas.json',
  'mobile/assets/icon.png',
  'mobile/assets/adaptive-icon.png',
  'mobile/assets/splash-icon.png',
  'mobile/App.js',
  'mobile/src/api/client.js',
  'mobile/src/device/native-features.js',
  'mobile/src/storage/session-store.js',
  'mobile/scripts/check-mobile-static.js',
  'mobile/scripts/start-expo-local.js',
  'mobile/README.md',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function directoryHasFiles(dirPath) {
  return fs.existsSync(dirPath) && fs.readdirSync(dirPath).length > 0;
}

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function warn(name, details = {}) {
  return { name, status: 'warn', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

const checks = [];

const config = getConfigStatus();
checks.push(config.ok
  ? pass('config.requiredEnv', { warnings: config.warnings })
  : fail('config.requiredEnv', { missing: config.missing, warnings: config.warnings }));

checks.push(config.internalTestInviteRequired
  ? pass('config.internalInvite')
  : warn('config.internalInvite', { message: 'INTERNAL_TEST_INVITE_CODE is not set; set it before external internal testing.' }));

checks.push(config.uploadRetentionDays > 0
  ? pass('config.uploadRetentionDays', { days: config.uploadRetentionDays })
  : fail('config.uploadRetentionDays', { days: config.uploadRetentionDays }));

checks.push(['local', 'http'].includes(config.uploadStorageProvider)
  ? pass('config.uploadStorage', {
      provider: config.uploadStorageProvider,
      endpointConfigured: config.uploadStorageEndpointConfigured,
    })
  : fail('config.uploadStorage', { provider: config.uploadStorageProvider }));

checks.push(config.aiEventRetentionDays > 0
  ? pass('config.aiEventRetentionDays', { days: config.aiEventRetentionDays })
  : fail('config.aiEventRetentionDays', { days: config.aiEventRetentionDays }));

checks.push(config.expiredSessionRetentionDays > 0
  ? pass('config.expiredSessionRetentionDays', { days: config.expiredSessionRetentionDays })
  : fail('config.expiredSessionRetentionDays', { days: config.expiredSessionRetentionDays }));

checks.push(config.notificationRetentionDays > 0 && config.disabledDeviceTokenRetentionDays > 0
  ? pass('config.notificationRetention', {
      notificationRetentionDays: config.notificationRetentionDays,
      disabledDeviceTokenRetentionDays: config.disabledDeviceTokenRetentionDays,
    })
  : fail('config.notificationRetention', {
      notificationRetentionDays: config.notificationRetentionDays,
      disabledDeviceTokenRetentionDays: config.disabledDeviceTokenRetentionDays,
    }));

checks.push(config.authOtpRetentionDays > 0
  ? pass('config.authOtpRetentionDays', { days: config.authOtpRetentionDays })
  : fail('config.authOtpRetentionDays', { days: config.authOtpRetentionDays }));

checks.push(config.authOtpTtlMinutes > 0 && config.authOtpMaxAttempts > 0 && config.authOtpMinIntervalSeconds > 0
  ? pass('config.authOtpPolicy', {
      ttlMinutes: config.authOtpTtlMinutes,
      maxAttempts: config.authOtpMaxAttempts,
      minIntervalSeconds: config.authOtpMinIntervalSeconds,
      deliveryProvider: config.authOtpDeliveryProvider,
      deliveryEndpointConfigured: config.authOtpDeliveryEndpointConfigured,
      devModeEnabled: config.authOtpDevModeEnabled,
    })
  : fail('config.authOtpPolicy', {
      ttlMinutes: config.authOtpTtlMinutes,
      maxAttempts: config.authOtpMaxAttempts,
      minIntervalSeconds: config.authOtpMinIntervalSeconds,
    }));

checks.push(config.plusPriceCentsMonthly > 0 && ['dev', 'http'].includes(config.paymentProvider)
  ? pass('config.billing', {
      provider: config.paymentProvider,
      endpointConfigured: config.paymentEndpointConfigured,
      webhookSecretConfigured: config.paymentWebhookSecretConfigured,
      priceCentsMonthly: config.plusPriceCentsMonthly,
      paymentReady: config.paymentReady,
    })
  : fail('config.billing', {
      provider: config.paymentProvider,
      priceCentsMonthly: config.plusPriceCentsMonthly,
    }));

checks.push(['dev', 'http'].includes(config.pushProvider)
  ? pass('config.push', {
      provider: config.pushProvider,
      endpointConfigured: config.pushEndpointConfigured,
      tokenConfigured: config.pushTokenConfigured,
      pushReady: config.pushReady,
    })
  : fail('config.push', { provider: config.pushProvider }));

checks.push(config.opsThresholds.maxAiFailureRate > 0
  && config.opsThresholds.maxAiFailureRate <= 1
  && config.opsThresholds.minReviewCompletionRate > 0
  && config.opsThresholds.minReviewCompletionRate <= 1
  && config.opsThresholds.minAverageFeedbackRating > 0
  && config.opsThresholds.minAverageFeedbackRating <= 5
  && config.opsThresholds.maxDailyAiCost > 0
  ? pass('config.opsThresholds', config.opsThresholds)
  : fail('config.opsThresholds', config.opsThresholds));

const packageJson = readJson(path.join(SERVER_DIR, 'package.json'));
const missingScripts = REQUIRED_SCRIPTS.filter(script => !packageJson.scripts?.[script]);
checks.push(missingScripts.length
  ? fail('package.requiredScripts', { missing: missingScripts })
  : pass('package.requiredScripts', { scripts: REQUIRED_SCRIPTS }));

const missingDocs = REQUIRED_DOCS.filter(doc => !fileExists(path.join(ROOT_DIR, doc)));
checks.push(missingDocs.length
  ? fail('docs.required', { missing: missingDocs })
  : pass('docs.required', { docs: REQUIRED_DOCS.length }));

const missingRoutes = REQUIRED_ROUTES.filter(route => !fileExists(path.join(SERVER_DIR, route)));
checks.push(missingRoutes.length
  ? fail('routes.required', { missing: missingRoutes })
  : pass('routes.required', { routes: REQUIRED_ROUTES.length }));

const missingWorkflows = REQUIRED_WORKFLOWS.filter(workflow => !fileExists(path.join(ROOT_DIR, workflow)));
checks.push(missingWorkflows.length
  ? fail('ci.workflows', { missing: missingWorkflows })
  : pass('ci.workflows', { workflows: REQUIRED_WORKFLOWS.length }));

const missingMobileFiles = REQUIRED_MOBILE_FILES.filter(file => !fileExists(path.join(ROOT_DIR, file)));
checks.push(missingMobileFiles.length
  ? fail('mobile.requiredFiles', { missing: missingMobileFiles })
  : pass('mobile.requiredFiles', { files: REQUIRED_MOBILE_FILES.length }));

const migrationsDir = path.join(SERVER_DIR, 'prisma', 'migrations');
checks.push(directoryHasFiles(migrationsDir)
  ? pass('prisma.migrations')
  : fail('prisma.migrations', { message: 'No Prisma migrations found.' }));

const evalCasesPath = path.join(SERVER_DIR, 'evals', 'cases.json');
const evalCases = readJson(evalCasesPath);
const evalCaseCount = Array.isArray(evalCases) ? evalCases.length : evalCases.cases?.length || 0;
checks.push(evalCaseCount >= 30
  ? pass('eval.cases.count', { cases: evalCaseCount })
  : warn('eval.cases.count', {
      cases: evalCaseCount,
      target: '30-50 real cases before internal testing',
    }));

const latestEvalPath = path.join(SERVER_DIR, 'evals', 'reports', 'latest.json');
if (fileExists(latestEvalPath)) {
  const latestEval = readJson(latestEvalPath);
  const summary = latestEval.summary || {};
  const evalPasses = summary.pass === true
    && summary.directAnswerLeakRate <= 0.1
    && summary.guideRate >= 0.8
    && summary.errorSpecificRate >= 0.8
    && summary.variantConsistencyRate >= 0.8
    && summary.contentSafetyPassRate === 1;

  checks.push(evalPasses
    ? pass('eval.latestReport', { summary })
    : fail('eval.latestReport', { summary }));
} else {
  checks.push(fail('eval.latestReport', { message: 'Run npm run eval:ai -- --output evals/reports/latest.json' }));
}

const appSource = fs.readFileSync(path.join(SERVER_DIR, 'src', 'app.js'), 'utf8');
const requiredRouteRegistrations = [
  'authRoutes',
  'meRoutes',
  'questionRoutes',
  'reviewRoutes',
  'reportRoutes',
  'uploadRoutes',
  'ocrRoutes',
  'billingRoutes',
  'deviceRoutes',
  'notificationRoutes',
  'accountRoutes',
  'adminRoutes',
];
const missingRegistrations = requiredRouteRegistrations.filter(name => !appSource.includes(name));
checks.push(missingRegistrations.length
  ? fail('app.routeRegistrations', { missing: missingRegistrations })
  : pass('app.routeRegistrations', { registrations: requiredRouteRegistrations.length }));

const statusCounts = checks.reduce((acc, check) => {
  acc[check.status] = (acc[check.status] || 0) + 1;
  return acc;
}, {});

const output = {
  ok: !checks.some(check => check.status === 'fail'),
  counts: {
    pass: statusCounts.pass || 0,
    warn: statusCounts.warn || 0,
    fail: statusCounts.fail || 0,
  },
  checks,
  nextRequiredExternalChecks: [
    'Start PostgreSQL, then run npm run verify:db',
    'Schedule npm run retention:cleanup daily after database setup',
    'Schedule npm run reminders:run -- --time HH:mm every minute or every configured reminder slot after push setup',
    'Configure a real LLM provider, run npm run ai:check, then re-run npm run eval:ai before inviting users',
  ],
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
