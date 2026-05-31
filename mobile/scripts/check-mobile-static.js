import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REQUIRED_FILES = [
  'package.json',
  'app.json',
  'eas.json',
  'assets/icon.png',
  'assets/adaptive-icon.png',
  'assets/splash-icon.png',
  'App.js',
  'src/api/client.js',
  'src/device/native-features.js',
  'src/storage/session-store.js',
  'scripts/print-local-api.js',
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

function pngSize(relativePath) {
  const file = fs.readFileSync(path.join(ROOT, relativePath));
  const pngSignature = '89504e470d0a1a0a';
  if (file.subarray(0, 8).toString('hex') !== pngSignature) return null;
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
  };
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
const easConfig = readJson('eas.json');
const iosBundleIdentifier = appConfig?.ios?.bundleIdentifier || '';
const androidPackage = appConfig?.android?.package || '';
const appIdPattern = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/;
const requiredAndroidPermissions = ['CAMERA', 'POST_NOTIFICATIONS'];
const missingAndroidPermissions = requiredAndroidPermissions.filter(permission => !appConfig?.android?.permissions?.includes(permission));
checks.push(appConfig?.name
  && appConfig?.slug
  && appConfig?.icon === './assets/icon.png'
  && appConfig?.splash?.image === './assets/splash-icon.png'
  && appConfig?.splash?.resizeMode === 'contain'
  && appIdPattern.test(iosBundleIdentifier)
  && appIdPattern.test(androidPackage)
  && !iosBundleIdentifier.includes('example')
  && !androidPackage.includes('example')
  && appConfig?.android?.adaptiveIcon?.foregroundImage === './assets/adaptive-icon.png'
  && appConfig?.ios?.infoPlist?.NSCameraUsageDescription
  && appConfig?.ios?.infoPlist?.NSPhotoLibraryUsageDescription
  && appConfig?.ios?.infoPlist?.NSUserNotificationsUsageDescription
  && appConfig?.ios?.buildNumber
  && Number.isInteger(appConfig?.android?.versionCode)
  && missingAndroidPermissions.length === 0
  ? pass('mobile.appConfig', {
      appName: appConfig.name,
      slug: appConfig.slug,
      iosBundleIdentifier,
      iosBuildNumber: appConfig.ios.buildNumber,
      androidPackage,
      androidVersionCode: appConfig.android.versionCode,
      androidPermissions: appConfig.android.permissions,
    })
  : fail('mobile.appConfig', {
      appConfig,
      missingAndroidPermissions,
      message: 'App config must use production-style package identifiers and explicit permission descriptions.',
    }));

const iconSize = pngSize('assets/icon.png');
const adaptiveIconSize = pngSize('assets/adaptive-icon.png');
const splashIconSize = pngSize('assets/splash-icon.png');
checks.push(iconSize?.width === 1024 && iconSize?.height === 1024
  && adaptiveIconSize?.width === 1024 && adaptiveIconSize?.height === 1024
  && splashIconSize?.width === 1024 && splashIconSize?.height === 1024
  ? pass('mobile.visualAssets', {
      icon: iconSize,
      adaptiveIcon: adaptiveIconSize,
      splashIcon: splashIconSize,
    })
  : fail('mobile.visualAssets', {
      icon: iconSize,
      adaptiveIcon: adaptiveIconSize,
      splashIcon: splashIconSize,
    }));

const requiredBuildProfiles = ['development', 'preview', 'production'];
const missingBuildProfiles = requiredBuildProfiles.filter(profile => !easConfig?.build?.[profile]);
checks.push(missingBuildProfiles.length === 0
  && easConfig?.cli?.appVersionSource === 'local'
  && easConfig?.build?.preview?.distribution === 'internal'
  && easConfig?.build?.preview?.android?.buildType === 'apk'
  && easConfig?.build?.production?.android?.buildType === 'app-bundle'
  && pkg.scripts?.['build:android:preview']
  && pkg.scripts?.['build:ios:preview']
  ? pass('mobile.easBuildConfig', {
      profiles: requiredBuildProfiles,
      previewDistribution: easConfig.build.preview.distribution,
    })
  : fail('mobile.easBuildConfig', {
      missingBuildProfiles,
      easConfig,
      scripts: pkg.scripts,
    }));

const jsFiles = [
  'App.js',
  'src/api/client.js',
  'src/device/native-features.js',
  'src/storage/session-store.js',
  'scripts/check-mobile-static.js',
  'scripts/print-local-api.js',
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
  '/health',
  '/ready',
  '/auth/otp/request',
  '/auth/otp/login',
  '/account/export',
  '/account',
  '/dashboard',
  '/questions',
  '/review-tasks/today',
  '/review-tasks/',
  '/uploads/images',
  '/ocr/extract',
  '/devices',
  '/mistakes',
  '/reports/parent-weekly',
  '/plans',
  '/billing/status',
  '/billing/checkout',
  '/billing/cancel',
  '/feedback',
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
  && appSource.includes('consentAccepted')
  && appSource.includes('POLICY_VERSION')
  && appSource.includes('submitFeedback')
  && appSource.includes('FEEDBACK_CATEGORIES')
  && appSource.includes('exportAccountData')
  && appSource.includes('requestAccountDeletion')
  && appSource.includes('LEGAL_DOCS')
  && appSource.includes('renderLegalDoc')
  && clientSource.includes('consentAccepted = false')
  && clientSource.includes("gradeStage: 'junior'")
  && !clientSource.includes('consentAccepted: true')
  && !appSource.includes('x-user-id')
  ? pass('mobile.apiContract', { calls: requiredApiCalls.length, auth: 'bearer-session' })
  : fail('mobile.apiContract', { missingApiCalls }));

checks.push(appSource.includes('enterDemoMode')
  && appSource.includes('DEMO_DASHBOARD')
  && appSource.includes('DEMO_SAMPLE_QUESTIONS')
  && appSource.includes('当前流程')
  && appSource.includes('answerReviewTask')
  && appSource.includes('openReviewForMistake')
  && appSource.includes('去复习这类题')
  && appSource.includes('家长行动清单')
  && appSource.includes('看相关错题')
  && appSource.includes('openKnowledgeAction')
  && appSource.includes('知识图谱')
  && appSource.includes('planCompare')
  && appSource.includes('免费版')
  && appSource.includes('管理 Plus')
  && appSource.includes('检查后端状态')
  && appSource.includes('今日额度')
  && appSource.includes('内测诊断')
  && appSource.includes('API_PRESETS')
  && appSource.includes('Android 模拟器')
  && appSource.includes('npm run api:local')
  && appSource.includes('我已阅读并同意内测协议')
  && appSource.includes('AI 仅作学习辅助')
  && appSource.includes('内测反馈')
  && appSource.includes('内容安全')
  && appSource.includes('账号与数据')
  && appSource.includes('确认注销账号')
  && appSource.includes('协议与隐私')
  && appSource.includes('用户协议')
  && appSource.includes('隐私政策')
  && appSource.includes('未成年人说明')
  && appSource.includes('仍不会')
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
