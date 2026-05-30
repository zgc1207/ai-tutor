(function initAdminConsole() {
  const statusEl = document.getElementById('configStatus');
  const apiBaseInput = document.getElementById('apiBase');
  const adminTokenInput = document.getElementById('adminToken');

  apiBaseInput.value = ApiClient.getBaseUrl();
  adminTokenInput.value = ApiClient.getAdminToken();

  function fmtPercent(value) {
    if (!Number.isFinite(Number(value))) return '--';
    return `${Math.round(Number(value) * 100)}%`;
  }

  function fmtMoneyCents(value) {
    return `¥${(Number(value || 0) / 100).toFixed(2)}`;
  }

  function fmtCost(value) {
    return Number(value || 0).toFixed(4);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[char]));
  }

  function setStatus(text, type = '') {
    statusEl.textContent = text;
    statusEl.className = `admin-status-line ${type}`;
  }

  function metric(label, value, hint = '') {
    return `
      <div class="admin-metric">
        <div class="admin-metric-value">${value}</div>
        <div class="admin-metric-label">${label}</div>
        ${hint ? `<div class="admin-metric-hint">${hint}</div>` : ''}
      </div>
    `;
  }

  function listItem(title, meta, level = '') {
    return `
      <div class="admin-list-item ${level}">
        <div class="admin-list-title">${title}</div>
        <div class="admin-list-meta">${meta}</div>
      </div>
    `;
  }

  function renderOpsHealth(data) {
    const status = document.getElementById('opsStatus');
    status.textContent = `${data.status || '--'} / ${data.recommendedAction || '--'}`;
    status.className = `admin-pill ${data.status || ''}`;
    document.getElementById('opsSummary').innerHTML = [
      metric('AI 失败率', fmtPercent(data.summary?.aiFailureRate), `阈值 ${fmtPercent(data.thresholds?.maxAiFailureRate)}`),
      metric('AI 日均成本', fmtCost(data.summary?.dailyAiCost), `阈值 ${data.thresholds?.maxDailyAiCost}`),
      metric('复习完成率', fmtPercent(data.summary?.reviewCompletionRate), `阈值 ${fmtPercent(data.thresholds?.minReviewCompletionRate)}`),
      metric('平均评分', Number(data.summary?.averageFeedbackRating || 0).toFixed(1), `阈值 ${data.thresholds?.minAverageFeedbackRating}`),
    ].join('');
    document.getElementById('opsChecks').innerHTML = (data.checks || []).map(check => listItem(
      `${check.name}: ${check.status}`,
      `${check.message} 观测值 ${check.observed}`,
      check.status,
    )).join('');
  }

  function renderMetrics(data, summary) {
    document.getElementById('metricsGrid').innerHTML = [
      metric('新增用户', summary.newUsers || 0),
      metric('活跃用户', data.acquisition?.activeUsers || 0),
      metric('提问数', data.learningLoop?.questionCount || 0),
      metric('错题数', summary.errorRecords || 0),
      metric('复习完成率', fmtPercent(data.learningLoop?.reviewCompletionRate)),
      metric('AI 失败率', fmtPercent(data.ai?.failureRate)),
      metric('AI 成本', fmtCost(data.ai?.totalCostEstimate)),
      metric('付费订单', data.billing?.paidOrderCount || 0),
    ].join('');
  }

  function renderBilling(data, reconciliation) {
    const paid = (data.summary?.ordersByStatus || []).find(item => item.status === 'paid');
    const refunded = (data.summary?.ordersByStatus || []).find(item => item.status === 'refunded');
    document.getElementById('billingGrid').innerHTML = [
      metric('已支付订单', paid?.count || 0, fmtMoneyCents(paid?.amountCents)),
      metric('退款订单', refunded?.count || 0, fmtMoneyCents(refunded?.amountCents)),
      metric('订阅记录', data.subscriptions?.length || 0),
      metric('对账状态', reconciliation.ok ? '正常' : '异常'),
    ].join('');

    const issues = [
      ['已支付无订阅', reconciliation.paidOrdersWithoutSubscription?.length || 0],
      ['active 订阅无 paid 订单', reconciliation.activeSubscriptionsWithoutPaidOrder?.length || 0],
      ['退款后仍 active', reconciliation.refundedOrdersWithActiveSubscription?.length || 0],
      ['过期仍 active', reconciliation.expiredActiveSubscriptions?.length || 0],
    ];
    document.getElementById('reconciliationList').innerHTML = issues
      .map(([title, count]) => listItem(title, `${count} 条`, count ? 'warn' : 'pass'))
      .join('');
  }

  function renderContentReview(data) {
    const items = [
      ['安全拦截', data.safetyEvents?.length || 0],
      ['AI 失败', data.aiFailures?.length || 0],
      ['低评分反馈', data.lowRatingFeedback?.length || 0],
      ['内容反馈', data.recentContentFeedback?.length || 0],
    ];
    document.getElementById('contentReviewList').innerHTML = items
      .map(([title, count]) => listItem(title, `${count} 条待看`, count ? 'warn' : 'pass'))
      .join('');
  }

  function renderUsers(users) {
    const rows = (users || []).map(user => `
      <div class="admin-table-row">
        <div>
          <div class="admin-table-title">${escapeHtml(user.nickname || '未命名')}</div>
          <div class="admin-table-meta">${escapeHtml(user.phone || '--')} · ${escapeHtml(user.profile?.grade || '--')}</div>
        </div>
        <div class="admin-table-num">${user.counts?.questions || 0} 题</div>
      </div>
    `).join('');
    document.getElementById('userTable').innerHTML = rows || '<div class="admin-empty">暂无用户</div>';
  }

  async function loadAdminData() {
    if (!ApiClient.getBaseUrl()) {
      setStatus('请先配置后端 API', 'warn');
      return;
    }
    if (!ApiClient.getAdminToken()) {
      setStatus('请先配置 Admin Token', 'warn');
      return;
    }
    setStatus('加载中...');
    try {
      const [summary, metrics, opsHealth, billing, reconciliation, contentReview, users] = await Promise.all([
        ApiClient.adminRequest('/admin/summary?days=7'),
        ApiClient.adminRequest('/admin/metrics?days=7'),
        ApiClient.adminRequest('/admin/ops-health?days=7'),
        ApiClient.adminRequest('/admin/billing?days=7&take=20'),
        ApiClient.adminRequest('/admin/billing/reconciliation?take=20'),
        ApiClient.adminRequest('/admin/content-review?days=7&take=20'),
        ApiClient.adminRequest('/admin/users?take=20'),
      ]);
      renderOpsHealth(opsHealth);
      renderMetrics(metrics, summary);
      renderBilling(billing, reconciliation);
      renderContentReview(contentReview);
      renderUsers(users);
      setStatus(`已加载 ${new Date().toLocaleString()}`, 'pass');
    } catch (error) {
      setStatus(`加载失败: ${error.message}`, 'fail');
    }
  }

  document.getElementById('saveConfigBtn').addEventListener('click', () => {
    ApiClient.setBaseUrl(apiBaseInput.value);
    ApiClient.setAdminToken(adminTokenInput.value);
    loadAdminData();
  });

  document.getElementById('clearConfigBtn').addEventListener('click', () => {
    ApiClient.setAdminToken('');
    adminTokenInput.value = '';
    setStatus('Admin Token 已清除');
  });

  document.getElementById('refreshBtn').addEventListener('click', loadAdminData);
  loadAdminData();
})();
