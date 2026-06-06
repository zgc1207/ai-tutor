import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), '..');
const MOBILE_DIR = path.join(ROOT_DIR, 'mobile');

const REQUIRED_DOCS = [
  '用户协议草案.md',
  '隐私政策草案.md',
  '未成年人使用说明.md',
  '合规上架检查清单.md',
  '内测准备清单.md',
  '部署前检查清单.md',
];

const REQUIRED_APP_CONFIG_SNIPPETS = [
  'com.zgc1207.aitutor',
  'NSCameraUsageDescription',
  'NSPhotoLibraryUsageDescription',
  'NSUserNotificationsUsageDescription',
  'CAMERA',
  'READ_MEDIA_IMAGES',
  'POST_NOTIFICATIONS',
  './assets/icon.png',
  './assets/adaptive-icon.png',
  './assets/splash-icon.png',
];

const REQUIRED_EAS_SNIPPETS = [
  '"appVersionSource": "local"',
  '"development"',
  '"preview"',
  '"production"',
  '"distribution": "internal"',
  '"buildType": "apk"',
  '"buildType": "app-bundle"',
  '"autoIncrement": true',
];

const REQUIRED_MOBILE_SCRIPT_SNIPPETS = [
  '"runtime:check"',
  '"start:check"',
  '"api:local"',
  '"build:android:preview"',
  '"build:ios:preview"',
  '"verify:static"',
];

const REQUIRED_MOBILE_APP_SNIPPETS = [
  'consentAccepted',
  'POLICY_VERSION',
  'LEGAL_DOCS',
  'renderLegalDoc',
  'exportAccountData',
  'requestAccountDeletion',
  'submitFeedback',
  'registerReviewPushToken',
  'takeQuestionPhoto',
];

const REQUIRED_MOBILE_NATIVE_FEATURE_SNIPPETS = [
  'expo-image-picker',
  'expo-notifications',
  'ImagePicker.requestCameraPermissionsAsync',
  'ImagePicker.requestMediaLibraryPermissionsAsync',
  'Notifications.requestPermissionsAsync',
  'Notifications.getExpoPushTokenAsync',
];

const REQUIRED_MOBILE_STORAGE_SNIPPETS = [
  'expo-secure-store',
  'SecureStore.getItemAsync',
  'SecureStore.setItemAsync',
];

const REQUIRED_COMPLIANCE_SNIPPETS = [
  '用户协议',
  '隐私政策',
  '未成年人使用说明',
  'SDK 清单',
  'App Store',
  'Google Play',
  'Data safety',
  '注销账号',
  '数据导出',
  '权限说明',
  'TestFlight',
  'Android',
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

function fileExists(relativePath) {
  return fs.existsSync(path.join(ROOT_DIR, relativePath));
}

function checkSnippets(name, source, snippets) {
  const missing = snippets.filter(snippet => !source.includes(snippet));
  return missing.length ? fail(name, { missing }) : pass(name, { snippets: snippets.length });
}

const checks = [];

const missingDocs = REQUIRED_DOCS.filter(doc => !fileExists(doc));
checks.push(missingDocs.length
  ? fail('release.docs.required', { missingDocs })
  : pass('release.docs.required', { docs: REQUIRED_DOCS.length }));

checks.push(checkSnippets('release.mobile.appConfig', read('mobile/app.json'), REQUIRED_APP_CONFIG_SNIPPETS));
checks.push(checkSnippets('release.mobile.easConfig', read('mobile/eas.json'), REQUIRED_EAS_SNIPPETS));
checks.push(checkSnippets('release.mobile.scripts', read('mobile/package.json'), REQUIRED_MOBILE_SCRIPT_SNIPPETS));

const mobileAppSource = read('mobile/App.js');
checks.push(checkSnippets('release.mobile.appReadiness', mobileAppSource, REQUIRED_MOBILE_APP_SNIPPETS));
checks.push(checkSnippets('release.mobile.nativeFeatures', read('mobile/src/device/native-features.js'), REQUIRED_MOBILE_NATIVE_FEATURE_SNIPPETS));
checks.push(checkSnippets('release.mobile.secureStorage', read('mobile/src/storage/session-store.js'), REQUIRED_MOBILE_STORAGE_SNIPPETS));

const requiredAssets = [
  'assets/icon.png',
  'assets/adaptive-icon.png',
  'assets/splash-icon.png',
].map(relativePath => path.join(MOBILE_DIR, relativePath));
const missingAssets = requiredAssets.filter(assetPath => !fs.existsSync(assetPath));
checks.push(missingAssets.length
  ? fail('release.mobile.assets', { missingAssets: missingAssets.map(assetPath => path.relative(ROOT_DIR, assetPath)) })
  : pass('release.mobile.assets', { assets: requiredAssets.length }));

checks.push(checkSnippets('release.complianceChecklist', read('合规上架检查清单.md'), REQUIRED_COMPLIANCE_SNIPPETS));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  checks,
  nextExternalChecks: [
    'Run cd mobile && npm run runtime:check before attempting Expo startup.',
    'Run cd mobile && npm run start:check after Expo/Metro is stable.',
    'Build preview packages with cd mobile && npm run build:android:preview and build:ios:preview after EAS login and credentials are ready.',
    'Verify TestFlight/Android internal install, camera, gallery, notification permission, push token, login, OCR, AI answer, review, subscription, export, and deletion on real devices.',
  ],
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
