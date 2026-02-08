# CHANGELOG

## [0.2.5] - 2026-02-08

### Added - 新功能 ✨

#### 思考深度切换 🧠
- **Think 选择器** - 底部工具栏新增思考深度下拉框，支持 off/minimal/low/medium/high/xhigh
- **会话级控制** - 每个会话独立设置思考深度
- **模型联动** - 切换模型后 thinking 自动重置为 medium
- **xhigh 智能显示** - 仅当前模型支持 xhigh 时才显示该选项
- **双语下拉** - 根据 VS Code 语言自动显示中文/英文标签

#### Windows WSL 支持 🪟
- **WSL 开箱即用** - 在 WSL 中安装 OpenClaw，Windows VS Code 直接使用
- **配置引导** - Gateway 绑定 `0.0.0.0` 即可跨 WSL/Windows 访问
- **零额外配置** - 默认 `localhost:18789` 自动映射到 WSL

### Changed - 聊天状态机重构 🏗️

#### 对齐 Webchat 架构
- **Fire-and-forget 消息发送** - `chat.send` RPC 立即返回，不再阻塞等待 AI 回复
- **RunId 状态追踪** - 用 `chatRunId`（= idempotencyKey）追踪当前运行，收到 `chat final` 事件才清空
- **事件驱动完成检测** - 回复完成由 Gateway `chat` 事件（state=final/error/aborted）决定，而非 Promise
- **忙碌状态对齐** - `isBusy = isSending || !!chatRunId`，完全匹配 webchat 的 `Qr` 函数

#### 自动刷新重建
- **setInterval 固定间隔** - 2 秒轮询 `chat.history`，替代不稳定的链式 setTimeout
- **条件刷新** - 仅在 `chatRunId` 非空（等待回复）时执行，发送中和空闲时不刷新
- **防崩溃** - `_loadHistory` 加 try-catch，单次异常不会永久禁用刷新
- **无闪烁** - 内容指纹 `lastHistoryHash` 避免重复 DOM 重建

### Fixed - 关键 Bug 修复 🐛

#### sendContextSetup 阻塞
- **问题** - `sendContextSetup` 用 `gateway.sendMessage()` 等待 AI 回复 "[No reply needed]"，Gateway 不发 final → 600 秒超时 → 后续所有消息被阻塞
- **修复** - 改为 fire-and-forget（`sendRpc('chat.send')` + `deliver: false`），不等回复

#### 会话历史混乱
- **问题** - 所有 VSCode 窗口共享同一聊天历史（sessionKey 前缀不一致）
- **修复** - sessionKey 统一加 `agent:main:` 前缀，与 Gateway 内部 key 格式一致

### Removed
- 移除 tool-events 实时推送方案（改用 autoRefresh 轮询，更可靠）
- 移除死代码：`_extractToolCalls`、`_fetchAndShowToolCalls`、`_seenToolCallIds`、`setupToolCallListener` 等

### Technical
- `Gateway` 新增 `sendChat()`、`onChatEvent()`/`offChatEvent()`
- `ChatController` 新增 `_setupChatEventListener()` 监听 chat 事件
- idle timeout 120s → 600s，适应长时间 AI 运行
