import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SERVER_DIR = process.cwd();
const CHECK_DIRS = ['src', 'scripts', 'prisma'];

function collectJsFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap(entry => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) return collectJsFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
  });
}

function run(label, command, args) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(result.status || 1);
  }

  if (result.status !== 0) {
    process.exit(result.status);
  }
}

const jsFiles = CHECK_DIRS.flatMap(dir => collectJsFiles(path.join(SERVER_DIR, dir)));
for (const file of jsFiles) {
  run(`node --check ${path.relative(SERVER_DIR, file)}`, process.execPath, ['--check', file]);
}

run('npm run prisma:generate', 'npm', ['run', 'prisma:generate']);
run('npx prisma validate', 'npx', ['prisma', 'validate']);
run('npm run schema:contract', 'npm', ['run', 'schema:contract']);
run('npm run config:check', 'npm', ['run', 'config:check']);
run('npm run api:contract', 'npm', ['run', 'api:contract']);
run('npm run frontend:contract', 'npm', ['run', 'frontend:contract']);
run('npm run core:contract', 'npm', ['run', 'core:contract']);
run('npm run smoke:contract', 'npm', ['run', 'smoke:contract']);
run('npm run ci:contract', 'npm', ['run', 'ci:contract']);
run('npm run env:contract', 'npm', ['run', 'env:contract']);
run('npm run deploy:contract', 'npm', ['run', 'deploy:contract']);
run('npm run stage:status', 'npm', ['run', 'stage:status']);
run('npm run release:contract', 'npm', ['run', 'release:contract']);
run('npm run provider:contract', 'npm', ['run', 'provider:contract']);
run('npm run ops:contract', 'npm', ['run', 'ops:contract']);
run('npm run ai:contract', 'npm', ['run', 'ai:contract']);
run('npm run prototype:check', 'npm', ['run', 'prototype:check']);
run('npm run mobile:check', 'npm', ['run', 'mobile:check']);
run('npm run uploads:cleanup', 'npm', ['run', 'uploads:cleanup']);
run('npm run eval:ai -- --output evals/reports/latest.json', 'npm', [
  'run',
  'eval:ai',
  '--',
  '--output',
  'evals/reports/latest.json',
]);
run('npm run readiness:static', 'npm', ['run', 'readiness:static']);

console.log('\nStatic verification passed.');
