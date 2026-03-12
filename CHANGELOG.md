# CHANGELOG

## [0.2.23] - 2026-03-12

### Changed - 修改 🔄

#### 多网关 Profile 匹配增强
- **Agent 列表来源优化** — `agents.list` 优先走 Gateway RPC；失败时按当前 Gateway 端口匹配 profile 配置，最后再回退文件系统
- **安全回退路径** — 多 Gateway 场景下避免直接读取共享 `~/.openclaw/workspace/agents` 导致串数据
- **Profile-aware agent loading** — Prefer Gateway RPC; fallback to profile config matched by gateway port; filesystem as last resort
- **Safer fallback chain** — Avoid cross-gateway contamination from shared workspace scan

#### CLI 执行注入 `--profile`
- **自动注入 profile 参数** — 在多 profile 场景，CLI 兜底命令自动追加 `--profile <name>`
- **重连后重新解析** — `reloadTokenAndReconnect` 时重置 profile 缓存，按新网关地址重新匹配
- **Auto profile injection** — CLI fallback commands now append `--profile <name>` in multi-profile setups
- **Re-resolve on reconnect** — Profile cache resets on reconnect and re-matches by gateway URL/port

### Fixed - 修复 🐛

#### Agent 创建 CLI 兜底兼容
- **创建命令补齐 profile** — `openclaw agents add` 兜底路径支持按当前网关 profile 执行，避免写入错误实例
- **Profile-aware create fallback** — Agent creation via CLI now targets the correct profile instance

## [0.2.22] - 2026-03-12

### Fixed - 修复 🐛

#### 断线重连后发送卡死修复 🔄
- **重连前重置发送状态** — 点击“重新连接”时主动重置 `_isSending`、`_chatRunId` 和 chat 监听器，避免 UI 一直处于发送中
- **连接断开主动通知业务层** — WebSocket 关闭时向 chat 事件处理器发送 `state: error`，触发上层恢复逻辑
- **Reconnect state reset** — Reset `_isSending`, `_chatRunId`, and chat listener before reconnect to prevent stuck sending UI
- **Disconnect error propagation** — Emit `state: error` to chat handlers on WebSocket close so upper layer can recover immediately

### Changed - 修改 🔄

#### 模型切换行为优化 ⚙️
- **移除重复上下文注入** — 切换模型后不再重复发送上下文 setup，减少额外 RPC 并降低干扰
- **Remove redundant context setup** — Stop re-sending context setup after model switch to reduce unnecessary RPC calls

## [0.2.21] - 2026-03-11

### Added - 新增 ✨

#### 项目会话绑定 🔗
- **项目路径哈希** — 使用项目路径的 MD5 哈希作为稳定标识符，确保会话与项目绑定
- **独立会话历史** — 每个项目拥有独立的会话历史，切换项目时自动切换会话
- **会话持久化** — 关闭 VSCode 重新打开同一项目，会话历史自动恢复
- **无项目降级** — 未打开项目时，使用 machineId 作为标识符
- **Project path hashing** — Use MD5 hash of project path as stable identifier to bind sessions to projects
- **Independent session history** — Each project has its own session history, auto-switch when changing projects
- **Session persistence** — Session history auto-restores when reopening the same project
- **No-project fallback** — Use machineId as identifier when no project is open

### Changed - 修改 🔄

#### SessionKey 格式优化 🆔
- **侧边栏** — `agent:main:vscode-main-${windowId}` → `agent:main:vm-${stableId}`
- **面板** — `agent:main:vscode-panel-${windowId}-${panelId}` → `agent:main:vp-${stableId}-${panelId}`
- **Client ID** — 使用项目稳定标识符替代窗口 ID
- **Sidebar** — `agent:main:vscode-main-${windowId}` → `agent:main:vm-${stableId}`
- **Panel** — `agent:main:vscode-panel-${windowId}-${panelId}` → `agent:main:vp-${stableId}-${panelId}`
- **Client ID** — Use project stable identifier instead of window ID

## [0.2.20] - 2026-03-11

### Fixed - 修复 🐛

#### Token 读取优化 🔑
- **Profile 端口匹配** — 支持按端口匹配 profile 配置，自动读取对应实例的 token
- **多实例支持** — 扫描 `~/.openclaw/profiles/` 目录，根据 Gateway URL 端口匹配正确的配置
- **Profile port matching** — Support port-based profile matching to auto-read token from corresponding instance
- **Multi-instance support** — Scan `~/.openclaw/profiles/` directory and match config by Gateway URL port

#### 会话清理优化 🧹
- **保留会话** — 关闭聊天面板时不再删除 Gateway 上的会话，避免意外丢失聊天历史
- **Preserve sessions** — No longer delete Gateway sessions when closing chat panel to avoid accidental history loss

### Changed - 修改 🔄

#### Client ID 优化 🆔
- **唯一标识** — 使用 `vscode-panel-${windowId}-${panelId}` 作为 client.id，确保每个面板有唯一标识
- **Unique identifier** — Use `vscode-panel-${windowId}-${panelId}` as client.id to ensure unique identification for each panel

## [0.2.19] - 2026-03-10

### Added - 新增 ✨

#### Agent 管理功能 🤖
- **Agent 选择器** — 在聊天面板顶部添加 Agent 下拉选择器，支持快速切换 Agent
- **Agent 创建面板** — 提供可视化创建界面，支持 6 种预设角色模板（全栈、前端、后端、DevOps、测试、架构师）+ 自定义角色
- **Agent 管理** — 支持创建、切换、删除 Agent 操作
- **项目本地配置** — Agent 配置保存到项目 `.openclaw/agent` 文件，支持团队共享
- **Agent selector** — Add Agent dropdown selector in chat panel for quick switching
- **Agent creation panel** — Visual creation interface with 6 preset role templates (fullstack, frontend, backend, devops, tester, architect) + custom role
- **Agent management** — Support create, switch, delete Agent operations
- **Project-local config** — Agent config saved to project `.openclaw/agent` file for team sharing

#### 角色模板系统 📝
- **预设角色模板** — 提供 6 种专业角色的 IDENTITY.md 和 SOUL.md 模板
- **自定义角色** — 支持用户自定义角色名称和描述
- **Emoji 可选** — Emoji 字段改为可选，默认使用 🤖
- **Preset role templates** — Provide IDENTITY.md and SOUL.md templates for 6 professional roles
- **Custom role** — Support user-defined role name and description
- **Optional emoji** — Emoji field is now optional, defaults to 🤖

### Fixed - 修复 🐛

#### 思考指示器修复 🔄
- **持久化显示** — 修复思考指示器在自动刷新时消失的问题，在 `waitingReply` 事件中重新显示
- **Persistent display** — Fix thinking indicator disappearing on auto-refresh by re-showing in `waitingReply` event

#### Agent 创建优化 🔧
- **RPC + 文件系统混合方案** — RPC 创建 Agent 后使用文件系统写入 IDENTITY.md 和 SOUL.md（因 `agents.files.set` RPC 不可用）
- **错误处理改进** — 检测 Agent 是否已创建，避免重复创建导致的错误
- **降级策略** — RPC 失败时自动降级到 CLI 命令
- **RPC + filesystem hybrid** — Use filesystem to write IDENTITY.md and SOUL.md after RPC agent creation (as `agents.files.set` RPC is unavailable)
- **Error handling improvement** — Detect if agent already exists to avoid duplicate creation errors
- **Fallback strategy** — Auto-fallback to CLI command when RPC fails

### Changed - 修改 🔄

#### WebSocket RPC 改进 🌐
- **统一连接配置** — 使用 `gateway-client` 作为 client.id，支持 token 认证
- **RPC 优先策略** — Agent 创建优先使用 RPC API，CLI 作为兜底
- **Unified connection config** — Use `gateway-client` as client.id with token authentication
- **RPC-first strategy** — Prioritize RPC API for agent creation, CLI as fallback

## [0.2.11] - 2026-03-07

### Fixed - 修复 🐛

#### Dialog Mode 权限修复 🔐
- **添加缺失的 scopes** — WebSocket 握手时显式请求 `operator.read` 和 `operator.write` scope，修复 "missing scope: operator.write" 错误
- **修正 client.id** — 从 `gateway-client` 改为 `openclaw-control-ui`，符合 Gateway 枚举值要求
- **添加 Origin header** — WebSocket 连接时添加 Origin header，匹配 Gateway 的 allowedOrigins 配置
- **Add missing scopes** — Explicitly request `operator.read` and `operator.write` scopes during WebSocket handshake, fixing "missing scope: operator.write" error
- **Correct client.id** — Changed from `gateway-client` to `openclaw-control-ui` to match Gateway enum values
- **Add Origin header** — Add Origin header to WebSocket connection to match Gateway's allowedOrigins config

**Fixes:** [#1](https://github.com/shenyingjun5/openclaw-vscode/issues/1)

## [0.2.10] - 2026-02-10

### Fixed - 修复 🐛

#### 链接渲染优化 🔗
- **Markdown 自动链接** — 支持 `<https://...>` 语法自动转为可点击链接
- **纯文本 URL 检测** — 未包裹的 URL 自动识别为可点击链接
- **代码块保护** — 代码块和行内代码中的 URL 不会被错误转换（占位符机制）
- **系统浏览器打开** — 所有外部链接点击后通过系统默认浏览器打开，而非 webview 内导航
- **Markdown auto-links** — Support `<https://...>` syntax as clickable links
- **Plain-text URL detection** — Bare URLs auto-detected as clickable links
- **Code block protection** — URLs inside code blocks/inline code are preserved (placeholder mechanism)
- **Open in system browser** — External links open in default browser instead of webview navigation

#### 重连状态反馈 🔌
- **重连成功推送绿灯** — 点击重连成功后，状态灯立即从红变绿，清除错误信息
- **重连失败更新错误** — 重连失败时更新最新错误信息到状态弹窗
- **Reconnect status feedback** — Status indicator turns green immediately after successful reconnect
- **Reconnect failure update** — Error message updates in status popup on reconnect failure

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
