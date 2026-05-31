import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd(), '..');
const SERVER_ROOT = process.cwd();

function commandResult(command, args = []) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    available: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || ''
  };
}

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function warn(name, details = {}) {
  return { name, status: 'warn', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .reduce((acc, line) => {
      const index = line.indexOf('=');
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^"|"$/g, '');
      acc[key] = value;
      return acc;
    }, {});
}

const checks = [];
const env = {
  ...readEnvFile(path.join(SERVER_ROOT, '.env')),
  ...process.env
};

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
checks.push(nodeMajor >= 20
  ? pass('runtime.node', { version: process.versions.node })
  : fail('runtime.node', { version: process.versions.node, required: '>=20' }));

const npm = commandResult('npm', ['--version']);
checks.push(npm.available
  ? pass('runtime.npm', { version: npm.stdout })
  : fail('runtime.npm', { message: npm.stderr || 'npm is not available' }));

const docker = commandResult('docker', ['--version']);
checks.push(docker.available
  ? pass('runtime.docker', { version: docker.stdout })
  : fail('runtime.docker', {
      message: 'Docker is required for the local PostgreSQL container defined in compose.yaml.'
    }));

if (docker.available) {
  const dockerCompose = commandResult('docker', ['compose', 'version']);
  checks.push(dockerCompose.available
    ? pass('runtime.dockerCompose', { version: dockerCompose.stdout })
    : fail('runtime.dockerCompose', {
        message: dockerCompose.stderr || 'docker compose is not available'
      }));
}

const psql = commandResult('psql', ['--version']);
checks.push(psql.available
  ? pass('runtime.psql', { version: psql.stdout })
  : warn('runtime.psql', {
      message: 'psql is optional, but useful for manual database inspection and readiness debugging.'
    }));

checks.push(fs.existsSync(path.join(ROOT, 'compose.yaml'))
  ? pass('runtime.composeFile', { path: 'compose.yaml' })
  : fail('runtime.composeFile', { message: 'compose.yaml is missing' }));

checks.push(env.DATABASE_URL
  ? pass('runtime.databaseUrl', { configured: true })
  : fail('runtime.databaseUrl', {
      configured: false,
      message: 'Set DATABASE_URL before running db:setup or smoke:api.'
    }));

checks.push(fs.existsSync(path.join(SERVER_ROOT, '.env'))
  ? pass('runtime.localEnv', { path: 'server/.env' })
  : warn('runtime.localEnv', {
      message: 'server/.env is missing; copy server/.env.example for local development.'
    }));

const counts = checks.reduce((acc, check) => {
  acc[check.status] = (acc[check.status] || 0) + 1;
  return acc;
}, {});

const output = {
  ok: !checks.some(check => check.status === 'fail'),
  counts: {
    pass: counts.pass || 0,
    warn: counts.warn || 0,
    fail: counts.fail || 0
  },
  checks,
  nextSteps: [
    'Install Docker Desktop or another Docker runtime.',
    'Run docker compose up -d postgres from the repository root.',
    'Run cd server && npm run verify:db.'
  ]
};

console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
