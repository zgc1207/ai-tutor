import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REQUIRED_FILES = [
  'package.json',
  'app.json',
  'App.js',
  'src/api/client.js',
  'src/device/native-features.js',
  'src/storage/session-store.js',
  'scripts/start-expo-local.js',
  'README.md',
];

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

const checks = [];

const missing = REQUIRED_FILES.filter(file => !fs.existsSync(path.join(ROOT, file)));
checks.push(missing.length ? fail('mobile.requiredFiles', { missing }) : pass('mobile.requiredFiles', { files: REQUIRED_FILES.length }));

const pkg = readJson('package.json');
const requiredDependencies = ['expo', 'react-native', 'expo-image-picker', 'expo-notifications', 'expo-secure-store'];
const missingDependencies = requiredDependencies.filter(name => !pkg.dependencies?.[name]);
checks.push(!missingDependencies.length
  ? pass('mobile.dependencies', {
      expo: pkg.dependencies.expo,
      reactNative: pkg.dependencies['react-native'],
      nativeModules: requiredDependencies.length - 2,
    })
  : fail('mobile.dependencies', { dependencies: pkg.dependencies || {} }));

const appConfig = readJson('app.json').expo;
checks.push(appConfig?.name && appConfig?.slug && appConfig?.ios?.bundleIdentifier && appConfig?.android?.package
  ? pass('mobile.appConfig', {
      appName: appConfig.name,
      slug: appConfig.slug,
      iosBundleIdentifier: appConfig.ios.bundleIdentifier,
      androidPackage: appConfig.android.package,
    })
  : fail('mobile.appConfig', { appConfig }));

const jsFiles = [
  'App.js',
  'src/api/client.js',
  'src/device/native-features.js',
  'src/storage/session-store.js',
  'scripts/check-mobile-static.js',
  'scripts/start-expo-local.js',
];
const syntaxFailures = jsFiles
  .map(file => ({
    file,
    result: spawnSync(process.execPath, ['--check', path.join(ROOT, file)], { encoding: 'utf8' }),
  }))
  .filter(item => item.result.status !== 0)
  .map(item => ({ file: item.file, stderr: item.result.stderr }));
checks.push(syntaxFailures.length
  ? fail('mobile.jsSyntax', { failures: syntaxFailures })
  : pass('mobile.jsSyntax', { files: jsFiles.length }));

const appSource = fs.readFileSync(path.join(ROOT, 'App.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(ROOT, 'src/api/client.js'), 'utf8');
const requiredApiCalls = [
  '/auth/otp/request',
  '/auth/otp/login',
  '/dashboard',
  '/questions',
  '/review-tasks/today',
  '/uploads/images',
  '/ocr/extract',
  '/devices',
  '/mistakes',
  '/reports/parent-weekly',
  '/plans',
  '/billing/status',
  '/billing/checkout',
  '/billing/cancel',
  '/knowledge-tree',
  '/finish',
];
const missingApiCalls = requiredApiCalls.filter(call => !clientSource.includes(call));
checks.push(!missingApiCalls.length
  && appSource.includes('sessionToken')
  && appSource.includes('takeQuestionPhoto')
  && appSource.includes('registerReviewPushToken')
  && appSource.includes('renderMistakes')
  && appSource.includes('renderReport')
  && appSource.includes('renderPlus')
  && appSource.includes('renderKnowledge')
  && appSource.includes('answerMessages')
  && !appSource.includes('x-user-id')
  ? pass('mobile.apiContract', { calls: requiredApiCalls.length, auth: 'bearer-session' })
  : fail('mobile.apiContract', { missingApiCalls }));

checks.push(appSource.includes('enterDemoMode')
  && appSource.includes('DEMO_DASHBOARD')
  && appSource.includes('体验演示')
  && appSource.includes('演示模式')
  ? pass('mobile.demoExperience', { entry: '体验演示' })
  : fail('mobile.demoExperience', {
      message: 'The mobile app should keep a visible demo entry for product review without backend setup.'
    }));

const counts = checks.reduce((acc, check) => {
  acc[check.status] = (acc[check.status] || 0) + 1;
  return acc;
}, {});
const output = {
  ok: !checks.some(check => check.status === 'fail'),
  counts: {
    pass: counts.pass || 0,
    fail: counts.fail || 0,
  },
  checks,
};

console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
