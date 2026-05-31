import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), '..');

const REQUIRED_FILES = [
  'server/Dockerfile',
  'server/.dockerignore',
  'deploy/internal.env.example',
  'deploy/production.env.example',
  'deploy/README.md',
];

const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'PORT',
  'BODY_LIMIT_BYTES',
  'SECURITY_HEADERS_ENABLED',
  'RATE_LIMIT_ENABLED',
  'CORS_ALLOWED_ORIGINS',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_READY',
  'OCR_PROVIDER',
  'ADMIN_TOKEN',
  'INTERNAL_TEST_INVITE_CODE',
  'AUTH_OTP_SECRET',
  'AUTH_OTP_DEV_MODE',
  'AUTH_OTP_DELIVERY_PROVIDER',
  'ALLOW_LEGACY_USER_ID_AUTH',
  'ALLOW_MOCK_LOGIN',
  'PRODUCTION_AUTH_READY',
  'OBJECT_STORAGE_READY',
  'HTTPS_READY',
  'PAYMENT_PROVIDER',
  'PAYMENT_READY',
  'PUSH_PROVIDER',
  'PUSH_READY',
  'UPLOAD_STORAGE_PROVIDER',
  'ALLOW_PUBLIC_UPLOAD_ACCESS',
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

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT_DIR, relativePath));
}

function parseEnv(source) {
  const values = new Map();
  const duplicates = [];

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (values.has(key)) duplicates.push(key);
    values.set(key, value);
  }

  return { values, duplicates };
}

const checks = [];
const missingFiles = REQUIRED_FILES.filter(file => !exists(file));
checks.push(missingFiles.length
  ? fail('deploy.files', { missing: missingFiles })
  : pass('deploy.files', { files: REQUIRED_FILES.length }));

if (exists('server/Dockerfile')) {
  const dockerfile = read('server/Dockerfile');
  const requiredSnippets = [
    'FROM node:22-alpine',
    'npm ci',
    'npx prisma generate',
    'EXPOSE 3000',
    'CMD ["npm", "run", "start"]',
  ];
  const missing = requiredSnippets.filter(snippet => !dockerfile.includes(snippet));
  checks.push(missing.length
    ? fail('deploy.dockerfile', { missing })
    : pass('deploy.dockerfile', { snippets: requiredSnippets.length }));
}

if (exists('server/.dockerignore')) {
  const dockerignore = read('server/.dockerignore');
  const requiredSnippets = ['node_modules', '.env', 'uploads', 'evals/reports'];
  const missing = requiredSnippets.filter(snippet => !dockerignore.includes(snippet));
  checks.push(missing.length
    ? fail('deploy.dockerignore', { missing })
    : pass('deploy.dockerignore', { snippets: requiredSnippets.length }));
}

for (const [profile, file] of [
  ['internal', 'deploy/internal.env.example'],
  ['production', 'deploy/production.env.example'],
]) {
  if (!exists(file)) continue;

  const { values, duplicates } = parseEnv(read(file));
  const missingKeys = REQUIRED_ENV_KEYS.filter(key => !values.has(key));
  checks.push(missingKeys.length || duplicates.length
    ? fail(`deploy.${profile}.env`, { missingKeys, duplicates })
    : pass(`deploy.${profile}.env`, { keys: values.size }));

  if (profile === 'internal') {
    checks.push(values.get('ALLOW_LEGACY_USER_ID_AUTH') === 'false'
      && values.get('ALLOW_PUBLIC_UPLOAD_ACCESS') === 'false'
      && values.get('HTTPS_READY') === 'true'
      ? pass('deploy.internal.safetyDefaults')
      : fail('deploy.internal.safetyDefaults', {
          ALLOW_LEGACY_USER_ID_AUTH: values.get('ALLOW_LEGACY_USER_ID_AUTH'),
          ALLOW_PUBLIC_UPLOAD_ACCESS: values.get('ALLOW_PUBLIC_UPLOAD_ACCESS'),
          HTTPS_READY: values.get('HTTPS_READY'),
        }));
  }

  if (profile === 'production') {
    checks.push(values.get('AUTH_OTP_DEV_MODE') === 'false'
      && values.get('ALLOW_MOCK_LOGIN') === 'false'
      && values.get('UPLOAD_STORAGE_PROVIDER') === 'http'
      && values.get('PAYMENT_PROVIDER') === 'http'
      && values.get('PUSH_PROVIDER') === 'http'
      ? pass('deploy.production.providerDefaults')
      : fail('deploy.production.providerDefaults', {
          AUTH_OTP_DEV_MODE: values.get('AUTH_OTP_DEV_MODE'),
          ALLOW_MOCK_LOGIN: values.get('ALLOW_MOCK_LOGIN'),
          UPLOAD_STORAGE_PROVIDER: values.get('UPLOAD_STORAGE_PROVIDER'),
          PAYMENT_PROVIDER: values.get('PAYMENT_PROVIDER'),
          PUSH_PROVIDER: values.get('PUSH_PROVIDER'),
        }));
  }
}

if (exists('deploy/README.md')) {
  const readme = read('deploy/README.md');
  const requiredSnippets = [
    'deploy:check -- --profile internal',
    'deploy:check -- --profile production',
    'verify:db',
    'LLM_READY=true',
    'PAYMENT_READY=true',
    'PUSH_READY=true',
  ];
  const missing = requiredSnippets.filter(snippet => !readme.includes(snippet));
  checks.push(missing.length
    ? fail('deploy.docs', { missing })
    : pass('deploy.docs', { snippets: requiredSnippets.length }));
}

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  checks,
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
