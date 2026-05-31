import {
  ERROR_EXTRACTION_PROMPT_VERSION,
  SOCRATIC_PROMPT_VERSION,
  VARIANT_PROMPT_VERSION,
  buildErrorExtractionMessages,
  buildSocraticMessages,
  buildVariantMessages,
} from './prompts.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_OUTPUT_TOKENS = 700;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeStep(payload) {
  const allowedTypes = new Set(['analysis', 'knowledge', 'hint', 'solution', 'related', 'text']);
  const type = allowedTypes.has(payload?.type) ? payload.type : 'hint';
  return {
    type,
    title: payload?.title || '提示',
    content: payload?.content || '我们先从题目条件入手。你能先说出这道题已知什么、要求什么吗?',
    options: Array.isArray(payload?.options) ? payload.options : [],
    should_create_error_record: Boolean(payload?.should_create_error_record),
  };
}

function mockSocraticStep({ question }) {
  const text = question.originalText || question.ocrText || '';
  const knowledgePoint = inferKnowledgePoint(text);
  const hintMap = {
    二次函数: '先判断它要考察的是图像特征还是代数变形',
    分式方程: '先找最简公分母, 并记得最后检验',
    相似三角形: '先确认已知角和边的对应关系',
    机械效率: '先区分有用功和总功',
    一般过去时: '先观察时间状语对应的时态',
    勾股定理: '先确认直角边和斜边分别是谁',
    概率: '先数清有利结果和所有可能结果',
    速度: '先找路程和时间, 再对应公式',
    情态动词: '先判断句子表达的是能力、允许还是必须',
    宾语从句: '先看从句在主句谓语后承担什么成分',
  };
  const subjectHint = hintMap[knowledgePoint] || '先观察题干关键词, 再回忆它对应的定义、公式或语言现象';
  return normalizeStep({
    type: 'hint',
    title: '先想关键条件',
    content: `我先不直接给答案。${subjectHint}。你能先说说这道题最关键的条件是什么吗?`,
    options: ['我能划出来', '不太确定', '想看一个提示'],
    should_create_error_record: false,
  });
}

function inferKnowledgePoint(text) {
  const rules = [
    ['二次函数', ['二次函数', '顶点']],
    ['分式方程', ['分式方程', '/(']],
    ['相似三角形', ['相似', '∽']],
    ['二元一次方程组', ['方程组', 'x + y', 'x - y']],
    ['一元一次方程', ['方程', '3x', '解方程']],
    ['一元一次不等式', ['不等式', '解集']],
    ['一次函数', ['一次函数', '象限']],
    ['圆周角', ['圆周角', '同弧']],
    ['概率', ['概率', '随机', '摸出']],
    ['勾股定理', ['直角三角形', '直角边', '斜边']],
    ['机械效率', ['机械效率', '有用功', '总功']],
    ['密度', ['密度', '质量', '体积']],
    ['串联电路', ['串联电路']],
    ['欧姆定律', ['电阻', '电流', '电压', 'Ω']],
    ['凸透镜成像', ['凸透镜', '焦距', '成像']],
    ['压强', ['压强', '受力面积']],
    ['速度', ['平均速度', '行驶', '千米']],
    ['机械能转化', ['重力势能', '动能', '下落']],
    ['一般过去时', ['yesterday']],
    ['现在完成时', ['have lived', 'since 2020']],
    ['比较级', ['taller than', 'than']],
    ['被动语态', ['was broken', 'by Tom']],
    ['情态动词', ['must', 'may', 'might', 'finish your homework']],
    ['宾语从句', ['where he lives', 'wonder']],
    ['定语从句', ['who is', '从句']],
    ['思想感情', ['思想感情', '作者']],
    ['比喻', ['像小船', '修辞']],
    ['文言实词', ['文言文', '乃']],
    ['说明方法', ['说明文', '列数字']],
    ['诗歌意象', ['古诗', '意象']],
  ];
  const matched = rules.find(([, keywords]) => keywords.some(keyword => text.includes(keyword)));
  return matched ? matched[0] : '题目核心知识点';
}

function providerConfig() {
  return {
    provider: process.env.LLM_PROVIDER || 'mock',
    model: process.env.LLM_MODEL || 'mock-socratic',
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs: positiveInt(process.env.LLM_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxOutputTokens: positiveInt(process.env.LLM_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS),
  };
}

async function requestJsonCompletion({ messages, promptVersion, temperature = 0.3 }) {
  const { provider, model, apiKey, baseUrl, timeoutMs, maxOutputTokens } = providerConfig();
  const startedAt = Date.now();

  if (!apiKey || provider === 'mock') {
    return {
      payload: null,
      meta: {
        provider: 'mock',
        model: provider === 'mock' ? 'mock-socratic' : model,
        promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        costEstimate: 0,
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxOutputTokens,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  return {
    payload: safeJsonParse(content),
    meta: {
      provider,
      model,
      promptVersion,
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
      latencyMs: Date.now() - startedAt,
      costEstimate: 0,
    },
  };
}

export async function generateSocraticStep({ question, profile }) {
  const config = providerConfig();
  if (!config.apiKey || config.provider === 'mock') {
    const startedAt = Date.now();
    return {
      step: mockSocraticStep({ question, profile }),
      meta: {
        provider: 'mock',
        model: 'mock-socratic',
        promptVersion: SOCRATIC_PROMPT_VERSION,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        costEstimate: 0,
      },
    };
  }

  const { payload, meta } = await requestJsonCompletion({
    messages: buildSocraticMessages({ question, profile }),
    promptVersion: SOCRATIC_PROMPT_VERSION,
    temperature: 0.3,
  });

  return {
    step: normalizeStep(payload),
    meta,
  };
}

function normalizeErrorExtraction(payload, question) {
  const text = question.originalText || question.ocrText || '';
  const defaultKnowledge = inferKnowledgePoint(text);
  return {
    shouldCreateErrorRecord: payload?.shouldCreateErrorRecord !== false,
    knowledgePoint: payload?.knowledgePoint || defaultKnowledge,
    knowledgePath: Array.isArray(payload?.knowledgePath) ? payload.knowledgePath : [],
    errorReason: payload?.errorReason || '未能独立完成关键步骤, 需要通过提示识别题目条件和解题目标。',
    status: ['weak', 'learning'].includes(payload?.status) ? payload.status : 'weak',
  };
}

export async function extractErrorRecord({ question, messages }) {
  const config = providerConfig();
  if (!config.apiKey || config.provider === 'mock') {
    const startedAt = Date.now();
    return {
      extraction: normalizeErrorExtraction(null, question),
      meta: {
        provider: 'mock',
        model: 'mock-socratic',
        promptVersion: ERROR_EXTRACTION_PROMPT_VERSION,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        costEstimate: 0,
      },
    };
  }

  const { payload, meta } = await requestJsonCompletion({
    messages: buildErrorExtractionMessages({ question, messages }),
    promptVersion: ERROR_EXTRACTION_PROMPT_VERSION,
    temperature: 0.2,
  });

  return {
    extraction: normalizeErrorExtraction(payload, question),
    meta,
  };
}

function normalizeVariant(payload, errorRecord, cycle) {
  const fallbackTitle = errorRecord.knowledgePoint.includes('二次函数')
    ? '求二次函数 y = x² - 6x + 5 的顶点坐标'
    : `围绕「${errorRecord.knowledgePoint}」完成一道变式题`;
  return {
    title: payload?.title || fallbackTitle,
    options: Array.isArray(payload?.options) && payload.options.length === 4
      ? payload.options
      : ['(3, -4)', '(3, 4)', '(-3, -4)', '(-3, 4)'],
    correctAnswer: payload?.correctAnswer || '(3, -4)',
    explain: payload?.explain || '通过配方法 y = (x - 3)² - 4, 顶点坐标为 (3, -4)。',
    knowledgePoint: payload?.knowledgePoint || errorRecord.knowledgePoint,
    consistencyNote: payload?.consistencyNote || `用于 ${cycle} 复习, 考察同一核心知识点。`,
  };
}

export async function generateVariantQuestion({ errorRecord, cycle }) {
  const config = providerConfig();
  if (!config.apiKey || config.provider === 'mock') {
    const startedAt = Date.now();
    return {
      variant: normalizeVariant(null, errorRecord, cycle),
      meta: {
        provider: 'mock',
        model: 'mock-socratic',
        promptVersion: VARIANT_PROMPT_VERSION,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        costEstimate: 0,
      },
    };
  }

  const { payload, meta } = await requestJsonCompletion({
    messages: buildVariantMessages({ errorRecord, cycle }),
    promptVersion: VARIANT_PROMPT_VERSION,
    temperature: 0.4,
  });

  return {
    variant: normalizeVariant(payload, errorRecord, cycle),
    meta,
  };
}
