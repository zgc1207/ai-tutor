# AI 家庭教师 - 数据库/API 烟测验收矩阵

更新时间: 2026-06-06

目标: 说明 `cd server && npm run verify:db` 在真实 PostgreSQL 可连接后如何证明主链路已经跑通。它不是静态设计文档, 而是数据库迁移、种子数据、清理任务、提醒 dry run 和 API smoke 的运行验收入口。

## 总入口

```bash
cd server
npm run db:start:local
npm run verify:db
```

`verify:db` 会依次执行:

- `npm run db:doctor`
- `npm run db:setup`
- `npm run db:check`
- `npm run retention:cleanup`
- `npm run reminders:run -- --time 19:30 --dry-run`
- `npm run smoke:api`

## 主链路验收矩阵

### 1. 登录/session/学生档案

产品证明:

- 可以请求验证码。
- 可以使用验证码登录并获得 session token。
- 可以读取当前用户和学生档案。
- 可以更新学生档案。

smoke 输出证据:

- `otp_request`
- `login`
- `me`
- `profile_update`

核心表:

- `User`
- `AuthOtp`
- `Session`
- `StudentProfile`

### 2. 提问/OCR/AI 引导

产品证明:

- 可以上传图片或提交 OCR 输入。
- 可以创建题目。
- 可以获得下一步启发式答疑。
- AI 调用会进入事件审计。

smoke 输出证据:

- `ocr`
- `upload_image`
- `question`
- `answer_next`

核心表:

- `Question`
- `AnswerSession`
- `AnswerMessage`
- `AiEvent`

### 3. 结束题目/加入错题

产品证明:

- 可以结束答疑。
- 未独立解决时可以生成错题。
- 错题可以被错题本接口读取。

smoke 输出证据:

- `finish`
- `mistakes`

核心表:

- `ErrorRecord`
- `Question`
- `KnowledgeNode`

### 4. 复习任务/掌握状态

产品证明:

- 错题入库后可以生成复习任务。
- 可以提交变式题答案。
- 后端会更新复习任务状态和错题掌握状态。

smoke 输出证据:

- `review_tasks`
- `review_answer`

核心表:

- `ReviewTask`
- `ErrorRecord`

### 5. 首页/周报/知识图谱

产品证明:

- 首页可以展示今日复习和最近答疑。
- 周报可以基于学习数据生成。
- 家长周报可以输出薄弱点和行动建议。
- 知识图谱可以聚合掌握状态。

smoke 输出证据:

- `dashboard`
- `weekly_report`
- `parent_weekly_report`
- `knowledge_tree`

核心表:

- `Question`
- `ErrorRecord`
- `ReviewTask`
- `KnowledgeNode`

## 完整通过标志

`npm run smoke:api` 最后应输出:

```text
main_flow_acceptance
```

该输出表示登录、提问、AI 引导、错题、复习、报告五段主链路已经在同一次 smoke run 中完成。它必须建立在真实 PostgreSQL 可连接、迁移已执行、种子数据已存在的前提下。

## CI 证据

GitHub Actions 的 `Server API Smoke` workflow 会使用 PostgreSQL service 执行:

```bash
npm run verify:db | tee verify-db.log
grep -q "main_flow_acceptance:" verify-db.log
```

如果 `main_flow_acceptance` 没有出现, CI 会失败。workflow 还会上传 `server-verify-db-log` artifact, 用于回看完整数据库/API smoke 日志。

## 当前限制

- 当前本机没有 Docker/PostgreSQL, 所以还不能本地证明 `verify:db` 通过。
- 静态命令 `npm run smoke:contract` 只能证明 smoke 覆盖范围存在, 不能替代真实数据库运行。
- 真实 AI 仍需要配置 `LLM_API_KEY`, 执行 `npm run ai:check` 和真实 `npm run eval:ai`。
