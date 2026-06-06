import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const SERVER_ROOT = process.cwd();

const SMOKE_CATEGORIES = [
  {
    id: 'auth',
    label: '账号登录/session',
    snippets: [
      'otp_request:',
      'login:',
      'me:',
      'profile_update:',
      'reminder_update:',
      'session_after_delete:',
    ],
  },
  {
    id: 'learning',
    label: '学习主链路',
    snippets: [
      'MAIN_FLOW_ACCEPTANCE',
      'main_flow_acceptance:',
      'ocr:',
      'upload_image:',
      'question:',
      'answer_next:',
      'finish:',
      'review_tasks:',
      'review_answer:',
      'dashboard:',
      'weekly_report:',
      'parent_weekly_report:',
      'mistakes:',
      'knowledge_tree:',
    ],
  },
  {
    id: 'safety',
    label: '安全拦截',
    snippets: [
      'requestExpectFailure',
      'safety_block:',
      '帮我考试作弊',
    ],
  },
  {
    id: 'billing',
    label: 'Plus/支付',
    snippets: [
      'plans:',
      'billing_checkout:',
      'billing_webhook:',
      'billing_status:',
      'plus_plan:',
      'billing_cancel:',
      'billing_refund_webhook:',
      'plan_after_refund:',
    ],
  },
  {
    id: 'notifications',
    label: '推送/提醒',
    snippets: [
      'device_register:',
      'notification_review_reminder:',
      'notification_status:',
      '/notifications/review-reminders/run',
      '/notifications/status',
    ],
  },
  {
    id: 'ops',
    label: '运营后台',
    snippets: [
      'admin_summary:',
      'admin_metrics:',
      'admin_ops_health:',
      'admin_billing:',
      'admin_billing_reconciliation:',
      'admin_questions:',
      'admin_feedback:',
      'admin_content_review:',
      'admin_question_detail:',
      'admin_users:',
      'admin_user_detail:',
    ],
  },
  {
    id: 'privacy',
    label: '隐私/账号删除',
    snippets: [
      'account_export:',
      'account_delete:',
      'account_delete_images:',
      'session_after_delete:',
      '/account/export',
      "method: 'DELETE'",
      "url: '/account'",
    ],
  },
];

const VERIFY_DB_STEPS = [
  'npm run db:doctor',
  'npm run db:setup',
  'npm run db:check',
  'npm run retention:cleanup',
  'npm run reminders:run -- --time 19:30 --dry-run',
  'npm run smoke:api',
];

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function missingSnippets(source, snippets) {
  return snippets.filter(snippet => !source.includes(snippet));
}

const packageJson = JSON.parse(fs.readFileSync(path.join(SERVER_ROOT, 'package.json'), 'utf8'));
const smokeApi = read('server/scripts/smoke-api.js');
const verifyDb = read('server/scripts/verify-db.js');
const docs = [
  read('server/README.md'),
  read('部署前检查清单.md'),
  read('项目状态看板.md'),
  read('数据库API烟测验收矩阵.md'),
].join('\n');

const checks = [];

checks.push(packageJson.scripts?.['smoke:api'] && packageJson.scripts?.['verify:db']
  ? pass('smoke.packageScripts', { scripts: ['smoke:api', 'verify:db'] })
  : fail('smoke.packageScripts', { scripts: packageJson.scripts || {} }));

for (const category of SMOKE_CATEGORIES) {
  const missing = missingSnippets(smokeApi, category.snippets);
  checks.push(missing.length
    ? fail(`smoke.${category.id}`, {
        label: category.label,
        missing,
      })
    : pass(`smoke.${category.id}`, {
        label: category.label,
        snippets: category.snippets.length,
      }));
}

const missingVerifySteps = missingSnippets(verifyDb, VERIFY_DB_STEPS);
checks.push(missingVerifySteps.length
  ? fail('smoke.verifyDbPipeline', { missing: missingVerifySteps })
  : pass('smoke.verifyDbPipeline', { steps: VERIFY_DB_STEPS.length }));

const requiredDocs = [
  'npm run verify:db',
  '数据库/API',
  'smoke:api',
  'PostgreSQL',
  'main_flow_acceptance',
];
const missingDocs = missingSnippets(docs, requiredDocs);
checks.push(missingDocs.length
  ? fail('smoke.docs', { missing: missingDocs })
  : pass('smoke.docs', { snippets: requiredDocs.length }));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  categories: SMOKE_CATEGORIES.map(category => ({
    id: category.id,
    label: category.label,
  })),
  checks,
  runtimePolicy: {
    local: 'Run npm run db:start:local first when using the repository compose PostgreSQL.',
    proof: 'Run npm run verify:db after PostgreSQL is reachable; this is the runtime proof for database/API smoke.',
    limitation: 'This contract is static coverage evidence and does not replace a successful verify:db run.',
  },
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
