export const SAFETY_PROMPT_VERSION = 'content-safety-v1';

const BLOCK_RULES = [
  {
    category: 'self_harm',
    severity: 'critical',
    keywords: ['自杀', '自残', '想死', '割腕', '跳楼', 'suicide', 'kill myself'],
    message: '这个内容不适合由学习助手继续处理。请立刻告诉家长、老师或身边可信任的成年人；如果存在即时危险, 请联系当地紧急救助渠道。',
  },
  {
    category: 'violence',
    severity: 'high',
    keywords: ['杀人', '伤害同学', '打死', '投毒', '炸学校', '做炸弹', '爆炸物', 'weapon', 'bomb'],
    message: '这个内容涉及伤害他人或危险行为, 学习助手不能提供帮助。请停止相关行为, 并向家长或老师寻求帮助。',
  },
  {
    category: 'sexual_minor',
    severity: 'critical',
    keywords: ['未成年人裸照', '儿童色情', '幼女', '幼童性', '性侵未成年', 'child porn'],
    message: '这个内容涉及未成年人性安全风险, 学习助手不能处理。',
  },
  {
    category: 'illegal',
    severity: 'high',
    keywords: ['偷银行卡', '盗号', '破解密码', '诈骗话术', '绕过监控', '黑进', 'hack account'],
    message: '这个内容涉及违法或侵害他人权益的行为, 学习助手不能提供帮助。',
  },
  {
    category: 'exam_cheating',
    severity: 'medium',
    keywords: ['帮我考试作弊', '替我考试', '代写作业', '代写作文', '直接给我答案不要步骤', '帮我抄答案'],
    message: '我不能代写或帮助作弊。你可以提交具体题目, 我会用提示引导你自己完成。',
  },
];

const PERSONAL_INFO_RULES = [
  {
    category: 'personal_id',
    pattern: /(?:身份证(?:号|是|号是)?|idcard)[:：]?\d{17}[\dXx]/,
  },
  {
    category: 'bank_card',
    pattern: /(?:银行卡号?|卡号)[:：]?\d{12,19}/,
  },
  {
    category: 'address',
    pattern: /(?:我家住在|家庭住址|住址是).{6,}/,
  },
];

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

export function checkInputSafety({ text = '', context = 'question' } = {}) {
  const normalized = normalizeText(text);
  const compactText = String(text || '').replace(/\s+/g, '');
  if (!normalized) {
    return { safe: true, context, category: 'none', severity: 'none' };
  }

  const blockedRule = BLOCK_RULES.find(rule => rule.keywords.some(keyword => normalized.includes(normalizeText(keyword))));
  if (blockedRule) {
    return {
      safe: false,
      context,
      category: blockedRule.category,
      severity: blockedRule.severity,
      message: blockedRule.message,
    };
  }

  const personalInfoRule = PERSONAL_INFO_RULES.find(rule => rule.pattern.test(compactText));
  if (personalInfoRule) {
    return {
      safe: false,
      context,
      category: personalInfoRule.category,
      severity: 'medium',
      message: '请不要在题目或反馈中提交身份证号、银行卡号、家庭住址等个人敏感信息。你可以删除这些信息后再继续。',
    };
  }

  return { safe: true, context, category: 'none', severity: 'none' };
}

export function buildSafetyEventData({ userId, result }) {
  return {
    userId,
    eventType: 'safety_check',
    provider: 'deterministic',
    model: 'keyword-rules',
    promptVersion: SAFETY_PROMPT_VERSION,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    costEstimate: 0,
    success: result.safe,
    errorMessage: result.safe ? null : `${result.category}:${result.severity}`,
  };
}
