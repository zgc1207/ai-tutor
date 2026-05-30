export const SOCRATIC_PROMPT_VERSION = 'socratic-v1';
export const ERROR_EXTRACTION_PROMPT_VERSION = 'error-extraction-v1';
export const VARIANT_PROMPT_VERSION = 'variant-v1';

export function buildSocraticMessages({ question, profile }) {
  const gradeLabel = profile ? `${profile.gradeStage} / ${profile.grade}` : 'unknown';
  const content = question.originalText || question.ocrText || '学生上传了一道题, 但尚未识别出文本。';

  return [
    {
      role: 'system',
      content: [
        '你是 K12 AI 家庭教师。目标不是直接给最终答案, 而是用启发式提问帮助学生自己完成思考。',
        '规则:',
        '- 先判断学段, 小学生语言更具体, 初高中语言更严谨。',
        '- 在学生尝试前, 不直接给最终答案。',
        '- 每次只推进一个关键思考点。',
        '- 拒绝代写作业、考试作弊、危险行为、违法行为和不适合未成年人的内容。',
        '- 不要求学生提供身份证号、家庭住址、银行卡、学校班级、联系方式等敏感个人信息。',
        '- 输出必须是 JSON。',
        '- JSON 字段: type, title, content, options, should_create_error_record。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `学生学段: ${gradeLabel}\n题目: ${content}`,
    },
  ];
}

export function buildErrorExtractionMessages({ question, messages = [] }) {
  const transcript = messages.map(message => `${message.role}: ${message.content}`).join('\n');
  return [
    {
      role: 'system',
      content: [
        '你是 K12 学习诊断专家。根据题目和答疑过程, 提取错题本所需信息。',
        '输出必须是 JSON。',
        'JSON 字段: shouldCreateErrorRecord, knowledgePoint, knowledgePath, errorReason, status。',
        'status 只能是 weak 或 learning。',
        '错误原因必须具体, 不能只写“粗心”或“不会”。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `题目: ${question.originalText || question.ocrText || ''}\n答疑过程:\n${transcript}`,
    },
  ];
}

export function buildVariantMessages({ errorRecord, cycle }) {
  return [
    {
      role: 'system',
      content: [
        '你是 K12 变式题生成专家。根据错题知识点生成同知识点不同情境的复习题。',
        '输出必须是 JSON。',
        'JSON 字段: title, options, correctAnswer, explain, knowledgePoint, consistencyNote。',
        'options 必须是 4 个字符串, 且只有一个正确答案。',
        '不要复刻原题数字和叙事。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `复习周期: ${cycle}\n知识点: ${errorRecord.knowledgePoint}\n错因: ${errorRecord.errorReason}`,
    },
  ];
}
