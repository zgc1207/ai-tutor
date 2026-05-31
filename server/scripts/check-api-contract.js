import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../src/app.js';

const ROOT = path.resolve(process.cwd(), '..');
const CONTRACT_PATH = path.join(ROOT, 'api-contract.json');
const ALLOWED_AUTH = new Set(['public', 'bearer-session', 'admin-token', 'provider-webhook', 'dev-public']);
const ALLOWED_CLIENTS = new Set(['mobile', 'prototype', 'admin', 'ops', 'provider']);

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function readContract() {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}

const contract = readContract();
const endpoints = Array.isArray(contract.endpoints) ? contract.endpoints : [];
const checks = [];

checks.push(contract.version
  && contract.authSchemes
  && endpoints.length > 0
  ? pass('contract.shape', { version: contract.version, endpoints: endpoints.length })
  : fail('contract.shape', { message: 'api-contract.json must include version, authSchemes, and endpoints.' }));

const seen = new Set();
const duplicateKeys = [];
const invalidEndpoints = [];

for (const endpoint of endpoints) {
  const key = `${endpoint.method || ''} ${endpoint.path || ''}`;
  if (seen.has(key)) duplicateKeys.push(key);
  seen.add(key);

  const clients = Array.isArray(endpoint.clients) ? endpoint.clients : [];
  const invalidClients = clients.filter(client => !ALLOWED_CLIENTS.has(client));
  if (
    !endpoint.method
    || endpoint.method !== endpoint.method.toUpperCase()
    || !endpoint.path?.startsWith('/')
    || !ALLOWED_AUTH.has(endpoint.auth)
    || clients.length === 0
    || invalidClients.length > 0
    || !endpoint.purpose
  ) {
    invalidEndpoints.push({
      key,
      auth: endpoint.auth,
      clients,
      invalidClients,
    });
  }
}

checks.push(duplicateKeys.length
  ? fail('contract.uniqueEndpoints', { duplicateKeys })
  : pass('contract.uniqueEndpoints', { endpoints: endpoints.length }));

checks.push(invalidEndpoints.length
  ? fail('contract.endpointMetadata', { invalidEndpoints })
  : pass('contract.endpointMetadata'));

const app = await buildApp({ logger: false });
await app.ready();

const missingRoutes = endpoints
  .filter(endpoint => !app.hasRoute({ method: endpoint.method, url: endpoint.path }))
  .map(endpoint => `${endpoint.method} ${endpoint.path}`);

await app.close();

checks.push(missingRoutes.length
  ? fail('contract.serverRoutes', { missingRoutes })
  : pass('contract.serverRoutes', { routes: endpoints.length }));

const mobileEndpoints = endpoints.filter(endpoint => endpoint.clients.includes('mobile'));
const mobilePublicEndpoints = mobileEndpoints.filter(endpoint => endpoint.auth === 'public');
const mobileProtectedEndpoints = mobileEndpoints.filter(endpoint => endpoint.auth === 'bearer-session');
const invalidMobileAuth = mobileEndpoints
  .filter(endpoint => !['public', 'bearer-session'].includes(endpoint.auth))
  .map(endpoint => `${endpoint.method} ${endpoint.path}`);

checks.push(invalidMobileAuth.length
  ? fail('contract.mobileAuth', { invalidMobileAuth })
  : pass('contract.mobileAuth', {
      public: mobilePublicEndpoints.length,
      bearerSession: mobileProtectedEndpoints.length,
    }));

const adminEndpoints = endpoints.filter(endpoint => endpoint.clients.includes('admin'));
const invalidAdminAuth = adminEndpoints
  .filter(endpoint => endpoint.auth !== 'admin-token')
  .map(endpoint => `${endpoint.method} ${endpoint.path}`);

checks.push(invalidAdminAuth.length
  ? fail('contract.adminAuth', { invalidAdminAuth })
  : pass('contract.adminAuth', { endpoints: adminEndpoints.length }));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  contract: path.relative(ROOT, CONTRACT_PATH),
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
