# AI 家庭教师 Mobile

这是阶段 4 App 化的 Expo 骨架, 目标是把已验证的 H5 学习闭环逐步迁移到 iOS/Android。

依赖版本按 Expo SDK 56 对齐: Expo 56、React Native 0.85、React 19.2.3。

当前范围:

- App 身份已使用 `com.zgc1207.aitutor` 作为 iOS bundle identifier 和 Android package, 静态检查会阻止继续使用 `com.example.*`。
- 已复用原型品牌图标生成移动端 `icon.png`、`adaptive-icon.png` 和 `splash-icon.png`, 并接入 Expo 图标和启动屏配置。
- 已补充 EAS 构建配置和本地版本号: iOS `buildNumber`、Android `versionCode`, 并提供 preview 内测包构建脚本。
- OTP 登录前必须显式勾选同意用户协议、隐私政策和未成年人使用说明; 客户端不再默认代填 `consentAccepted`。
- 登录页提供“体验演示”入口, 不需要后端和验证码即可查看首页、提问、错题、复习、报告和知识图谱核心体验。
- 体验演示内置数学、英语、物理示例题, 首页提供“开始一道题”和“今日复习”行动入口, 提问页会展示当前引导流程进度。
- 今日复习页支持“答对”和“仍不会”操作, 演示模式下会即时减少任务或重置 D1 复习, 真实后端模式复用 `/review-tasks/:id/answer`。
- 真实后端模式的复习提交已按后端契约发送 `answer` 字段; 答对使用变式题 `correctAnswer`, 仍不会提交错误答案以触发后端 D1/D3/D7/D15 重置逻辑。
- 错题本卡片展示复习状态, 并提供“去复习这类题”动作, 便于从错题直接回到复习任务。
- 家长周报按“本周结论 / 主要薄弱点 / 家长行动清单”分区展示, 并可跳转到相关错题和今日复习。
- 知识图谱以状态卡片展示薄弱、学习中、已掌握知识点, 并可跳转到相关错题或复习计划。
- Plus 页展示免费版和 Plus 权益对比, 演示模式下可模拟开通/取消; 我的页展示账号状态、复习提醒和周报/Plus 入口。
- 我的页提供内测诊断: 可刷新账号/学生档案/今日额度, 并检查后端 `/health` 和 `/ready` 是否可用。
- 登录成功或恢复 session 后会自动同步账号、首页、复习、错题、周报、知识图谱、套餐和后端 readiness; 我的页也提供“同步账号数据”手动入口。
- 我的页提供内测反馈入口, 可提交问题、AI 质量、体验建议或内容安全反馈, 真实后端模式写入 `/feedback`。
- 我的页提供账号数据导出摘要和二次确认注销入口, 真实后端模式复用 `/account/export` 和 `DELETE /account`。
- 登录页和我的页均可查看内测版用户协议、隐私政策和未成年人使用说明摘要。
- 登录页提供 iOS/Android 模拟器 API 快捷配置; 真机 Expo Go 可用 `npm run api:local` 获取局域网后端地址。
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
npm run runtime:check
```

`runtime:check` 会检查 Node、npm、package-lock、node_modules、Expo CLI、关键 Expo/React Native 包、常用 Metro 端口、端口/host bind matrix 和真机/模拟器后端 API 地址建议。它是启动 Expo 前的环境预检, 不能替代 `start:check` 的 Metro 监听验证。

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

如果网络受限导致 Expo 在启动时卡在 DevTools 下载, 使用离线启动:

```bash
npm run start:local:offline
```

`start:local:offline` 会使用本地 Expo HOME, 关闭依赖校验和独立 React Native DevTools shell, 保留 `--localhost` 启动 Metro。这里不直接把 Expo CLI 的 `--offline` 透传给 Expo, 因为 Expo SDK 56 会把 `--offline` 强制切到 LAN host, 不适合作为本机端口验收。

自动检查 Metro 是否真正监听:

```bash
npm run runtime:check
npm run start:check
```

`runtime:check` 先确认本机依赖、Expo CLI 和端口状态, 并分别检查 `127.0.0.1`、`0.0.0.0` 和 LAN 地址能否绑定常用 Metro 端口。`start:check` 会用网络受限模式启动 Expo, 在超时前轮询本机端口, 并输出结构化结果、启动命令、子进程 PID、实际探测端口、Expo startup log 路径、最近阶段事件、建议动作和原始输出尾部。它用于定位“命令看起来启动了, 但 Metro 实际没有监听”的问题; 如果 Expo 事件里出现了不同端口, 脚本也会一起探测。

当前已知本机诊断:

- 2026-06-06 执行 `npm run start:check`, 30 秒后仍未探测到 Metro; Expo startup log 只到 `env:load`, 说明当前机器卡在 dev server setup 之前。该问题仍需继续排查本机 Expo/Node/网络环境或换真机/模拟器环境复测。
- 2026-06-06 执行 `npm run runtime:check`, 8081/8082 在 `127.0.0.1`、`0.0.0.0` 和 LAN 地址 `192.168.31.185` 上全部返回 `EPERM`。这更像本机 Node/网络权限、VPN/代理、安全软件或系统防火墙问题, 不是单纯端口占用。
- 2026-06-06 执行 `EXPO_CHECK_PORT=19000 npm run start:check`, 30 秒后仍停在 `env:load`, 没有进入 `devserver:start`。说明换备用端口不能单独解决当前机器的 Expo 启动阻塞。

连接本机后端:

```bash
npm run api:local
```

- iOS Simulator 通常使用 `http://127.0.0.1:3000`。
- Android Emulator 通常使用 `http://10.0.2.2:3000`。
- 真机 Expo Go 需要手机和电脑在同一 Wi-Fi, 然后把 `expoGoDeviceUrls` 中的地址填到登录页“后端 API”。

生成内测包:

```bash
npm run build:android:preview
npm run build:ios:preview
```

构建前需要先登录 Expo/EAS, 并为 iOS 配置 Apple 开发者账号、证书和设备; Android preview 默认输出 APK, 便于内部安装验证。

体验演示:

1. 启动 Metro 后用 Expo Go 打开 App。
2. 在登录页点击“进入体验演示”。
3. 在首页点击“开始一道题”, 或在提问页点数学/英语/物理示例题。
4. 点击“获取启发式引导”后查看当前流程, 再尝试“下一步提示”或“加入错题”。
5. 进入“复习”页, 对任务点击“答对”或“仍不会”, 观察任务和错题状态变化。
6. 进入“错题”页, 查看状态标签, 点击“去复习这类题”回到复习任务。
7. 进入“报告”页, 查看本周结论、薄弱点和家长行动清单, 再跳转到错题或复习。
8. 查看知识图谱, 点击薄弱知识点的“看相关错题”回到错题本; 演示模式下拍照/相册会模拟 OCR 识别结果。
9. 查看 Plus 和我的页, 模拟开通 Plus、刷新账号信息、检查后端状态、开启复习提醒、提交内测反馈、导出账号摘要、查看协议说明并跳转周报。

后续迁移顺序:

1. 替换图标、启动屏和应用商店素材。
2. 在真机上验证相机、相册、通知权限和 Expo push token 获取。
3. 接入离线缓存错题和最近复习任务。
4. 接入渠道支付或 IAP 流程。
5. 拆分当前单文件 App 为可维护的导航和页面组件。
