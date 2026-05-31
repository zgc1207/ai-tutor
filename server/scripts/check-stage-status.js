import fs from 'node:fs';
import path from 'node:path';
import { getConfigStatus, loadEnvFile } from '../src/lib/config.js';

loadEnvFile();

const ROOT_DIR = path.resolve(process.cwd(), '..');
const SERVER_DIR = process.cwd();

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT_DIR, relativePath));
}

function packageHasScript(scriptName) {
  const pkg = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'package.json'), 'utf8'));
  return Boolean(pkg.scripts?.[scriptName]);
}

function gate(id, label, status, evidence, nextAction) {
  return { id, label, status, evidence, nextAction };
}

const config = getConfigStatus();
const internalDeployConfigIssues = [
  ...config.warnings,
  ...(!config.internalTestInviteRequired ? ['INTERNAL_TEST_INVITE_CODE is not set'] : []),
];
const gates = [
  gate(
    'static-verification',
    '静态工程验证',
    packageHasScript('verify:static') ? 'ready' : 'missing',
    'server package exposes npm run verify:static.',
    '每次提交前执行 cd server && npm run verify:static。',
  ),
  gate(
    'api-contract',
    '前后端 API 合同',
    fileExists('api-contract.json') && packageHasScript('api:contract') ? 'ready' : 'missing',
    'api-contract.json plus npm run api:contract.',
    '接口新增或变更时同步 api-contract.json 并运行 api:contract。',
  ),
  gate(
    'schema-contract',
    '数据库 Schema 合同',
    packageHasScript('schema:contract') ? 'ready' : 'missing',
    'npm run schema:contract checks core models, fields, enums, indexes, and cascade relations.',
    '数据库表结构变更时同步 Schema Contract。',
  ),
  gate(
    'ci-contract',
    'GitHub Actions 主干门禁',
    packageHasScript('ci:contract') && fileExists('.github/workflows/server-static.yml') && fileExists('.github/workflows/server-smoke.yml') ? 'ready' : 'missing',
    'npm run ci:contract checks static and PostgreSQL smoke workflows.',
    'CI workflow 变更时运行 ci:contract。',
  ),
  gate(
    'env-contract',
    '环境变量合同',
    packageHasScript('env:contract') ? 'ready' : 'missing',
    'npm run env:contract checks .env.example and deploy:check coverage.',
    '新增环境变量时同步 .env.example、deploy:check 和 env:contract。',
  ),
  gate(
    'release-contract',
    '内测包/上架准备合同',
    packageHasScript('release:contract') && fileExists('mobile/eas.json') && fileExists('合规上架检查清单.md') ? 'ready' : 'missing',
    'npm run release:contract checks EAS config, mobile assets, native permissions, legal docs, and compliance checklist.',
    '移动端构建、权限、图标或合规材料变更时运行 release:contract。',
  ),
  gate(
    'provider-contract',
    '第三方服务商接入合同',
    packageHasScript('provider:contract') ? 'ready' : 'missing',
    'npm run provider:contract checks OCR, OTP delivery, upload storage, payment, and push provider seams.',
    '接入或替换 OCR、短信、对象存储、支付、推送服务商时运行 provider:contract。',
  ),
  gate(
    'ops-contract',
    '运营观测/扩量合同',
    packageHasScript('ops:contract') ? 'ready' : 'missing',
    'npm run ops:contract checks admin metrics, ops health, smoke coverage, thresholds, and expansion docs.',
    '运营指标、健康阈值、后台路由或扩量规则变更时运行 ops:contract。',
  ),
  gate(
    'database-smoke',
    '数据库/API 烟测',
    'external-blocked',
    'Current local machine still needs Docker/PostgreSQL for npm run verify:db.',
    '安装 Docker Desktop 或提供可访问 PostgreSQL 后执行 cd server && npm run verify:db。',
  ),
  gate(
    'mobile-runtime',
    '移动端真实启动',
    'external-blocked',
    'Expo static checks pass, but start:check previously timed out before Metro became reachable.',
    '解决本机 Expo/Metro 启动问题后执行 cd mobile && npm run start:check，并用真机或模拟器验收。',
  ),
  gate(
    'real-ai',
    '真实 AI Provider',
    config.llmReady ? 'ready' : 'external-blocked',
    config.llmReady
      ? 'LLM_READY=true in current environment.'
      : 'LLM_READY=false or real LLM credentials are not fully verified.',
    '配置真实 LLM_API_KEY 后执行 cd server && npm run ai:check，再运行真实 eval:ai 和人工抽检。',
  ),
  gate(
    'internal-deploy-config',
    '内测部署配置',
    internalDeployConfigIssues.length === 0 ? 'ready' : 'needs-config',
    internalDeployConfigIssues.length ? internalDeployConfigIssues.join('; ') : 'Config status has no warnings.',
    '设置 ADMIN_TOKEN、INTERNAL_TEST_INVITE_CODE、AUTH_OTP_SECRET、CORS_ALLOWED_ORIGINS 等内测变量后运行 deploy:check。',
  ),
];

const statusOrder = ['missing', 'needs-config', 'external-blocked', 'ready'];
const statusCounts = gates.reduce((acc, item) => {
  acc[item.status] = (acc[item.status] || 0) + 1;
  return acc;
}, {});

const readyCount = statusCounts.ready || 0;
const output = {
  ok: !gates.some(item => item.status === 'missing'),
  phase: '阶段 4 App 化早期',
  summary: `${readyCount}/${gates.length} stage gates are ready; external runtime, real AI, and internal deploy config still need environment input.`,
  counts: Object.fromEntries(statusOrder.map(status => [status, statusCounts[status] || 0])),
  gates,
  nextStageFocus: [
    'Start PostgreSQL and run cd server && npm run verify:db.',
    'Make mobile Metro reachable and run cd mobile && npm run start:check.',
    'Configure real LLM credentials, run ai:check, real eval:ai, and set LLM_READY=true only after review.',
    'Set internal deploy variables and run cd server && npm run deploy:check -- --profile internal.',
  ],
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
