import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), '..');
const DOC_PATH = path.join(ROOT_DIR, '主链路数据设计.md');
const SCHEMA_PATH = path.join(process.cwd(), 'prisma', 'schema.prisma');
const API_CONTRACT_PATH = path.join(ROOT_DIR, 'api-contract.json');

const REQUIRED_FLOWS = [
  {
    id: 'auth-profile',
    heading: '## 主链路 1: 登录和学生档案',
    models: ['User', 'AuthOtp', 'Session', 'StudentProfile'],
    endpoints: ['/auth/otp/request', '/auth/otp/login', '/auth/logout', '/me', '/me/profile'],
    commands: ['npm run core:contract', 'npm run verify:db'],
  },
  {
    id: 'ask-ai',
    heading: '## 主链路 2: 提问和 AI 启发式答疑',
    models: ['Subject', 'KnowledgeNode', 'Question', 'AnswerSession', 'AnswerMessage', 'AiEvent'],
    endpoints: ['/uploads/images', '/ocr/extract', '/questions', '/questions/:id/answer/next'],
    commands: ['npm run core:contract', 'npm run ai:contract', 'npm run ai:check', 'npm run eval:ai'],
  },
  {
    id: 'mistake',
    heading: '## 主链路 3: 加入错题和错因归纳',
    models: ['ErrorRecord', 'Question', 'KnowledgeNode'],
    endpoints: ['/questions/:id/finish', '/mistakes'],
    commands: ['npm run core:contract', 'npm run verify:db'],
  },
  {
    id: 'review',
    heading: '## 主链路 4: 复习任务和掌握状态',
    models: ['ReviewTask', 'ErrorRecord'],
    endpoints: ['/review-tasks/today', '/review-tasks', '/review-tasks/:id/answer'],
    commands: ['npm run core:contract', 'npm run verify:db'],
  },
  {
    id: 'report',
    heading: '## 主链路 5: 首页、知识图谱和家长周报',
    models: ['Question', 'ErrorRecord', 'ReviewTask', 'KnowledgeNode'],
    endpoints: ['/dashboard', '/knowledge-tree', '/reports/parent-weekly', '/reports/weekly'],
    commands: ['npm run core:contract', 'npm run verify:db'],
  },
];

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function missingSnippets(source, snippets) {
  return snippets.filter(snippet => !source.includes(snippet));
}

const doc = read(DOC_PATH);
const schema = read(SCHEMA_PATH);
const apiContract = JSON.parse(read(API_CONTRACT_PATH));
const contractEndpoints = new Set(apiContract.endpoints.map(endpoint => endpoint.path));
const checks = [];

checks.push(doc.includes('前端页面 -> 后端接口 -> 数据库表 -> 验收命令')
  ? pass('mainFlow.doc.purpose')
  : fail('mainFlow.doc.purpose', { message: 'Document must state the page/API/table/verification mapping purpose.' }));

for (const flow of REQUIRED_FLOWS) {
  const missingDoc = missingSnippets(doc, [
    flow.heading,
    ...flow.models.map(model => `\`${model}\``),
    ...flow.endpoints,
    ...flow.commands,
  ]);
  const missingSchemaModels = flow.models.filter(model => !schema.includes(`model ${model} `));
  const missingContractEndpoints = flow.endpoints.filter(endpoint => !contractEndpoints.has(endpoint));
  const missing = {
    doc: missingDoc,
    schemaModels: missingSchemaModels,
    apiContractEndpoints: missingContractEndpoints,
  };
  const hasMissing = Object.values(missing).some(items => items.length > 0);

  checks.push(hasMissing
    ? fail(`mainFlow.${flow.id}`, { missing })
    : pass(`mainFlow.${flow.id}`, {
        models: flow.models.length,
        endpoints: flow.endpoints.length,
        commands: flow.commands.length,
      }));
}

checks.push(doc.includes('当前阻塞') && doc.includes('下一步验收顺序')
  ? pass('mainFlow.doc.projectManagement')
  : fail('mainFlow.doc.projectManagement', { message: 'Document must include blockers and next acceptance order.' }));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  document: path.relative(ROOT_DIR, DOC_PATH),
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  flows: REQUIRED_FLOWS.map(flow => ({ id: flow.id, heading: flow.heading.replace(/^## /, '') })),
  checks,
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
