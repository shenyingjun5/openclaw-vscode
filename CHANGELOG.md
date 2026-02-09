# CHANGELOG

## [0.2.9] - 2026-02-09

### Fixed - 修复 🐛

#### chatRunId 竞态修复 🔄
- **发送前设置 chatRunId** — 对齐 WebChat，先设状态 + 监听器再发 RPC，避免 chat 事件先于 RPC 响应到达时被丢弃
- **idempotencyKey 外部生成** — `crypto.randomUUID()` 在 controller 层生成，传入 `sendChat()`

#### chat 事件监听器丢失修复 🔌
- **新增 `_pendingChatHandlers`** — 缓存 chat 事件 handler，确保 wsClient 重连后自动补挂
- **`_reattachChatHandlers()`** — 在所有 `wsClient.connect()` 之后调用

#### 错误分类增强 🚨
- **新增认证失败** — 匹配 `401`、`Unauthorized`、`invalid_api_key`
- **新增余额不足** — 匹配 `insufficient_quota`、`billing`、`balance`
- **Token 超限匹配** — 新增 `context_length`、`maximum context`（Gateway 返回 LLM 原始异常格式）
- **限流匹配** — 新增 `429`、`rate_limit`
- **模型不可用匹配** — 新增 `model_not_found`、`does not exist`

## [0.2.8] - 2026-02-09

### Added - 新功能 ✨

#### 拖拽文件支持 📁
- **全窗口拖放** — 拖拽文件到聊天面板任意位置，可视化蒙层提示
- **多种来源** — VSCode 文件树、编辑器标签页、系统文件管理器（Finder/Explorer）
- **智能兼容** — `text/uri-list` → `File.path` → `FileReader` 三级兜底

#### Gateway Token 设置 🔑
- **新增设置** — `openclaw.gatewayToken`：直接在 VS Code 设置中填写 Token
- **优先级** — VS Code 设置 > 配置文件（`~/.openclaw/openclaw.json`）
- **热重载** — 修改 Token 或 Gateway 地址后自动重连

#### 连接状态 UI 🔌
- **可点击状态灯** — 绿灯/红灯均可点击查看详情
- **错误分类** — ECONNREFUSED、超时、认证等错误自动转换为友好中文提示
- **快捷操作** — 重新连接、打开设置、打开对话面板
- **关闭对话** — 侧边栏新增关闭按钮

### Fixed - 修复 🐛

#### WSL 连接修复 🪟
- **localhost → 127.0.0.1 自动回退** — 解决部分 WSL 2 环境下 DNS 解析异常

### Technical
- `src/gateway.ts` 新增 `reloadTokenAndReconnect()`、`_classifyError()`、localhost/127.0.0.1 双 URL 回退
- `src/extension.ts` 新增 `showConnectionStatus()` 命令、配置变化监听自动重连
- `src/chatController.ts` 新增 `_handleUriDrop()`、`_handleDropContent()` 拖放处理
- `webview/main.js` 全窗口拖放区域、连接状态弹窗、text/uri-list + FileReader 解析
- `webview/index.html` 新增 `#dropOverlay` 蒙层、`#statusPopup` 弹窗
- `webview/styles.css` 新增 `.drop-overlay`、`.status-popup` 样式

## [0.2.7] - 2026-02-08

### Added - 新功能 ✨

#### AI 头像与昵称显示 🤖
- **头像显示** — 连续 assistant 消息组的首条显示 AI 头像和名称
- **数据来源** — 连接后通过 `agent.identity.get` API 获取
- **多种头像** — 支持 URL（`<img>`）、emoji 和字母（渐变圆形背景）
- **分组逻辑** — 同 role 连续消息只在组首显示一次头像，不重复

#### 计划模式自定义提示词 ✏️
- **新增设置** — `openclaw.planModePrompt`：用户可自定义计划模式指令文本
- **多行编辑** — 设置项支持多行文本输入
- **留空默认** — 不填则使用内置默认文本，自动跟随语言（中/英）
- **标记不变** — `---- 计划模式 ----` / `---- Plan Mode ----` 标记自动包裹，过滤逻辑无需变动

### Technical
- `gateway.ts` 新增 `getAgentIdentity()` 方法
- `chatController.ts` 新增 `_fetchAssistantIdentity()` 连接后推送身份到 webview
- `webview/main.js` 新增 `renderAvatarElement()` + 分组头像渲染
- `webview/styles.css` 新增 `.assistant-header` / `.assistant-avatar` / `.assistant-name` 样式
