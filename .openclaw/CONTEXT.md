# 项目上下文

## 快速入门（给新 Agent）

**项目是什么**:
OpenClaw VSCode Extension - 一个强大的 AI 编程助手扩展，为 VSCode 提供 AI 对话、代码编辑、多 Agent 管理等功能。

**当前状态**:
- 版本：v0.2.19
- 主要功能：
  - ✅ AI 聊天（侧边栏 + 独立面板）
  - ✅ 多 Agent 管理（创建、切换、删除）
  - ✅ 代码变更预览与应用
  - ✅ 技能与工作流自动检测
  - ✅ 文件与图片附件支持
  - ✅ 实时连接状态监控
  - ✅ 多语言支持（中文、英文、日语、韩语）
- 正在进行：文档完善、性能优化

**最近的工作**:
- 2026-03-10：修复"正在思考中"提示消失问题
- 2026-03-10：完善创建 Agent 功能（角色模板、自定义角色）
- 2026-03-09：实现 Agent 管理功能（Phase 1-3，约 1470 行代码）

**关键文件**:
- `src/extension.ts` - 扩展入口，注册命令和视图
- `src/chatController.ts` - 聊天核心逻辑（共享）
- `src/chatProvider.ts` - 侧边栏聊天视图
- `src/chatPanel.ts` - 独立面板聊天窗口
- `src/agentManager.ts` - Agent 管理（创建、切换、删除）
- `src/createAgentPanel.ts` - 创建 Agent 面板
- `src/gateway.ts` - Gateway 客户端（RPC）
- `src/gatewayWSClient.ts` - WebSocket 客户端
- `webview/index.html` - 聊天界面 HTML
- `webview/main.js` - 聊天界面逻辑（约 1500 行）
- `webview/create-agent.html` - 创建 Agent 界面
- `webview/create-agent.js` - 创建 Agent 逻辑

**开发流程**:
1. 修改代码（TypeScript 或 Webview 资源）
2. 编译：`npm run compile`（或 `npm run watch` 监听模式）
3. 测试：按 F5 启动调试（会打开新的 VSCode 窗口）
4. 打包：`npx vsce package`（生成 .vsix 文件）
5. 安装：在 VSCode 中从 VSIX 安装

**注意事项**:
- Webview 代码修改后需要重新加载窗口（Ctrl+R）
- TypeScript 代码修改后需要重新启动调试
- 状态管理要清晰（`isSending`、`chatRunId`）
- 自动刷新要优化（内容指纹、批量渲染）
- 跨平台兼容（Windows 路径、WSL 配置）

## 架构概览

### 核心模块
```
extension.ts (入口)
    ↓
ChatProvider (侧边栏)  ←→  ChatController (核心逻辑)  ←→  ChatPanel (独立面板)
    ↓                           ↓                              ↓
Webview (index.html)      GatewayClient (通信)          Webview (index.html)
    ↓                           ↓
main.js (前端逻辑)        WebSocket 连接
```

### 聊天流程
```
用户输入 → sendMessage() → ChatController._sendMessage()
    ↓
发送 RPC (chat.send)
    ↓
收到 waitingReply → 显示 thinking
    ↓
启动自动刷新 (2s)
    ↓
收到 chat 事件 (delta/final/error)
    ↓
隐藏 thinking → 切换到空闲刷新 (5s)
```

### Agent 管理流程
```
用户选择 Agent → ChatController._handleSwitchAgent()
    ↓
检查 Agent 是否存在
    ↓
更新 currentAgentId
    ↓
生成新 sessionKey (agent:<agentId>:<windowId>)
    ↓
重置会话管理器
    ↓
加载历史记录
    ↓
保存 Workspace 关联
    ↓
创建项目软连接
```

## 常见任务

### 添加新功能
1. 在 `ChatController` 中添加业务逻辑
2. 在 `webview/main.js` 中添加 UI 交互
3. 在 `webview/index.html` 中添加 UI 元素
4. 在 `webview/styles.css` 中添加样式
5. 测试功能是否正常工作

### 修复 Bug
1. 复现问题（在调试窗口中）
2. 使用 `console.log` 追踪状态变化
3. 使用 Chrome DevTools 调试 Webview
4. 修改代码并测试
5. 更新文档（如果需要）

### 添加新命令
1. 在 `package.json` 中注册命令
2. 在 `extension.ts` 中实现命令处理
3. 在 UI 中添加触发入口（如果需要）
4. 测试命令是否正常工作

### 添加新配置项
1. 在 `package.json` 的 `contributes.configuration` 中定义
2. 在代码中使用 `vscode.workspace.getConfiguration('openclaw').get('key')`
3. 在文档中说明配置项的作用
4. 测试配置项是否生效

## 调试技巧

### 调试扩展代码
1. 按 F5 启动调试
2. 在代码中设置断点
3. 触发功能，观察断点
4. 使用调试控制台查看变量

### 调试 Webview
1. 在调试窗口中打开聊天界面
2. 按 Ctrl+Shift+P → "Developer: Open Webview Developer Tools"
3. 在 Console 中查看日志
4. 在 Elements 中检查 DOM
5. 在 Sources 中设置断点

### 查看 OpenClaw 日志
```bash
openclaw logs
openclaw logs --follow  # 实时查看
```

### 查看 Gateway 状态
```bash
openclaw status
openclaw gateway status
```

## 常见问题

### Q: "正在思考中"提示消失了？
A: 已修复（v0.2.19）。在 `waitingReply` 处理中添加了 `showThinking()` 调用。

### Q: 如何添加新的预设角色？
A: 在 `src/createAgentPanel.ts` 的 `roles` 数组中添加新角色，包括 `id`、`name`、`description`、`icon`、`template`。

### Q: 如何修改自动刷新间隔？
A: 在 VSCode 设置中搜索 "OpenClaw: Auto Refresh Interval"，修改值（毫秒）。

### Q: 如何禁用自动刷新？
A: 将 `openclaw.autoRefreshInterval` 设置为 0。

### Q: 如何切换 Agent？
A: 点击聊天界面顶部的 Agent 下拉菜单，选择要切换的 Agent。

### Q: 如何创建新 Agent？
A: 点击 Agent 下拉菜单底部的"创建 Agent"按钮，或执行命令 "OpenClaw: Create Agent"。

### Q: 如何删除 Agent？
A: 目前需要通过 OpenClaw CLI：`openclaw agents delete <agentId>`。UI 删除功能待实现。

## 相关资源

- **项目文档**：`.openclaw/` 目录
  - `PROJECT.md` - 项目概述
  - `PROGRESS.md` - 进展记录
  - `MEMORY.md` - 项目记忆
  - `TODO.md` - 待办事项
  - `DECISIONS.md` - 技术决策

- **OpenClaw 文档**：
  - 官网：https://openclaw.ai
  - GitHub：https://github.com/openclaw/openclaw
  - 文档：https://docs.openclaw.ai

- **VSCode 扩展开发**：
  - 官方文档：https://code.visualstudio.com/api
  - Webview API：https://code.visualstudio.com/api/extension-guides/webview

## 贡献指南

1. Fork 项目
2. 创建功能分支：`git checkout -b feature/xxx`
3. 提交更改：`git commit -m "Add xxx"`
4. 推送分支：`git push origin feature/xxx`
5. 创建 Pull Request

**代码规范**：
- 使用 TypeScript
- 遵循 ESLint 规则
- 添加必要的注释
- 更新相关文档

**提交信息规范**：
- `feat: 添加新功能`
- `fix: 修复 Bug`
- `docs: 更新文档`
- `style: 代码格式调整`
- `refactor: 代码重构`
- `test: 添加测试`
- `chore: 构建/工具变更`
