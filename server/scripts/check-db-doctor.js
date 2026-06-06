import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd(), '..');
const SERVER_ROOT = process.cwd();
const CONNECT_TIMEOUT_MS = Number(process.env.DB_DOCTOR_TIMEOUT_MS || 1500);

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function warn(name, details = {}) {
  return { name, status: 'warn', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function commandResult(command, args = []) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return {
    available: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
  };
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

function parseDatabaseUrl(value) {
  try {
    const url = new URL(value);
    return {
      ok: true,
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, ''),
      schema: url.searchParams.get('schema') || 'public',
      usernameConfigured: Boolean(url.username),
      passwordConfigured: Boolean(url.password),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
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

const env = {
  ...readEnvFile(path.join(SERVER_ROOT, '.env')),
  ...process.env,
};
const checks = [];

const databaseUrl = env.DATABASE_URL || '';
const parsed = parseDatabaseUrl(databaseUrl);
checks.push(parsed.ok
  && parsed.protocol === 'postgresql'
  && parsed.host
  && parsed.database
  ? pass('db.url', {
      protocol: parsed.protocol,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      schema: parsed.schema,
      usernameConfigured: parsed.usernameConfigured,
      passwordConfigured: parsed.passwordConfigured,
    })
  : fail('db.url', {
      message: 'DATABASE_URL must be a valid postgresql URL.',
      error: parsed.error,
    }));

const composePath = path.join(ROOT, 'compose.yaml');
checks.push(fs.existsSync(composePath)
  ? pass('db.composeFile', { path: 'compose.yaml' })
  : warn('db.composeFile', { message: 'compose.yaml is missing; remote PostgreSQL may still be usable.' }));

const migrationsPath = path.join(SERVER_ROOT, 'prisma', 'migrations');
checks.push(fs.existsSync(migrationsPath) && fs.readdirSync(migrationsPath).length > 0
  ? pass('db.migrations', { path: 'server/prisma/migrations' })
  : fail('db.migrations', { message: 'Prisma migrations are required before smoke verification.' }));

const docker = commandResult('docker', ['--version']);
checks.push(docker.available
  ? pass('db.docker', { version: docker.stdout })
  : warn('db.docker', {
      message: 'Docker is unavailable. This is fine only when DATABASE_URL points to an already running PostgreSQL instance.',
    }));

if (docker.available) {
  const compose = commandResult('docker', ['compose', 'ps', 'postgres']);
  checks.push(compose.available
    ? pass('db.composePostgres', { output: compose.stdout.split('\n').slice(0, 3).join('\n') })
    : warn('db.composePostgres', {
        message: compose.stderr || 'docker compose postgres service is not running or not inspectable.',
      }));
}

if (parsed.ok) {
  const connection = await canConnect(parsed);
  checks.push(connection.ok
    ? pass('db.tcpReachable', {
        host: parsed.host,
        port: parsed.port,
        elapsedMs: connection.elapsedMs,
      })
    : fail('db.tcpReachable', {
        host: parsed.host,
        port: parsed.port,
        error: connection.error,
        elapsedMs: connection.elapsedMs,
        message: 'PostgreSQL TCP port is not reachable. Start Docker PostgreSQL or point DATABASE_URL to a reachable database.',
      }));
}

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    warn: checks.filter(check => check.status === 'warn').length,
    fail: failCount,
  },
  checks,
  nextSteps: [
    'If using local PostgreSQL, install/start Docker Desktop and run docker compose up -d postgres from the repository root.',
    'If using remote PostgreSQL, set DATABASE_URL to that database and ensure the host/port is reachable from this machine.',
    'After db:doctor passes, run cd server && npm run verify:db.',
  ],
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
