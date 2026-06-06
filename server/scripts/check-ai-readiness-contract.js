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

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function missingSnippets(source, snippets) {
  return snippets.filter(snippet => !source.includes(snippet));
}

const checks = [];
const packageJson = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf8'));
const evalCases = readJson('server/evals/cases.json');
const latestReport = readJson('server/evals/reports/latest.json');
const aiCheck = read('server/scripts/check-ai-provider.js');
const evalScript = read('server/scripts/eval-ai.js');
const deployCheck = read('server/scripts/check-deploy-config.js');
const aiTemplate = read('AI评测记录模板.md');
const serverReadme = read('server/README.md');
const deploymentChecklist = read('部署前检查清单.md');
const internalChecklist = read('内测准备清单.md');
const docsSource = `${serverReadme}\n${deploymentChecklist}\n${internalChecklist}\n${aiTemplate}`;

const requiredScripts = ['ai:check', 'eval:ai'];
const missingScripts = requiredScripts.filter(script => !packageJson.scripts?.[script]);
checks.push(missingScripts.length
  ? fail('ai.packageScripts', { missing: missingScripts })
  : pass('ai.packageScripts', { scripts: requiredScripts }));

checks.push(Array.isArray(evalCases) && evalCases.length >= 30
  ? pass('ai.evalCases', {
      cases: evalCases.length,
      subjects: [...new Set(evalCases.map(item => item.subject))],
      gradeStages: [...new Set(evalCases.map(item => item.gradeStage))],
    })
  : fail('ai.evalCases', { cases: Array.isArray(evalCases) ? evalCases.length : 0, minimum: 30 }));

const summary = latestReport.summary || {};
const latestPasses = summary.pass === true
  && summary.directAnswerLeakRate <= 0.1
  && summary.guideRate >= 0.8
  && summary.errorSpecificRate >= 0.8
  && summary.variantConsistencyRate >= 0.8
  && summary.contentSafetyPassRate === 1
  && summary.p95LatencyMs < 12000;
checks.push(latestPasses
  ? pass('ai.latestEvalReport', { summary })
  : fail('ai.latestEvalReport', { summary }));

const requiredAiCheckSnippets = [
  'const allowMock = process.argv.includes',
  'LLM_PROVIDER must be non-mock',
  'LLM_API_KEY must be set',
  'actuallyMock',
  'Set LLM_READY=true only after eval:ai and manual review also pass',
];
const missingAiCheckSnippets = missingSnippets(aiCheck, requiredAiCheckSnippets);
checks.push(missingAiCheckSnippets.length
  ? fail('ai.providerCheck', { missing: missingAiCheckSnippets })
  : pass('ai.providerCheck', { snippets: requiredAiCheckSnippets.length }));

const requiredEvalSnippets = [
  'directAnswerLeakRate',
  'guideRate',
  'errorSpecificRate',
  'variantConsistencyRate',
  'contentSafetyPassRate',
  'p95LatencyMs',
  'forbiddenFinalAnswers',
  'safetyCases',
];
const missingEvalSnippets = missingSnippets(evalScript, requiredEvalSnippets);
checks.push(missingEvalSnippets.length
  ? fail('ai.evalScript', { missing: missingEvalSnippets })
  : pass('ai.evalScript', { snippets: requiredEvalSnippets.length }));

const requiredDeploySnippets = [
  'llm.realProvider',
  'llm.apiKey',
  'llm.ready',
  'Set LLM_READY=true only after npm run ai:check and real eval:ai pass.',
];
const missingDeploySnippets = missingSnippets(deployCheck, requiredDeploySnippets);
checks.push(missingDeploySnippets.length
  ? fail('ai.deployGate', { missing: missingDeploySnippets })
  : pass('ai.deployGate', { snippets: requiredDeploySnippets.length }));

const requiredManualReviewSnippets = [
  '人工抽检',
  'AI 是否直接给答案',
  '启发式引导是否自然',
  '错因是否具体',
  '变式题是否同知识点',
  '是否适合学生继续使用',
  '是否进入小规模内测',
];
const missingManualReviewSnippets = missingSnippets(aiTemplate, requiredManualReviewSnippets);
checks.push(missingManualReviewSnippets.length
  ? fail('ai.manualReviewTemplate', { missing: missingManualReviewSnippets })
  : pass('ai.manualReviewTemplate', { snippets: requiredManualReviewSnippets.length }));

const requiredDocSnippets = [
  'npm run ai:check',
  'npm run eval:ai -- --output evals/reports/latest.json',
  'LLM_READY=true',
  '人工抽检',
  '真实模型',
];
const missingDocSnippets = missingSnippets(docsSource, requiredDocSnippets);
checks.push(missingDocSnippets.length
  ? fail('ai.docs', { missing: missingDocSnippets })
  : pass('ai.docs', { snippets: requiredDocSnippets.length }));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  checks,
  readinessPolicy: {
    llmReady: 'Set LLM_READY=true only after real ai:check, real eval:ai, and manual review pass.',
    internalTestBlocker: 'Do not invite external internal testers while the real-ai stage gate is external-blocked.',
  },
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
