# 项目记忆

## 关键决策

### 1. ChatController 共享架构
**决策**：将聊天核心逻辑抽取到 `ChatController` 类，供侧边栏（`ChatProvider`）和独立面板（`ChatPanel`）共享。

**理由**：
- 避免代码重复
- 统一业务逻辑，减少维护成本
- 便于功能扩展和 bug 修复

**影响**：
- 代码量减少约 40%
- 新功能只需在一处实现
- 状态管理更加清晰

### 2. 聊天状态机设计
**决策**：使用 `isSending` 和 `chatRunId` 两个状态变量追踪聊天状态。

**状态定义**：
- `isSending = true`：正在发送 RPC 请求
- `chatRunId != null`：等待 AI 回复
- `isBusy() = isSending || !!chatRunId`：忙碌状态

**理由**：
- 对齐 webchat 的状态机设计
- 避免 chat 事件先于 RPC 响应到达时被跳过
- 支持消息队列（忙碌时排队）

### 3. 自动刷新机制
**决策**：采用双速率自动刷新策略。

**策略**：
- 等待 AI 回复时：2 秒间隔（快速捕获回复和工具调用）
- 空闲时：5 秒间隔（捕获后台任务回复）

**优化**：
- 内容指纹检查（hash），跳过无变化的重建
- 批量渲染历史消息，最后统一滚动
- 保持用户滚动位置（非底部时不自动滚动）

**理由**：
- 平衡实时性和性能
- 避免频繁刷新导致的闪烁
- 提升用户体验

### 4. Agent 管理三层降级策略
**决策**：Agent 列表获取采用三层降级策略。

**策略**：
1. Gateway RPC API（最优）
2. CLI 命令（兜底）
3. 文件系统读取（最后手段）

**理由**：
- Gateway 可能未连接或不支持 RPC
- CLI 可能未安装或路径配置错误
- 文件系统读取最可靠，但信息有限

**影响**：
- 提高功能可用性
- 兼容不同环境和配置

### 5. 创建 Agent 的角色模板设计
**决策**：提供 6 个预设角色 + 1 个自定义角色选项。

**预设角色**：
- 全栈开发
- 前端专家
- 后端专家
- DevOps 工程师
- 测试工程师
- 架构师

**设计**：
- 每个角色包含详细的模板描述
- 用户可以在模板基础上修改
- 自定义角色使用 fullstack 作为基础模板

**理由**：
- 降低用户创建 Agent 的门槛
- 提供最佳实践参考
- 保持灵活性（可自定义）

## 重要信息

### SessionKey 格式
```
agent:<agentId>:<windowId>
```
- `agentId`：Agent ID（如 main、dev2）
- `windowId`：窗口 ID（如 main、vscode-1234567890）

### Workspace 关联存储
- 文件：`~/.openclaw/workspace-mappings.json`
- 格式：`{ "/path/to/project": "agentId" }`
- 用途：记住每个项目使用的 Agent

### 项目软连接
- 位置：`~/.openclaw/workspace/agents/<agentId>/projects/<projectName>`
- 类型：Mac/Unix 用 symlink，Windows 用 Junction
- 用途：Agent 可以访问项目文件

### 自动刷新间隔
- 等待回复：2000ms（可配置：`openclaw.autoRefreshInterval`）
- 空闲轮询：5000ms（硬编码）

### 最大并行会话
- 限制：5 个独立面板
- 原因：避免资源占用过高
- 提示：达到上限时显示友好提示

## 已知问题

### 1. "正在思考中"提示消失（已修复）
**问题**：自动刷新时会清空所有消息，导致 thinking indicator 消失。

**原因**：`waitingReply` 消息处理中没有调用 `showThinking()`。

**解决**：在 `waitingReply` 处理中添加 `showThinking()` 调用。

### 2. Windows 路径配置
**问题**：Windows 用户需要手动配置 OpenClaw CLI 路径。

**原因**：Windows 的 PATH 环境变量在 VSCode 中可能不可用。

**解决**：提供配置项 `openclaw.openclawPath`，并在文档中说明。

### 3. WebSocket 重连
**问题**：WebSocket 断开后不会自动重连。

**原因**：避免频繁重连导致的资源浪费。

**解决**：提供手动重连按钮（状态指示器点击）。

### 4. 大文件处理
**问题**：大文件可能导致性能问题。

**原因**：一次性读取整个文件到内存。

**解决**：使用 `readCode` 工具，支持分块读取和 AST 分析。

## 经验教训

### 1. 状态管理要清晰
- 使用明确的状态变量（`isSending`、`chatRunId`）
- 避免隐式状态（如依赖 DOM 元素存在性）
- 状态变化时及时更新 UI

### 2. 自动刷新要优化
- 使用内容指纹避免无意义的重建
- 批量操作，减少 DOM 操作次数
- 保持用户滚动位置，避免打断阅读

### 3. 错误处理要友好
- 分类错误类型（连接、认证、超时、余额等）
- 提供可操作的建议（如何解决）
- 避免技术术语，使用用户能理解的语言

### 4. 跨平台兼容要考虑
- Windows 路径使用反斜杠
- Windows 需要 Junction 而不是 symlink
- WSL 需要特殊配置（Gateway 绑定 0.0.0.0）

### 5. 用户体验要细致
- 实时预览（创建 Agent 时）
- 表单验证（ID 格式、重复检查）
- 加载状态（创建中、检查中）
- 成功反馈（创建成功提示）

### 6. 代码复用要合理
- 抽取共享逻辑到独立类（`ChatController`）
- 避免过度抽象（保持代码可读性）
- 接口设计要灵活（支持不同场景）

### 7. 文档要及时更新
- 代码变更后及时更新文档
- 记录关键决策和理由
- 保留历史版本信息

### 8. 调试技巧
- 使用 `console.log` 追踪状态变化
- 使用 Chrome DevTools 调试 Webview
- 使用 VSCode 调试器调试扩展代码
- 查看 OpenClaw 日志：`openclaw logs`

### 9. 性能优化
- 防抖输入（ID 检查、文件搜索）
- 懒加载（Webview retainContextWhenHidden）
- 资源复用（ChatController 共享）
- 批量渲染（历史消息）

### 10. 测试策略
- 手动测试关键流程（发送消息、切换 Agent）
- 测试边界情况（网络断开、大文件、特殊字符）
- 测试跨平台（Windows、Mac、Linux）
- 测试多窗口场景（并行会话）
