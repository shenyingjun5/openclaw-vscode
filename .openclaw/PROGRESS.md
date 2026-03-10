# 项目进展

## 2026-03-10

### ✅ 修复"正在思考中"提示消失问题
- **问题**：用户发送消息后，"招财正在思考中"的提示会消失
- **原因**：自动刷新触发 `loadHistory` 时会清空所有消息（`messages.innerHTML = ''`），虽然有逻辑在重建后检查 `isBusy()` 并重新显示 thinking indicator，但在 `waitingReply` 消息处理中没有调用 `showThinking()`
- **解决方案**：在 `waitingReply` 消息处理中添加 `showThinking()` 调用，确保在等待 AI 回复期间始终显示提示
- **修改文件**：`webview/main.js`

### ✅ 完善创建 Agent 功能
- **需求**：创建 Agent 时，用户应该能够选择预设角色模板，也能自定义角色
- **实现**：
  1. 后端（`createAgentPanel.ts`）：
     - 为每个预设角色添加详细的 `template` 描述
     - 添加"自定义角色"选项（id: 'custom'）
     - 优化角色描述，更加详细和专业
  2. 前端 HTML（`create-agent.html`）：
     - 添加"自定义角色名称"输入框（仅在选择自定义角色时显示）
     - 将"自定义描述"改为"角色描述"，并设为必填项
     - 添加提示文字，说明选择预设角色会自动填充模板
  3. 前端 JS（`create-agent.js`）：
     - 选择角色时自动填充对应的模板描述到描述框
     - 选择"自定义角色"时显示自定义角色名称输入框
     - 更新表单验证逻辑，确保所有必填字段都已填写
     - 自定义角色使用 fullstack 作为基础模板，并在描述中添加自定义角色信息
- **修改文件**：
  - `src/createAgentPanel.ts`
  - `webview/create-agent.html`
  - `webview/create-agent.js`

### 📦 打包发布
- 版本：v0.2.19
- 包含修复：
  1. "正在思考中"提示消失问题
  2. 创建 Agent 角色选择和自定义功能
  3. 角色显示问题

## 2026-03-09

### ✅ Agent 管理功能（Phase 1-3）
- **Phase 1: 基础架构**
  - 创建 `AgentManager` 类，封装 Agent 管理逻辑
  - 实现三层降级策略：Gateway RPC API > CLI > 文件系统
  - 定义 `AgentInfo` 和 `AgentCreateConfig` 接口
  
- **Phase 2: ChatController 集成**
  - 在 `ChatController` 中集成 `AgentManager`
  - 实现 Agent 切换逻辑（更新 sessionKey、重置会话、加载历史）
  - 实现 Workspace 关联（保存/恢复当前项目使用的 Agent）
  - 实现项目软连接（自动创建 Agent workspace 到项目的链接）
  - 添加 Agent 创建、删除、更新功能
  
- **Phase 3: Webview UI**
  - 在聊天界面添加 Agent 下拉选择器
  - 实现 Agent 列表显示（emoji + 名称 + ID）
  - 实现 Agent 切换功能
  - 添加"创建 Agent"按钮
  - 创建独立的 `CreateAgentPanel`（Webview 面板）
  - 实现预设角色选择（6 个预设角色）
  - 实现实时预览和表单验证

- **完成度**：约 1470 行代码
- **修改文件**：
  - `src/agentManager.ts`（新建）
  - `src/chatController.ts`
  - `src/createAgentPanel.ts`（新建）
  - `webview/index.html`
  - `webview/main.js`
  - `webview/create-agent.html`（新建）
  - `webview/create-agent.js`（新建）
  - `webview/styles.css`

### 📝 初始化项目记忆
- 创建 `.openclaw` 目录
- 初始化项目文档结构

## 历史版本

### v0.2.10 (2026-02-XX)
- 🔗 链接渲染改进
  - 支持 Markdown 自动链接 `<https://...>` 语法
  - 自动检测纯文本 URL
  - 代码块保护（占位符机制）
  - 在系统浏览器中打开外部链接
- 🔌 重连状态反馈
  - 重连成功后立即显示绿灯，清除错误信息
  - 重连失败时更新错误信息

### v0.2.5 (2026-02-08)
- 🔄 聊天状态机重构（对齐 webchat）
- 🧠 思考深度控制
- 🪟 WSL 支持
- 🔄 自动刷新重建
- 🐛 Bug 修复

### v0.2.0 之前
- 💬 基础聊天功能
- 🔄 Diff 预览与应用
- 🎯 技能与工作流支持
- 📎 文件与图片附件
- 🔌 WebSocket 连接
- 🌍 多语言支持
