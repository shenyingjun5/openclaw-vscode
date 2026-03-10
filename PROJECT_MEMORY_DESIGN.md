# 项目记忆机制设计

## 一、核心问题

**当前问题**：
- Agent 的记忆存储在 `~/.openclaw/workspace/agents/<agentId>/memory/`
- 这是 Agent 级别的记忆，不是项目级别的
- 换 Agent 时，新 Agent 无法访问之前的项目记忆
- 每次都要重新了解项目，效率低

**目标**：
- 实现项目级别的记忆
- 任何 Agent 都可以读取项目的历史和记忆
- 换 Agent 时无缝衔接，快速上手

---

## 二、方案设计

### 1. 目录结构

```
项目根目录/
├── .openclaw/
│   ├── agent                    # 当前关联的 Agent ID
│   ├── PROJECT.md               # 项目概述和文档
│   ├── PROGRESS.md              # 项目进展日志（按日期记录）
│   ├── MEMORY.md                # 项目记忆（精炼的长期记忆）
│   ├── DECISIONS.md             # 技术决策记录（ADR）
│   ├── TODO.md                  # 待办事项
│   ├── CONTEXT.md               # 项目上下文（给 Agent 的快速入门）
│   └── memory/                  # 按日期的详细记录
│       ├── 2026-03-09.md
│       ├── 2026-03-08.md
│       └── ...
```

### 2. 记忆层次（三层结构）

```
┌─────────────────────────────────────────────────────────┐
│  Agent 个人记忆（~/.openclaw/workspace/agents/<id>/）   │
│  - Agent 的个人偏好、风格、学习经验                      │
│  - 跨项目的通用知识                                      │
│  - 不随项目切换而改变                                    │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  项目记忆（<project>/.openclaw/）                        │
│  - 项目的历史、决策、进展                                │
│  - 任何 Agent 都可以读取                                 │
│  - 随项目切换而切换                                      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  会话记忆（临时，在内存中）                              │
│  - 当前会话的上下文                                      │
│  - 会话结束后写入项目记忆                                │
└─────────────────────────────────────────────────────────┘
```

**职责划分**：
- **Agent 个人记忆**：我是谁，我的风格，我的经验
- **项目记忆**：这个项目是什么，做了什么，怎么做的
- **会话记忆**：当前正在做什么

---

## 三、文件格式和内容

### PROJECT.md（项目概述）

```markdown
# 项目名称

## 概述
简短描述项目是什么，解决什么问题。

## 技术栈
- TypeScript
- VSCode Extension API
- Webview API

## 目录结构
src/
  ├── extension.ts
  ├── chatPanel.ts
  └── ...

## 关键模块
- ChatPanel: 聊天面板
- AgentManager: Agent 管理
- CreateAgentPanel: 创建 Agent 界面

## 开发指南
- 编译：npm run compile
- 打包：npx vsce package
- 测试：npm test
```

### PROGRESS.md（项目进展日志）

```markdown
# 项目进展

## 2026-03-09
- ✅ [完成] 实现创建 Agent Webview（Phase 1）
  - 创建 CreateAgentPanel 类
  - 实现 HTML/JS 界面
  - 集成到扩展中
- 🔄 [进行中] 优化 Agent 记忆机制
- 📋 [待办] Phase 2-4 实现

## 2026-03-08
- ✅ [完成] Agent 选择功能（Phase 1-3）
- ✅ [完成] 项目文档完善

## 2026-03-07
- ✅ [完成] 初始版本开发
```

### MEMORY.md（项目记忆）

```markdown
# 项目记忆

## 关键决策
- **2026-03-09**: 采用独立 Webview 创建 Agent
  - 理由：职责分离，更好的 UI/UX
  - 影响：新增 3 个文件，用户体验提升
  
- **2026-03-08**: Agent 选择使用三层降级策略
  - 理由：兼容性和可靠性
  - 策略：RPC > CLI > 文件系统

## 重要信息
- 项目路径：~/Desktop/openclaw-vscode
- 当前版本：0.2.13
- 主要功能：聊天、Agent 管理、代码辅助

## 已知问题
- 无

## 经验教训
- Webview 需要处理好消息通信
- 表单验证要前后端双重验证
```

### DECISIONS.md（技术决策记录 ADR）

```markdown
# 技术决策记录

## ADR-001: 创建 Agent 使用独立 Webview

**日期**: 2026-03-09

**状态**: 已采纳

**背景**:
用户反馈多步骤 InputBox 体验不好，要求改成完整表单界面。

**决策**:
创建独立的 CreateAgentPanel，而不是在聊天面板中添加模态框。

**理由**:
1. 职责分离，聊天面板专注于聊天
2. 更好的 UI/UX，不受聊天面板布局限制
3. 独立开发和测试
4. 未来可扩展为 Agent 管理面板

**影响**:
- 新增 3 个文件（约 850 行代码）
- 用户体验大幅提升
- 开发时间：5-8 小时

**替代方案**:
- 在聊天面板中添加模态框（被拒绝，职责不清晰）
- 继续使用 InputBox（被拒绝，体验差）

---

## ADR-002: Agent 选择使用三层降级策略

**日期**: 2026-03-08

**状态**: 已采纳

**背景**:
需要获取 Agent 列表，但 Gateway 可能不可用。

**决策**:
使用三层降级策略：RPC > CLI > 文件系统

**理由**:
1. RPC 最快，但可能不可用
2. CLI 兼容性好，但需要安装 openclaw
3. 文件系统托底，总能工作

**影响**:
- 提高可靠性
- 兼容多种环境
```

### TODO.md（待办事项）

```markdown
# 待办事项

## 高优先级
- [ ] Phase 2: 实时验证和预览优化
- [ ] Phase 3: 角色选择优化
- [ ] Phase 4: Emoji 选择器、国际化

## 中优先级
- [ ] Agent 管理面板（列表、编辑、删除）
- [ ] 项目记忆机制实现

## 低优先级
- [ ] Agent 模板市场
- [ ] 批量创建 Agent
```

### CONTEXT.md（项目上下文 - 给 Agent 的快速入门）

```markdown
# 项目上下文

## 快速入门（给新 Agent）

**项目是什么**:
openclaw-vscode 扩展，为 VSCode 提供 OpenClaw AI 助手功能。

**当前状态**:
- 版本：0.2.13
- 主要功能已完成：聊天、Agent 管理、创建 Agent
- 正在进行：优化 Agent 记忆机制

**最近的工作**:
- 2026-03-09: 实现创建 Agent Webview（Phase 1）
- 2026-03-08: 实现 Agent 选择功能

**关键文件**:
- src/extension.ts - 扩展入口
- src/chatPanel.ts - 聊天面板
- src/createAgentPanel.ts - 创建 Agent 面板
- src/agentManager.ts - Agent 管理

**开发流程**:
1. 修改代码
2. npm run compile
3. npx vsce package
4. code --install-extension openclaw-x.x.x.vsix

**注意事项**:
- Webview 需要处理好消息通信
- 表单验证要前后端双重验证
- 记得更新版本号
```

### memory/YYYY-MM-DD.md（每日详细记录）

```markdown
# 2026-03-09

## 工作内容
- 实现创建 Agent Webview（Phase 1）
- 设计项目记忆机制

## 详细过程
（详细的工作过程，包括代码修改、问题解决等）

## 遇到的问题
- 无

## 解决方案
- 无

## 经验教训
- Webview 消息通信需要定义清晰的协议
```

---

## 四、工作流程

### 1. Agent 启动时（自动）

```
1. 读取 Agent 个人记忆
   ~/.openclaw/workspace/agents/<agentId>/MEMORY.md

2. 检测项目目录
   检查是否有 .openclaw/ 目录

3. 读取项目记忆（按优先级）
   - .openclaw/CONTEXT.md      （快速入门，最重要）
   - .openclaw/PROJECT.md       （项目概述）
   - .openclaw/PROGRESS.md      （最近进展）
   - .openclaw/MEMORY.md        （长期记忆）
   - .openclaw/memory/今天.md   （今天的工作）
   - .openclaw/memory/昨天.md   （昨天的工作）

4. 显示提示
   "已加载项目记忆：openclaw-vscode (v0.2.13)"
```

### 2. 工作过程中（手动/自动）

**手动更新**：
- 命令：`OpenClaw: Update Project Progress`
- 命令：`OpenClaw: Update Project Memory`
- 命令：`OpenClaw: Add Decision Record`

**自动更新**：
- 每次重要操作后，自动记录到 `memory/YYYY-MM-DD.md`
- 例如：创建 Agent、修改代码、打包发布等

### 3. 会话结束时（自动）

```
1. 整理今天的工作
   更新 .openclaw/memory/YYYY-MM-DD.md

2. 更新项目进展
   更新 .openclaw/PROGRESS.md

3. 提炼重要信息
   如果有重要决策或经验，更新 .openclaw/MEMORY.md
```

### 4. 切换 Agent 时（自动）

```
1. 保存当前 Agent 的工作
   写入 .openclaw/memory/YYYY-MM-DD.md

2. 切换到新 Agent

3. 新 Agent 自动读取项目记忆
   按照"Agent 启动时"的流程

4. 显示提示
   "已切换到 Agent: frontend-expert"
   "已加载项目记忆：openclaw-vscode (v0.2.13)"
```

---

## 五、VSCode 扩展集成

### 1. 自动初始化

**触发时机**：
- 打开项目时，检查 `.openclaw/` 目录是否存在
- 如果不存在，询问是否初始化项目记忆

**初始化内容**：
```typescript
async function initProjectMemory(projectPath: string) {
    const openclawDir = path.join(projectPath, '.openclaw');
    
    // 创建目录
    fs.mkdirSync(openclawDir, { recursive: true });
    fs.mkdirSync(path.join(openclawDir, 'memory'), { recursive: true });
    
    // 创建默认文件
    fs.writeFileSync(path.join(openclawDir, 'PROJECT.md'), getProjectTemplate());
    fs.writeFileSync(path.join(openclawDir, 'PROGRESS.md'), getProgressTemplate());
    fs.writeFileSync(path.join(openclawDir, 'MEMORY.md'), getMemoryTemplate());
    fs.writeFileSync(path.join(openclawDir, 'DECISIONS.md'), getDecisionsTemplate());
    fs.writeFileSync(path.join(openclawDir, 'TODO.md'), getTodoTemplate());
    fs.writeFileSync(path.join(openclawDir, 'CONTEXT.md'), getContextTemplate());
    
    vscode.window.showInformationMessage('项目记忆已初始化！');
}
```

### 2. 自动读取

**在 ChatController 中**：
```typescript
async function loadProjectMemory() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    
    const openclawDir = path.join(workspaceFolder.uri.fsPath, '.openclaw');
    if (!fs.existsSync(openclawDir)) return;
    
    // 读取项目记忆文件
    const context = readFileIfExists(path.join(openclawDir, 'CONTEXT.md'));
    const project = readFileIfExists(path.join(openclawDir, 'PROJECT.md'));
    const progress = readFileIfExists(path.join(openclawDir, 'PROGRESS.md'));
    const memory = readFileIfExists(path.join(openclawDir, 'MEMORY.md'));
    
    // 读取最近的日志
    const today = new Date().toISOString().split('T')[0];
    const todayLog = readFileIfExists(path.join(openclawDir, 'memory', `${today}.md`));
    
    // 发送给 Agent（作为系统消息或上下文）
    this._webview?.postMessage({
        type: 'projectMemoryLoaded',
        context: context,
        project: project,
        progress: progress,
        memory: memory,
        todayLog: todayLog
    });
    
    // 显示提示
    vscode.window.showInformationMessage('已加载项目记忆');
}
```

### 3. 提供命令

```typescript
// 更新项目进展
vscode.commands.registerCommand('openclaw.updateProjectProgress', async () => {
    const content = await vscode.window.showInputBox({
        prompt: '输入今天的进展',
        placeHolder: '例如: 完成创建 Agent Webview'
    });
    
    if (content) {
        appendToProgress(content);
        vscode.window.showInformationMessage('项目进展已更新');
    }
});

// 更新项目记忆
vscode.commands.registerCommand('openclaw.updateProjectMemory', async () => {
    const openclawDir = getOpenclawDir();
    const memoryFile = path.join(openclawDir, 'MEMORY.md');
    
    // 打开文件让用户编辑
    const doc = await vscode.workspace.openTextDocument(memoryFile);
    await vscode.window.showTextDocument(doc);
});

// 添加决策记录
vscode.commands.registerCommand('openclaw.addDecisionRecord', async () => {
    // 打开一个表单，收集决策信息
    // 然后追加到 DECISIONS.md
});
```

### 4. 在 Heartbeat 中提醒

```typescript
// 在 HEARTBEAT.md 中添加
/**
 * 每天检查一次：
 * - 是否更新了项目进展？
 * - 是否有重要决策需要记录？
 * - 是否需要整理项目记忆？
 */
```

---

## 六、实现步骤

### Phase 1: 基础结构（2-3小时）

**目标**: 定义目录结构和文件格式

**任务**:
1. 定义 `.openclaw/` 目录结构
2. 创建文件模板（PROJECT.md, PROGRESS.md, MEMORY.md 等）
3. 实现初始化函数（创建默认文件）
4. 实现读取函数（读取项目记忆）

**验收标准**:
- ✓ 可以初始化项目记忆目录
- ✓ 可以读取项目记忆文件
- ✓ 文件格式清晰，易于编辑

### Phase 2: 自动化（2-3小时）

**目标**: Agent 启动时自动读取项目记忆

**任务**:
1. 在 ChatController 中添加 `loadProjectMemory()` 方法
2. Agent 启动时自动调用
3. 显示"已加载项目记忆"提示
4. 将项目记忆作为上下文发送给 Agent

**验收标准**:
- ✓ Agent 启动时自动读取项目记忆
- ✓ 显示加载提示
- ✓ Agent 可以访问项目记忆

### Phase 3: 命令和 UI（2-3小时）

**目标**: 提供更新和管理项目记忆的命令

**任务**:
1. 实现 `openclaw.updateProjectProgress` 命令
2. 实现 `openclaw.updateProjectMemory` 命令
3. 实现 `openclaw.addDecisionRecord` 命令
4. 在聊天面板中添加快速访问按钮

**验收标准**:
- ✓ 可以通过命令更新项目进展
- ✓ 可以快速打开项目记忆文件
- ✓ 可以添加决策记录

### Phase 4: 切换 Agent 优化（1-2小时）

**目标**: 切换 Agent 时自动加载项目记忆

**任务**:
1. 在 `_handleSwitchAgent` 中添加加载项目记忆的逻辑
2. 显示"正在加载项目记忆..."提示
3. 显示"已切换到 Agent: xxx"提示

**验收标准**:
- ✓ 切换 Agent 时自动加载项目记忆
- ✓ 显示加载提示
- ✓ 新 Agent 可以立即访问项目记忆

---

## 七、优势对比

| 对比项 | 当前方案 | 新方案 |
|--------|---------|--------|
| 记忆范围 | Agent 级别 | 项目级别 |
| 切换 Agent | 需要重新了解项目 | 自动加载项目记忆 |
| 协作 | 每个 Agent 独立记忆 | 共享项目记忆 |
| 记忆持久化 | Agent workspace | 项目目录 |
| 版本控制 | 不在项目中 | 可以提交到 Git |
| 团队共享 | 不支持 | 支持（通过 Git） |
| 记忆层次 | 单层 | 三层（Agent/项目/会话） |
| 快速上手 | 需要手动了解 | 自动加载 CONTEXT.md |

**核心优势**:
1. ✅ 项目记忆与项目绑定，不随 Agent 切换而丢失
2. ✅ 任何 Agent 都可以快速了解项目历史
3. ✅ 记忆文件可以提交到 Git，团队共享
4. ✅ 清晰的记忆层次（Agent 个人 vs 项目共享）
5. ✅ 自动化的记忆管理（读取、更新、提醒）
6. ✅ 支持多人协作（通过 Git 同步项目记忆）

---

## 八、示例场景

### 场景 1: 新 Agent 接手项目

```
1. 用户切换到新 Agent "frontend-expert"

2. Agent 启动，自动读取：
   - CONTEXT.md: "这是一个 VSCode 扩展项目..."
   - PROJECT.md: "技术栈：TypeScript, VSCode API..."
   - PROGRESS.md: "最近完成：创建 Agent Webview..."
   - MEMORY.md: "关键决策：采用独立 Webview..."

3. Agent 回复：
   "你好！我是 frontend-expert。
   我已经了解了这个项目：
   - 这是一个 VSCode 扩展（openclaw-vscode）
   - 当前版本 0.2.13
   - 最近完成了创建 Agent Webview 功能
   - 接下来要做 Phase 2-4
   
   需要我帮你做什么？"
```

### 场景 2: 团队协作

```
1. 开发者 A 使用 Agent "backend-expert" 完成了一个功能
   - 更新了 PROGRESS.md
   - 记录了决策到 DECISIONS.md
   - 提交到 Git

2. 开发者 B 拉取代码
   - 切换到 Agent "frontend-expert"
   - Agent 自动读取项目记忆
   - 了解到开发者 A 做了什么

3. 开发者 B 继续开发
   - Agent 基于项目记忆提供建议
   - 无需重新了解项目
```

### 场景 3: 长期项目

```
1. 项目开发 3 个月后
   - PROGRESS.md 记录了所有进展
   - MEMORY.md 记录了关键决策和经验
   - DECISIONS.md 记录了所有技术决策

2. 新成员加入
   - 阅读 CONTEXT.md 快速了解项目
   - 阅读 PROGRESS.md 了解历史
   - 阅读 DECISIONS.md 了解为什么这样做

3. 任何 Agent 都可以：
   - 快速上手
   - 了解项目历史
   - 做出符合项目风格的决策
```

---

## 九、注意事项

### 1. 隐私和安全

- 项目记忆文件可能包含敏感信息
- 建议在 `.gitignore` 中添加 `.openclaw/memory/` （详细日志）
- 但保留 `.openclaw/*.md` （概述和决策）

### 2. 文件大小

- 定期清理旧的 `memory/YYYY-MM-DD.md` 文件
- 只保留最近 30 天的详细日志
- 重要信息提炼到 `MEMORY.md`

### 3. 冲突处理

- 多人协作时，可能出现 Git 冲突
- 建议使用 Markdown 格式，易于合并
- 或者使用 JSON 格式，但可读性差

### 4. 性能

- 项目记忆文件不应太大（建议 < 100KB）
- 读取时只加载必要的文件
- 使用缓存避免重复读取

---

## 十、总结

**核心思想**:
- 记忆分层：Agent 个人 vs 项目共享
- 项目记忆与项目绑定，存储在 `.openclaw/` 目录
- 任何 Agent 都可以读取项目记忆
- 自动化管理，减少手动操作

**预期效果**:
- 换 Agent 时无缝衔接
- 团队协作更高效
- 项目历史清晰可追溯
- 新成员快速上手

**开发成本**:
- Phase 1-4 总计 7-11 小时
- 约 500-800 行代码
- 可分阶段实现，逐步优化
