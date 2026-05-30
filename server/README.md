# AI家庭教师 Server

阶段 2 后端骨架, 用于接入真实 AI、PostgreSQL 存储和账号级数据隔离。

当前总体进展和下一步优先级见根目录 `项目状态看板.md`。

## 本地启动

1. 安装依赖:

```bash
npm install
```

2. 配置环境变量:

```bash
cp .env.example .env
```

3. 启动 PostgreSQL:

项目根目录提供了 `compose.yaml`。如果本机已安装 Docker:

```bash
docker compose up -d postgres
```

如果本机直接安装 PostgreSQL, 只需保证 `.env` 里的 `DATABASE_URL` 可连接。

4. 初始化数据库:

```bash
npm run db:setup
```

`db:setup` 会执行 `prisma migrate deploy` 并写入基础科目与知识树种子数据。开发阶段如需生成新迁移, 使用 `npm run prisma:migrate`。

5. 启动服务:

```bash
npm run dev
```

6. 跑通 API smoke:

```bash
npm run smoke:api
```

## 调用约定

阶段 2 MVP 已提供验证码登录骨架: `POST /auth/otp/request` 创建一次性验证码, `POST /auth/otp/login` 校验验证码、创建用户并返回 `sessionToken`。登录请求必须包含协议同意状态, 服务会记录当前协议版本和同意时间。内测环境可设置 `INTERNAL_TEST_INVITE_CODE`; 设置后验证码请求和登录请求都必须携带匹配的 `inviteCode`, 否则返回 403。后续业务接口优先使用 bearer token:

```http
Authorization: Bearer <sessionToken>
```

为兼容早期联调, 服务可接受 `x-user-id: <user id>`。设置 `ALLOW_LEGACY_USER_ID_AUTH=false` 后会关闭该入口, 正式账号体系接入短信/微信登录后应保持关闭。
`POST /auth/mock-login` 只保留为早期联调入口, 可通过 `ALLOW_MOCK_LOGIN=false` 关闭; 生产环境必须关闭 mock 登录。`AUTH_OTP_DEV_MODE=true` 时验证码会返回 `devCode`, 只允许开发或小范围内测; 生产必须设置为 `false`, 并把 `AUTH_OTP_DELIVERY_PROVIDER=http`、`AUTH_OTP_DELIVERY_ENDPOINT` 和 `AUTH_OTP_DELIVERY_TOKEN` 配到真实短信、微信或其他发送网关。

所有学习数据查询都必须带 `user_id` 条件, 不能跨用户读取。
如果 session 缺失、过期、已注销或用户不存在, 业务接口会返回 401 或 404。
单账号每日提问和 AI 引导步数会做配额限制, 超限返回 429。

## AI 接入

默认 `.env.example` 中 `LLM_API_KEY` 为空, 服务会走 mock provider, 便于先联调数据库和页面。

配置 OpenAI 或兼容 OpenAI 协议的模型后, `/questions/:id/answer/next` 会调用真实模型:

```env
LLM_PROVIDER="openai"
LLM_MODEL="gpt-4o-mini"
LLM_API_KEY="..."
LLM_BASE_URL="https://api.openai.com/v1"
BODY_LIMIT_BYTES=8388608
SECURITY_HEADERS_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
CORS_ALLOWED_ORIGINS="https://app.example.com,https://admin.example.com"
OCR_PROVIDER="mock"
OCR_API_KEY=""
OCR_ENDPOINT=""
ALLOW_LEGACY_USER_ID_AUTH=true
ALLOW_MOCK_LOGIN=true
DAILY_QUESTION_LIMIT=50
DAILY_AI_STEP_LIMIT=150
PLUS_DAILY_QUESTION_LIMIT=200
PLUS_DAILY_AI_STEP_LIMIT=600
PLUS_PRICE_CENTS_MONTHLY=2900
PAYMENT_PROVIDER="dev"
PAYMENT_PROVIDER_ENDPOINT=""
PAYMENT_PROVIDER_TOKEN=""
PAYMENT_WEBHOOK_SECRET="..."
PAYMENT_READY=false
PUSH_PROVIDER="dev"
PUSH_ENDPOINT=""
PUSH_TOKEN=""
PUSH_READY=false
OPS_MAX_AI_FAILURE_RATE=0.08
OPS_MAX_DAILY_AI_COST=100
OPS_MIN_REVIEW_COMPLETION_RATE=0.5
OPS_MIN_AVERAGE_FEEDBACK_RATING=3.5
UPLOAD_RETENTION_DAYS=30
UPLOAD_STORAGE_PROVIDER="local"
UPLOAD_STORAGE_ENDPOINT=""
UPLOAD_STORAGE_TOKEN=""
AI_EVENT_RETENTION_DAYS=180
EXPIRED_SESSION_RETENTION_DAYS=30
NOTIFICATION_RETENTION_DAYS=180
DISABLED_DEVICE_TOKEN_RETENTION_DAYS=180
ALLOW_PUBLIC_UPLOAD_ACCESS=true
INTERNAL_TEST_INVITE_CODE=""
AUTH_OTP_SECRET="..."
AUTH_OTP_DEV_MODE=true
AUTH_OTP_DELIVERY_PROVIDER="dev"
AUTH_OTP_DELIVERY_ENDPOINT=""
AUTH_OTP_DELIVERY_TOKEN=""
AUTH_OTP_TTL_MINUTES=10
AUTH_OTP_MAX_ATTEMPTS=5
AUTH_OTP_RETENTION_DAYS=7
AUTH_OTP_MIN_INTERVAL_SECONDS=60
```

内测阶段建议保留每日额度和邀请码。`OCR_PROVIDER` 默认为 `mock`, 后续可通过 `OCR_ENDPOINT` 接第三方 OCR。`BODY_LIMIT_BYTES` 默认 8MB, 用于容纳 5MB 图片转 base64 后的 JSON 请求。`SECURITY_HEADERS_ENABLED` 默认开启基础安全响应头, 生产不得关闭。`RATE_LIMIT_ENABLED` 默认开启进程内基础限流, `RATE_LIMIT_WINDOW_MS` 和 `RATE_LIMIT_MAX` 控制每个来源 IP 的固定窗口请求数; 生产仍建议叠加网关/WAF 限流。`CORS_ALLOWED_ORIGINS` 为空时允许开发联调来源; 生产必须配置为 App/API 网关和管理后台的真实来源列表。`AUTH_OTP_SECRET` 用于验证码哈希, `AUTH_OTP_DELIVERY_PROVIDER=http` 时会将 `{ phone, code, purpose, requestId, expiresAt }` POST 到 `AUTH_OTP_DELIVERY_ENDPOINT`, 并用 `AUTH_OTP_DELIVERY_TOKEN` 作为 bearer token。`UPLOAD_STORAGE_PROVIDER=local` 使用本地文件存储, `UPLOAD_STORAGE_PROVIDER=http` 时会将 `{ contentType, imageData }` POST 到 `UPLOAD_STORAGE_ENDPOINT`, 并用 `UPLOAD_STORAGE_TOKEN` 作为 bearer token, 发送网关需返回 `imageUrl`。`AUTH_OTP_TTL_MINUTES`、`AUTH_OTP_MAX_ATTEMPTS` 和 `AUTH_OTP_MIN_INTERVAL_SECONDS` 控制验证码有效期、错误次数和重复发送间隔, `AUTH_OTP_RETENTION_DAYS` 控制验证码记录清理周期。`DAILY_QUESTION_LIMIT` 控制单账号每日新题数, `DAILY_AI_STEP_LIMIT` 控制单账号每日 AI 引导步数。`PLUS_DAILY_QUESTION_LIMIT`、`PLUS_DAILY_AI_STEP_LIMIT` 和 `PLUS_PRICE_CENTS_MONTHLY` 控制 Plus 订阅权益和价格; `PAYMENT_PROVIDER=dev` 仅用于开发和 CI, `PAYMENT_PROVIDER=http` 会向 `PAYMENT_PROVIDER_ENDPOINT` 创建 checkout, `PAYMENT_WEBHOOK_SECRET` 用于校验支付回调签名, 生产必须设置 `PAYMENT_READY=true` 前确认真实支付、退款和对账流程。`PUSH_PROVIDER=dev` 仅记录模拟投递, `PUSH_PROVIDER=http` 会把设备 token 和通知内容 POST 到 `PUSH_ENDPOINT`, 并用 `PUSH_TOKEN` 作为 bearer token; 生产必须设置 `PUSH_READY=true` 前确认真实推送到达、退订和夜间免打扰策略。`OPS_MAX_AI_FAILURE_RATE`、`OPS_MAX_DAILY_AI_COST`、`OPS_MIN_REVIEW_COMPLETION_RATE` 和 `OPS_MIN_AVERAGE_FEEDBACK_RATING` 控制运营健康检查阈值, 触发失败时应暂停扩量。`UPLOAD_RETENTION_DAYS` 控制本地题目图片清理周期, `AI_EVENT_RETENTION_DAYS` 控制 AI 调用日志保留周期, `EXPIRED_SESSION_RETENTION_DAYS` 控制过期和已登出 session 的清理周期, `NOTIFICATION_RETENTION_DAYS` 控制通知投递记录保留周期, `DISABLED_DEVICE_TOKEN_RETENTION_DAYS` 控制停用设备 token 保留周期, `INTERNAL_TEST_INVITE_CODE` 控制内测准入。`ALLOW_LEGACY_USER_ID_AUTH` 仅用于早期联调兼容, 内测和生产应设为 `false`, 强制所有业务请求使用 session token。`ALLOW_MOCK_LOGIN` 可在内测期保留为 `true`, 生产必须设为 `false`。`ALLOW_PUBLIC_UPLOAD_ACCESS` 仅用于早期图片 URL 联调; 生产必须设为 `false`, 本地图片读取需要有效 session。

## 已有接口

- `GET /health`
- `GET /ready`
- `GET /account/export`
- `DELETE /account`
- `GET /admin/summary`
- `GET /admin/users`
- `GET /admin/users/:id`
- `GET /admin/feedback`
- `GET /admin/ai-events`
- `GET /admin/billing`
- `GET /admin/billing/reconciliation`
- `GET /admin/ops-health`
- `GET /notifications/status`
- `POST /notifications/review-reminders/run`
- `GET /notifications/deliveries`
- `POST /auth/otp/request`
- `POST /auth/otp/login`
- `POST /auth/mock-login`
- `POST /auth/logout`
- `GET /billing/status`
- `POST /billing/checkout`
- `POST /billing/cancel`
- `POST /billing/webhook`
- `GET /devices`
- `POST /devices`
- `DELETE /devices/:id`
- `GET /dashboard`
- `POST /feedback`
- `GET /knowledge-tree?subject=math`
- `GET /me`
- `GET /plans`
- `POST /uploads/images`
- `GET /uploads/images/:filename`
- `POST /ocr/extract`
- `PATCH /me/profile`
- `PATCH /me/reminder`
- `POST /questions`
- `POST /questions/:id/answer/next`
- `POST /questions/:id/finish`
- `GET /reports/weekly`
- `GET /reports/parent-weekly`
- `GET /review-tasks?scope=all`
- `GET /mistakes`
- `GET /review-tasks/today`
- `POST /review-tasks/:id/answer` returns `mastery`; correct answers increment `correctStreak`, two consecutive correct answers mark the knowledge point `mastered`, and a wrong answer resets pending tasks into a new D1/D3/D7/D15 cycle.

## 当前验证命令

```bash
npx prisma validate
npm run prisma:generate
npm run config:check
npm run prototype:check
npm run mobile:check
npm run deploy:check -- --profile internal
npm run verify:static
npm run prisma:deploy
npm run prisma:seed
npm run db:check
npm run readiness:static
node -e "import('./src/app.js').then(async ({ buildApp }) => { const app = await buildApp({ logger: false }); const health = await app.inject({ method: 'GET', url: '/health' }); const ready = await app.inject({ method: 'GET', url: '/ready' }); console.log(health.statusCode, health.body); console.log(ready.statusCode, ready.body); await app.close(); })"
npm run smoke:api
npm run uploads:cleanup
npm run retention:cleanup
npm run reminders:run -- --time 19:30 --dry-run
npm run ops:check -- --days 7
npm run eval:ai
```

其中 `npm run prisma:deploy`、`npm run prisma:seed`、`npm run db:check` 和 `npm run smoke:api` 需要 PostgreSQL 已启动。
`npm run verify:static` 是无需数据库的一键验证, 会执行 JS 语法检查、Prisma Client 生成、Prisma schema 校验、配置检查、上传清理、AI 评测和静态 readiness。仓库也提供 GitHub Actions workflow `Server Static Verification`, 用于 PR 和 main 分支推送时自动执行同一检查。
`npm run prototype:check` 会检查 `prototype` 的 PWA 安装配置、service worker 缓存清单、离线页和原型 JS 语法; H5 内测分发前应单独执行一次。
`prototype/admin.html` 是静态内测运营控制台, 可配置后端 API 地址和 `ADMIN_TOKEN`, 聚合健康闸口、关键指标、商业化对账、内容审核和最近用户。该页面只适合内部访问, 如果随 H5 一起托管, 必须通过独立域名、VPN、基础认证或平台访问控制限制公开访问, 并确保后端 `CORS_ALLOWED_ORIGINS` 只允许可信来源。
`npm run mobile:check` 会执行 `mobile` Expo 骨架的静态检查, 包括 App 配置、核心文件、JS 语法和 bearer session API 契约; `npm run verify:static` 已包含该检查。
完整 API 链路由 GitHub Actions workflow `Server API Smoke` 覆盖, 它会启动 PostgreSQL service, 执行 `npm run db:setup`、`npm run db:check` 和 `npm run smoke:api`。
`npm run deploy:check -- --profile internal` 和 `npm run deploy:check -- --profile production` 用于目标环境部署前的严格配置检查; 开发环境不要求通过。
`npm run eval:ai` 不依赖数据库; 默认使用 mock provider, 配置 `LLM_API_KEY` 后可评测真实模型。
`npm run uploads:cleanup` 会删除 `uploads/images` 中超过 `UPLOAD_RETENTION_DAYS` 的本地图片, 内测环境建议通过 cron 或部署平台定时任务每天执行一次。
`npm run retention:cleanup` 会将已过期订阅标记为 `expired`, 删除超过 `AI_EVENT_RETENTION_DAYS` 的 AI 事件日志、超过 `EXPIRED_SESSION_RETENTION_DAYS` 的过期或已登出 session、超过 `AUTH_OTP_RETENTION_DAYS` 的验证码记录、超过 `NOTIFICATION_RETENTION_DAYS` 的通知投递记录, 以及超过 `DISABLED_DEVICE_TOKEN_RETENTION_DAYS` 的停用设备 token, 需要数据库连接, 内测环境建议每天执行一次。
`npm run reminders:run -- --time 19:30` 会按指定提醒时间查找待复习用户并投递复习提醒; 部署平台可每分钟运行一次当前时间, 或按允许的提醒时间槽运行。加 `--dry-run` 只返回候选用户, 不写投递记录。
`npm run ops:check -- --days 7` 会按运营阈值检查 AI 失败率、AI 日均成本、复习完成率和反馈评分; 结果为 `fail` 时应暂停扩量并排查。
`npm run readiness:static` 会检查不依赖数据库的内测门槛, 包括关键脚本、迁移、文档、路由注册、评测报告和清理配置。

`/health` 只检查服务进程是否存活; `/ready` 会检查必要环境变量和数据库连接, 更适合部署、内测放量和监控探针使用。

## AI 质量评测

评测题集位于 `evals/cases.json`, 脚本位于 `scripts/eval-ai.js`。

```bash
npm run eval:ai
npm run eval:ai -- --output evals/reports/latest.json
```

当前评测指标:

- 直接泄露答案率低于 10%
- 错因具体率高于 80%
- 变式题知识点一致率高于 80%
- 内容安全用例通过率 100%
- P95 响应时间低于 12 秒

## 内容安全

`POST /questions` 会在创建题目前执行确定性内容安全检查, 并记录 `safety_check` AI 事件。当前会拦截明显的考试作弊、危险伤害、违法请求、未成年人性安全风险和敏感个人信息输入。

`POST /feedback` 会拦截身份证号、银行卡号、家庭住址等敏感个人信息, 避免反馈渠道保存不必要的隐私数据。

真实模型评测后, 建议同步填写根目录 `AI评测记录模板.md`。
进入内测前, 按根目录 `内测准备清单.md` 做检查。

## 内测运营接口

配置 `.env` 中的 `ADMIN_TOKEN`, 使用请求头访问:

```http
x-admin-token: <ADMIN_TOKEN>
```

也可以打开 `prototype/admin.html`, 填入后端 API 地址和 `ADMIN_TOKEN` 后查看运营数据。静态控制台会读取 `/admin/summary`、`/admin/metrics`、`/admin/ops-health`、`/admin/billing`、`/admin/billing/reconciliation`、`/admin/content-review` 和 `/admin/users`; 它不是公开用户功能, 不应被搜索引擎索引或暴露给内测用户。

可用接口:

- `GET /admin/summary`
- `GET /admin/metrics?days=7`
- `GET /admin/ops-health?days=7`
- `GET /admin/content-review?days=7&take=50`
- `GET /admin/questions?days=7&take=50&subjectCode=math&status=guiding`
- `GET /admin/questions/:id`
- `GET /admin/users?take=50`
- `GET /admin/users/:id`
- `GET /admin/feedback?take=50`
- `GET /admin/ai-events?take=50`
- `GET /admin/billing?days=7&take=50`
- `GET /admin/billing/reconciliation?take=20`
- `GET /notifications/status`
- `POST /notifications/review-reminders/run`
- `GET /notifications/deliveries?take=50`

`/admin/metrics` 面向小规模内测观察, 返回新用户、活跃用户、留存 cohort、复习完成率、反馈评分、AI 失败率、AI 成本和每日趋势。
`/admin/ops-health` 面向每日放量决策, 返回 pass/warn/fail、阈值、观测值和 recommendedAction。
`/admin/billing` 用于查看订单、订阅和订单状态金额汇总; `/admin/billing/reconciliation` 用于发现已支付无订阅、退款后仍有 active 订阅、订阅已过期但状态仍 active 等对账异常。
`/devices` 保存 App 或 PWA 注册的推送 token; `/notifications/review-reminders/run` 供定时任务按 `reviewReminderTime` 执行复习提醒投递, 并写入 `NotificationDelivery` 方便运营排查。

`/admin/content-review` 汇总安全拦截、AI 失败、低评分反馈和内容/AI 质量反馈。`/admin/questions` 支持按时间窗口、用户、科目、状态、输入类型和关键词检索题目。`/admin/questions/:id` 用于单题回放, 返回原题、答疑消息、错题记录、复习任务和该用户附近的 AI 日志。

## 静态原型接入方式

当前 `prototype` 仍默认使用本地假数据。要切到后端联调:

1. 启动本服务。
2. 打开 `prototype/me.html`。
3. 在“后端 API”中填写服务地址, 例如 `http://localhost:3000`。
4. 重新登录或在“后端 API”配置后自动同步账号。
5. 进入“提问”页, 文字输入会优先调用 `/questions` 和 `/questions/:id/answer/next`。
6. 点击“加入错题并生成复习任务”会调用 `/questions/:id/finish`, 生成错题和 D1/D3/D7/D15 复习任务。
7. 进入“复习”页会优先调用 `/review-tasks?scope=all`, 提交答案会调用 `/review-tasks/:id/answer`。
8. 首页会优先调用 `/dashboard`, 错题本列表会优先调用 `/mistakes`, 知识图谱会优先调用 `/knowledge-tree?subject=all`。
9. “我的 -> 学习报告”会优先调用 `/reports/weekly`, 展示最近 7 天提问、错题、复习完成率和薄弱点。
10. “我的”页支持导出当前账号数据和注销账号。注销会删除该账号绑定的学生档案、题目、答疑记录、错题、复习任务、AI 日志、反馈和本地题目图片。

拍照识题在后端 API 启用时会优先调用 `/uploads/images` 和 `/ocr/extract`, 默认使用本地文件存储与 mock OCR; 本地图片由 `npm run uploads:cleanup` 按 `UPLOAD_RETENTION_DAYS` 清理。生产应设置 `UPLOAD_STORAGE_PROVIDER=http`, 通过对象存储或预签名上传网关返回长期可控的 `imageUrl`。`ALLOW_PUBLIC_UPLOAD_ACCESS=false` 后, 读取本地题目图片必须带有效 session。语音暂时仍使用本地原型数据。正式 App 上线前应确保全链路 HTTPS。
