import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SERVER_ROOT = process.cwd();
const ROOT = path.resolve(SERVER_ROOT, '..');
const CONNECT_TIMEOUT_MS = Number(process.env.DB_START_CONNECT_TIMEOUT_MS || 1500);
const WAIT_TIMEOUT_MS = Number(process.env.DB_START_WAIT_TIMEOUT_MS || 30000);

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

function commandResult(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || SERVER_ROOT,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
    error: result.error?.message || '',
  };
}

function parseDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return {
      ok: true,
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, ''),
      user: url.username,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function canConnect({ host, port }) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const startedAt = Date.now();

    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.on('connect', () => {
      socket.destroy();
      resolve({ ok: true, elapsedMs: Date.now() - startedAt });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'timeout', elapsedMs: Date.now() - startedAt });
    });
    socket.on('error', error => {
      resolve({ ok: false, error: error.code || error.message, elapsedMs: Date.now() - startedAt });
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDatabase(parsed) {
  const startedAt = Date.now();
  let last = null;

  while (Date.now() - startedAt < WAIT_TIMEOUT_MS) {
    last = await canConnect(parsed);
    if (last.ok) {
      return {
        ok: true,
        elapsedMs: Date.now() - startedAt,
        connectElapsedMs: last.elapsedMs,
      };
    }
    await sleep(1000);
  }

  return {
    ok: false,
    elapsedMs: Date.now() - startedAt,
    lastError: last?.error || 'unknown',
  };
}

const env = {
  ...readEnvFile(path.join(SERVER_ROOT, '.env')),
  ...process.env,
};

const parsed = parseDatabaseUrl(env.DATABASE_URL || '');
if (!parsed.ok) {
  console.log(JSON.stringify({
    ok: false,
    reason: 'invalid-database-url',
    message: 'Set DATABASE_URL in server/.env before starting the local database.',
    error: parsed.error,
  }, null, 2));
  process.exit(1);
}

const initial = await canConnect(parsed);
if (initial.ok) {
  console.log(JSON.stringify({
    ok: true,
    status: 'already-running',
    database: {
      host: parsed.host,
      port: parsed.port,
      name: parsed.database,
      user: parsed.user,
    },
    nextStep: 'Run npm run verify:db.',
  }, null, 2));
  process.exit(0);
}

const docker = commandResult('docker', ['--version']);
if (docker.ok) {
  const composePath = path.join(ROOT, 'compose.yaml');
  if (!fs.existsSync(composePath)) {
    console.log(JSON.stringify({
      ok: false,
      reason: 'compose-file-missing',
      message: 'compose.yaml is required to start the local PostgreSQL container.',
      expectedPath: 'compose.yaml',
    }, null, 2));
    process.exit(1);
  }

  console.log(`Starting local PostgreSQL with docker compose for ${parsed.host}:${parsed.port}...`);
  const compose = commandResult('docker', ['compose', 'up', '-d', 'postgres'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (!compose.ok) {
    console.log(JSON.stringify({
      ok: false,
      reason: 'docker-compose-failed',
      message: 'docker compose up -d postgres failed.',
      status: compose.status,
      error: compose.error || compose.stderr,
    }, null, 2));
    process.exit(compose.status || 1);
  }

  const waited = await waitForDatabase(parsed);
  console.log(JSON.stringify({
    ok: waited.ok,
    status: waited.ok ? 'started' : 'not-reachable-after-start',
    database: {
      host: parsed.host,
      port: parsed.port,
      name: parsed.database,
      user: parsed.user,
    },
    wait: waited,
    nextStep: waited.ok ? 'Run npm run verify:db.' : 'Run npm run db:doctor and inspect docker compose logs postgres.',
  }, null, 2));
  if (!waited.ok) process.exit(1);
  process.exit(0);
}

const psql = commandResult('psql', ['--version']);
const brew = commandResult('brew', ['--version']);
console.log(JSON.stringify({
  ok: false,
  reason: 'local-postgres-runtime-missing',
  database: {
    host: parsed.host,
    port: parsed.port,
    name: parsed.database,
    user: parsed.user,
  },
  checks: {
    docker: {
      available: false,
      message: docker.error || docker.stderr || 'docker command is not available',
    },
    psql: {
      available: psql.ok,
      version: psql.stdout || null,
    },
    brew: {
      available: brew.ok,
      version: brew.stdout.split('\n')[0] || null,
    },
  },
  options: [
    {
      name: 'Docker Desktop',
      commands: [
        'Install and start Docker Desktop',
        'cd /Users/zhangguochang/code/ai-tutor/server && npm run db:start:local',
        'cd /Users/zhangguochang/code/ai-tutor/server && npm run verify:db',
      ],
    },
    {
      name: 'Homebrew PostgreSQL',
      commands: [
        'brew install postgresql@16',
        'brew services start postgresql@16',
        'createdb ai_tutor',
        'cd /Users/zhangguochang/code/ai-tutor/server && npm run verify:db',
      ],
    },
    {
      name: 'Remote PostgreSQL',
      commands: [
        'Set DATABASE_URL in server/.env to a reachable PostgreSQL database',
        'cd /Users/zhangguochang/code/ai-tutor/server && npm run db:doctor',
        'cd /Users/zhangguochang/code/ai-tutor/server && npm run verify:db',
      ],
    },
  ],
}, null, 2));
process.exit(1);
