import fs from 'node:fs';
import path from 'node:path';

const SCHEMA_PATH = path.join(process.cwd(), 'prisma', 'schema.prisma');

const REQUIRED_MODELS = {
  User: ['id', 'phone', 'nickname', 'policyVersion', 'termsAcceptedAt', 'privacyAcceptedAt', 'minorNoticeAcceptedAt', 'createdAt', 'updatedAt'],
  AuthOtp: ['phone', 'codeHash', 'purpose', 'attempts', 'maxAttempts', 'expiresAt', 'consumedAt', 'userId', 'createdAt'],
  Session: ['token', 'userId', 'expiresAt', 'revokedAt', 'createdAt'],
  StudentProfile: ['userId', 'grade', 'gradeStage', 'targetSubjects', 'reviewReminderEnabled', 'reviewReminderTime', 'quietHoursStart', 'quietHoursEnd'],
  Subject: ['code', 'name'],
  KnowledgeNode: ['subjectId', 'parentId', 'name', 'stage', 'sortOrder'],
  Question: ['userId', 'subjectId', 'inputType', 'originalText', 'imageUrl', 'ocrText', 'status', 'createdAt', 'updatedAt'],
  AnswerSession: ['questionId', 'userId', 'currentStep', 'finalAnswerRevealed', 'solvedIndependently', 'createdAt', 'updatedAt'],
  AnswerMessage: ['sessionId', 'role', 'messageType', 'content', 'structuredPayload', 'createdAt'],
  ErrorRecord: ['userId', 'questionId', 'subjectId', 'knowledgeNodeId', 'knowledgePoint', 'errorReason', 'status', 'correctStreak', 'createdAt', 'updatedAt'],
  ReviewTask: ['userId', 'errorRecordId', 'cycle', 'dueAt', 'status', 'variantQuestion', 'answeredCorrectly', 'answeredAt', 'createdAt'],
  AiEvent: ['userId', 'eventType', 'provider', 'model', 'promptVersion', 'inputTokens', 'outputTokens', 'latencyMs', 'costEstimate', 'success', 'errorMessage', 'createdAt'],
  UserFeedback: ['userId', 'rating', 'category', 'content', 'page', 'createdAt'],
  PaymentOrder: ['userId', 'planCode', 'amountCents', 'currency', 'provider', 'providerOrderId', 'checkoutUrl', 'status', 'paidAt', 'rawPayload', 'createdAt', 'updatedAt'],
  Subscription: ['userId', 'planCode', 'status', 'startsAt', 'expiresAt', 'cancelAtPeriodEnd', 'canceledAt', 'sourceOrderId', 'createdAt', 'updatedAt'],
  DeviceToken: ['userId', 'platform', 'provider', 'token', 'enabled', 'lastSeenAt', 'createdAt', 'updatedAt'],
  NotificationDelivery: ['userId', 'deviceTokenId', 'type', 'title', 'body', 'provider', 'status', 'dedupeKey', 'rawPayload', 'errorMessage', 'createdAt'],
};

const REQUIRED_ENUMS = {
  GradeStage: ['primary', 'junior', 'senior'],
  InputType: ['text', 'image', 'voice'],
  QuestionStatus: ['started', 'guiding', 'solved', 'abandoned'],
  MessageRole: ['user', 'assistant'],
  MessageType: ['analysis', 'knowledge', 'hint', 'solution', 'related', 'text'],
  ErrorStatus: ['weak', 'learning', 'mastered'],
  ReviewCycle: ['D1', 'D3', 'D7', 'D15'],
  ReviewStatus: ['pending', 'done', 'skipped', 'reset'],
  AiEventType: ['socratic_answer', 'extract_error', 'generate_variant', 'safety_check'],
  PaymentOrderStatus: ['pending', 'paid', 'failed', 'canceled', 'refunded'],
  SubscriptionStatus: ['active', 'expired', 'canceled'],
};

const REQUIRED_INDEXES = {
  AuthOtp: ['@@index([phone, purpose, expiresAt])', '@@index([userId, createdAt])'],
  Session: ['@@index([userId, expiresAt])', '@@index([token, expiresAt])'],
  KnowledgeNode: ['@@index([subjectId, parentId])'],
  Question: ['@@index([userId, createdAt])', '@@index([userId, subjectId])'],
  AnswerSession: ['@@index([userId, createdAt])'],
  ErrorRecord: ['@@index([userId, status])', '@@index([userId, subjectId])'],
  ReviewTask: ['@@index([userId, status, dueAt])'],
  AiEvent: ['@@index([userId, eventType, createdAt])'],
  UserFeedback: ['@@index([userId, createdAt])', '@@index([category, createdAt])'],
  PaymentOrder: ['@@index([userId, createdAt])', '@@index([status, createdAt])', '@@index([providerOrderId])'],
  Subscription: ['@@index([userId, status, expiresAt])', '@@index([sourceOrderId])'],
  DeviceToken: ['@@unique([provider, token])', '@@index([userId, enabled])'],
  NotificationDelivery: ['@@unique([dedupeKey])', '@@index([userId, type, createdAt])', '@@index([status, createdAt])'],
};

const REQUIRED_CASCADE_RELATIONS = {
  AuthOtp: ['user'],
  Session: ['user'],
  StudentProfile: ['user'],
  Question: ['user'],
  AnswerSession: ['question', 'user'],
  AnswerMessage: ['session'],
  ErrorRecord: ['user'],
  ReviewTask: ['user', 'errorRecord'],
  AiEvent: ['user'],
  UserFeedback: ['user'],
  PaymentOrder: ['user'],
  Subscription: ['user'],
  DeviceToken: ['user'],
  NotificationDelivery: ['user'],
};

function pass(name, details = {}) {
  return { name, status: 'pass', ...details };
}

function fail(name, details = {}) {
  return { name, status: 'fail', ...details };
}

function parseBlocks(source, keyword) {
  const blocks = new Map();
  const pattern = new RegExp(`${keyword}\\s+(\\w+)\\s+\\{([\\s\\S]*?)\\n\\}`, 'g');
  let match;
  while ((match = pattern.exec(source))) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

function modelFields(modelBody) {
  return modelBody
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('@@'))
    .map(line => line.split(/\s+/)[0])
    .filter(Boolean);
}

function enumValues(enumBody) {
  return enumBody
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('//'));
}

const source = fs.readFileSync(SCHEMA_PATH, 'utf8');
const models = parseBlocks(source, 'model');
const enums = parseBlocks(source, 'enum');
const checks = [];

const missingModels = Object.keys(REQUIRED_MODELS).filter(model => !models.has(model));
checks.push(missingModels.length
  ? fail('schema.models.required', { missingModels })
  : pass('schema.models.required', { models: Object.keys(REQUIRED_MODELS).length }));

const missingFields = [];
for (const [model, requiredFields] of Object.entries(REQUIRED_MODELS)) {
  const body = models.get(model);
  if (!body) continue;
  const fields = new Set(modelFields(body));
  const missing = requiredFields.filter(field => !fields.has(field));
  if (missing.length) missingFields.push({ model, missing });
}
checks.push(missingFields.length
  ? fail('schema.fields.required', { missingFields })
  : pass('schema.fields.required'));

const missingEnums = [];
for (const [enumName, requiredValues] of Object.entries(REQUIRED_ENUMS)) {
  const body = enums.get(enumName);
  if (!body) {
    missingEnums.push({ enum: enumName, missing: requiredValues });
    continue;
  }
  const values = new Set(enumValues(body));
  const missing = requiredValues.filter(value => !values.has(value));
  if (missing.length) missingEnums.push({ enum: enumName, missing });
}
checks.push(missingEnums.length
  ? fail('schema.enums.required', { missingEnums })
  : pass('schema.enums.required'));

const missingIndexes = [];
for (const [model, requiredIndexes] of Object.entries(REQUIRED_INDEXES)) {
  const body = models.get(model);
  if (!body) continue;
  const compactBody = body.replace(/\s+/g, ' ');
  const missing = requiredIndexes.filter(index => !compactBody.includes(index));
  if (missing.length) missingIndexes.push({ model, missing });
}
checks.push(missingIndexes.length
  ? fail('schema.indexes.required', { missingIndexes })
  : pass('schema.indexes.required'));

const missingCascadeRelations = [];
for (const [model, relationFields] of Object.entries(REQUIRED_CASCADE_RELATIONS)) {
  const body = models.get(model);
  if (!body) continue;
  const lines = body.split('\n').map(line => line.trim());
  const missing = relationFields.filter(field => {
    const line = lines.find(item => item.startsWith(`${field} `));
    return !line || !line.includes('@relation') || !line.includes('onDelete: Cascade');
  });
  if (missing.length) missingCascadeRelations.push({ model, missing });
}
checks.push(missingCascadeRelations.length
  ? fail('schema.relations.cascade', { missingCascadeRelations })
  : pass('schema.relations.cascade'));

const failCount = checks.filter(check => check.status === 'fail').length;
const output = {
  ok: failCount === 0,
  schema: path.relative(process.cwd(), SCHEMA_PATH),
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
