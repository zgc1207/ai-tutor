export const OCR_PROMPT_VERSION = 'ocr-v1';

function providerConfig() {
  return {
    provider: process.env.OCR_PROVIDER || 'mock',
    apiKey: process.env.OCR_API_KEY,
    endpoint: process.env.OCR_ENDPOINT,
  };
}

function mockExtract({ mockText, imageUrl }) {
  return mockText || (
    imageUrl
      ? '求二次函数 y = x² - 4x + 3 的顶点坐标'
      : '请在拍照后确认题目文字, 或手动补充题目内容。'
  );
}

export async function extractTextFromImage({ imageUrl, imageData, mockText } = {}) {
  const config = providerConfig();
  const startedAt = Date.now();

  if (config.provider === 'mock' || !config.apiKey || !config.endpoint) {
    return {
      text: mockExtract({ mockText, imageUrl, imageData }),
      confidence: mockText ? 0.98 : 0.8,
      meta: {
        provider: 'mock',
        model: 'mock-ocr',
        promptVersion: OCR_PROMPT_VERSION,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - startedAt,
        costEstimate: 0,
      },
    };
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ imageUrl, imageData }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OCR request failed: ${response.status} ${text}`);
  }
  const data = await response.json();
  return {
    text: data.text || data.ocrText || '',
    confidence: Number(data.confidence || 0),
    meta: {
      provider: config.provider,
      model: data.model || 'external-ocr',
      promptVersion: OCR_PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - startedAt,
      costEstimate: Number(data.costEstimate || 0),
    },
  };
}
