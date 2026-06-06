import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), '..');
const SERVER_DIR = process.cwd();

const CORE_FLOW_STEPS = [
  {
    id: 'auth',
    label: '登录/session',
    models: ['User', 'StudentProfile', 'Session', 'AuthOtp'],
    routes: ['/auth/otp/request', '/auth/otp/login', '/me'],
    mobileClient: ['requestOtp', 'loginWithOtp', 'getMe'],
    mobileUi: ['function renderLogin', 'consentAccepted', 'sessionToken'],
    prototype: ['prototype/login.html', 'prototype/me.html'],
    smoke: ['otp_request:', 'login:', 'me:'],
  },
  {
    id: 'ask',
    label: '提问/AI 引导',
    models: ['Question', 'AnswerSession', 'AnswerMessage', 'AiEvent'],
    routes: ['/questions', '/questions/:id/answer/next'],
    mobileClient: ['createQuestion', 'nextAnswer'],
    mobileUi: ['function renderAsk', 'async function ask', 'answerMessages'],
    prototype: ['prototype/ask.html'],
    smoke: ['question:', 'answer_next:'],
  },
  {
    id: 'mistake',
    label: '加入错题',
    models: ['ErrorRecord', 'KnowledgeNode'],
    routes: ['/questions/:id/finish', '/mistakes'],
    mobileClient: ['finishQuestion', 'getMistakes'],
    mobileUi: ['加入错题', 'function renderMistakes', 'finishCurrentQuestion'],
    prototype: ['prototype/mistakes.html'],
    smoke: ['finish:', 'mistakes:'],
  },
  {
    id: 'review',
    label: '复习任务',
    models: ['ReviewTask'],
    routes: ['/review-tasks/today', '/review-tasks/:id/answer'],
    mobileClient: ['getReviewTasks', 'answerReviewTask'],
    mobileUi: ['function renderReview', 'answerReviewTask', '仍不会'],
    prototype: ['prototype/review.html'],
    smoke: ['review_tasks:', 'review_answer:'],
  },
  {
    id: 'report',
    label: '学习报告',
    models: ['Question', 'ErrorRecord', 'ReviewTask'],
    routes: ['/dashboard', '/reports/parent-weekly', '/knowledge-tree'],
    mobileClient: ['getDashboard', 'getParentWeeklyReport', 'getKnowledgeTree'],
    mobileUi: ['function renderHome', 'function renderReport', 'function renderKnowledge'],
    prototype: ['prototype/index.html', 'prototype/report.html'],
    smoke: ['dashboard:', 'parent_weekly_report:', 'knowledge_tree:'],
  },
];

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), 'utf8');
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT_DIR, relativePath));
}

function missingSnippets(source, snippets) {
  return snippets.filter(snippet => !source.includes(snippet));
}

const schema = read('server/prisma/schema.prisma');
const apiContract = JSON.parse(read('api-contract.json'));
const mobileClient = read('mobile/src/api/client.js');
const mobileApp = read('mobile/App.js');
const smokeApi = read('server/scripts/smoke-api.js');
const packageJson = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf8'));
const checks = [];

checks.push(packageJson.scripts?.['smoke:api'] && packageJson.scripts?.['verify:db']
  ? pass('core.packageScripts', { scripts: ['smoke:api', 'verify:db'] })
  : fail('core.packageScripts', { message: 'smoke:api and verify:db scripts are required.' }));

const contractEndpoints = new Set(apiContract.endpoints.map(endpoint => endpoint.path));

for (const step of CORE_FLOW_STEPS) {
  const missingModels = step.models.filter(model => !schema.includes(`model ${model} `));
  const missingRoutes = step.routes.filter(route => !contractEndpoints.has(route));
  const missingMobileClient = missingSnippets(mobileClient, step.mobileClient);
  const missingMobileUi = missingSnippets(mobileApp, step.mobileUi);
  const missingPrototypeFiles = step.prototype.filter(file => !fileExists(file));
  const missingSmoke = missingSnippets(smokeApi, step.smoke);

  const missing = {
    models: missingModels,
    routes: missingRoutes,
    mobileClient: missingMobileClient,
    mobileUi: missingMobileUi,
    prototype: missingPrototypeFiles,
    smoke: missingSmoke,
  };
  const hasMissing = Object.values(missing).some(items => items.length > 0);

  checks.push(hasMissing
    ? fail(`core.${step.id}`, { label: step.label, missing })
    : pass(`core.${step.id}`, {
        label: step.label,
        models: step.models.length,
        routes: step.routes.length,
        mobileClient: step.mobileClient.length,
        mobileUi: step.mobileUi.length,
        prototype: step.prototype.length,
        smoke: step.smoke.length,
      }));
}

const requiredDocs = [
  ['上线推进计划.md', '提问 -> 启发式答疑 -> 加入错题 -> 复习变式题 -> 知识点状态变化'],
  ['项目状态看板.md', '提问、AI 启发式引导、错题入库、D1/D3/D7/D15 复习任务'],
  ['阶段2技术设计.md', 'GET /dashboard'],
  ['阶段2技术设计.md', 'POST /review-tasks/:id/answer'],
];
const missingDocs = requiredDocs.filter(([file, snippet]) => !read(file).includes(snippet));
checks.push(missingDocs.length
  ? fail('core.docs', { missing: missingDocs.map(([file, snippet]) => `${file}: ${snippet}`) })
  : pass('core.docs', { docs: requiredDocs.length }));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  flow: CORE_FLOW_STEPS.map(step => ({ id: step.id, label: step.label })),
  checks,
  verificationPolicy: {
    staticContract: 'Run npm run core:contract before changing core learning routes, database models, or mobile screens.',
    runtimeSmoke: 'Run npm run verify:db after PostgreSQL is reachable to prove the full API chain executes.',
    productWalkthrough: 'Run mobile start:check and a real-device walkthrough before calling the app internally testable.',
  },
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
