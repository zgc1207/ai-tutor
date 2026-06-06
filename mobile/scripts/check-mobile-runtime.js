import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const DEFAULT_API_PORT = Number(process.env.API_PORT || 3000);
const METRO_PORTS = String(process.env.MOBILE_RUNTIME_PORTS || '8081,8082')
  .split(',')
  .map(port => Number(port.trim()))
  .filter(Number.isFinite);

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
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
    error: result.error?.message || '',
  };
}

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === 'IPv4' && !item.internal)
    .map(item => item.address);
}

function canBind(port, host) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error => resolve({
      port,
      host,
      available: false,
      error: error.code || error.message,
    }));
    server.once('listening', () => {
      server.close(() => resolve({ port, host, available: true }));
    });
    server.listen(port, host);
  });
}

function resolvePackage(name) {
  const result = commandResult(process.execPath, ['-e', `require.resolve('${name}/package.json')`]);
  return result.ok;
}

const checks = [];

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
checks.push(nodeMajor >= 20
  ? pass('mobileRuntime.node', { version: process.versions.node })
  : fail('mobileRuntime.node', { version: process.versions.node, required: '>=20' }));

const npm = commandResult('npm', ['--version']);
checks.push(npm.ok
  ? pass('mobileRuntime.npm', { version: npm.stdout })
  : fail('mobileRuntime.npm', { message: npm.error || npm.stderr || 'npm is not available' }));

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'app.json',
  'node_modules',
  'node_modules/.bin/expo',
  'scripts/start-expo-local.js',
  'scripts/check-expo-start.js',
  'scripts/print-local-api.js',
];
const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(ROOT, file)));
checks.push(missingFiles.length
  ? fail('mobileRuntime.requiredFiles', { missing: missingFiles })
  : pass('mobileRuntime.requiredFiles', { files: requiredFiles.length }));

const requiredPackages = [
  'expo',
  'react',
  'react-native',
  'expo-image-picker',
  'expo-notifications',
  'expo-secure-store',
];
const missingPackages = requiredPackages.filter(pkg => !resolvePackage(pkg));
checks.push(missingPackages.length
  ? fail('mobileRuntime.packages', { missing: missingPackages })
  : pass('mobileRuntime.packages', { packages: requiredPackages.length }));

const expoVersion = commandResult(path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'expo.cmd' : 'expo'), ['--version']);
checks.push(expoVersion.ok
  ? pass('mobileRuntime.expoCli', { version: expoVersion.stdout || expoVersion.stderr })
  : fail('mobileRuntime.expoCli', { message: expoVersion.error || expoVersion.stderr || 'Expo CLI is not available in node_modules.' }));

const addresses = localAddresses();
const bindHosts = [
  '127.0.0.1',
  '0.0.0.0',
  ...addresses,
];
const bindMatrix = await Promise.all(METRO_PORTS.flatMap(port => bindHosts.map(host => canBind(port, host))));
const blockedBinds = bindMatrix.filter(item => !item.available);
const epermBinds = blockedBinds.filter(item => item.error === 'EPERM');
checks.push(blockedBinds.length
  ? warn('mobileRuntime.metroPorts', {
      ports: METRO_PORTS,
      bindHosts,
      bindMatrix,
      message: epermBinds.length
        ? 'Metro port binding returned EPERM on this machine. Check macOS local network/firewall permissions, VPN/security software, or run Expo on a different port.'
        : 'A blocked Metro port may be fine if an existing Expo server is already running.',
    })
  : pass('mobileRuntime.metroPorts', {
      ports: METRO_PORTS,
      bindHosts,
      bindMatrix,
    }));

checks.push(addresses.length
  ? pass('mobileRuntime.lanAddresses', {
      expoGoDeviceUrls: addresses.map(address => `http://${address}:${DEFAULT_API_PORT}`),
      simulator: {
        ios: `http://127.0.0.1:${DEFAULT_API_PORT}`,
        android: `http://10.0.2.2:${DEFAULT_API_PORT}`,
      },
    })
  : warn('mobileRuntime.lanAddresses', {
      message: 'No LAN IPv4 address found. Real-device Expo Go API access may need manual network setup.',
      simulator: {
        ios: `http://127.0.0.1:${DEFAULT_API_PORT}`,
        android: `http://10.0.2.2:${DEFAULT_API_PORT}`,
      },
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
    fail: counts.fail || 0,
  },
  checks,
  nextSteps: [
    'Run npm run start:check to verify Metro can actually listen.',
    'If mobileRuntime.metroPorts reports EPERM, try EXPO_CHECK_PORT=19000 npm run start:check and check OS firewall/local network permissions for Node.',
    'Run npm run api:local after the backend is running to choose the API URL for simulator or Expo Go.',
    'Use Expo Go or a simulator to walk through demo mode, login, ask, mistake, review, report, camera, gallery, and notification permission.',
  ],
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
