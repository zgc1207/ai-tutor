import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), '..');

const WORKFLOW_CONTRACTS = [
  {
    name: 'server-static',
    path: '.github/workflows/server-static.yml',
    requiredSnippets: [
      'pull_request:',
      'push:',
      '- main',
      'runs-on: ubuntu-latest',
      'actions/checkout@v4',
      'actions/setup-node@v4',
      'node-version: 22',
      'cache: npm',
      'cache-dependency-path: server/package-lock.json',
      'working-directory: server',
      'npm ci',
      'npm run verify:static',
      'DATABASE_URL:',
      'ADMIN_TOKEN:',
      'INTERNAL_TEST_INVITE_CODE:',
      'AUTH_OTP_SECRET:',
      'ALLOW_LEGACY_USER_ID_AUTH: false',
      'LLM_PROVIDER: mock',
      'OCR_PROVIDER: mock',
    ],
  },
  {
    name: 'server-smoke',
    path: '.github/workflows/server-smoke.yml',
    requiredSnippets: [
      'pull_request:',
      'push:',
      '- main',
      'runs-on: ubuntu-latest',
      'services:',
      'postgres:',
      'image: postgres:16-alpine',
      'POSTGRES_USER: ai_tutor',
      'POSTGRES_PASSWORD: ai_tutor',
      'POSTGRES_DB: ai_tutor',
      'pg_isready -U ai_tutor -d ai_tutor',
      '5432:5432',
      'actions/checkout@v4',
      'actions/setup-node@v4',
      'node-version: 22',
      'cache: npm',
      'cache-dependency-path: server/package-lock.json',
      'working-directory: server',
      'npm ci',
      'npm run verify:db',
      'DATABASE_URL:',
      'ADMIN_TOKEN:',
      'INTERNAL_TEST_INVITE_CODE:',
      'AUTH_OTP_SECRET:',
      'ALLOW_LEGACY_USER_ID_AUTH: false',
      'LLM_PROVIDER: mock',
      'OCR_PROVIDER: mock',
      'DAILY_QUESTION_LIMIT: 50',
      'DAILY_AI_STEP_LIMIT: 150',
    ],
  },
];

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function readWorkflow(relativePath) {
  const filePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

const checks = [];

for (const contract of WORKFLOW_CONTRACTS) {
  const source = readWorkflow(contract.path);
  if (!source) {
    checks.push(fail(`ci.${contract.name}`, {
      path: contract.path,
      message: 'Workflow file is missing.',
    }));
    continue;
  }

  const missingSnippets = contract.requiredSnippets.filter(snippet => !source.includes(snippet));
  checks.push(missingSnippets.length
    ? fail(`ci.${contract.name}`, {
        path: contract.path,
        missingSnippets,
      })
    : pass(`ci.${contract.name}`, {
        path: contract.path,
        requiredSnippets: contract.requiredSnippets.length,
      }));
}

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
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
