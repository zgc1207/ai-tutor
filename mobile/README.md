# AI 家庭教师 Mobile

这是阶段 4 App 化的 Expo 骨架, 目标是把已验证的 H5 学习闭环逐步迁移到 iOS/Android。

依赖版本按 Expo SDK 56 对齐: Expo 56、React Native 0.85、React 19.2.3。

当前范围:

- 登录页提供“体验演示”入口, 不需要后端和验证码即可查看首页、提问、错题、复习、报告和知识图谱核心体验。
- 体验演示内置数学、英语、物理示例题, 首页提供“开始一道题”和“今日复习”行动入口, 提问页会展示当前引导流程进度。
- 今日复习页支持“答对”和“仍不会”操作, 演示模式下会即时减少任务或重置 D1 复习, 真实后端模式复用 `/review-tasks/:id/answer`。
- 错题本卡片展示复习状态, 并提供“去复习这类题”动作, 便于从错题直接回到复习任务。
- 使用 `/auth/otp/request` 和 `/auth/otp/login` 做内测登录。
- 所有业务请求只使用 bearer `sessionToken`, 不使用 `x-user-id`。
- 使用 `expo-secure-store` 保存 API 地址和 session token。
- 保持一个登录账号对应一个学生档案, 不提供多学生切换。
- 首屏覆盖首页概览、文字/图片提问、多轮启发式引导、今日复习、错题本、知识图谱、家长周报、Plus 订阅和我的核心入口。
- 提问页可继续获取下一步提示, 也可标记独立解决或加入错题复习, 复用 `/questions/:id/finish` 生成错题和复习任务。
- 使用 `expo-image-picker` 接入拍照/相册图片, 复用 `/uploads/images` 和 `/ocr/extract` 跑通拍照识题骨架。
- 使用 `expo-notifications` 获取 Expo push token, 并注册到 `/devices` 用于复习提醒。
- Plus 页复用 `/plans`、`/billing/status`、`/billing/checkout` 和 `/billing/cancel`, 仍需真机和渠道沙盒验证支付体验。

本地验证:

```bash
npm run verify:static
```

安装依赖并启动:

```bash
npm install
npm run start
```

如果本地环境限制 Expo 写入用户目录, 使用项目内缓存启动:

```bash
npm run start:local
```

`start:local` 会把 Expo 的 HOME 指到 `mobile/.expo-home`, 并使用 `--localhost` 启动 Metro。该目录已加入 `.gitignore`, 不会进入仓库。

体验演示:

1. 启动 Metro 后用 Expo Go 打开 App。
2. 在登录页点击“进入体验演示”。
3. 在首页点击“开始一道题”, 或在提问页点数学/英语/物理示例题。
4. 点击“获取启发式引导”后查看当前流程, 再尝试“下一步提示”或“加入错题”。
5. 进入“复习”页, 对任务点击“答对”或“仍不会”, 观察任务和错题状态变化。
6. 进入“错题”页, 查看状态标签, 点击“去复习这类题”回到复习任务。
7. 依次查看报告和知识图谱; 演示模式下拍照/相册会模拟 OCR 识别结果。

后续迁移顺序:

1. 替换示例包名、图标、启动屏和应用商店素材。
2. 在真机上验证相机、相册、通知权限和 Expo push token 获取。
3. 接入离线缓存错题和最近复习任务。
4. 接入渠道支付或 IAP 流程。
5. 拆分当前单文件 App 为可维护的导航和页面组件。
