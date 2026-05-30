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

export default function App() {
  const [apiBase, setApiBase] = useState('');
  const [sessionToken, setSessionToken] = useState('');
  const [phone, setPhone] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [otpCode, setOtpCode] = useState('');
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
    setTab('home');
    setStatus('已进入体验演示: 不需要后端, 可先查看核心学习闭环');
  }

  function loadDemoQuestion(sample) {
    setQuestionText(sample.text);
    setTab('ask');
    setStatus(`已填入示例题: ${sample.label}`);
  }

  async function login() {
    await saveApiBase(apiBase);
    const result = await run('登录', () => api.loginWithOtp({ phone, code: otpCode, inviteCode }));
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
      api.answerReviewTask(task.id, { correct })
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

  function appendAnswerMessage(step) {
    setAnswerMessages(messages => messages.concat({
      id: step.messageId || `${Date.now()}`,
      type: step.type || step.messageType || 'guide',
      title: step.title || '下一步提示',
      content: step.message?.content || step.content || '继续观察题目条件',
    }));
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

  async function checkoutPlus() {
    if (demoMode) {
      setStatus('演示: 真实支付会在接入 IAP 或渠道支付后打开');
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
    setKnowledgeTree([]);
    setStatus('已退出当前账号');
  }

  function renderLogin() {
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, 'AI 家庭教师'),
      h(Text, { style: styles.subtitle }, '一个账号对应一个学生档案, 数据只跟随当前登录账号'),
      h(Field, { label: '后端 API', value: apiBase, onChangeText: setApiBase, placeholder: 'https://api.example.com' }),
      h(Field, { label: '手机号', value: phone, onChangeText: setPhone, placeholder: '内测手机号' }),
      h(Field, { label: '邀请码', value: inviteCode, onChangeText: setInviteCode, placeholder: '可选' }),
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
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '家长周报'),
      h(Text, { style: styles.subtitle }, report?.headline || '加载后查看本周学习摘要'),
      h(Button, { label: '刷新周报', onPress: loadReport, secondary: true }),
      report && h(View, { style: styles.metrics }, [
        h(Metric, { key: 'questions', label: '提问', value: summary.questionCount || 0 }),
        h(Metric, { key: 'mistakes', label: '错题', value: summary.newMistakeCount || 0 }),
        h(Metric, { key: 'reviews', label: '复习率', value: `${Math.round((summary.reviewCompletionRate || 0) * 100)}%` }),
      ]),
      report?.parentSummary?.topWeakPoint && h(
        View,
        { style: styles.highlight },
        h(Text, { style: styles.listTitle }, report.parentSummary.topWeakPoint.knowledgePoint),
        h(Text, { style: styles.bodyText }, report.parentSummary.topWeakPoint.errorReason || '需要继续观察错因'),
      ),
      report?.actionItems?.map((item, index) => h(
        Text,
        { key: `${index}-${item}`, style: styles.bodyText },
        `${index + 1}. ${item}`,
      )),
    );
  }

  function renderKnowledge() {
    const statusLabel = {
      red: '薄弱',
      yellow: '学习中',
      green: '已掌握',
      gray: '未开始',
    };
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '知识图谱'),
      h(Text, { style: styles.subtitle }, '按当前账号错题状态标记薄弱点'),
      h(Button, { label: '刷新知识图谱', onPress: loadKnowledgeTree, secondary: true }),
      knowledgeTree.length
        ? knowledgeTree.map(subject => h(
            View,
            { key: subject.code, style: styles.highlight },
            h(Text, { style: styles.listTitle }, subject.name),
            subject.children?.slice(0, 8).map(node => h(
              View,
              { key: node.id, style: styles.treeNode },
              h(Text, { style: styles.bodyText }, `${node.name} · ${statusLabel[node.status] || node.status} · ${node.mistakes || 0} 错题`),
              node.children?.slice(0, 3).map(child => h(
                Text,
                { key: child.id, style: styles.treeChild },
                `${child.name} · ${statusLabel[child.status] || child.status} · ${child.mistakes || 0}`,
              )),
            )),
          ))
        : h(Text, { style: styles.empty }, '暂无知识图谱数据'),
    );
  }

  function renderPlus() {
    const plus = plans.find(plan => plan.code === 'plus');
    const active = billingStatus?.activeSubscription;
    const expiresAt = active?.expiresAt ? new Date(active.expiresAt).toLocaleDateString() : '--';
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, 'Plus 订阅'),
      h(Text, { style: styles.subtitle }, active ? `Plus 有效期至 ${expiresAt}` : 'Plus 可提升每日提问和 AI 引导额度'),
      h(Button, { label: '刷新订阅状态', onPress: loadPlans, secondary: true }),
      plus && h(
        View,
        { style: styles.highlight },
        h(Text, { style: styles.listTitle }, plus.name || 'Plus'),
        h(Text, { style: styles.bodyText }, `¥${((plus.priceCentsMonthly || 0) / 100).toFixed(2)} / 月`),
        h(Text, { style: styles.bodyText }, `每日提问 ${plus.limits?.dailyQuestions || '--'} 次, AI 引导 ${plus.limits?.dailyAiSteps || '--'} 步`),
      ),
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
    return h(
      View,
      { style: styles.card },
      h(Text, { style: styles.title }, '我的'),
      h(Text, { style: styles.subtitle }, demoMode ? '当前为体验演示, 未连接真实账号' : (sessionToken ? '已通过 session token 登录' : '未登录')),
      h(Text, { style: styles.hint }, `复习提醒设备: ${pushStatus}`),
      h(Button, { label: '开启复习提醒', onPress: enableReviewPush }),
      h(Button, { label: '退出登录', onPress: logout, secondary: true }),
    );
  }

  const loggedIn = sessionToken || demoMode;
  const content = loggedIn
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
