import { spawnSync } from 'node:child_process';

const SERVER_ROOT = process.cwd();

function runStageStatus() {
  const result = spawnSync(process.execPath, ['scripts/check-stage-status.js'], {
    cwd: SERVER_ROOT,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || 'stage:status failed');
    process.exit(result.status || 1);
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    console.error(`Unable to parse stage status JSON: ${error.message}`);
    console.error(result.stdout);
    process.exit(1);
  }
}

function formatDate() {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function section(title, lines) {
  if (!lines.length) return '';
  return [`## ${title}`, '', ...lines, ''].join('\n');
}

function gateLine(gate) {
  return `- ${gate.label}: ${gate.evidence}`;
}

const status = runStageStatus();
const gates = status.gates || [];
const ready = gates.filter(gate => gate.status === 'ready');
const blocked = gates.filter(gate => gate.status === 'external-blocked');
const needsConfig = gates.filter(gate => gate.status === 'needs-config');
const missing = gates.filter(gate => gate.status === 'missing');

const lines = [
  '# AI 家庭教师 - 阶段汇报',
  '',
  `生成时间: ${formatDate()}`,
  '',
  `当前阶段: ${status.phase}`,
  '',
  `总体结论: ${status.summary}`,
  '',
  `门禁统计: ready ${status.counts.ready}, external-blocked ${status.counts['external-blocked']}, needs-config ${status.counts['needs-config']}, missing ${status.counts.missing}`,
  '',
  section('已完成/已具备证据', ready.map(gateLine)),
  section('当前阻塞', blocked.map(gate => `- ${gate.label}: ${gate.evidence}\n  下一步: ${gate.nextAction}`)),
  section('配置缺口', needsConfig.map(gate => `- ${gate.label}: ${gate.evidence}\n  下一步: ${gate.nextAction}`)),
  section('缺失项', missing.map(gate => `- ${gate.label}: ${gate.evidence}\n  下一步: ${gate.nextAction}`)),
  section('下一阶段焦点', (status.nextStageFocus || []).map(item => `- ${item}`)),
  '## 建议先执行的命令',
  '',
  '```bash',
  'cd server',
  'npm run stage:status',
  'npm run stage:report',
  'npm run mainflow:contract',
  'npm run db:start:local',
  'npm run verify:db',
  'cd ../mobile',
  'npm run runtime:check',
  'npm run start:check',
  '```',
  '',
  '说明: `stage:report` 是项目管理汇报, 不能替代 `verify:db`、mobile 真机验收或真实 AI 评测。',
  '',
].join('\n');

console.log(lines);
