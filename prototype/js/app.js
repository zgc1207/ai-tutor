// ===== 公共逻辑 =====

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

// 渲染顶部用户信息
function renderUserHeader(container) {
  const u = UserStore.get();
  if (!u) return;
  const avatar = (u.nickname || '我')[0];
  container.innerHTML = `
    <div class="student-avatar">${avatar}</div>
    <div class="student-info">
      <div class="student-name">${u.nickname}</div>
      <div class="student-grade">${u.gradeLabel}</div>
    </div>
  `;
}

// 底部 Tab 渲染
function renderTabBar(activeKey) {
  const tabs = [
    { key: 'home',     icon: '🏠', label: '首页',   href: 'index.html'    },
    { key: 'mistakes', icon: '📒', label: '错题本', href: 'mistakes.html' },
    { key: 'ask',      icon: '＋', label: '提问',   href: 'ask.html', center: true },
    { key: 'review',   icon: '🔄', label: '复习',   href: 'review.html'   },
    { key: 'me',       icon: '👤', label: '我的',   href: 'me.html'       },
  ];
  return `
    <nav class="tab-bar">
      ${tabs.map(t => `
        <a href="${t.href}" class="tab-item ${t.center ? 'center' : ''} ${activeKey === t.key ? 'active' : ''}">
          <div class="tab-icon">${t.icon}</div>
          <div>${t.label}</div>
        </a>
      `).join('')}
    </nav>
  `;
}

// 时段问候
function greetingByHour() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了，早点休息';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

// 未成年人保护: 原型阶段先在本地提示连续使用时长, App 化后再接系统级使用时长能力。
const UsageGuard = {
  KEY: 'ai_tutor_usage_guard',
  REST_REMINDER_MINUTES: 25,
  DAILY_NOTICE_MINUTES: 45,

  todayKey() {
    return new Date().toISOString().slice(0, 10);
  },

  read() {
    const raw = localStorage.getItem(this.KEY);
    const today = this.todayKey();
    if (!raw) return { date: today, totalMinutes: 0, sessionStartedAt: Date.now(), restPrompted: false, dailyPrompted: false };
    const state = JSON.parse(raw);
    if (state.date !== today) {
      return { date: today, totalMinutes: 0, sessionStartedAt: Date.now(), restPrompted: false, dailyPrompted: false };
    }
    return state;
  },

  write(state) {
    localStorage.setItem(this.KEY, JSON.stringify(state));
  },

  start() {
    if (!window.UserStore || !UserStore.isLoggedIn()) return;
    const state = this.read();
    if (!state.sessionStartedAt) state.sessionStartedAt = Date.now();
    this.write(state);

    window.setInterval(() => {
      const current = this.read();
      const sessionMinutes = Math.floor((Date.now() - current.sessionStartedAt) / 60000);
      const totalMinutes = current.totalMinutes + sessionMinutes;
      if (!current.restPrompted && sessionMinutes >= this.REST_REMINDER_MINUTES) {
        current.restPrompted = true;
        this.write(current);
        alert('你已经连续学习一段时间了。建议站起来活动一下眼睛和肩颈, 休息 5 分钟再继续。');
        return;
      }
      if (!current.dailyPrompted && totalMinutes >= this.DAILY_NOTICE_MINUTES) {
        current.dailyPrompted = true;
        this.write(current);
        alert('今日学习时间已经不少了。可以把剩余任务安排到明天, 保持稳定节奏更重要。');
      }
    }, 60 * 1000);

    window.addEventListener('beforeunload', () => {
      const current = this.read();
      const sessionMinutes = Math.floor((Date.now() - current.sessionStartedAt) / 60000);
      current.totalMinutes += Math.max(sessionMinutes, 0);
      current.sessionStartedAt = Date.now();
      this.write(current);
    });
  },
};

UsageGuard.start();
