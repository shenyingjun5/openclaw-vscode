# openclaw-vscode

## 概述

OpenClaw VSCode Extension 是一个 AI 编程助手扩展，为 VSCode 提供强大的 AI 对话、代码编辑、多 Agent 管理等功能。

**核心特性**：
- 💬 AI 聊天界面（侧边栏 + 独立面板）
- 🤖 多 Agent 管理（创建、切换、删除）
- 🔄 代码变更预览与应用
- 🎯 技能与工作流自动检测
- 📎 文件与图片附件支持
- 🔌 实时连接状态监控
- 🌍 多语言支持（中文、英文、日语、韩语）

## 技术栈

- **语言**: TypeScript
- **框架**: VSCode Extension API
- **通信**: WebSocket (Gateway 连接)
- **前端**: 原生 HTML/CSS/JavaScript (Webview)
- **依赖**:
  - `ws` - WebSocket 客户端
  - `js-yaml` - YAML 解析

## 目录结构

```
openclaw-vscode/
├── src/                          # TypeScript 源码
│   ├── extension.ts              # 扩展入口
│   ├── chatController.ts         # 聊天核心逻辑（共享）
│   ├── chatProvider.ts           # 侧边栏聊天视图
│   ├── chatPanel.ts              # 独立面板聊天窗口
│   ├── chatSessionManager.ts    # 会话管理
│   ├── gateway.ts                # Gateway 客户端（RPC）
│   ├── gatewayWSClient.ts        # WebSocket 客户端
│   ├── agentManager.ts           # Agent 管理
│   ├── createAgentPanel.ts       # 创建 Agent 面板
│   ├── changeManager.ts          # 代码变更管理
│   ├── diffProvider.ts           # Diff 预览
│   ├── projectMemoryManager.ts   # 项目记忆管理
│   └── ...
├── webview/                      # Webview 前端资源
│   ├── index.html                # 聊天界面 HTML
│   ├── main.js                   # 聊天界面逻辑
│   ├── create-agent.html         # 创建 Agent 界面
│   ├── create-agent.js           # 创建 Agent 逻辑
│   ├── changeCard.js             # 代码变更卡片
│   └── styles.css                # 样式
├── .openclaw/                    # 项目文档
│   ├── PROJECT.md                # 项目概述（本文件）
│   ├── PROGRESS.md               # 进展记录
│   ├── MEMORY.md                 # 项目记忆
│   ├── TODO.md                   # 待办事项
│   ├── DECISIONS.md              # 技术决策
│   └── memory/                   # 日记
└── package.json                  # 扩展配置
```

## 关键模块

### 1. ChatController（聊天核心）
- 统一的聊天业务逻辑，供侧边栏和独立面板共享
- 消息发送、历史加载、工具调用处理
- 状态管理（isSending、chatRunId）
- 自动刷新机制（等待回复时 2s，空闲时 5s）

### 2. AgentManager（Agent 管理）
- Agent 列表获取（三层降级：RPC > CLI > 文件系统）
- Agent 创建、删除、更新
- Workspace 关联（保存/恢复当前项目使用的 Agent）
- 项目软连接（自动创建 Agent workspace 到项目的链接）

### 3. GatewayClient（Gateway 通信）
- WebSocket 连接管理
- RPC 调用封装
- Chat 事件监听
- 连接状态监控

### 4. CreateAgentPanel（创建 Agent）
- 独立的 Webview 面板
- 预设角色模板（全栈、前端、后端、DevOps、测试、架构师）
- 自定义角色支持
- 实时预览和表单验证

### 5. ChangeManager（代码变更）
- 代码变更集管理
- Diff 预览
- 文件级应用/跳过
- 批量接受/拒绝

## 开发指南

### 安装依赖
```bash
npm install
```

### 编译
```bash
npm run compile
```

### 监听模式（开发时）
```bash
npm run watch
```

### 打包 VSIX
```bash
npm run package
# 或
npx vsce package
```

### 测试
1. 按 F5 启动调试（会打开新的 VSCode 窗口）
2. 在新窗口中测试扩展功能

### 发布
```bash
# 打包
npx vsce package

# 发布到 VSCode Marketplace（需要 PAT）
npx vsce publish

# 发布到 Open VSX
npx ovsx publish openclaw-x.x.x.vsix -p <token>
```

## 配置项

- `openclaw.gatewayUrl` - Gateway 地址（默认：http://localhost:18789）
- `openclaw.openclawPath` - OpenClaw CLI 路径（Windows 用户需配置）
- `openclaw.aiOutputLanguage` - AI 输出语言（zh-CN/en/ja/ko）
- `openclaw.autoRefreshInterval` - 自动刷新间隔（毫秒，默认 2000）
- `openclaw.planMode` - 计划模式（默认 false）
- `openclaw.planModePrompt` - 计划模式提示词
- `openclaw.defaultAgent` - 默认 Agent（默认 main）

## 架构设计

### 聊天状态机
```
用户发送消息
  ↓
isSending = true (显示 thinking)
  ↓
发送 RPC
  ↓
收到 waitingReply
  ↓
isSending = false, chatRunId = runId (保持 thinking)
  ↓
启动自动刷新（2s 间隔）
  ↓
收到 chat 事件（delta/final/error）
  ↓
chatRunId = null (隐藏 thinking)
  ↓
切换到空闲刷新（5s 间隔）
```

### Agent 切换流程
```
用户选择 Agent
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
  ↓
发送上下文设置
```

### 自动刷新机制
- **等待回复时**：2 秒间隔（快速捕获 AI 回复和工具调用）
- **空闲时**：5 秒间隔（捕获后台任务回复）
- **优化**：内容指纹检查，跳过无变化的重建（避免闪烁）

## 性能优化

1. **历史记录去重**：通过内容指纹（hash）跳过无变化的重建
2. **批量渲染**：历史消息批量渲染，最后统一滚动
3. **防抖输入**：ID 检查、文件搜索等使用防抖（300ms）
4. **懒加载**：Webview 使用 retainContextWhenHidden 保持状态
5. **资源复用**：ChatController 在侧边栏和独立面板间共享

## 已知限制

1. **最大并行会话**：5 个独立面板（避免资源占用过高）
2. **文件大小限制**：大文件需要分块读取（readCode 工具处理）
3. **WebSocket 重连**：需要手动触发（状态指示器点击重连）
4. **Windows 路径**：需要手动配置 OpenClaw CLI 路径

## 相关链接

- [OpenClaw 官网](https://openclaw.ai)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [扩展 GitHub](https://github.com/shenyingjun5/openclaw-vscode)
- [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=openclaw.openclaw)
- [Open VSX](https://open-vsx.org/extension/openclaw/openclaw)
