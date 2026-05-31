export function createApiClient({ baseUrl, sessionToken, onSessionToken }) {
  const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/$/, '');

  async function request(path, options = {}) {
    if (!normalizedBaseUrl) throw new Error('请先配置后端 API');

    const headers = {
      'content-type': 'application/json',
      ...(options.headers || {}),
    };
    if (sessionToken) headers.authorization = `Bearer ${sessionToken}`;

    const response = await fetch(`${normalizedBaseUrl}${path}`, {
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
      throw error;
    }
    return data;
  }

  return {
    requestOtp({ phone, inviteCode }) {
      return request('/auth/otp/request', {
        method: 'POST',
        body: { phone, inviteCode: inviteCode || undefined },
      });
    },

    async loginWithOtp({
      phone,
      code,
      inviteCode,
      nickname = '学生',
      grade = '初中',
      consentAccepted = false,
      policyVersion = 'internal-test-v1',
    }) {
      const result = await request('/auth/otp/login', {
        method: 'POST',
        body: {
          phone,
          code,
          inviteCode: inviteCode || undefined,
          nickname,
          grade,
          gradeStage: 'junior',
          consentAccepted,
          policyVersion,
        },
      });
      if (result.sessionToken && onSessionToken) onSessionToken(result.sessionToken);
      return result;
    },

    logout() {
      return request('/auth/logout', { method: 'POST', body: {} });
    },

    getMe() {
      return request('/me');
    },

    exportAccount() {
      return request('/account/export');
    },

    deleteAccount() {
      return request('/account', { method: 'DELETE' });
    },

    getHealth() {
      return request('/health');
    },

    getReady() {
      return request('/ready');
    },

    getDashboard() {
      return request('/dashboard');
    },

    getReviewTasks() {
      return request('/review-tasks/today');
    },

    answerReviewTask(taskId, { answer }) {
      return request(`/review-tasks/${taskId}/answer`, {
        method: 'POST',
        body: { answer },
      });
    },

    getMistakes() {
      return request('/mistakes');
    },

    getParentWeeklyReport() {
      return request('/reports/parent-weekly');
    },

    getPlans() {
      return request('/plans');
    },

    getBillingStatus() {
      return request('/billing/status');
    },

    getKnowledgeTree({ subject = 'all' } = {}) {
      return request(`/knowledge-tree?subject=${encodeURIComponent(subject)}`);
    },

    createQuestion({ text, subjectCode = 'math' }) {
      return request('/questions', {
        method: 'POST',
        body: {
          subjectCode,
          inputType: 'text',
          originalText: text,
        },
      });
    },

    createImageQuestion({ imageUrl, ocrText, subjectCode = 'math' }) {
      return request('/questions', {
        method: 'POST',
        body: {
          subjectCode,
          inputType: 'image',
          imageUrl,
          ocrText,
          originalText: ocrText || '图片题目',
        },
      });
    },

    uploadImage({ imageData, contentType }) {
      return request('/uploads/images', {
        method: 'POST',
        body: { imageData, contentType },
      });
    },

    extractOcr({ imageUrl, imageData }) {
      return request('/ocr/extract', {
        method: 'POST',
        body: { imageUrl, imageData },
      });
    },

    nextAnswer(questionId) {
      return request(`/questions/${questionId}/answer/next`, {
        method: 'POST',
        body: {},
      });
    },

    finishQuestion(questionId, { solvedIndependently = false, forceCreateErrorRecord = false } = {}) {
      return request(`/questions/${questionId}/finish`, {
        method: 'POST',
        body: { solvedIndependently, forceCreateErrorRecord },
      });
    },

    registerDeviceToken({ platform, provider, token }) {
      return request('/devices', {
        method: 'POST',
        body: { platform, provider, token },
      });
    },

    createCheckout({ planCode = 'plus' } = {}) {
      return request('/billing/checkout', {
        method: 'POST',
        body: {
          planCode,
          guardianConfirmed: true,
          refundNoticeAccepted: true,
        },
      });
    },

    cancelSubscription({ cancelAtPeriodEnd = true } = {}) {
      return request('/billing/cancel', {
        method: 'POST',
        body: { cancelAtPeriodEnd },
      });
    },

    submitFeedback({ rating, category = 'other', content, page }) {
      return request('/feedback', {
        method: 'POST',
        body: {
          rating,
          category,
          content,
          page,
        },
      });
    },
  };
}
