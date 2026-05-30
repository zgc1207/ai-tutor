// ===== 阶段 2 API 客户端 =====
// 默认不启用后端, 保持纯静态原型可用。用户在“我的”页配置 API 地址后启用。

const ApiClient = {
  BASE_KEY: 'ai_tutor_api_base',
  ADMIN_TOKEN_KEY: 'ai_tutor_admin_token',
  SERVER_USER_KEY: 'ai_tutor_server_user_id',
  SESSION_KEY: 'ai_tutor_session_token',

  getBaseUrl() {
    return (localStorage.getItem(this.BASE_KEY) || '').replace(/\/$/, '');
  },

  setBaseUrl(url) {
    const value = (url || '').trim().replace(/\/$/, '');
    if (value) localStorage.setItem(this.BASE_KEY, value);
    else localStorage.removeItem(this.BASE_KEY);
  },

  isEnabled() {
    return !!this.getBaseUrl();
  },

  getAdminToken() {
    return localStorage.getItem(this.ADMIN_TOKEN_KEY) || '';
  },

  setAdminToken(token) {
    const value = String(token || '').trim();
    if (value) localStorage.setItem(this.ADMIN_TOKEN_KEY, value);
    else localStorage.removeItem(this.ADMIN_TOKEN_KEY);
  },

  getServerUserId() {
    return localStorage.getItem(this.SERVER_USER_KEY) || '';
  },

  setServerUserId(userId) {
    if (userId) localStorage.setItem(this.SERVER_USER_KEY, userId);
  },

  getSessionToken() {
    return localStorage.getItem(this.SESSION_KEY) || '';
  },

  setSessionToken(token) {
    if (token) localStorage.setItem(this.SESSION_KEY, token);
  },

  clearSession() {
    localStorage.removeItem(this.SERVER_USER_KEY);
    localStorage.removeItem(this.SESSION_KEY);
  },

  async request(path, options = {}) {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) throw new Error('未配置后端 API 地址');

    const headers = {
      'content-type': 'application/json',
      ...(options.headers || {}),
    };
    const sessionToken = this.getSessionToken();
    const userId = this.getServerUserId();
    if (sessionToken) headers.authorization = `Bearer ${sessionToken}`;
    else if (userId) headers['x-user-id'] = userId;

    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.error || `请求失败: ${response.status}`);
      error.status = response.status;
      error.code = data?.code;
      error.quota = data?.quota;
      throw error;
    }
    return data;
  },

  async adminRequest(path, options = {}) {
    const token = this.getAdminToken();
    if (!token) throw new Error('未配置 Admin Token');
    return this.request(path, {
      ...options,
      headers: {
        'x-admin-token': token,
        ...(options.headers || {}),
      },
    });
  },

  async login(user) {
    if (!this.isEnabled()) return null;
    const result = await this.request('/auth/mock-login', {
      method: 'POST',
      body: {
        phone: user.phone,
        nickname: user.nickname,
        grade: user.grade,
        gradeStage: user.gradeStage,
        consentAccepted: Boolean(user.consentAccepted),
        policyVersion: user.policyVersion || 'internal-test-v1',
        inviteCode: user.inviteCode || undefined,
      },
    });
    this.setServerUserId(result.userId);
    this.setSessionToken(result.sessionToken);
    return result;
  },

  async requestLoginOtp({ phone, inviteCode }) {
    if (!this.isEnabled()) return null;
    return this.request('/auth/otp/request', {
      method: 'POST',
      body: {
        phone,
        inviteCode: inviteCode || undefined,
      },
    });
  },

  async loginWithOtp(user) {
    if (!this.isEnabled()) return null;
    const result = await this.request('/auth/otp/login', {
      method: 'POST',
      body: {
        phone: user.phone,
        code: user.otpCode,
        nickname: user.nickname,
        grade: user.grade,
        gradeStage: user.gradeStage,
        consentAccepted: Boolean(user.consentAccepted),
        policyVersion: user.policyVersion || 'internal-test-v1',
        inviteCode: user.inviteCode || undefined,
      },
    });
    this.setServerUserId(result.userId);
    this.setSessionToken(result.sessionToken);
    return result;
  },

  async logout() {
    if (!this.isEnabled() || !this.getSessionToken()) {
      this.clearSession();
      return { revoked: false };
    }
    const result = await this.request('/auth/logout', { method: 'POST', body: {} });
    this.clearSession();
    return result;
  },

  async getMe() {
    return this.request('/me');
  },

  async getPlans() {
    return this.request('/plans');
  },

  async getBillingStatus() {
    return this.request('/billing/status');
  },

  async createCheckout({ planCode = 'plus' } = {}) {
    return this.request('/billing/checkout', {
      method: 'POST',
      body: {
        planCode,
        guardianConfirmed: true,
        refundNoticeAccepted: true,
      },
    });
  },

  async cancelSubscription({ cancelAtPeriodEnd = true } = {}) {
    return this.request('/billing/cancel', {
      method: 'POST',
      body: { cancelAtPeriodEnd },
    });
  },

  async updateProfile({ grade, gradeStage, targetSubjects }) {
    return this.request('/me/profile', {
      method: 'PATCH',
      body: { grade, gradeStage, targetSubjects },
    });
  },

  async updateReminder({ reviewReminderEnabled, reviewReminderTime, quietHoursStart, quietHoursEnd }) {
    return this.request('/me/reminder', {
      method: 'PATCH',
      body: { reviewReminderEnabled, reviewReminderTime, quietHoursStart, quietHoursEnd },
    });
  },

  async uploadImage({ imageData, contentType }) {
    return this.request('/uploads/images', {
      method: 'POST',
      body: { imageData, contentType },
    });
  },

  async extractOcr({ imageUrl, imageData, mockText }) {
    return this.request('/ocr/extract', {
      method: 'POST',
      body: { imageUrl, imageData, mockText },
    });
  },

  async createQuestion({ subjectCode = 'math', inputType = 'text', originalText, imageUrl, ocrText }) {
    return this.request('/questions', {
      method: 'POST',
      body: {
        subjectCode,
        inputType,
        originalText,
        imageUrl,
        ocrText,
      },
    });
  },

  async nextAnswer(questionId) {
    return this.request(`/questions/${questionId}/answer/next`, {
      method: 'POST',
      body: {},
    });
  },

  async finishQuestion(questionId, { solvedIndependently = false } = {}) {
    return this.request(`/questions/${questionId}/finish`, {
      method: 'POST',
      body: { solvedIndependently },
    });
  },

  async getParentWeeklyReport() {
    return this.request('/reports/parent-weekly');
  },

  normalizeReviewTask(task) {
    const variant = task.variantQuestion || {};
    const subject = task.errorRecord?.subject?.code || 'math';
    return {
      id: task.id,
      serverTask: true,
      mistakeId: task.errorRecordId,
      subject,
      knowledgePoint: task.errorRecord?.knowledgePoint || variant.knowledgePoint || '复习任务',
      cycle: task.cycle,
      cycleLabel: { D1: '第 1 天', D3: '第 3 天', D7: '第 7 天', D15: '第 15 天' }[task.cycle] || task.cycle,
      variantTitle: variant.title || '变式题',
      variantOptions: variant.options || [],
      correctAnswer: variant.correctAnswer,
      explain: variant.explain || '',
      sourceTitle: task.errorRecord?.knowledgePoint || '',
    };
  },

  async getReviewTasks({ includeUpcoming = false } = {}) {
    const path = includeUpcoming ? '/review-tasks?scope=all' : '/review-tasks/today';
    const tasks = await this.request(path);
    return tasks.map(task => this.normalizeReviewTask(task));
  },

  async answerReviewTask(taskId, answer) {
    return this.request(`/review-tasks/${taskId}/answer`, {
      method: 'POST',
      body: { answer },
    });
  },

  normalizeRecentQuestion(question) {
    return {
      id: question.id,
      subject: question.subject?.code || 'math',
      title: question.originalText || question.ocrText || '未命名题目',
      time: '刚刚',
      status: question.status === 'solved' ? 'solved' : 'mistake',
    };
  },

  async getDashboard() {
    const dashboard = await this.request('/dashboard');
    return {
      progress: dashboard.progress || { weak: 0, learning: 0, mastered: 0 },
      todayReviewCount: dashboard.todayReviewCount || 0,
      recent: (dashboard.recentQuestions || []).map(q => this.normalizeRecentQuestion(q)),
    };
  },

  async getWeeklyReport() {
    return this.request('/reports/weekly');
  },

  normalizeMistake(record) {
    const statusMap = { weak: 'red', learning: 'yellow', mastered: 'green' };
    return {
      id: record.id,
      serverRecord: true,
      subject: record.subject?.code || 'math',
      title: record.question?.originalText || record.question?.ocrText || record.knowledgePoint,
      addedAt: '刚刚',
      reviewDay: 1,
      knowledgePoint: record.knowledgePoint,
      knowledgePath: [record.subject?.name || '科目', record.knowledgePoint],
      errorReason: record.errorReason,
      status: statusMap[record.status] || 'red',
    };
  },

  async getMistakes() {
    const records = await this.request('/mistakes');
    return records.map(record => this.normalizeMistake(record));
  },

  async getKnowledgeTree(subject = 'all') {
    const result = await this.request(`/knowledge-tree?subject=${encodeURIComponent(subject)}`);
    const treeBySubject = {};
    (result.subjects || []).forEach(subjectItem => {
      treeBySubject[subjectItem.code] = {
        name: subjectItem.name,
        children: subjectItem.children || [],
      };
    });
    return treeBySubject;
  },

  async submitFeedback({ rating, category = 'other', content, page = 'prototype' }) {
    return this.request('/feedback', {
      method: 'POST',
      body: { rating, category, content, page },
    });
  },

  async exportAccountData() {
    return this.request('/account/export');
  },

  async deleteAccount() {
    const result = await this.request('/account', { method: 'DELETE' });
    this.clearSession();
    return result;
  },
};
