// ===== AI家庭教师 - 模拟数据(单用户) =====

const SUBJECTS = {
  math:    { name: '数学', icon: '📐', cls: 'math' },
  physics: { name: '物理', icon: '⚛️', cls: 'physics' },
  english: { name: '英语', icon: '🔤', cls: 'english' },
  chinese: { name: '语文', icon: '📖', cls: 'chinese' },
};

// 年级配置（决定 AI 答疑语言风格、可选科目等）
const GRADES = [
  { value: 'p1', label: '小学一年级', stage: 'primary' },
  { value: 'p2', label: '小学二年级', stage: 'primary' },
  { value: 'p3', label: '小学三年级', stage: 'primary' },
  { value: 'p4', label: '小学四年级', stage: 'primary' },
  { value: 'p5', label: '小学五年级', stage: 'primary' },
  { value: 'p6', label: '小学六年级', stage: 'primary' },
  { value: 'j1', label: '初一',       stage: 'junior'  },
  { value: 'j2', label: '初二',       stage: 'junior'  },
  { value: 'j3', label: '初三',       stage: 'junior'  },
  { value: 'h1', label: '高一',       stage: 'senior'  },
  { value: 'h2', label: '高二',       stage: 'senior'  },
  { value: 'h3', label: '高三',       stage: 'senior'  },
];

// 默认科目（所有年级都展示这四个）
const DEFAULT_SUBJECTS = ['math', 'physics', 'english', 'chinese'];

// 学习进度假数据（不区分用户，原型阶段所有用户共用一份）
const MOCK_PROGRESS = {
  math:    { weak: 5, learning: 8, mastered: 23, todayReview: 3 },
  physics: { weak: 3, learning: 4, mastered: 12, todayReview: 2 },
  english: { weak: 1, learning: 3, mastered: 18, todayReview: 0 },
  chinese: { weak: 0, learning: 2, mastered: 15, todayReview: 1 },
};

// ===== 错题数据 =====
const MOCK_MISTAKES = [
  {
    id: 'm1', subject: 'math',
    title: '二次函数动点问题求最值',
    addedAt: '今天 14:32', reviewDay: 1,
    knowledgePoint: '二次函数最值',
    knowledgePath: ['数学', '函数', '二次函数', '二次函数最值'],
    errorReason: '未将动点的坐标用参数表示,直接代入原函数,导致变量混淆。',
    status: 'red',
  },
  {
    id: 'm2', subject: 'math',
    title: '相似三角形判定 (AA 与 SAS 混淆)',
    addedAt: '昨天 20:08', reviewDay: 3,
    knowledgePoint: '相似三角形判定',
    knowledgePath: ['数学', '几何', '相似三角形', '判定定理'],
    errorReason: '条件中只有两组对应角相等,误用了 SAS 的边比例条件。',
    status: 'yellow',
  },
  {
    id: 'm3', subject: 'math',
    title: '分式方程增根判定',
    addedAt: '3 天前', reviewDay: 7,
    knowledgePoint: '分式方程的解与增根',
    knowledgePath: ['数学', '代数', '分式方程', '增根'],
    errorReason: '求出 x 后没有代回最简公分母检验,把增根当作了方程的解。',
    status: 'yellow',
  },
  {
    id: 'm4', subject: 'physics',
    title: '滑轮组机械效率(忽略动滑轮重)',
    addedAt: '今天 10:15', reviewDay: 1,
    knowledgePoint: '机械效率',
    knowledgePath: ['物理', '简单机械', '机械效率'],
    errorReason: '计算时漏掉了提升动滑轮所做的额外功,导致效率虚高。',
    status: 'red',
  },
  {
    id: 'm5', subject: 'physics',
    title: '凸透镜成像规律应用',
    addedAt: '5 天前', reviewDay: 15,
    knowledgePoint: '凸透镜成像规律',
    knowledgePath: ['物理', '光学', '凸透镜', '成像规律'],
    errorReason: '物距与焦距关系判断错误,把"u > 2f"当成了"f < u < 2f"。',
    status: 'green',
  },
  {
    id: 'm6', subject: 'english',
    title: '现在完成时与一般过去时',
    addedAt: '昨天 19:22', reviewDay: 3,
    knowledgePoint: '完成时态与过去时态辨析',
    knowledgePath: ['英语', '语法', '时态', '完成时'],
    errorReason: '看到时间状语 yesterday 后仍使用 have done 结构。',
    status: 'red',
  },
];

// ===== 知识图谱树(按科目) =====
// status: red(薄弱) / yellow(学习中) / green(已掌握) / gray(未涉及)
const MOCK_KNOWLEDGE_TREE = {
  math: {
    name: '数学',
    children: [
      {
        name: '代数', status: 'yellow',
        children: [
          { name: '一元一次方程',   status: 'green'  },
          { name: '分式方程',       status: 'yellow', mistakes: 1 },
          { name: '一元二次方程',   status: 'green'  },
          { name: '不等式',         status: 'gray'   },
        ],
      },
      {
        name: '函数', status: 'red',
        children: [
          { name: '一次函数',       status: 'green' },
          { name: '反比例函数',     status: 'yellow' },
          { name: '二次函数最值',   status: 'red',    mistakes: 1 },
          { name: '二次函数动点',   status: 'red',    mistakes: 1 },
        ],
      },
      {
        name: '几何', status: 'yellow',
        children: [
          { name: '全等三角形',     status: 'green' },
          { name: '相似三角形',     status: 'yellow', mistakes: 1 },
          { name: '圆',             status: 'gray' },
        ],
      },
    ],
  },
  physics: {
    name: '物理',
    children: [
      { name: '力学',
        status: 'yellow',
        children: [
          { name: '机械效率',       status: 'red',    mistakes: 1 },
          { name: '功与功率',       status: 'yellow' },
          { name: '压强',           status: 'green' },
        ],
      },
      { name: '光学',
        status: 'green',
        children: [
          { name: '凸透镜成像',     status: 'green',  mistakes: 1 },
          { name: '光的反射',       status: 'green' },
        ],
      },
      { name: '电学',
        status: 'gray',
        children: [
          { name: '欧姆定律',       status: 'gray' },
          { name: '电功率',         status: 'gray' },
        ],
      },
    ],
  },
  english: {
    name: '英语',
    children: [
      { name: '语法',
        status: 'yellow',
        children: [
          { name: '时态',           status: 'red',    mistakes: 1 },
          { name: '从句',           status: 'yellow' },
          { name: '非谓语动词',     status: 'gray' },
        ],
      },
      { name: '词汇',
        status: 'green',
        children: [
          { name: '高频短语',       status: 'green' },
        ],
      },
    ],
  },
  chinese: {
    name: '语文',
    children: [
      { name: '阅读理解',
        status: 'yellow',
        children: [
          { name: '记叙文',         status: 'yellow' },
          { name: '说明文',         status: 'gray' },
        ],
      },
      { name: '古诗文',
        status: 'green',
        children: [
          { name: '常考实词',       status: 'green' },
        ],
      },
    ],
  },
};

// ===== 复习任务(基于艾宾浩斯曲线生成) =====
const MOCK_REVIEW_TASKS = [
  {
    id: 'r1', mistakeId: 'm1', subject: 'math',
    knowledgePoint: '二次函数最值', cycle: 'D1', cycleLabel: '第 1 天',
    variantTitle: '求二次函数 y = x² − 6x + 8 的最小值',
    variantOptions: ['−1', '0', '−5', '−4'],
    correctAnswer: '−1',
    explain: '配方:y = (x − 3)² − 1,最小值为 −1。'
  },
  {
    id: 'r2', mistakeId: 'm4', subject: 'physics',
    knowledgePoint: '机械效率', cycle: 'D1', cycleLabel: '第 1 天',
    variantTitle: '动滑轮重 10N,用它提升 90N 重物,拉力做功 200J,机械效率约为?',
    variantOptions: ['90%', '50%', '45%', '100%'],
    correctAnswer: '45%',
    explain: '有用功 W_有 = G × h ≈ 90J (h = 1m 推算),η = W_有/W_总 = 90/200 = 45%。'
  },
  {
    id: 'r3', mistakeId: 'm2', subject: 'math',
    knowledgePoint: '相似三角形判定', cycle: 'D3', cycleLabel: '第 3 天',
    variantTitle: '已知 △ABC 中 ∠A = ∠D,要使 △ABC ∽ △DEF,还需满足?',
    variantOptions: ['AB/DE = BC/EF', '∠B = ∠E', 'BC = EF', '∠C = ∠E'],
    correctAnswer: '∠B = ∠E',
    explain: '已有一组角相等,再增加一组角相等即可用 AA 判定相似。'
  },
  {
    id: 'r4', mistakeId: 'm6', subject: 'english',
    knowledgePoint: '完成时与过去时辨析', cycle: 'D3', cycleLabel: '第 3 天',
    variantTitle: 'Choose: I ____ my homework yesterday.',
    variantOptions: ['have finished', 'finished', 'had finished', 'finish'],
    correctAnswer: 'finished',
    explain: 'yesterday 是明确的过去时间,用一般过去时 finished。'
  },
  {
    id: 'r5', mistakeId: 'm3', subject: 'math',
    knowledgePoint: '分式方程增根', cycle: 'D7', cycleLabel: '第 7 天',
    variantTitle: '解方程 2/(x−1) = 1/(x+1),x = ?',
    variantOptions: ['x = 3', '无解', 'x = −3', 'x = 1'],
    correctAnswer: 'x = −3',
    explain: '去分母得 2(x+1) = x−1,解得 x = −3。代回检验:x − 1 ≠ 0 且 x + 1 ≠ 0,所以 x = −3 是解。',
  },
  {
    id: 'r6', mistakeId: 'm5', subject: 'physics',
    knowledgePoint: '凸透镜成像', cycle: 'D15', cycleLabel: '第 15 天',
    variantTitle: '物体放在凸透镜 2 倍焦距外,成的像是?',
    variantOptions: ['倒立放大实像', '倒立缩小实像', '正立放大虚像', '正立缩小虚像'],
    correctAnswer: '倒立缩小实像',
    explain: 'u > 2f 时,f < v < 2f,成倒立缩小的实像(照相机原理)。'
  },
];

// 最近答疑记录
const MOCK_RECENT = [
  { id: 'q1', subject: 'math',    title: '二次函数动点问题求最值', time: '今天 14:32', status: 'mistake' },
  { id: 'q2', subject: 'physics', title: '滑轮组机械效率计算',     time: '今天 10:15', status: 'solved' },
  { id: 'q3', subject: 'math',    title: '相似三角形判定',         time: '昨天 20:08', status: 'solved' },
  { id: 'q4', subject: 'english', title: '现在完成时与一般过去时', time: '昨天 19:22', status: 'mistake' },
];

// ===== 当前登录用户 =====
const UserStore = {
  KEY: 'ai_tutor_user',
  get() {
    const raw = localStorage.getItem(this.KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    ensureUserData(user.phone);
    return user;
  },
  set(user) {
    localStorage.setItem(this.KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(this.KEY);
  },
  isLoggedIn() {
    return !!this.get();
  },
  // 工具:取年级对象
  grade() {
    const u = this.get();
    if (!u) return null;
    return GRADES.find(g => g.value === u.grade);
  },
};

function userDataKey(phone) {
  return `ai_tutor_data_${phone}`;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function ensureUserData(phone) {
  if (!phone) return null;
  const key = userDataKey(phone);
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);
  const seeded = {
    progress: cloneData(MOCK_PROGRESS),
    mistakes: cloneData(MOCK_MISTAKES),
    reviewTasks: cloneData(MOCK_REVIEW_TASKS),
    recent: cloneData(MOCK_RECENT),
  };
  localStorage.setItem(key, JSON.stringify(seeded));
  return seeded;
}

function getCurrentUserData() {
  const u = UserStore.get();
  return u ? ensureUserData(u.phone) : null;
}

function getCurrentProgress() {
  const data = getCurrentUserData();
  return data ? data.progress : MOCK_PROGRESS;
}

function getCurrentMistakes() {
  const data = getCurrentUserData();
  return data ? data.mistakes : MOCK_MISTAKES;
}

function getCurrentReviewTasks() {
  const data = getCurrentUserData();
  return data ? data.reviewTasks : MOCK_REVIEW_TASKS;
}

function getCurrentRecent() {
  const data = getCurrentUserData();
  return data ? data.recent : MOCK_RECENT;
}

// 没登录就跳到登录页
function requireLogin() {
  if (!UserStore.isLoggedIn()) {
    location.replace('login.html');
    return false;
  }
  return true;
}
