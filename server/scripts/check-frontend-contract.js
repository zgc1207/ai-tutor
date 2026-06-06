import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function missingSnippets(source, snippets) {
  return snippets.filter(snippet => !source.includes(snippet));
}

function assertSnippets(checks, name, source, snippets, details = {}) {
  const missing = missingSnippets(source, snippets);
  checks.push(missing.length
    ? fail(name, { missing, ...details })
    : pass(name, { snippets: snippets.length, ...details }));
}

const apiContract = readJson('api-contract.json');
const mobileClient = read('mobile/src/api/client.js');
const mobileApp = read('mobile/App.js');
const prototypeApi = read('prototype/js/api.js');
const prototypePages = [
  'prototype/login.html',
  'prototype/index.html',
  'prototype/ask.html',
  'prototype/mistakes.html',
  'prototype/review.html',
  'prototype/report.html',
  'prototype/me.html',
].map(read).join('\n');
const adminConsole = read('prototype/js/admin-console.js');
const mobileReadme = read('mobile/README.md');
const serverReadme = read('server/README.md');
const deployChecklist = read('部署前检查清单.md');

const checks = [];

const contractEndpoints = apiContract.endpoints || [];
const mobileEndpoints = contractEndpoints.filter(endpoint => endpoint.clients?.includes('mobile'));
const prototypeEndpoints = contractEndpoints.filter(endpoint => endpoint.clients?.includes('prototype'));
const adminEndpoints = contractEndpoints.filter(endpoint => endpoint.clients?.includes('admin'));

checks.push(apiContract.version && mobileEndpoints.length && prototypeEndpoints.length && adminEndpoints.length
  ? pass('frontend.contractScope', {
      version: apiContract.version,
      mobileEndpoints: mobileEndpoints.length,
      prototypeEndpoints: prototypeEndpoints.length,
      adminEndpoints: adminEndpoints.length,
    })
  : fail('frontend.contractScope', {
      version: apiContract.version,
      mobileEndpoints: mobileEndpoints.length,
      prototypeEndpoints: prototypeEndpoints.length,
      adminEndpoints: adminEndpoints.length,
    }));

assertSnippets(checks, 'frontend.mobileCoreApi', mobileClient, [
  '/auth/otp/request',
  '/auth/otp/login',
  '/auth/logout',
  '/me',
  '/health',
  '/ready',
  '/dashboard',
  '/questions',
  '/answer/next',
  '/finish',
  '/mistakes',
  '/review-tasks/today',
  '/review-tasks/',
  '/reports/parent-weekly',
  '/knowledge-tree?subject=',
  '/uploads/images',
  '/ocr/extract',
  '/devices',
  '/plans',
  '/billing/status',
  '/billing/checkout',
  '/billing/cancel',
  '/feedback',
  '/account/export',
  '/account',
]);

assertSnippets(checks, 'frontend.mobileScreens', mobileApp, [
  'renderLogin',
  'renderHome',
  'renderAsk',
  'renderMistakes',
  'renderReview',
  'renderReport',
  'renderKnowledge',
  'renderPlus',
  'renderMe',
  'loadAuthenticatedData',
  'registerReviewPushToken',
  'takeQuestionPhoto',
  'finishCurrentQuestion',
  'answerReviewTask',
  'submitFeedback',
  'requestAccountDeletion',
]);

const mobileForbiddenAuthSnippets = ['x-user-id', '/auth/mock-login'];
const mobileAuthViolations = mobileForbiddenAuthSnippets.filter(snippet => mobileClient.includes(snippet) || mobileApp.includes(snippet));
checks.push(mobileAuthViolations.length
  ? fail('frontend.mobileAuthPolicy', { violations: mobileAuthViolations })
  : pass('frontend.mobileAuthPolicy', { auth: 'bearer-session-only' }));

assertSnippets(checks, 'frontend.prototypeCoreApi', prototypeApi, [
  '/auth/mock-login',
  '/auth/otp/request',
  '/auth/otp/login',
  '/auth/logout',
  '/me',
  '/me/profile',
  '/me/reminder',
  '/dashboard',
  '/questions',
  '/answer/next',
  '/finish',
  '/mistakes',
  '/review-tasks/today',
  '/review-tasks?scope=all',
  '/review-tasks/',
  '/reports/weekly',
  '/reports/parent-weekly',
  '/knowledge-tree?subject=',
  '/uploads/images',
  '/ocr/extract',
  '/plans',
  '/billing/status',
  '/billing/checkout',
  '/billing/cancel',
  '/feedback',
  '/account/export',
  '/account',
]);

assertSnippets(checks, 'frontend.prototypePages', prototypePages, [
  'ApiClient.requestLoginOtp',
  'ApiClient.loginWithOtp',
  'ApiClient.getDashboard',
  'ApiClient.createQuestion',
  'ApiClient.nextAnswer',
  'ApiClient.finishQuestion',
  'ApiClient.getMistakes',
  'ApiClient.getReviewTasks',
  'ApiClient.answerReviewTask',
  'ApiClient.getWeeklyReport',
  'ApiClient.getParentWeeklyReport',
  'ApiClient.getKnowledgeTree',
  'ApiClient.submitFeedback',
  'ApiClient.exportAccountData',
  'ApiClient.deleteAccount',
]);

assertSnippets(checks, 'frontend.adminConsole', `${adminConsole}\n${prototypeApi}`, [
  'ApiClient.adminRequest',
  '/admin/summary?days=7',
  '/admin/metrics?days=7',
  '/admin/ops-health?days=7',
  '/admin/billing?days=7&take=20',
  '/admin/billing/reconciliation?take=20',
  '/admin/content-review?days=7&take=20',
  '/admin/users?take=20',
  'x-admin-token',
]);

assertSnippets(checks, 'frontend.authDocs', `${mobileReadme}\n${serverReadme}\n${deployChecklist}`, [
  'bearer `sessionToken`',
  'Authorization: Bearer <sessionToken>',
  'ALLOW_LEGACY_USER_ID_AUTH=false',
  'ALLOW_MOCK_LOGIN=false',
  'POST /auth/mock-login',
]);

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  checks,
  runtimePolicy: {
    databaseRequired: 'Run npm run verify:db after PostgreSQL is reachable to prove backend API execution.',
    mobileRequired: 'Run cd mobile && npm run start:check plus a real-device walkthrough before claiming frontend runtime readiness.',
    productionAuth: 'Set ALLOW_LEGACY_USER_ID_AUTH=false and ALLOW_MOCK_LOGIN=false before production exposure.',
  },
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
