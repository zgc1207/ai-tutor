import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function missingSnippets(source, snippets) {
  return snippets.filter(snippet => !source.includes(snippet));
}

const checks = [];

if (!exists('compose.yaml')) {
  checks.push(fail('stack.composeFile', { missing: 'compose.yaml' }));
} else {
  const compose = read('compose.yaml');
  const requiredComposeSnippets = [
    'postgres:',
    'image: postgres:16-alpine',
    'POSTGRES_USER: ai_tutor',
    'POSTGRES_PASSWORD: ai_tutor',
    'POSTGRES_DB: ai_tutor',
    'pg_isready -U ai_tutor -d ai_tutor',
    'server:',
    'build:',
    'context: ./server',
    'depends_on:',
    'condition: service_healthy',
    'DATABASE_URL: "postgresql://ai_tutor:ai_tutor@postgres:5432/ai_tutor?schema=public"',
    'PORT: 3000',
    '"3000:3000"',
    'npm run db:setup && npm run start',
    'ai_tutor_uploads:/app/uploads',
    'ai_tutor_postgres_data:',
    'ai_tutor_uploads:',
  ];
  const missing = missingSnippets(compose, requiredComposeSnippets);
  checks.push(missing.length
    ? fail('stack.composeServices', { missing })
    : pass('stack.composeServices', { snippets: requiredComposeSnippets.length }));
}

if (!exists('server/Dockerfile')) {
  checks.push(fail('stack.dockerfile', { missing: 'server/Dockerfile' }));
} else {
  const dockerfile = read('server/Dockerfile');
  const requiredDockerfileSnippets = [
    'FROM node:22-alpine',
    'npm ci',
    'npx prisma generate',
    'COPY scripts ./scripts',
    'COPY prisma ./prisma',
    'COPY src ./src',
    'EXPOSE 3000',
    'CMD ["npm", "run", "start"]',
  ];
  const missing = missingSnippets(dockerfile, requiredDockerfileSnippets);
  checks.push(missing.length
    ? fail('stack.dockerfile', { missing })
    : pass('stack.dockerfile', { snippets: requiredDockerfileSnippets.length }));
}

const docs = [
  exists('server/README.md') ? read('server/README.md') : '',
  exists('deploy/README.md') ? read('deploy/README.md') : '',
  exists('项目状态看板.md') ? read('项目状态看板.md') : '',
].join('\n');
const requiredDocs = [
  'docker compose up -d postgres server',
  'http://localhost:3000/health',
  'npm run verify:db',
];
const missingDocs = missingSnippets(docs, requiredDocs);
checks.push(missingDocs.length
  ? fail('stack.docs', { missing: missingDocs })
  : pass('stack.docs', { snippets: requiredDocs.length }));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  checks,
  runtimePolicy: {
    localStack: 'Run docker compose up -d postgres server from the repository root when Docker is available.',
    databaseProof: 'Run cd server && npm run verify:db after the stack is healthy.',
    limitation: 'This contract checks stack configuration statically; it does not replace a Docker runtime smoke.',
  },
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
