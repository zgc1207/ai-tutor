import React, { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { createApiClient } from './src/api/client.js';
import { chooseQuestionImage, registerReviewPushToken, takeQuestionPhoto } from './src/device/native-features.js';
import { clearSessionState, loadSessionState, saveApiBase, saveSessionToken } from './src/storage/session-store.js';

const h = React.createElement;

const DEMO_DASHBOARD = {
  today: {
    questions: 3,
    mistakes: 1,
    reviews: 4,
  },
};

const POLICY_VERSION = 'internal-test-v1';

const DEMO_REVIEW_TASKS = [
  {
    id: 'demo-review-1',
    knowledgePoint: '一元一次方程',
    cycleLabel: 'D1 今日复习',
    prompt: '先说出移项时为什么要变号。',
  },
  {
    id: 'demo-review-2',
    knowledgePoint: '一般过去时',
    cycleLabel: 'D3 巩固复习',
    prompt: '看到 yesterday 时, 先判断动词要不要变过去式。',
  },
  {
    id: 'demo-review-3',
    knowledgePoint: '压强公式',
    cycleLabel: 'D7 间隔复习',
    prompt: '先写出 P = F / S, 再统一单位。',
  },
];

const DEMO_MISTAKES = [
  {
    id: 'demo-mistake-1',
    knowledgePoint: '一元一次方程',
    status: 'reviewing',
    subject: { name: '数学' },
    errorReason: '移项后没有同步改变符号, 导致未知数系数计算错误。',
  },
];

const DEMO_REPORT = {
  headline: '本周学习稳定, 需要重点复习方程移项和英语时态。',
  summaryText: '本周孩子能坚持完成提问和复习, 但错题集中在“步骤规则”而不是概念完全不会。',
  sourceReport: {
    summary: {
      questionCount: 12,
      newMistakeCount: 3,
      reviewCompletionRate: 0.82,
    },
  },
  parentSummary: {
    topWeakPoint: {
      knowledgePoint: '一元一次方程',
      errorReason: '错因集中在移项和合并同类项。',
    },
    encouragement: '建议家长重点看孩子是否能说清每一步理由, 不需要追求一次做很多题。',
  },
  actionItems: [
    '每天完成 3 道同类方程变式题。',
    '复习时先口头说明每一步为什么变号。',
    '周末回看错题本中同一知识点的记录。',
  ],
};

const DEMO_KNOWLEDGE_TREE = [
  {
    code: 'math',
    name: '数学',
    children: [
      { id: 'math-1', name: '一元一次方程', status: 'red', mistakes: 2, children: [] },
      { id: 'math-2', name: '函数基础', status: 'yellow', mistakes: 1, children: [] },
      { id: 'math-3', name: '勾股定理', status: 'green', mistakes: 0, children: [] },
    ],
  },
  {
    code: 'english',
    name: '英语',
    children: [
      { id: 'english-1', name: '一般过去时', status: 'yellow', mistakes: 1, children: [] },
      { id: 'english-2', name: '宾语从句', status: 'gray', mistakes: 0, children: [] },
    ],
  },
];

const DEMO_ME = {
  user: {
    phone: '13800000000',
    nickname: '体验学生',
    role: 'student',
  },
  profile: {
    grade: '初中',
    gradeStage: 'junior',
    targetSubjects: ['math', 'english', 'physics'],
  },
  accountModel: 'single-student',
  plan: {
    code: 'free',
    dailyQuestions: 50,
    dailyAiSteps: 150,
  },
  quota: {
    questionCount: 3,
    aiStepCount: 8,
    questionLimit: 50,
    aiStepLimit: 150,
  },
};

const DEMO_SAMPLE_QUESTIONS = [
  {
    label: '数学方程',
    text: '解方程: 3x - 5 = 10。请引导我一步步分析, 不要直接给最终答案。',
  },
  {
    label: '英语时态',
    text: 'I ____ to school yesterday. A. go B. went C. goes。请先提示我判断时间状语。',
  },
  {
    label: '物理压强',
    text: '一个物体重 20N, 与桌面的接触面积是 0.01m², 求压强。请引导我列公式。',
  },
];

const API_PRESETS = [
  {
    label: 'iOS 模拟器',
    value: 'http://127.0.0.1:3000',
    hint: '适合 iOS Simulator 或本机 Web 调试',
  },
  {
    label: 'Android 模拟器',
    value: 'http://10.0.2.2:3000',
    hint: '适合 Android Emulator 访问宿主机后端',
  },
];

const FEEDBACK_CATEGORIES = [
  { label: '问题反馈', value: 'bug' },
  { label: 'AI 质量', value: 'ai_quality' },
  { label: '体验建议', value: 'ux' },
  { label: '内容安全', value: 'content' },
  { label: '其他', value: 'other' },
];

const LEGAL_DOCS = {
  terms: {
    title: '用户协议',
    version: POLICY_VERSION,
    items: [
      'AI 家庭教师提供拍照/文本提问、启发式答疑、错题整理、复习任务和学习报告等学习辅助服务。',
      '一个登录用户只对应一个学生, 学习数据按账号隔离, 不提供多学生切换。',
      'AI 输出不能替代学校教学、教师判断、考试官方答案或监护人的教育决策。',
      '不得使用本产品代写作业、考试作弊、上传违法内容或上传他人个人信息。',
      '内测阶段可通过产品内反馈入口提交账号、内容、隐私和未成年人保护问题。',
    ],
  },
  privacy: {
    title: '隐私政策',
    version: POLICY_VERSION,
    items: [
      '我们只收集学习辅导、错题复习、账号安全、服务改进和合规要求所必需的信息。',
      '可能处理手机号、学生年级、文本/图片题目、OCR 文本、AI 对话、错题、复习任务、反馈和设备推送 token。',
      '相机、相册和通知权限只在对应功能触发时申请; 拒绝非必要权限后仍可使用文本提问。',
      '账号数据可在“我的”页导出摘要, 也可通过二次确认注销账号并删除关联学习数据。',
      '题目图片、AI 日志、验证码、会话和通知记录按服务端配置的保存期限清理。',
    ],
  },
  minor: {
    title: '未成年人使用说明',
    version: POLICY_VERSION,
    items: [
      '未成年人应在父母或其他监护人同意和指导下使用本产品。',
      '不要输入身份证号、家庭住址、学校班级、联系方式、银行卡等敏感信息。',
      '不要要求 AI 直接代写作业、考试作弊或绕过老师要求。',
      'AI 可能讲错, 遇到不确定内容应询问老师、家长或查教材。',
      '监护人应关注使用时长、错题复习、内容安全和付费异常。',
    ],
  },
};

function Button({ label, onPress, secondary = false }) {
  return h(
    TouchableOpacity,
    { style: [styles.button, secondary && styles.buttonSecondary], onPress },
    h(Text, { style: [styles.buttonText, secondary && styles.buttonSecondaryText] }, label),
  );
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry = false, multiline = false }) {
  return h(
    View,
    { style: styles.field },
    h(Text, { style: styles.label }, label),
    h(TextInput, {
      style: [styles.input, multiline && styles.textarea],
      value,
      onChangeText,
      placeholder,
      secureTextEntry,
      multiline,
      textAlignVertical: multiline ? 'top' : 'center',
      autoCapitalize: 'none',
    }),
  );
}

function Metric({ label, value }) {
  return h(
    View,
    { style: styles.metric },
    h(Text, { style: styles.metricValue }, String(value ?? '--')),
    h(Text, { style: styles.metricLabel }, label),
  );
}

function QuickCard({ title, body, action, onPress }) {
  return h(
    TouchableOpacity,
    { style: styles.quickCard, onPress },
    h(Text, { style: styles.quickTitle }, title),
    h(Text, { style: styles.quickBody }, body),
    h(Text, { style: styles.quickAction }, action),
  );
}

function StatusPill({ label, tone = 'neutral' }) {
  return h(
    Text,
    { style: [styles.statusPill, styles[`statusPill_${tone}`]] },
    label,
  );
}

function ApiPresetButton({ preset, onSelect }) {
  return h(
    TouchableOpacity,
    { style: styles.apiPreset, onPress: () => onSelect(preset) },
    h(Text, { style: styles.apiPresetText }, preset.label),
  );
}

function SegmentedOption({ label, selected, onPress }) {
  return h(
    TouchableOpacity,
    { style: [styles.segmentOption, selected && styles.segmentOptionActive], onPress },
    h(Text, { style: [styles.segmentOptionText, selected && styles.segmentOptionTextActive] }, label),
  );
}

export default function App() {
  const [apiBase, setApiBase] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [status, setStatus] = useState('配置后端 API 后开始内测登录');
  const [demoMode, setDemoMode] = useState(false);
  const [tab, setTab] = useState('home');
  const [dashboard, setDashboard] = useState(null);
  const [reviewTasks, setReviewTasks] = useState([]);
  const [questionText, setQuestionText] = useState('');
  const [answer, setAnswer] = useState('');
  const [currentQuestionId, setCurrentQuestionId] = useState('');
  const [answerMessages, setAnswerMessages] = useState([]);
  const [imageStatus, setImageStatus] = useState('');
  const [pushStatus, setPushStatus] = useState('未注册');
  const [mistakes, setMistakes] = useState([]);
  const [report, setReport] = useState(null);
  const [plans, setPlans] = useState([]);
  const [billingStatus, setBillingStatus] = useState(null);
  const [knowledgeTree, setKnowledgeTree] = useState([]);
  const [demoPlusActive, setDemoPlusActive] = useState(false);
  const [meInfo, setMeInfo] = useState(null);
  const [runtimeCheck, setRuntimeCheck] = useState(null);
  const [feedbackCategory, setFeedbackCategory] = useState('bug');
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackContent, setFeedbackContent] = useState('');
  const [accountExportSummary, setAccountExportSummary] = useState(null);
  const [deleteConfirmArmed, setDeleteConfirmArmed] = useState(false);
  const [selectedLegalDoc, setSelectedLegalDoc] = useState(null);

  const api = useMemo(
    () => createApiClient({ baseUrl: apiBase, sessionToken, onSessionToken: setSessionToken }),
    [apiBase, sessionToken],
  );

  useEffect(() => {
    let mounted = true;
    loadSessionState()
      .then(saved => {
        if (!mounted) return;
        setApiBase(saved.apiBase);
        setSessionToken(saved.sessionToken);
        if (saved.sessionToken) setStatus('已恢复登录态');
      })
      .catch(error => setStatus(`读取本地登录态失败: ${error.message}`));
    return () => {
      mounted = false;
    };
  }, []);

  async function run(label, action) {
    setStatus(`${label}中...`);
    try {
      const result = await action();
      setStatus(`${label}成功`);
      return result;
    } catch (error) {
      setStatus(`${label}失败: ${error.message}`);
      return null;
    }
  }

  async function requestOtp() {
    if (!consentAccepted) {
      setStatus('请先勾选同意用户协议、隐私政策和未成年人使用说明');
      return;
    }
    await run('发送验证码', () => api.requestOtp({ phone, inviteCode }));
  }

  function enterDemoMode() {
    setDemoMode(true);
    setSessionToken('');
    setDashboard(DEMO_DASHBOARD);
    setReviewTasks(DEMO_REVIEW_TASKS);
    setMistakes(DEMO_MISTAKES);
    setReport(DEMO_REPORT);
    setKnowledgeTree(DEMO_KNOWLEDGE_TREE);
    setPlans([{
      code: 'plus',
      name: 'Plus',
      priceCentsMonthly: 2900,
      limits: { dailyQuestions: 200, dailyAiSteps: 600 },
    }]);
    setBillingStatus({ activeSubscription: null, recentOrders: [] });
    setMeInfo(DEMO_ME);
    setRuntimeCheck({
      health: 'ok',
      ready: 'demo',
      detail: '体验演示不连接真实后端',
    });
    setTab('home');
    setStatus('已进入体验演示: 不需要后端, 可先查看核心学习闭环');
  }

  function loadDemoQuestion(sample) {
    setQuestionText(sample.text);
    setTab('ask');
    setStatus(`已填入示例题: ${sample.label}`);
  }

  async function useApiPreset(preset) {
    setApiBase(preset.value);
    await saveApiBase(preset.value);
    setStatus(`已选择 ${preset.label}: ${preset.hint}`);
  }

  function openLegalDoc(key) {
    setSelectedLegalDoc(key);
    setStatus(`正在查看${LEGAL_DOCS[key].title}`);
  }

  async function login() {
    if (!consentAccepted) {
      setStatus('请先勾选同意用户协议、隐私政策和未成年人使用说明');
      return;
    }
    await saveApiBase(apiBase);
    const result = await run('登录', () => api.loginWithOtp({
      phone,
      code: otpCode,
      inviteCode,
      consentAccepted,
      policyVersion: POLICY_VERSION,
    }));
    if (result?.sessionToken) await saveSessionToken(result.sessionToken);
    setTab('home');
  }

  async function loadHome() {
    if (demoMode) {
      setDashboard(DEMO_DASHBOARD);
      setStatus('演示首页已刷新');
      return;
    }
    const data = await run('刷新首页', () => api.getDashboard());
    if (data) setDashboard(data);
  }

  async function loadReview() {
    if (demoMode) {
      setReviewTasks(DEMO_REVIEW_TASKS);
      setStatus('演示复习任务已加载');
      return;
    }
    const data = await run('加载复习', () => api.getReviewTasks());
    if (data) setReviewTasks(data.tasks || data || []);
  }

  async function loadMistakes() {
    if (demoMode) {
      setMistakes(DEMO_MISTAKES);
      setStatus('演示错题本已刷新');
      return;
    }
    const data = await run('加载错题本', () => api.getMistakes());
    if (data) setMistakes(data || []);
  }

  async function loadReport() {
    if (demoMode) {
      setReport(DEMO_REPORT);
      setStatus('演示周报已刷新');
      return;
    }
    const data = await run('加载学习报告', () => api.getParentWeeklyReport());
    if (data) setReport(data);
  }

  async function loadPlans() {
    if (demoMode) {
      setPlans([{
        code: 'plus',
        name: 'Plus',
        priceCentsMonthly: 2900,
        limits: { dailyQuestions: 200, dailyAiSteps: 600 },
      }]);
      setBillingStatus({ activeSubscription: null, recentOrders: [] });
      setStatus('演示套餐已刷新');
      return;
    }
    const planData = await run('加载套餐', () => api.getPlans());
    const billingData = await run('加载订阅状态', () => api.getBillingStatus());
    if (planData?.plans) setPlans(planData.plans);
    if (billingData) setBillingStatus(billingData);
  }

  async function loadKnowledgeTree() {
    if (demoMode) {
      setKnowledgeTree(DEMO_KNOWLEDGE_TREE);
      setStatus('演示知识图谱已刷新');
      return;
    }
    const data = await run('加载知识图谱', () => api.getKnowledgeTree({ subject: 'all' }));
    if (data?.subjects) setKnowledgeTree(data.subjects);
  }

  async function answerReviewTask(task, correct) {
    const taskTitle = task.errorRecord?.knowledgePoint || task.knowledgePoint || '复习任务';
    if (demoMode) {
      if (correct) {
        setReviewTasks(tasks => tasks.filter(item => item.id !== task.id));
        setMistakes(items => items.map(item => (
          item.knowledgePoint === taskTitle ? { ...item, status: 'mastered' } : item
        )));
        setDashboard(current => ({
          ...(current || DEMO_DASHBOARD),
          today: {
            ...((current || DEMO_DASHBOARD).today || {}),
            reviews: Math.max(((current || DEMO_DASHBOARD).today?.reviews || 1) - 1, 0),
          },
        }));
        setStatus(`演示: ${taskTitle} 已答对, 今日复习任务减少 1 个`);
        return;
      }

      setReviewTasks(tasks => tasks.map(item => (
        item.id === task.id
          ? { ...item, cycleLabel: 'D1 重新复习', prompt: '仍不熟, 明天先从错因重新讲一遍。' }
          : item
      )));
      setMistakes(items => {
        const exists = items.some(item => item.knowledgePoint === taskTitle);
        if (exists) return items.map(item => (
          item.knowledgePoint === taskTitle
            ? { ...item, status: 'reviewing', errorReason: '复习时仍不稳定, 已重置为 D1 复习。' }
            : item
        ));
        return [{
          id: `demo-mistake-${Date.now()}`,
          knowledgePoint: taskTitle,
          status: 'reviewing',
          subject: { name: '复习' },
          errorReason: '复习时仍不稳定, 已重置为 D1 复习。',
        }].concat(items);
      });
      setStatus(`演示: ${taskTitle} 仍不会, 已重置复习节奏`);
      return;
    }

    const result = await run(correct ? '提交答对结果' : '提交仍不会结果', () => (
      api.answerReviewTask(task.id, { answer: getReviewTaskAnswer(task, correct) })
    ));
    if (result) await loadReview();
  }

  function openReviewForMistake(record) {
    const knowledgePoint = record.knowledgePoint || record.knowledgeNode?.name || '错题知识点';
    const matchedTask = reviewTasks.find(task => (
      (task.errorRecord?.knowledgePoint || task.knowledgePoint) === knowledgePoint
    ));
    setTab('review');
    setStatus(matchedTask
      ? `已定位 ${knowledgePoint} 的复习任务`
      : `${knowledgePoint} 暂无今日复习任务`);
  }

  function openKnowledgeAction(node) {
    const hasMistake = (node.mistakes || 0) > 0 || node.status === 'red' || node.status === 'yellow';
    setTab(hasMistake ? 'mistakes' : 'review');
    setStatus(hasMistake
      ? `已跳到错题本, 查看 ${node.name} 的相关错因`
      : `${node.name} 暂无明显错题, 可继续查看复习计划`);
  }

  function appendAnswerMessage(step) {
    setAnswerMessages(messages => messages.concat({
      id: step.messageId || `${Date.now()}`,
      type: step.type || step.messageType || 'guide',
      title: step.title || '下一步提示',
      content: step.message?.content || step.content || '继续观察题目条件',
    }));
  }

  function getReviewTaskAnswer(task, correct) {
    const correctAnswer = task.variantQuestion?.correctAnswer;
    if (correct && correctAnswer) return correctAnswer;
    if (correct) return '我已答对';
    return '__mobile_review_wrong_answer__';
  }

  async function ask() {
    if (!questionText.trim()) {
      setStatus('请输入题目');
      return;
    }
    if (demoMode) {
      const demoQuestionId = `demo-question-${Date.now()}`;
      setCurrentQuestionId(demoQuestionId);
      setAnswerMessages([
        {
          id: `question-${demoQuestionId}`,
          type: 'question',
          title: '原题',
          content: questionText,
        },
        {
          id: `guide-${demoQuestionId}`,
          type: 'guide',
          title: '第 1 步提示',
          content: '先圈出题目中的已知条件, 再判断它考的是哪个知识点。不要急着算最终答案。',
        },
      ]);
      setAnswer('演示引导已生成');
      setStatus('演示题目已提交: 可以继续点下一步提示或加入错题');
      return;
    }
    const question = await run('提交题目', () => api.createQuestion({ text: questionText }));
    if (!question?.id) return;
    setCurrentQuestionId(question.id);
    setAnswerMessages([{
      id: `question-${question.id}`,
      type: 'question',
      title: '原题',
      content: questionText,
    }]);
    const next = await run('获取引导', () => api.nextAnswer(question.id));
    if (next) appendAnswerMessage(next);
    setAnswer(next?.message?.content || next?.content || '已提交, 等待下一步引导');
  }

  async function getNextGuide() {
    if (!currentQuestionId) {
      setStatus('请先提交一道题');
      return;
    }
    if (demoMode) {
      appendAnswerMessage({
        messageId: `demo-guide-${Date.now()}`,
        type: 'guide',
        title: `第 ${answerMessages.length} 步提示`,
        content: answerMessages.length % 2
          ? '把未知数相关的项移到等号一边, 常数项移到另一边, 每次移项都检查符号。'
          : '最后把系数化为 1, 再代回原式检查是否成立。',
      });
      setStatus('演示下一步提示已生成');
      return;
    }
    const next = await run('获取下一步引导', () => api.nextAnswer(currentQuestionId));
    if (next) appendAnswerMessage(next);
    setAnswer(next?.message?.content || next?.content || answer);
  }

  async function finishCurrentQuestion({ solvedIndependently = false } = {}) {
    if (!currentQuestionId) {
      setStatus('请先提交一道题');
      return;
    }
    if (demoMode) {
      if (solvedIndependently) {
        setStatus('演示: 已标记为独立解决, 不加入错题');
        return;
      }
      const newMistake = {
        id: `demo-mistake-${Date.now()}`,
        knowledgePoint: '演示知识点',
        status: 'reviewing',
        subject: { name: '数学' },
        errorReason: '已加入错题本, 后续会按 D1/D3/D7/D15 安排复习。',
      };
      setMistakes(items => [newMistake].concat(items));
      setReviewTasks(items => [{
        id: `demo-review-${Date.now()}`,
        knowledgePoint: newMistake.knowledgePoint,
        cycleLabel: 'D1 今日复习',
      }].concat(items));
      setStatus('演示: 已加入错题本并生成今日复习任务');
      return;
    }
    const result = await run(
      solvedIndependently ? '标记已掌握' : '加入错题复习',
      () => api.finishQuestion(currentQuestionId, {
        solvedIndependently,
        forceCreateErrorRecord: !solvedIndependently,
      }),
    );
    if (result?.createdErrorRecord || result?.errorRecord) {
      setStatus('已加入错题本并生成复习任务');
    }
  }

  async function askWithImage(source) {
    if (demoMode) {
      const demoText = source === 'camera'
        ? '拍照识题演示: 解方程 3x - 5 = 10'
        : '相册识题演示: The boy went to school yesterday.';
      setQuestionText(demoText);
      setImageStatus('演示模式已模拟图片识别结果');
      setStatus('演示图片题已识别, 可以点击获取启发式引导');
      return;
    }
    const picker = source === 'camera' ? takeQuestionPhoto : chooseQuestionImage;
    setImageStatus(source === 'camera' ? '打开相机...' : '打开相册...');
    const picked = await run(source === 'camera' ? '获取照片' : '选择图片', picker);
    if (!picked) {
      setImageStatus('未选择图片');
      return;
    }

    const uploaded = await run('上传图片', () => api.uploadImage({
      imageData: picked.imageData,
      contentType: picked.contentType,
    }));
    if (!uploaded?.imageUrl) return;

    const ocr = await run('识别题目', () => api.extractOcr({
      imageUrl: uploaded.imageUrl,
      imageData: picked.imageData,
    }));
    if (!ocr?.text) return;

    setQuestionText(ocr.text);
    setImageStatus(`已识别: ${ocr.text.slice(0, 40)}`);
    const question = await run('提交图片题目', () => api.createImageQuestion({
      imageUrl: uploaded.imageUrl,
      ocrText: ocr.text,
    }));
    if (!question?.id) return;
    setCurrentQuestionId(question.id);
    setAnswerMessages([{
      id: `question-${question.id}`,
      type: 'image-question',
      title: '图片识别题目',
      content: ocr.text,
    }]);
    const next = await run('获取图片题引导', () => api.nextAnswer(question.id));
    if (next) appendAnswerMessage(next);
    setAnswer(next?.message?.content || next?.content || '图片题目已提交');
  }

  async function enableReviewPush() {
    if (demoMode) {
      setPushStatus('demo / expo');
      setStatus('演示: 复习提醒已开启');
      return;
    }
    const result = await run('注册复习提醒', () => registerReviewPushToken({ api }));
    if (result?.device) {
      setPushStatus(`${result.device.provider} / ${result.device.platform}`);
    }
  }

  async function loadMeInfo() {
    if (demoMode) {
      setMeInfo(DEMO_ME);
      setStatus('演示账号信息已刷新');
      return;
    }
    const data = await run('刷新账号信息', () => api.getMe());
    if (data) setMeInfo(data);
  }

  async function checkApiRuntime() {
    if (demoMode) {
      setRuntimeCheck({
        health: 'ok',
        ready: 'demo',
        detail: '体验演示不连接真实后端',
      });
      setStatus('演示后端状态已检查');
      return;
    }

    setRuntimeCheck({ health: 'checking', ready: 'checking', detail: '正在检查后端 /health 和 /ready' });
    const health = await run('检查后端健康', () => api.getHealth());
    if (!health) {
      setRuntimeCheck({ health: 'failed', ready: 'skipped', detail: '无法访问 /health, 请检查 API 地址和网络' });
      return;
    }

    const ready = await run('检查后端就绪', () => api.getReady());
    setRuntimeCheck({
      health: health.ok ? 'ok' : 'failed',
      ready: ready?.ok ? 'ok' : 'failed',
      detail: ready?.ok
        ? '后端和数据库已就绪'
        : '后端可访问, 但 /ready 未通过, 请检查数据库或环境变量',
    });
  }

  async function submitFeedback() {
    const content = feedbackContent.trim();
    if (content.length < 2) {
      setStatus('请先填写至少 2 个字的反馈内容');
      return;
    }
    if (demoMode) {
      setFeedbackContent('');
      setStatus('演示: 反馈已记录, 真实版本会提交到运营后台');
      return;
    }
    const result = await run('提交反馈', () => api.submitFeedback({
      rating: feedbackRating,
      category: feedbackCategory,
      content,
      page: tab,
    }));
    if (result?.id) {
      setFeedbackContent('');
      setStatus('反馈已提交, 内测问题会进入运营后台跟进');
    }
  }

  async function exportAccountData() {
    if (demoMode) {
      setAccountExportSummary({
        questions: DEMO_DASHBOARD.today.questions,
        mistakes: DEMO_MISTAKES.length,
        feedback: feedbackContent.trim() ? 1 : 0,
      });
      setStatus('演示: 已生成账号数据导出摘要');
      return;
    }
    const data = await run('导出账号数据', () => api.exportAccount());
    if (!data?.account) return;
    setAccountExportSummary({
      questions: data.account.questions?.length || 0,
      mistakes: data.account.errorRecords?.length || 0,
      feedback: data.account.feedback?.length || 0,
      exportedAt: data.exportedAt,
    });
  }

  async function requestAccountDeletion() {
    if (!deleteConfirmArmed) {
      setDeleteConfirmArmed(true);
      setStatus('再次点击“确认注销账号”会删除当前账号及学习数据');
      return;
    }

    if (demoMode) {
      setDeleteConfirmArmed(false);
      await logout();
      setStatus('演示: 已模拟注销账号并清空本地体验状态');
      return;
    }

    const result = await run('注销账号', () => api.deleteAccount());
    if (result?.deleted) {
      setDeleteConfirmArmed(false);
      await logout();
      setStatus('账号已注销, 当前设备登录态已清除');
    }
  }

  async function checkoutPlus() {
    if (demoMode) {
      setDemoPlusActive(true);
      setBillingStatus({
        activeSubscription: {
          planCode: 'plus',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        recentOrders: [{ id: 'demo-order-1', status: 'paid', amountCents: 2900 }],
      });
      setStatus('演示: 已开通 Plus, 真实版本会接入 IAP 或渠道支付');
      return;
    }
    const result = await run('创建订阅订单', () => api.createCheckout({ planCode: 'plus' }));
    if (result?.checkoutUrl) {
      await Linking.openURL(result.checkoutUrl);
      setStatus('已打开支付页面, 完成后回到 App 刷新订阅状态');
    }
  }

  async function cancelPlus() {
    if (demoMode) {
      setDemoPlusActive(false);
      setBillingStatus({ activeSubscription: null, recentOrders: [] });
      setStatus('演示: 已模拟取消自动续订');
      return;
    }
    const result = await run('取消自动续订', () => api.cancelSubscription({ cancelAtPeriodEnd: true }));
    if (result?.subscription) setBillingStatus({ ...billingStatus, activeSubscription: result.subscription });
  }

  async function logout() {
    await clearSessionState();
    setDemoMode(false);
    setSessionToken('');
    setDashboard(null);
    setReviewTasks([]);
    setAnswer('');
    setCurrentQuestionId('');
    setAnswerMessages([]);
    setMistakes([]);
    setReport(null);
    setBillingStatus(null);
    setDemoPlusActive(false);
    setMeInfo(null);
    setRuntimeCheck(null);
    setAccountExportSummary(null);
    setDeleteConfirmArmed(false);
    setKnowledgeTree([]);
    setStatus('已退出当前账号');
  }

  function renderLegalLinks() {
    return h(View, { style: styles.legalLinks }, [
      h(Button, { key: 'terms', label: '用户协议', onPress: () => openLegalDoc('terms'), secondary: true }),
      h(Button, { key: 'privacy', label: '隐私政策', onPress: () => openLegalDoc('privacy'), secondary: true }),
      h(Button, { key: 'minor', label: '未成年人说明', onPress: () => openLegalDoc('minor'), secondary: true }),
    ]);
  }

  function renderLegalDoc() {
    const doc = LEGAL_DOCS[selectedLegalDoc] || LEGAL_DOCS.terms;
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, doc.title),
      h(Text, { style: styles.subtitle }, `内测版本 ${doc.version}, 上线前需经法务审核确认。`),
      doc.items.map((item, index) => h(
        View,
        { key: `${doc.title}-${index}`, style: styles.legalItem },
        h(Text, { style: styles.actionIndex }, String(index + 1)),
        h(Text, { style: styles.actionText }, item),
      )),
      h(Button, { label: '返回', onPress: () => setSelectedLegalDoc(null), secondary: true }),
    );
  }

  function renderLogin() {
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, 'AI 家庭教师'),
      h(Text, { style: styles.subtitle }, '一个账号对应一个学生档案, 数据只跟随当前登录账号'),
      h(Field, { label: '后端 API', value: apiBase, onChangeText: setApiBase, placeholder: 'https://api.example.com' }),
      h(View, { style: styles.apiPresetRow }, API_PRESETS.map(preset => h(
        ApiPresetButton,
        { key: preset.label, preset, onSelect: useApiPreset },
      ))),
      h(Text, { style: styles.hint }, '真机 Expo Go 不能用 localhost, 请运行 npm run api:local 后填入局域网地址。'),
      h(Field, { label: '手机号', value: phone, onChangeText: setPhone, placeholder: '内测手机号' }),
      h(Field, { label: '邀请码', value: inviteCode, onChangeText: setInviteCode, placeholder: '可选' }),
      h(TouchableOpacity, {
        style: styles.consentBox,
        onPress: () => setConsentAccepted(value => !value),
      }, [
        h(Text, { key: 'mark', style: [styles.consentMark, consentAccepted && styles.consentMarkActive] }, consentAccepted ? '✓' : ''),
        h(View, { key: 'copy', style: styles.consentCopy },
          h(Text, { style: styles.consentTitle }, '我已阅读并同意内测协议'),
          h(Text, { style: styles.bodyText }, `同意用户协议、隐私政策和未成年人使用说明, 版本 ${POLICY_VERSION}。AI 仅作学习辅助, 不替代教师、教材或官方答案。`),
        ),
      ]),
      renderLegalLinks(),
      h(Button, { label: '发送验证码', onPress: requestOtp, secondary: true }),
      h(Field, { label: '验证码', value: otpCode, onChangeText: setOtpCode, placeholder: '6 位验证码' }),
      h(Button, { label: '登录', onPress: login }),
      h(View, { style: styles.demoPanel },
        h(Text, { style: styles.listTitle }, '先看产品体验'),
        h(Text, { style: styles.bodyText }, '不用配置后端, 直接进入演示数据, 查看首页、提问、错题、复习、报告和知识图谱。'),
        h(Button, { label: '进入体验演示', onPress: enterDemoMode, secondary: true }),
      ),
    );
  }

  function renderHome() {
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '今日学习'),
      demoMode ? h(Text, { style: styles.demoBadge }, '体验演示') : null,
      h(Text, { style: styles.subtitle }, '先提问, 再根据引导完成思考; 做错的题会进入错题本和复习计划。'),
      h(View, { style: styles.metrics }, [
        h(Metric, { key: 'questions', label: '提问', value: dashboard?.today?.questions || dashboard?.questionCount || 0 }),
        h(Metric, { key: 'mistakes', label: '错题', value: dashboard?.today?.mistakes || dashboard?.mistakeCount || 0 }),
        h(Metric, { key: 'reviews', label: '复习', value: dashboard?.today?.reviews || dashboard?.reviewCount || 0 }),
      ]),
      h(View, { style: styles.quickGrid }, [
        h(QuickCard, {
          key: 'ask',
          title: '开始一道题',
          body: '输入题目或模拟拍照识别, 看 AI 如何一步步提示。',
          action: '去提问',
          onPress: () => setTab('ask'),
        }),
        h(QuickCard, {
          key: 'review',
          title: '今日复习',
          body: `${reviewTasks.length || 0} 个任务等待巩固, 按间隔复习推进掌握。`,
          action: '看复习',
          onPress: () => setTab('review'),
        }),
      ]),
      h(Button, { label: '刷新学习概览', onPress: loadHome, secondary: true }),
      h(View, { style: styles.highlight },
        h(Text, { style: styles.listTitle }, '核心流程'),
        h(Text, { style: styles.bodyText }, '提问获得启发式引导, 仍不会直接泄露答案; 做错后加入错题本, 自动生成间隔复习任务。'),
      ),
    );
  }

  function renderAsk() {
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '文字提问'),
      demoMode ? h(Text, { style: styles.demoBadge }, '演示模式: 可输入任意题目测试流程') : null,
      demoMode ? h(View, { style: styles.sampleRow }, DEMO_SAMPLE_QUESTIONS.map(sample => h(
        TouchableOpacity,
        { key: sample.label, style: styles.sampleChip, onPress: () => loadDemoQuestion(sample) },
        h(Text, { style: styles.sampleChipText }, sample.label),
      ))) : null,
      h(Field, {
        label: '题目',
        value: questionText,
        onChangeText: setQuestionText,
        placeholder: '输入一道数学、物理、英语或语文题',
        multiline: true,
      }),
      h(View, { style: styles.actionRow }, [
        h(Button, { key: 'camera', label: '拍照识题', onPress: () => askWithImage('camera'), secondary: true }),
        h(Button, { key: 'library', label: '相册识题', onPress: () => askWithImage('library'), secondary: true }),
      ]),
      imageStatus ? h(Text, { style: styles.hint }, imageStatus) : null,
      h(Button, { label: '获取启发式引导', onPress: ask }),
      currentQuestionId ? h(View, { style: styles.flowPanel }, [
        h(Text, { key: 'flow-title', style: styles.listTitle }, '当前流程'),
        h(Text, { key: 'flow-1', style: styles.flowStep }, '1. 已记录题目'),
        h(Text, { key: 'flow-2', style: styles.flowStep }, `2. 已生成 ${Math.max(answerMessages.length - 1, 0)} 条引导`),
        h(Text, { key: 'flow-3', style: styles.flowStep }, '3. 可继续提示, 或加入错题生成复习'),
      ]) : null,
      currentQuestionId ? h(View, { style: styles.actionRow }, [
        h(Button, { key: 'next', label: '下一步提示', onPress: getNextGuide, secondary: true }),
        h(Button, { key: 'mistake', label: '加入错题', onPress: () => finishCurrentQuestion({ solvedIndependently: false }), secondary: true }),
      ]) : null,
      currentQuestionId ? h(Button, { label: '我已独立解决', onPress: () => finishCurrentQuestion({ solvedIndependently: true }), secondary: true }) : null,
      answerMessages.length
        ? answerMessages.map(message => h(
            View,
            { key: message.id, style: [styles.messageBubble, message.type === 'question' || message.type === 'image-question' ? styles.messageQuestion : null] },
            h(Text, { style: styles.listTitle }, message.title),
            h(Text, { style: styles.bodyText }, message.content),
          ))
        : answer ? h(Text, { style: styles.answer }, answer) : null,
    );
  }

  function renderReview() {
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '今日复习'),
      h(Text, { style: styles.subtitle }, '答对会推进掌握状态; 仍不会会回到 D1 重新复习。'),
      h(Button, { label: '加载复习任务', onPress: loadReview, secondary: true }),
      reviewTasks.length
        ? reviewTasks.map(task => h(
            View,
            { key: task.id, style: styles.listItem },
            h(Text, { style: styles.listTitle }, task.errorRecord?.knowledgePoint || task.knowledgePoint || '复习任务'),
            h(Text, { style: styles.listMeta }, task.cycle || task.cycleLabel || '待复习'),
            task.prompt ? h(Text, { style: styles.bodyText }, task.prompt) : null,
            task.variantQuestion?.title ? h(Text, { style: styles.bodyText }, task.variantQuestion.title) : null,
            Array.isArray(task.variantQuestion?.options) && task.variantQuestion.options.length
              ? h(Text, { style: styles.listMeta }, `选项: ${task.variantQuestion.options.join(' / ')}`)
              : null,
            h(View, { style: styles.actionRow }, [
              h(Button, { key: 'correct', label: '答对', onPress: () => answerReviewTask(task, true), secondary: true }),
              h(Button, { key: 'wrong', label: '仍不会', onPress: () => answerReviewTask(task, false), secondary: true }),
            ]),
          ))
        : h(Text, { style: styles.empty }, '暂无待复习任务'),
    );
  }

  function renderMistakes() {
    const statusLabel = {
      reviewing: '复习中',
      mastered: '已掌握',
      open: '待处理',
    };
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '错题本'),
      h(Text, { style: styles.subtitle }, '只展示当前登录账号对应学生的错题, 可从错题直接进入复习。'),
      h(Button, { label: '刷新错题', onPress: loadMistakes, secondary: true }),
      mistakes.length
        ? mistakes.slice(0, 20).map(record => {
            const knowledgePoint = record.knowledgePoint || record.knowledgeNode?.name || '错题知识点';
            const hasReviewTask = reviewTasks.some(task => (
              (task.errorRecord?.knowledgePoint || task.knowledgePoint) === knowledgePoint
            ));
            const mastered = record.status === 'mastered';
            return h(
              View,
              { key: record.id, style: styles.listItem },
              h(View, { style: styles.listHeader }, [
                h(Text, { key: 'title', style: styles.listTitle }, knowledgePoint),
                h(StatusPill, {
                  key: 'status',
                  label: statusLabel[record.status] || record.status || '待复习',
                  tone: mastered ? 'success' : 'warning',
                }),
              ]),
              h(Text, { style: styles.listMeta }, `${record.subject?.name || '--'} · ${hasReviewTask ? '今日有复习任务' : '等待复习计划'}`),
              h(Text, { style: styles.bodyText }, record.errorReason || record.question?.originalText || '暂无错因记录'),
              h(Button, {
                label: hasReviewTask ? '去复习这类题' : '查看复习页',
                onPress: () => openReviewForMistake(record),
                secondary: true,
              }),
            );
          })
        : h(Text, { style: styles.empty }, '暂无错题'),
    );
  }

  function renderReport() {
    const summary = report?.sourceReport?.summary || {};
    const reviewRate = Math.round((summary.reviewCompletionRate || 0) * 100);
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '家长周报'),
      h(Text, { style: styles.subtitle }, report?.headline || '加载后查看本周学习摘要'),
      h(Button, { label: '刷新周报', onPress: loadReport, secondary: true }),
      report && h(View, { style: styles.metrics }, [
        h(Metric, { key: 'questions', label: '提问', value: summary.questionCount || 0 }),
        h(Metric, { key: 'mistakes', label: '错题', value: summary.newMistakeCount || 0 }),
        h(Metric, { key: 'reviews', label: '复习率', value: `${reviewRate}%` }),
      ]),
      report && h(
        View,
        { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '本周结论'),
        h(Text, { style: styles.reportHeadline }, report.summaryText || report.headline || '本周学习记录已生成'),
        h(Text, { style: styles.bodyText }, reviewRate >= 80
          ? '复习完成率较好, 可以继续保持当前节奏。'
          : '复习完成率偏低, 建议先减少新题, 把今日复习补齐。'),
      ),
      report?.parentSummary?.topWeakPoint && h(
        View,
        { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '主要薄弱点'),
        h(Text, { style: styles.listTitle }, report.parentSummary.topWeakPoint.knowledgePoint),
        h(Text, { style: styles.bodyText }, report.parentSummary.topWeakPoint.errorReason || '需要继续观察错因'),
        report.parentSummary.encouragement ? h(Text, { style: styles.bodyText }, report.parentSummary.encouragement) : null,
      ),
      report?.actionItems?.length ? h(
        View,
        { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '家长行动清单'),
        report.actionItems.map((item, index) => h(
          View,
          { key: `${index}-${item}`, style: styles.actionItem },
          h(Text, { style: styles.actionIndex }, String(index + 1)),
          h(Text, { style: styles.actionText }, item),
        )),
      ) : null,
      report ? h(View, { style: styles.actionRow }, [
        h(Button, { key: 'mistakes', label: '看相关错题', onPress: () => setTab('mistakes'), secondary: true }),
        h(Button, { key: 'review', label: '安排今日复习', onPress: () => setTab('review'), secondary: true }),
      ]) : null,
    );
  }

  function renderKnowledge() {
    const statusLabel = {
      red: '薄弱',
      yellow: '学习中',
      green: '已掌握',
      gray: '未开始',
    };
    const statusTone = {
      red: 'danger',
      yellow: 'warning',
      green: 'success',
      gray: 'neutral',
    };
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '知识图谱'),
      h(Text, { style: styles.subtitle }, '按当前账号错题状态标记薄弱点, 可直接跳到错题或复习。'),
      h(Button, { label: '刷新知识图谱', onPress: loadKnowledgeTree, secondary: true }),
      knowledgeTree.length
        ? knowledgeTree.map(subject => h(
            View,
            { key: subject.code, style: styles.knowledgeSubject },
            h(Text, { style: styles.sectionLabel }, subject.name),
            subject.children?.slice(0, 8).map(node => h(
              View,
              { key: node.id, style: styles.knowledgeCard },
              h(View, { style: styles.listHeader }, [
                h(Text, { key: 'name', style: styles.listTitle }, node.name),
                h(StatusPill, {
                  key: 'status',
                  label: statusLabel[node.status] || node.status || '未开始',
                  tone: statusTone[node.status] || 'neutral',
                }),
              ]),
              h(Text, { style: styles.bodyText }, `${node.mistakes || 0} 道相关错题`),
              node.children?.slice(0, 3).map(child => h(
                Text,
                { key: child.id, style: styles.treeChild },
                `${child.name} · ${statusLabel[child.status] || child.status} · ${child.mistakes || 0}`,
              )),
              h(Button, {
                label: (node.mistakes || 0) > 0 || node.status === 'red' ? '看相关错题' : '查看复习计划',
                onPress: () => openKnowledgeAction(node),
                secondary: true,
              }),
            )),
          ))
        : h(Text, { style: styles.empty }, '暂无知识图谱数据'),
    );
  }

  function renderPlus() {
    const plus = plans.find(plan => plan.code === 'plus');
    const active = demoMode && demoPlusActive
      ? billingStatus?.activeSubscription || { expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() }
      : billingStatus?.activeSubscription;
    const expiresAt = active?.expiresAt ? new Date(active.expiresAt).toLocaleDateString() : '--';
    const freeDailyQuestions = 50;
    const freeDailyAiSteps = 150;
    const plusDailyQuestions = plus?.limits?.dailyQuestions || 200;
    const plusDailyAiSteps = plus?.limits?.dailyAiSteps || 600;
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, 'Plus 订阅'),
      h(Text, { style: styles.subtitle }, active ? `Plus 有效期至 ${expiresAt}` : 'Plus 可提升每日提问和 AI 引导额度'),
      h(Button, { label: '刷新订阅状态', onPress: loadPlans, secondary: true }),
      h(View, { style: styles.planCompare }, [
        h(View, { key: 'free', style: styles.planCard },
          h(Text, { style: styles.sectionLabel }, '免费版'),
          h(Text, { style: styles.listTitle }, '日常试用'),
          h(Text, { style: styles.bodyText }, `每日提问 ${freeDailyQuestions} 次`),
          h(Text, { style: styles.bodyText }, `AI 引导 ${freeDailyAiSteps} 步`),
        ),
        h(View, { key: 'plus', style: [styles.planCard, styles.planCardActive] },
          h(View, { style: styles.listHeader }, [
            h(Text, { key: 'title', style: styles.listTitle }, plus?.name || 'Plus'),
            active ? h(StatusPill, { key: 'status', label: '已开通', tone: 'success' }) : h(StatusPill, { key: 'status', label: '推荐', tone: 'warning' }),
          ]),
          h(Text, { style: styles.bodyText }, `¥${((plus?.priceCentsMonthly || 2900) / 100).toFixed(2)} / 月`),
          h(Text, { style: styles.bodyText }, `每日提问 ${plusDailyQuestions} 次`),
          h(Text, { style: styles.bodyText }, `AI 引导 ${plusDailyAiSteps} 步`),
        ),
      ]),
      h(Button, { label: active ? '续费 Plus' : '开通 Plus', onPress: checkoutPlus }),
      active ? h(Button, { label: '取消自动续订', onPress: cancelPlus, secondary: true }) : null,
      billingStatus?.recentOrders?.length
        ? billingStatus.recentOrders.slice(0, 3).map(order => h(
            Text,
            { key: order.id, style: styles.bodyText },
            `${order.status} · ¥${((order.amountCents || 0) / 100).toFixed(2)}`,
          ))
        : h(Text, { style: styles.empty }, '暂无订单记录'),
    );
  }

  function renderMe() {
    const accountMode = demoMode ? '体验演示账号' : '正式登录账号';
    const quota = meInfo?.quota || {};
    const questionCount = quota.questionCount ?? quota.questionsUsedToday ?? 0;
    const questionLimit = quota.questionLimit ?? quota.dailyQuestions ?? '--';
    const aiStepCount = quota.aiStepCount ?? quota.aiStepsUsedToday ?? 0;
    const aiStepLimit = quota.aiStepLimit ?? quota.dailyAiSteps ?? '--';
    const profile = meInfo?.profile || {};
    const runtimeTone = runtimeCheck?.ready === 'ok' || runtimeCheck?.ready === 'demo'
      ? 'success'
      : runtimeCheck?.ready === 'failed'
        ? 'danger'
        : 'neutral';
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '我的'),
      h(Text, { style: styles.subtitle }, demoMode ? '当前为体验演示, 未连接真实账号' : (sessionToken ? '已通过 session token 登录' : '未登录')),
      h(View, { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '账号状态'),
        h(View, { style: styles.listHeader }, [
          h(Text, { key: 'mode', style: styles.listTitle }, accountMode),
          h(StatusPill, { key: 'model', label: meInfo?.accountModel === 'single-student' ? '单学生' : '待刷新', tone: 'neutral' }),
        ]),
        h(Text, { style: styles.bodyText }, meInfo?.user?.phone ? `手机号: ${meInfo.user.phone}` : '手机号: 未加载'),
        h(Text, { style: styles.bodyText }, profile.grade ? `年级: ${profile.grade}` : '年级: 未加载'),
        h(Text, { style: styles.bodyText }, '一个登录账号只对应一个学生档案, 不提供多学生切换。'),
      ),
      h(View, { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '今日额度'),
        h(View, { style: styles.metrics }, [
          h(Metric, {
            key: 'questions',
            label: '提问',
            value: `${questionCount}/${questionLimit}`,
          }),
          h(Metric, {
            key: 'steps',
            label: 'AI 引导',
            value: `${aiStepCount}/${aiStepLimit}`,
          }),
        ]),
      ),
      h(View, { style: styles.actionRow }, [
        h(Button, { key: 'refreshMe', label: '刷新账号信息', onPress: loadMeInfo, secondary: true }),
        h(Button, { key: 'checkRuntime', label: '检查后端状态', onPress: checkApiRuntime, secondary: true }),
      ]),
      h(View, { style: styles.reportSection },
        h(View, { style: styles.listHeader }, [
          h(Text, { key: 'title', style: styles.sectionLabel }, '内测诊断'),
          runtimeCheck ? h(StatusPill, { key: 'status', label: runtimeCheck.ready, tone: runtimeTone }) : null,
        ]),
        h(Text, { style: styles.bodyText }, `API: ${demoMode ? 'demo://local' : (apiBase || '未配置')}`),
        h(Text, { style: styles.bodyText }, runtimeCheck?.detail || '点击“检查后端状态”确认 API、服务和数据库是否可用。'),
      ),
      h(View, { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '复习提醒'),
        h(Text, { style: styles.listTitle }, pushStatus === '未注册' ? '未开启' : '已开启'),
        h(Text, { style: styles.bodyText }, `设备: ${pushStatus}`),
      ),
      h(Button, { label: '开启复习提醒', onPress: enableReviewPush }),
      h(View, { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '内测反馈'),
        h(Text, { style: styles.bodyText }, '提交问题、AI 质量或内容安全反馈, 运营后台会按当前账号归档。'),
        h(View, { style: styles.segmentRow }, FEEDBACK_CATEGORIES.map(category => h(
          SegmentedOption,
          {
            key: category.value,
            label: category.label,
            selected: feedbackCategory === category.value,
            onPress: () => setFeedbackCategory(category.value),
          },
        ))),
        h(View, { style: styles.ratingRow }, [1, 2, 3, 4, 5].map(value => h(
          TouchableOpacity,
          { key: value, style: [styles.ratingDot, feedbackRating === value && styles.ratingDotActive], onPress: () => setFeedbackRating(value) },
          h(Text, { style: [styles.ratingText, feedbackRating === value && styles.ratingTextActive] }, String(value)),
        ))),
        h(Field, {
          label: '反馈内容',
          value: feedbackContent,
          onChangeText: setFeedbackContent,
          placeholder: '例如: 某个提示太直接、拍照识别不准、页面操作不顺畅',
          multiline: true,
        }),
        h(Button, { label: '提交反馈', onPress: submitFeedback, secondary: true }),
      ),
      h(View, { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '账号与数据'),
        h(Text, { style: styles.bodyText }, '可导出当前单学生账号数据摘要; 注销会删除账号、题目、错题、复习、反馈和设备记录。'),
        h(View, { style: styles.actionRow }, [
          h(Button, { key: 'export', label: '导出数据摘要', onPress: exportAccountData, secondary: true }),
          h(Button, {
            key: 'delete',
            label: deleteConfirmArmed ? '确认注销账号' : '申请注销账号',
            onPress: requestAccountDeletion,
            secondary: true,
          }),
        ]),
        accountExportSummary ? h(
          View,
          { style: styles.exportSummary },
          h(Text, { style: styles.bodyText }, `题目 ${accountExportSummary.questions || 0} · 错题 ${accountExportSummary.mistakes || 0} · 反馈 ${accountExportSummary.feedback || 0}`),
          accountExportSummary.exportedAt ? h(Text, { style: styles.listMeta }, `导出时间 ${new Date(accountExportSummary.exportedAt).toLocaleString()}`) : null,
        ) : null,
      ),
      h(View, { style: styles.reportSection },
        h(Text, { style: styles.sectionLabel }, '协议与隐私'),
        h(Text, { style: styles.bodyText }, '可随时查看内测版用户协议、隐私政策和未成年人使用说明。'),
        renderLegalLinks(),
      ),
      h(View, { style: styles.actionRow }, [
        h(Button, { key: 'report', label: '看周报', onPress: () => setTab('report'), secondary: true }),
        h(Button, { key: 'plus', label: '管理 Plus', onPress: () => setTab('plus'), secondary: true }),
      ]),
      h(Button, { label: '退出登录', onPress: logout, secondary: true }),
    );
  }

  const loggedIn = sessionToken || demoMode;
  const content = selectedLegalDoc
    ? renderLegalDoc()
    : loggedIn
    ? {
        home: renderHome,
        ask: renderAsk,
        review: renderReview,
        mistakes: renderMistakes,
        report: renderReport,
        knowledge: renderKnowledge,
        plus: renderPlus,
        me: renderMe,
      }[tab]()
    : renderLogin();

  return h(
    SafeAreaView,
    { style: styles.safe },
    h(StatusBar, { barStyle: 'dark-content' }),
    h(ScrollView, { contentContainerStyle: styles.container }, [
      content,
      h(Text, { key: 'status', style: styles.status }, status),
    ]),
    loggedIn && h(
      View,
      { style: styles.tabs },
      ['home', 'ask', 'review', 'mistakes', 'report', 'knowledge', 'plus', 'me'].map(item => h(
        TouchableOpacity,
        { key: item, style: [styles.tab, tab === item && styles.tabActive], onPress: () => setTab(item) },
        h(Text, { style: [styles.tabText, tab === item && styles.tabTextActive] }, {
          home: '首页',
          ask: '提问',
          review: '复习',
          mistakes: '错题',
          report: '报告',
          knowledge: '图谱',
          plus: 'Plus',
          me: '我的',
        }[item]),
      )),
    ),
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f7f7fb',
  },
  demoPanel: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  demoBadge: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
  },
  quickGrid: {
    gap: 10,
    marginBottom: 12,
  },
  quickCard: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  quickTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  quickBody: {
    marginTop: 5,
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 19,
  },
  quickAction: {
    marginTop: 8,
    fontSize: 13,
    color: '#4f46e5',
    fontWeight: '700',
  },
  sampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  sampleChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  sampleChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
  },
  consentBox: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  consentMark: {
    width: 22,
    height: 22,
    overflow: 'hidden',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
    color: '#ffffff',
    fontWeight: '700',
  },
  consentMarkActive: {
    borderColor: '#4f46e5',
    backgroundColor: '#4f46e5',
  },
  consentCopy: {
    flex: 1,
  },
  consentTitle: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  legalLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  legalItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  segmentOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  segmentOptionActive: {
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff',
  },
  segmentOptionText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
  },
  segmentOptionTextActive: {
    color: '#4f46e5',
  },
  ratingRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  ratingDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  ratingDotActive: {
    borderColor: '#4f46e5',
    backgroundColor: '#4f46e5',
  },
  ratingText: {
    color: '#374151',
    fontWeight: '700',
  },
  ratingTextActive: {
    color: '#ffffff',
  },
  exportSummary: {
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  apiPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -4,
    marginBottom: 8,
  },
  apiPreset: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  apiPresetText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '700',
  },
  flowPanel: {
    marginTop: 2,
    marginBottom: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  flowStep: {
    marginTop: 6,
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 19,
  },
  reportSection: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionLabel: {
    marginBottom: 6,
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
  },
  reportHeadline: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
    lineHeight: 22,
  },
  actionItem: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  actionIndex: {
    width: 22,
    height: 22,
    overflow: 'hidden',
    borderRadius: 11,
    backgroundColor: '#eef2ff',
    color: '#4f46e5',
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12,
    fontWeight: '700',
  },
  actionText: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
  },
  statusPill: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
  },
  statusPill_warning: {
    color: '#92400e',
    backgroundColor: '#fef3c7',
  },
  statusPill_danger: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
  },
  statusPill_success: {
    color: '#047857',
    backgroundColor: '#d1fae5',
  },
  statusPill_neutral: {
    color: '#374151',
    backgroundColor: '#f3f4f6',
  },
  container: {
    padding: 16,
    paddingBottom: 96,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 14,
    lineHeight: 20,
  },
  field: {
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 6,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  textarea: {
    minHeight: 140,
    paddingTop: 12,
  },
  button: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 10,
  },
  buttonSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  buttonSecondaryText: {
    color: '#374151',
  },
  status: {
    marginTop: 12,
    fontSize: 12,
    color: '#6b7280',
  },
  hint: {
    marginBottom: 10,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  metric: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#6b7280',
  },
  answer: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
    color: '#312e81',
    lineHeight: 20,
  },
  highlight: {
    marginVertical: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  bodyText: {
    marginTop: 6,
    fontSize: 13,
    color: '#374151',
    lineHeight: 20,
  },
  messageBubble: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef2ff',
  },
  messageQuestion: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  treeNode: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  treeChild: {
    marginTop: 4,
    marginLeft: 12,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  knowledgeSubject: {
    marginTop: 12,
  },
  knowledgeCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  planCompare: {
    gap: 10,
    marginBottom: 12,
  },
  planCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  planCardActive: {
    borderColor: '#c7d2fe',
    backgroundColor: '#eef2ff',
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  listMeta: {
    marginTop: 3,
    fontSize: 12,
    color: '#6b7280',
  },
  empty: {
    marginTop: 12,
    color: '#6b7280',
  },
  tabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingBottom: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 12,
  },
  tabActive: {
    backgroundColor: '#eef2ff',
  },
  tabText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#4f46e5',
  },
});
