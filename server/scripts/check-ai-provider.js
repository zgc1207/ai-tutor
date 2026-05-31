import { generateSocraticStep } from '../src/ai/llm-provider.js';
import { isLlmReady, loadEnvFile } from '../src/lib/config.js';

loadEnvFile();

const allowMock = process.argv.includes('--allow-mock');
const provider = process.env.LLM_PROVIDER || 'mock';
const model = process.env.LLM_MODEL || 'mock-socratic';
const hasApiKey = Boolean(process.env.LLM_API_KEY);
const llmReady = isLlmReady();
const startedAt = Date.now();

function finish(output, failed = false) {
  console.log(JSON.stringify(output, null, 2));
  if (failed) process.exitCode = 1;
}

if (!allowMock && (provider === 'mock' || !hasApiKey)) {
  finish({
    ok: false,
    provider,
    model,
    llmReady,
    message: 'LLM_PROVIDER must be non-mock and LLM_API_KEY must be set. Use --allow-mock only for local development checks.',
  }, true);
} else {
  try {
    const result = await generateSocraticStep({
      question: {
        id: 'ai-provider-check',
        originalText: '求二次函数 y = x² - 4x + 3 的顶点坐标。',
        ocrText: null,
      },
      profile: {
        grade: '初二',
        gradeStage: 'junior',
      },
    });

    const actuallyMock = result.meta.provider === 'mock';
    const hasUsableStep = Boolean(result.step?.type && result.step?.title && result.step?.content);
    const ok = hasUsableStep && (allowMock || !actuallyMock);

    finish({
      ok,
      provider: result.meta.provider,
      model: result.meta.model,
      llmReady,
      promptVersion: result.meta.promptVersion,
      latencyMs: result.meta.latencyMs,
      totalMs: Date.now() - startedAt,
      inputTokens: result.meta.inputTokens,
      outputTokens: result.meta.outputTokens,
      stepType: result.step?.type,
      title: result.step?.title,
      message: ok
        ? (llmReady ? 'AI provider check passed.' : 'AI provider check passed. Set LLM_READY=true only after eval:ai and manual review also pass.')
        : 'AI provider check returned mock or an invalid step.',
    }, !ok);
  } catch (error) {
    finish({
      ok: false,
      provider,
      model,
      llmReady,
      totalMs: Date.now() - startedAt,
      message: error.message,
    }, true);
  }
}
