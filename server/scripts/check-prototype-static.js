import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = path.resolve(process.cwd(), '..');
const PROTOTYPE_DIR = path.join(ROOT_DIR, 'prototype');
const REQUIRED_PAGES = [
  'index.html',
  'login.html',
  'ask.html',
  'mistakes.html',
  'review.html',
  'report.html',
  'me.html',
  'legal.html',
  'admin.html',
  'offline.html',
];
const REQUIRED_ASSETS = [
  'manifest.webmanifest',
  'sw.js',
  'assets/app-icon.svg',
  'css/styles.css',
  'js/pwa.js',
  'js/api.js',
  'js/app.js',
  'js/admin-console.js',
  'js/mock-data.js',
];

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(PROTOTYPE_DIR, relativePath));
}

function checkJsSyntax(relativePath) {
  const result = spawnSync(process.execPath, ['--check', path.join(PROTOTYPE_DIR, relativePath)], {
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    stderr: result.stderr,
  };
}

const checks = [];

const missingPages = REQUIRED_PAGES.filter(page => !fileExists(page));
checks.push(missingPages.length
  ? fail('prototype.pages', { missing: missingPages })
  : pass('prototype.pages', { pages: REQUIRED_PAGES.length }));

const missingAssets = REQUIRED_ASSETS.filter(asset => !fileExists(asset));
checks.push(missingAssets.length
  ? fail('prototype.assets', { missing: missingAssets })
  : pass('prototype.assets', { assets: REQUIRED_ASSETS.length }));

const manifest = JSON.parse(read(path.join(PROTOTYPE_DIR, 'manifest.webmanifest')));
checks.push(manifest.name && manifest.short_name && manifest.start_url && manifest.display === 'standalone'
  ? pass('pwa.manifest.basic', {
      appName: manifest.name,
      startUrl: manifest.start_url,
      display: manifest.display,
    })
  : fail('pwa.manifest.basic', { manifest }));

checks.push(Array.isArray(manifest.icons) && manifest.icons.some(icon => icon.src && icon.purpose?.includes('maskable'))
  ? pass('pwa.manifest.icons', { icons: manifest.icons.length })
  : fail('pwa.manifest.icons', { icons: manifest.icons || [] }));

const swSource = read(path.join(PROTOTYPE_DIR, 'sw.js'));
const requiredCacheEntries = REQUIRED_PAGES.concat([
  'manifest.webmanifest',
  'assets/app-icon.svg',
  'css/styles.css',
  'js/pwa.js',
]);
const missingCacheEntries = requiredCacheEntries.filter(entry => !swSource.includes(`./${entry}`));
checks.push(missingCacheEntries.length
  ? fail('pwa.serviceWorker.cacheList', { missing: missingCacheEntries })
  : pass('pwa.serviceWorker.cacheList', { cached: requiredCacheEntries.length }));

const pageRegistrationFailures = REQUIRED_PAGES
  .filter(page => page !== 'offline.html')
  .filter(page => {
    const source = read(path.join(PROTOTYPE_DIR, page));
    return !source.includes('manifest.webmanifest')
      || !source.includes('apple-mobile-web-app-capable')
      || !source.includes('js/pwa.js');
  });
checks.push(pageRegistrationFailures.length
  ? fail('pwa.pageRegistration', { pages: pageRegistrationFailures })
  : pass('pwa.pageRegistration', { pages: REQUIRED_PAGES.length - 1 }));

const jsFiles = ['js/pwa.js', 'js/api.js', 'js/app.js', 'js/admin-console.js', 'js/ai-script.js', 'js/mock-data.js', 'sw.js'];
const syntaxFailures = jsFiles
  .map(file => ({ file, result: checkJsSyntax(file) }))
  .filter(item => !item.result.ok);
checks.push(syntaxFailures.length
  ? fail('prototype.jsSyntax', { failures: syntaxFailures })
  : pass('prototype.jsSyntax', { files: jsFiles.length }));

const statusCounts = checks.reduce((acc, check) => {
  acc[check.status] = (acc[check.status] || 0) + 1;
  return acc;
}, {});
const output = {
  ok: !checks.some(check => check.status === 'fail'),
  counts: {
    pass: statusCounts.pass || 0,
    fail: statusCounts.fail || 0,
  },
  checks,
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
