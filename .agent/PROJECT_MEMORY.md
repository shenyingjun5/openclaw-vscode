# openclaw-vscode - PROJECT_MEMORY

## 长期记忆（可跨会话复用）

### 项目目标
OpenClaw VS Code 扩展。AI 编程助手，连接 OpenClaw Gateway，提供聊天、Diff 预览、多窗口、文件/图片附件、技能自动检测等功能。

### 核心约束
- Gateway 默认地址：http://localhost:18789
- 最多 5 个并行聊天会话（多窗口独立）
- 发布到 Open VSX（非微软官方市场）
- vsix 文件在项目根目录（openclaw-0.2.11.vsix）

### 关键决策
- v0.2.11：Dialog Mode 权限修复（operator.read/write scopes）
- v0.2.10：链接渲染优化（Markdown auto-links + 纯文本 URL + 代码块保护）+ 重连状态反馈
- v0.2.9：chatRunId 竞态修复 + chat 事件监听器修复 + 错误分类增强
- v0.2.8：拖拽文件 + Gateway Token 设置 + 连接状态 UI
- 会话级模型切换，多窗口独立
- 消息队列：AI 响应中可继续发消息，自动排队
- **Agent 选择功能**（2026-03-08）：
  - 用户可在聊天界面选择不同的 Agent
  - 支持创建新 Agent，定义人设（开发相关角色）
  - Agent 选择与 VSCode Workspace 关联
  - 使用 Gateway RPC API（agents.list, agents.create, agents.files.set）
  - SessionKey 格式：`agent:<agentId>:<windowId>`

### 风险与坑点
- Windows/WSL 需要特殊兼容处理（auto-fallback）
- chatRunId 竞态：先设状态+监听器再发 RPC
- webview 外部链接必须通过系统浏览器打开（不能内部导航）
- Agent 切换需要更新 sessionKey 并重新加载历史

### 常用命令
```bash
# 开发
npm install && npm run compile
# 打包
vsce package
# 安装
code --install-extension openclaw-*.vsix
# 发布
npm run publish
```

## Agent 选择功能（2026-03-08）

### 架构
- **AgentManager** (`src/agentManager.ts`)：Agent 管理模块
  - 优先使用 Gateway RPC API
  - 备选使用 CLI 命令
  - 托底使用文件系统读取
- **ChatController** 修改：添加 Agent 切换逻辑
- **Webview UI**：Agent 选择器（HTML + CSS + JavaScript）

### Gateway RPC API
- `agents.list` - 获取 Agent 列表
- `agents.create` - 创建新 Agent
- `agents.update` - 更新 Agent
- `agents.delete` - 删除 Agent
- `agents.files.get/set` - 读写 Agent 文件

### SessionKey 格式
- 格式：`agent:<agentId>:<windowId>`
- 示例：`agent:dev2:panel-1`
- 切换 Agent = 切换 sessionKey

### Workspace 关联
- 存储位置：`~/.openclaw/workspace-mappings.json`
- 格式：`{ "/path/to/workspace": "agentId" }`

### 预设角色
- 全栈开发、前端专家、后端专家
- DevOps 工程师、测试工程师、架构师

### 实现状态
- ✅ Phase 1: 基础功能（Agent 列表、切换、UI）
- ⏳ Phase 2: 创建 Agent 对话框
- ⏳ Phase 3: Agent 管理界面、优化

### 设计文档
- `.agent/AGENT_SELECTOR_DESIGN.md` - 完整需求和 UI 设计

## 最近更新
- 2026-03-08 Agent 选择功能（Phase 1 完成）
- 2026-02-10 v0.2.10：链接渲染 + 重连反馈
- 2026-02-09 v0.2.9：竞态修复
- 2026-02-09 v0.2.8：拖拽文件支持
- 2026-03-01 回填整理
