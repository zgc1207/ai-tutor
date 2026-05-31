import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve(process.cwd(), '..');
const SERVER_DIR = process.cwd();

const PROVIDER_CONTRACTS = [
  {
    name: 'ocr',
    implementation: 'src/ai/ocr-provider.js',
    envKeys: ['OCR_PROVIDER', 'OCR_API_KEY', 'OCR_ENDPOINT'],
    deploySnippets: ['OCR_PROVIDER', 'OCR_ENDPOINT', 'OCR_API_KEY', 'ocr.realProvider', 'ocr.endpointOrKey'],
    docSnippets: ['OCR_PROVIDER', 'OCR_API_KEY', 'OCR_ENDPOINT'],
    requiredImplementationSnippets: ['OCR_PROVIDER', 'OCR_API_KEY', 'OCR_ENDPOINT', "provider: 'mock'", 'fetch(config.endpoint'],
  },
  {
    name: 'otpDelivery',
    implementation: 'src/lib/otp-delivery.js',
    envKeys: ['AUTH_OTP_DELIVERY_PROVIDER', 'AUTH_OTP_DELIVERY_ENDPOINT', 'AUTH_OTP_DELIVERY_TOKEN', 'AUTH_OTP_DEV_MODE'],
    deploySnippets: ['AUTH_OTP_DELIVERY_PROVIDER', 'AUTH_OTP_DELIVERY_ENDPOINT', 'AUTH_OTP_DELIVERY_TOKEN', 'AUTH_OTP_DEV_MODE'],
    docSnippets: ['AUTH_OTP_DELIVERY_PROVIDER=http', 'AUTH_OTP_DELIVERY_ENDPOINT', 'AUTH_OTP_DELIVERY_TOKEN'],
    requiredImplementationSnippets: ['getAuthOtpDeliveryProvider', 'getAuthOtpDeliveryEndpoint', 'getAuthOtpDeliveryToken', 'isAuthOtpDevModeEnabled', 'provider !== \'http\'', 'fetch(endpoint'],
  },
  {
    name: 'uploadStorage',
    implementation: 'src/lib/image-storage.js',
    envKeys: ['UPLOAD_STORAGE_PROVIDER', 'UPLOAD_STORAGE_ENDPOINT', 'UPLOAD_STORAGE_TOKEN', 'OBJECT_STORAGE_READY'],
    deploySnippets: ['UPLOAD_STORAGE_PROVIDER', 'UPLOAD_STORAGE_ENDPOINT', 'UPLOAD_STORAGE_TOKEN', 'OBJECT_STORAGE_READY'],
    docSnippets: ['UPLOAD_STORAGE_PROVIDER=http', 'UPLOAD_STORAGE_ENDPOINT', 'UPLOAD_STORAGE_TOKEN'],
    requiredImplementationSnippets: ['getUploadStorageProvider', 'getUploadStorageEndpoint', 'getUploadStorageToken', 'storeLocalImage', 'storeHttpImage', 'fetch(endpoint'],
  },
  {
    name: 'payment',
    implementation: 'src/lib/payment-provider.js',
    envKeys: ['PAYMENT_PROVIDER', 'PAYMENT_PROVIDER_ENDPOINT', 'PAYMENT_PROVIDER_TOKEN', 'PAYMENT_WEBHOOK_SECRET', 'PAYMENT_READY'],
    deploySnippets: ['PAYMENT_PROVIDER', 'PAYMENT_PROVIDER_ENDPOINT', 'PAYMENT_PROVIDER_TOKEN', 'PAYMENT_WEBHOOK_SECRET', 'PAYMENT_READY'],
    docSnippets: ['PAYMENT_PROVIDER=http', 'PAYMENT_PROVIDER_ENDPOINT', 'PAYMENT_PROVIDER_TOKEN', 'PAYMENT_READY=true'],
    requiredImplementationSnippets: ['getPaymentProvider', 'getPaymentEndpoint', 'getPaymentToken', 'getPaymentWebhookSecret', 'verifyPaymentSignature', 'createCheckoutSession', 'fetch(endpoint'],
  },
  {
    name: 'push',
    implementation: 'src/lib/push-provider.js',
    envKeys: ['PUSH_PROVIDER', 'PUSH_ENDPOINT', 'PUSH_TOKEN', 'PUSH_READY'],
    deploySnippets: ['PUSH_PROVIDER', 'PUSH_ENDPOINT', 'PUSH_TOKEN', 'PUSH_READY'],
    docSnippets: ['PUSH_PROVIDER=http', 'PUSH_ENDPOINT', 'PUSH_TOKEN', 'PUSH_READY=true'],
    requiredImplementationSnippets: ['getPushProvider', 'getPushEndpoint', 'getPushToken', 'sendPushNotification', 'provider !== \'http\'', 'fetch(endpoint'],
  },
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

const envExample = read('server/.env.example');
const deployCheck = read('server/scripts/check-deploy-config.js');
const deploymentChecklist = read('部署前检查清单.md');
const internalChecklist = read('内测准备清单.md');
const checks = [];

for (const contract of PROVIDER_CONTRACTS) {
  const implementation = read(path.join('server', contract.implementation));
  const missingEnvKeys = contract.envKeys.filter(key => !envExample.includes(`${key}=`));
  const missingDeploySnippets = contract.deploySnippets.filter(snippet => !deployCheck.includes(snippet));
  const docsSource = `${deploymentChecklist}\n${internalChecklist}`;
  const missingDocSnippets = contract.docSnippets.filter(snippet => !docsSource.includes(snippet));
  const missingImplementationSnippets = contract.requiredImplementationSnippets
    .filter(snippet => !implementation.includes(snippet));

  const missing = {
    envKeys: missingEnvKeys,
    deployChecks: missingDeploySnippets,
    docs: missingDocSnippets,
    implementation: missingImplementationSnippets,
  };
  const hasMissing = Object.values(missing).some(items => items.length > 0);

  checks.push(hasMissing
    ? fail(`provider.${contract.name}`, { implementation: contract.implementation, missing })
    : pass(`provider.${contract.name}`, {
        implementation: contract.implementation,
        envKeys: contract.envKeys.length,
        deployChecks: contract.deploySnippets.length,
        docs: contract.docSnippets.length,
      }));
}

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  counts: {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: failCount,
  },
  checks,
  nextExternalChecks: [
    'Choose real OCR, OTP delivery, upload storage, payment, and push providers.',
    'Configure each provider in the target environment and run deploy:check.',
    'Run real-device OCR, push delivery, payment sandbox, refund, and account deletion verification before external release.',
  ],
};

console.log(JSON.stringify(output, null, 2));

if (!output.ok) {
  process.exitCode = 1;
}
