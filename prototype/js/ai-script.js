// ===== 模拟"苏格拉底式启发答疑"对话脚本 =====
// 原型阶段不接真 AI,用预设脚本模拟分步引导。
// 后续阶段 2 接入大模型后,只需替换此文件中的 nextStep() 即可。

// 一道演示题(可换):
// "已知二次函数 y = x² - 4x + 3,求该抛物线顶点坐标。"
const DEMO_QUESTION = {
  id: 'demo-q1',
  subject: 'math',
  title: '求二次函数 y = x² − 4x + 3 的顶点坐标',
  steps: [
    {
      role: 'ai',
      type: 'analysis',
      title: '题目分析',
      content: '这是一道关于二次函数图像性质的题目。我们要找的是抛物线的"顶点"——它对应函数取最值的位置。',
    },
    {
      role: 'ai',
      type: 'knowledge',
      title: '涉及知识点',
      content: '二次函数一般式 y = ax² + bx + c 与顶点式 y = a(x − h)² + k 的转换。',
    },
    {
      role: 'ai',
      type: 'hint',
      title: '提示 1 / 3',
      content: '别急,我先不告诉你答案。你回忆一下:二次函数的"顶点"在数学上是怎么定义的?你能想到几种求它的方法?',
      options: ['配方法', '顶点公式 x = −b/(2a)', '求导', '我忘了'],
    },
    {
      role: 'user',
      type: 'choice',
      content: '配方法',
    },
    {
      role: 'ai',
      type: 'hint',
      title: '提示 2 / 3',
      content: '很好,配方法是基础。试着把 x² − 4x + 3 配成 (x − h)² + k 的形式。提示:把 −4x 看作"−2·x·2",那 h 应该等于多少?',
      options: ['h = 2', 'h = −2', 'h = 4', '不确定'],
    },
    {
      role: 'user',
      type: 'choice',
      content: 'h = 2',
    },
    {
      role: 'ai',
      type: 'hint',
      title: '提示 3 / 3',
      content: '答对了!配方时要补一个 2² = 4,然后再减回去保持等式成立:\n\nx² − 4x + 3 = (x − 2)² − 4 + 3 = (x − 2)² − 1\n\n那顶点坐标应该是?',
      options: ['(2, −1)', '(−2, 1)', '(2, 1)', '(−2, −1)'],
    },
    {
      role: 'user',
      type: 'choice',
      content: '(2, −1)',
    },
    {
      role: 'ai',
      type: 'solution',
      title: '最终解法',
      content: '完全正确!完整解题过程:\n\n1. 原式:y = x² − 4x + 3\n2. 配方:y = (x² − 4x + 4) − 4 + 3 = (x − 2)² − 1\n3. 顶点式:y = (x − 2)² + (−1)\n4. 所以顶点为 (2, −1) ✓',
    },
    {
      role: 'ai',
      type: 'related',
      title: '举一反三',
      content: '掌握这道题后,你可以试试这些变式:',
      questions: [
        '若 y = x² − 6x + 5,顶点坐标是?',
        '若顶点为 (3, 2) 且过原点,求二次函数解析式',
        '二次函数 y = 2x² + 4x − 1 的最小值是多少?',
      ],
    },
    {
      role: 'ai',
      type: 'finish',
      title: '本题小结',
      content: '本题涉及的核心知识点【配方法求顶点】已加入你的学习档案。如果一周内类似题做对两次,会自动标记为"已掌握"。',
    },
  ],
};

// 状态机:返回下一步
function getNextStep(question, currentIndex) {
  const step = question.steps[currentIndex];
  if (!step) return null;
  return { step, isLast: currentIndex === question.steps.length - 1 };
}
