import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), '..');
const SERVER_DIR = process.cwd();

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

function missingSnippets(source, snippets) {
  return snippets.filter(snippet => !source.includes(snippet));
}

const packageJson = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf8'));
const opsHealth = read('server/src/lib/ops-health.js');
const opsCli = read('server/scripts/check-ops-health.js');
const adminRoutes = read('server/src/routes/admin.js');
const smokeApi = read('server/scripts/smoke-api.js');
const envExample = read('server/.env.example');
const deploymentChecklist = read('部署前检查清单.md');
const internalChecklist = read('内测准备清单.md');
const projectDashboard = read('项目状态看板.md');
const docsSource = `${deploymentChecklist}\n${internalChecklist}\n${projectDashboard}`;

const checks = [];

const requiredPackageScripts = ['ops:check', 'smoke:api', 'verify:static'];
const missingPackageScripts = requiredPackageScripts.filter(script => !packageJson.scripts?.[script]);
checks.push(missingPackageScripts.length
  ? fail('ops.packageScripts', { missing: missingPackageScripts })
  : pass('ops.packageScripts', { scripts: requiredPackageScripts }));

const requiredOpsHealthSnippets = [
  'export async function evaluateOpsHealth',
  'getOpsHealthThresholds',
  'ai.failureRate',
  'ai.dailyCost',
  'learning.reviewCompletionRate',
  'feedback.averageRating',
  'pause_expansion',
  'watch_and_investigate',
  'continue',
];
const missingOpsHealthSnippets = missingSnippets(opsHealth, requiredOpsHealthSnippets);
checks.push(missingOpsHealthSnippets.length
  ? fail('ops.healthEvaluator', { missing: missingOpsHealthSnippets })
  : pass('ops.healthEvaluator', {
      checks: 4,
      actions: ['pause_expansion', 'watch_and_investigate', 'continue'],
    }));

const requiredOpsCliSnippets = [
  'evaluateOpsHealth',
  '--days',
  'prisma.$disconnect',
];
const missingOpsCliSnippets = missingSnippets(opsCli, requiredOpsCliSnippets);
checks.push(missingOpsCliSnippets.length
  ? fail('ops.healthCli', { missing: missingOpsCliSnippets })
  : pass('ops.healthCli', { command: 'npm run ops:check -- --days 7' }));

const requiredAdminRouteSnippets = [
  'requireAdmin(request)',
  "app.get('/metrics'",
  "app.get('/ops-health'",
  "app.get('/billing'",
  "app.get('/billing/reconciliation'",
  "app.get('/users'",
  "app.get('/users/:id'",
  "app.get('/feedback'",
  "app.get('/ai-events'",
  "app.get('/content-review'",
  "app.get('/questions'",
  "app.get('/questions/:id'",
];
const missingAdminRouteSnippets = missingSnippets(adminRoutes, requiredAdminRouteSnippets);
checks.push(missingAdminRouteSnippets.length
  ? fail('ops.adminRoutes', { missing: missingAdminRouteSnippets })
  : pass('ops.adminRoutes', { routes: requiredAdminRouteSnippets.length - 1 }));

const requiredSmokeEndpoints = [
  '/admin/metrics?days=7',
  '/admin/ops-health?days=7',
  '/admin/billing?days=7&take=5',
  '/admin/billing/reconciliation?take=5',
  '/admin/questions?days=7&take=5&subjectCode=math',
  '/admin/feedback?take=5',
  '/admin/content-review?days=7&take=5',
  '/admin/users?take=5',
];
const missingSmokeEndpoints = missingSnippets(smokeApi, requiredSmokeEndpoints);
checks.push(missingSmokeEndpoints.length
  ? fail('ops.smokeCoverage', { missing: missingSmokeEndpoints })
  : pass('ops.smokeCoverage', { endpoints: requiredSmokeEndpoints.length }));

const requiredEnvKeys = [
  'OPS_MAX_AI_FAILURE_RATE',
  'OPS_MAX_DAILY_AI_COST',
  'OPS_MIN_REVIEW_COMPLETION_RATE',
  'OPS_MIN_AVERAGE_FEEDBACK_RATING',
];
const missingEnvKeys = requiredEnvKeys.filter(key => !envExample.includes(`${key}=`));
checks.push(missingEnvKeys.length
  ? fail('ops.envThresholds', { missing: missingEnvKeys })
  : pass('ops.envThresholds', { envKeys: requiredEnvKeys.length }));

const requiredDocSnippets = [
  'npm run ops:check -- --days 7',
  '/admin/metrics',
  '/admin/ops-health',
  'pause_expansion',
];
const missingDocSnippets = missingSnippets(docsSource, requiredDocSnippets);
checks.push(missingDocSnippets.length
  ? fail('ops.docs', { missing: missingDocSnippets })
  : pass('ops.docs', { docs: ['部署前检查清单.md', '内测准备清单.md', '项目状态看板.md'] }));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  checks,
  expansionPolicy: {
    gate: 'Do not invite the next internal cohort when recommendedAction is pause_expansion.',
    requiredDailyReview: 'Review /admin/metrics and /admin/ops-health before increasing test volume.',
  },
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
