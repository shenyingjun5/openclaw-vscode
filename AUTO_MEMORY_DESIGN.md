# 项目记忆自动记录方案

## 一、核心思路

**边做边记，实时日志 + 自动归档**

- **实时日志**：Agent 每次回复后自动记录到 `memory/YYYY-MM-DD.md`
- **自动归档**：定期整理日志，提炼重要信息到 `MEMORY.md` 和 `PROGRESS.md`
- **无需命令**：直接写文件，不需要用户手动操作

---

## 二、记录层次

### 1. 详细日志（`memory/YYYY-MM-DD.md`）

**内容**：
- 每次对话的记录（时间、问题、回复摘要）
- 重要操作的记录（创建 Agent、打包发布等）
- 遇到的问题和解决方案

**保留时间**：30 天（自动清理旧日志）

**格式**：
```markdown
# 2026-03-09

## 14:30 - 讨论项目记忆规则
- **问题**：项目记忆，agent是按什么规则记录的？
- **回复**：解释了当前实现和改进方案
- **关键点**：需要实现自动记录机制

## 14:35 - 创建 Agent
- **操作**：创建新 Agent "frontend-expert"
- **配置**：角色=前端专家，Emoji=⚛️
- **结果**：成功创建

## 15:00 - 实现项目记忆自动记录
- **任务**：实现实时日志功能
- **修改文件**：chatController.ts, projectMemoryManager.ts
- **状态**：进行中
```

### 2. 精炼记忆（`MEMORY.md`）

**内容**：
- 关键决策和理由
- 重要信息（项目路径、版本等）
- 经验教训

**保留时间**：永久

**格式**：
```markdown
# 项目记忆

## 关键决策
- **2026-03-09**: 采用实时日志 + 自动归档的项目记忆方式
  - 理由：边做边记，不需要事后总结
  - 影响：Agent 可以更好地记住项目历史

## 重要信息
- 项目路径：~/Desktop/openclaw-vscode
- 当前版本：0.2.16
- 主要功能：聊天、Agent 管理、项目记忆

## 经验教训
- 实时记录比事后总结更准确
- 命令不如直接写文件简单
```

### 3. 进展日志（`PROGRESS.md`）

**内容**：
- 按日期记录完成的任务
- 格式：`- ✅ [完成] 任务描述`

**保留时间**：永久

**格式**：
```markdown
# 项目进展

## 2026-03-09
- ✅ [完成] 实现创建 Agent Webview（Phase 1）
- ✅ [完成] 实现项目记忆机制（Phase 1-4）
- 🔄 [进行中] 实现项目记忆自动记录

## 2026-03-08
- ✅ [完成] Agent 选择功能（Phase 1-3）
```

---

## 三、记录时机

### 1. 实时记录（自动）

**触发时机**：
- Agent 每次回复后
- 用户执行重要操作后（创建 Agent、打包发布等）

**记录内容**：
- 时间戳
- 用户问题（摘要，不超过 100 字）
- Agent 回复（摘要，不超过 200 字）
- 关键点（可选）

**实现方式**：
```typescript
// 在 ChatController 中，Agent 回复后
async _onAgentReply(message: string) {
    // ... 处理回复 ...
    
    // 自动记录到日志
    await ProjectMemoryManager.getInstance().appendDailyLog({
        time: new Date(),
        type: 'conversation',
        question: this._lastUserMessage,  // 用户问题
        reply: message,                   // Agent 回复
        summary: this._extractSummary(message)  // 提取摘要
    });
}
```

**记录规则**：
- 用户问题：保留原文（如果太长，截取前 100 字）
- Agent 回复：提取摘要（关键点、决策、操作）
- 代码块：不记录（太长）
- 错误信息：完整记录

### 2. 操作记录（自动）

**触发时机**：
- 创建 Agent
- 删除 Agent
- 切换 Agent
- 打包发布
- 初始化项目记忆

**记录内容**：
- 操作类型
- 操作参数
- 操作结果

**实现方式**：
```typescript
// 在 AgentManager 中，创建 Agent 后
async createAgent(config: AgentCreateConfig) {
    // ... 创建 Agent ...
    
    // 自动记录到日志
    await ProjectMemoryManager.getInstance().appendDailyLog({
        time: new Date(),
        type: 'operation',
        operation: 'createAgent',
        params: { id: config.id, name: config.name, role: config.role },
        result: 'success'
    });
}
```

### 3. 自动归档（定期）

**触发时机**：
- 每天 23:00（使用定时器）
- 或者 Agent 启动时检查昨天的日志是否已归档

**归档内容**：
1. 读取昨天的 `memory/YYYY-MM-DD.md`
2. 提炼重要信息：
   - 关键决策 → `MEMORY.md`
   - 完成的任务 → `PROGRESS.md`
3. 标记为已归档

**实现方式**：
```typescript
// 定时器或 Agent 启动时
async archiveYesterdayLog() {
    const yesterday = getYesterdayDate();
    const logPath = `memory/${yesterday}.md`;
    
    // 检查是否已归档
    if (this.isArchived(logPath)) return;
    
    // 读取日志
    const log = this.readDailyLog(logPath);
    
    // 提炼重要信息（简单规则或 AI）
    const decisions = this.extractDecisions(log);
    const tasks = this.extractTasks(log);
    
    // 更新 MEMORY.md 和 PROGRESS.md
    if (decisions.length > 0) {
        this.appendToMemory(decisions);
    }
    if (tasks.length > 0) {
        this.appendToProgress(yesterday, tasks);
    }
    
    // 标记为已归档
    this.markAsArchived(logPath);
}
```

**提炼规则**（简单版）：
- 包含"决策"、"决定"、"采用"等关键词 → 关键决策
- 包含"完成"、"实现"、"✅"等关键词 → 完成的任务
- 包含"问题"、"错误"、"失败"等关键词 → 经验教训

**提炼规则**（AI 版，可选）：
- 使用 AI 分析日志内容
- 提取关键信息
- 生成摘要

### 4. 手动记录（可选）

**方式 1：用户直接编辑文件**
- 用户可以直接打开 `.openclaw/` 目录下的文件编辑
- 不需要命令，不需要 UI

**方式 2：Agent 主动记录**
- Agent 在回复中可以说："我已经记录了这个决策到项目记忆中"
- 通过特殊标记触发记录（例如：`[RECORD: 这是一个重要决策]`）

---

## 四、记录格式

### 1. 日志条目格式

**对话记录**：
```markdown
## HH:MM - 对话主题
- **问题**：用户问题摘要
- **回复**：Agent 回复摘要
- **关键点**：提取的关键信息（可选）
```

**操作记录**：
```markdown
## HH:MM - 操作类型
- **操作**：操作描述
- **参数**：操作参数
- **结果**：成功/失败
```

**问题记录**：
```markdown
## HH:MM - 遇到问题
- **问题**：问题描述
- **原因**：问题原因
- **解决方案**：如何解决
- **经验教训**：学到了什么
```

### 2. 摘要提取规则

**用户问题摘要**：
- 保留原文（如果 < 100 字）
- 否则提取关键词（例如："询问项目记忆规则"）

**Agent 回复摘要**：
- 提取关键点（决策、操作、建议）
- 忽略代码块、长篇解释
- 保留重要信息（例如："建议采用实时日志方式"）

**示例**：
```
用户问题：项目记忆，agent是按什么规则记录的？
→ 摘要：询问项目记忆的记录规则

Agent 回复：（长篇解释）
→ 摘要：解释了当前实现和改进方案，建议采用实时日志 + 自动归档的方式
```

---

## 五、实现架构

### 1. ProjectMemoryManager 扩展

**新增方法**：
```typescript
class ProjectMemoryManager {
    // 追加日志条目
    async appendDailyLog(entry: LogEntry): Promise<void>
    
    // 读取日志
    readDailyLog(date: string): string
    
    // 提炼重要信息
    extractDecisions(log: string): Decision[]
    extractTasks(log: string): Task[]
    
    // 更新精炼记忆
    appendToMemory(decisions: Decision[]): void
    appendToProgress(date: string, tasks: Task[]): void
    
    // 归档管理
    isArchived(logPath: string): boolean
    markAsArchived(logPath: string): void
    
    // 清理旧日志（保留 30 天）
    cleanOldLogs(): void
}
```

**LogEntry 类型**：
```typescript
interface LogEntry {
    time: Date;
    type: 'conversation' | 'operation' | 'problem';
    
    // 对话记录
    question?: string;
    reply?: string;
    summary?: string;
    
    // 操作记录
    operation?: string;
    params?: any;
    result?: 'success' | 'failure';
    
    // 问题记录
    problem?: string;
    cause?: string;
    solution?: string;
    lesson?: string;
}
```

### 2. ChatController 集成

**在 Agent 回复后自动记录**：
```typescript
private async _handleMessage(data: any) {
    // ... 发送消息 ...
    
    // 保存用户问题（用于后续记录）
    this._lastUserMessage = data.content;
}

private async _onAgentReply(message: string) {
    // ... 处理回复 ...
    
    // 自动记录到日志
    if (this._lastUserMessage) {
        await ProjectMemoryManager.getInstance().appendDailyLog({
            time: new Date(),
            type: 'conversation',
            question: this._lastUserMessage,
            reply: message,
            summary: this._extractSummary(message)
        });
        
        this._lastUserMessage = null;
    }
}

private _extractSummary(message: string): string {
    // 简单提取：取前 200 字，去掉代码块
    let summary = message.replace(/```[\s\S]*?```/g, '[代码]');
    if (summary.length > 200) {
        summary = summary.substring(0, 200) + '...';
    }
    return summary;
}
```

### 3. AgentManager 集成

**在重要操作后自动记录**：
```typescript
async createAgent(config: AgentCreateConfig) {
    // ... 创建 Agent ...
    
    // 自动记录
    await ProjectMemoryManager.getInstance().appendDailyLog({
        time: new Date(),
        type: 'operation',
        operation: 'createAgent',
        params: { id: config.id, name: config.name, role: config.role },
        result: 'success'
    });
}

async deleteAgent(agentId: string) {
    // ... 删除 Agent ...
    
    // 自动记录
    await ProjectMemoryManager.getInstance().appendDailyLog({
        time: new Date(),
        type: 'operation',
        operation: 'deleteAgent',
        params: { id: agentId },
        result: 'success'
    });
}
```

### 4. 定时归档

**使用 VSCode 的定时器**：
```typescript
// 在 extension.ts 中
export function activate(context: vscode.ExtensionContext) {
    // ... 其他初始化 ...
    
    // 每小时检查一次是否需要归档
    const archiveTimer = setInterval(async () => {
        const now = new Date();
        // 每天 23:00 归档
        if (now.getHours() === 23 && now.getMinutes() === 0) {
            await ProjectMemoryManager.getInstance().archiveYesterdayLog();
        }
    }, 60000); // 每分钟检查一次
    
    context.subscriptions.push({
        dispose: () => clearInterval(archiveTimer)
    });
}
```

**或者在 Agent 启动时检查**：
```typescript
private async _handleReady() {
    // ... 其他初始化 ...
    
    // 检查是否需要归档昨天的日志
    await ProjectMemoryManager.getInstance().checkAndArchive();
}
```

---

## 六、优势

### 1. 实时记录
- ✅ 边做边记，不会遗漏
- ✅ 不需要事后总结
- ✅ 记录更准确

### 2. 自动化
- ✅ 不需要用户手动操作
- ✅ 不需要命令
- ✅ 直接写文件，简单高效

### 3. 结构化
- ✅ 日志格式清晰
- ✅ 易于查找和回顾
- ✅ 分层存储（详细日志 + 精炼记忆）

### 4. 可扩展
- ✅ 可以添加更多记录类型
- ✅ 可以使用 AI 提炼信息
- ✅ 可以集成到其他工具

---

## 七、实现优先级

### Phase 1：实时日志（立即实现）

**目标**：Agent 回复后自动记录到日志

**任务**：
1. 扩展 ProjectMemoryManager，添加 `appendDailyLog()` 方法
2. 在 ChatController 中，Agent 回复后调用 `appendDailyLog()`
3. 实现简单的摘要提取（去掉代码块，截取前 200 字）
4. 测试：发送几条消息，检查日志是否正确记录

**预计时间**：1-2 小时

### Phase 2：操作记录（后续实现）

**目标**：重要操作后自动记录到日志

**任务**：
1. 在 AgentManager 中，创建/删除 Agent 后调用 `appendDailyLog()`
2. 在其他重要操作后添加记录（打包发布、初始化项目记忆等）
3. 测试：执行操作，检查日志是否正确记录

**预计时间**：1 小时

### Phase 3：自动归档（可选）

**目标**：定期整理日志，提炼重要信息

**任务**：
1. 实现 `archiveYesterdayLog()` 方法
2. 实现简单的提炼规则（关键词匹配）
3. 在 Agent 启动时或定时器中调用
4. 测试：等待一天，检查是否自动归档

**预计时间**：2-3 小时

### Phase 4：AI 提炼（未来优化）

**目标**：使用 AI 提炼日志中的重要信息

**任务**：
1. 调用 AI 分析日志内容
2. 提取关键决策、任务、经验教训
3. 生成摘要

**预计时间**：3-4 小时

---

## 八、注意事项

### 1. 性能

- 日志写入是异步的，不阻塞用户操作
- 每次只追加一条记录，不重写整个文件
- 定期清理旧日志（保留 30 天）

### 2. 隐私

- 日志可能包含敏感信息
- 建议在 `.gitignore` 中添加 `.openclaw/memory/`
- 但保留 `.openclaw/*.md`（概述和决策）

### 3. 文件大小

- 每天的日志文件不应太大（建议 < 1MB）
- 如果太大，可以分割成多个文件
- 或者只记录摘要，不记录完整内容

### 4. 错误处理

- 写入失败时不应影响用户操作
- 记录错误日志，但不显示给用户
- 提供手动修复机制（重新生成日志）

---

## 九、总结

**核心思路**：
- 实时记录：边做边记，不需要事后总结
- 自动化：不需要命令，直接写文件
- 分层存储：详细日志 + 精炼记忆
- 定期归档：自动整理，提炼重要信息

**预期效果**：
- Agent 可以记住项目的所有历史
- 换 Agent 时可以快速了解项目
- 团队协作时可以共享项目记忆
- 不需要用户手动操作

**实现成本**：
- Phase 1：1-2 小时（实时日志）
- Phase 2：1 小时（操作记录）
- Phase 3：2-3 小时（自动归档）
- 总计：4-6 小时
