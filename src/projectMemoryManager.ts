import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 项目记忆数据
 */
export interface ProjectMemory {
    context?: string;      // CONTEXT.md - 快速入门
    project?: string;      // PROJECT.md - 项目概述
    progress?: string;     // PROGRESS.md - 进展日志
    memory?: string;       // MEMORY.md - 长期记忆
    decisions?: string;    // DECISIONS.md - 技术决策
    todo?: string;         // TODO.md - 待办事项
    todayLog?: string;     // memory/YYYY-MM-DD.md - 今天的日志
    yesterdayLog?: string; // memory/YYYY-MM-DD.md - 昨天的日志
}

/**
 * 日志条目类型
 */
export interface LogEntry {
    time: Date;
    type: 'operation' | 'progress' | 'decision' | 'problem';
    
    // 操作记录
    operation?: string;      // 操作类型（createAgent, deleteAgent 等）
    params?: any;            // 操作参数
    result?: 'success' | 'failure';  // 操作结果
    
    // 进展记录
    task?: string;           // 任务描述
    status?: 'completed' | 'in-progress';  // 任务状态
    files?: string[];        // 相关文件
    
    // 决策记录
    decision?: string;       // 决策内容
    reason?: string;         // 决策理由
    
    // 问题记录
    problem?: string;        // 问题描述
    solution?: string;       // 解决方案
    lesson?: string;         // 经验教训
}

/**
 * 项目记忆管理器
 */
export class ProjectMemoryManager {
    private static instance: ProjectMemoryManager;
    private openclawDir: string | null = null;

    private constructor() {}

    public static getInstance(): ProjectMemoryManager {
        if (!ProjectMemoryManager.instance) {
            ProjectMemoryManager.instance = new ProjectMemoryManager();
        }
        return ProjectMemoryManager.instance;
    }

    /**
     * 获取项目的 .openclaw 目录
     */
    private getOpenclawDir(): string | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        const dir = path.join(workspaceFolder.uri.fsPath, '.openclaw');
        this.openclawDir = dir;
        return dir;
    }

    /**
     * 检查项目记忆是否已初始化
     */
    public isInitialized(): boolean {
        const dir = this.getOpenclawDir();
        if (!dir) return false;

        return fs.existsSync(dir) && fs.existsSync(path.join(dir, 'CONTEXT.md'));
    }

    /**
     * 尝试初始化项目记忆（原子操作，避免多窗口冲突）
     * @returns true 如果成功初始化，false 如果已经初始化
     */
    public tryInitialize(): boolean {
        const dir = this.getOpenclawDir();
        if (!dir) return false;

        try {
            // 检查是否已经初始化
            if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'CONTEXT.md'))) {
                return false; // 已经初始化
            }

            // 使用原子操作创建目录
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // 创建 memory 目录
            const memoryDir = path.join(dir, 'memory');
            if (!fs.existsSync(memoryDir)) {
                fs.mkdirSync(memoryDir, { recursive: true });
            }

            // 创建默认文件
            this.createFileIfNotExists(path.join(dir, 'CONTEXT.md'), this.getContextTemplate());
            this.createFileIfNotExists(path.join(dir, 'PROJECT.md'), this.getProjectTemplate());
            this.createFileIfNotExists(path.join(dir, 'PROGRESS.md'), this.getProgressTemplate());
            this.createFileIfNotExists(path.join(dir, 'MEMORY.md'), this.getMemoryTemplate());
            this.createFileIfNotExists(path.join(dir, 'DECISIONS.md'), this.getDecisionsTemplate());
            this.createFileIfNotExists(path.join(dir, 'TODO.md'), this.getTodoTemplate());

            // 创建今天的日志文件
            const today = new Date().toISOString().split('T')[0];
            const todayLogPath = path.join(memoryDir, `${today}.md`);
            this.createFileIfNotExists(todayLogPath, this.getDailyLogTemplate(today));

            return true; // 成功初始化

        } catch (err) {
            console.error('[ProjectMemory] Failed to initialize:', err);
            return false;
        }
    }

    /**
     * 初始化项目记忆
     */
    public async initialize(): Promise<void> {
        const dir = this.getOpenclawDir();
        if (!dir) {
            throw new Error('No workspace folder found');
        }

        // 创建目录
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const memoryDir = path.join(dir, 'memory');
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }

        // 创建默认文件
        this.createFileIfNotExists(path.join(dir, 'CONTEXT.md'), this.getContextTemplate());
        this.createFileIfNotExists(path.join(dir, 'PROJECT.md'), this.getProjectTemplate());
        this.createFileIfNotExists(path.join(dir, 'PROGRESS.md'), this.getProgressTemplate());
        this.createFileIfNotExists(path.join(dir, 'MEMORY.md'), this.getMemoryTemplate());
        this.createFileIfNotExists(path.join(dir, 'DECISIONS.md'), this.getDecisionsTemplate());
        this.createFileIfNotExists(path.join(dir, 'TODO.md'), this.getTodoTemplate());

        // 创建今天的日志文件
        const today = new Date().toISOString().split('T')[0];
        const todayLogPath = path.join(memoryDir, `${today}.md`);
        this.createFileIfNotExists(todayLogPath, this.getDailyLogTemplate(today));
    }

    /**
     * 创建文件（如果不存在）
     */
    private createFileIfNotExists(filePath: string, content: string): void {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, content, 'utf-8');
        }
    }

    /**
     * 读取项目记忆
     */
    public loadProjectMemory(): ProjectMemory | null {
        const dir = this.getOpenclawDir();
        if (!dir || !fs.existsSync(dir)) {
            return null;
        }

        const memory: ProjectMemory = {};

        // 读取主要文件
        memory.context = this.readFileIfExists(path.join(dir, 'CONTEXT.md'));
        memory.project = this.readFileIfExists(path.join(dir, 'PROJECT.md'));
        memory.progress = this.readFileIfExists(path.join(dir, 'PROGRESS.md'));
        memory.memory = this.readFileIfExists(path.join(dir, 'MEMORY.md'));
        memory.decisions = this.readFileIfExists(path.join(dir, 'DECISIONS.md'));
        memory.todo = this.readFileIfExists(path.join(dir, 'TODO.md'));

        // 读取今天和昨天的日志
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const todayStr = today.toISOString().split('T')[0];
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        memory.todayLog = this.readFileIfExists(path.join(dir, 'memory', `${todayStr}.md`));
        memory.yesterdayLog = this.readFileIfExists(path.join(dir, 'memory', `${yesterdayStr}.md`));

        return memory;
    }

    /**
     * 读取文件（如果存在）
     */
    private readFileIfExists(filePath: string): string | undefined {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8');
        }
        return undefined;
    }

    /**
     * 更新项目进展
     */
    public async updateProgress(content: string): Promise<void> {
        const dir = this.getOpenclawDir();
        if (!dir) {
            throw new Error('No workspace folder found');
        }

        const progressPath = path.join(dir, 'PROGRESS.md');
        const today = new Date().toISOString().split('T')[0];

        // 读取现有内容
        let existingContent = '';
        if (fs.existsSync(progressPath)) {
            existingContent = fs.readFileSync(progressPath, 'utf-8');
        }

        // 检查今天的日期是否已存在
        const todayHeader = `## ${today}`;
        let newContent: string;

        if (existingContent.includes(todayHeader)) {
            // 今天的日期已存在，追加到该日期下
            const lines = existingContent.split('\n');
            const headerIndex = lines.findIndex(line => line.startsWith(todayHeader));
            
            // 找到下一个日期标题的位置
            let nextHeaderIndex = lines.length;
            for (let i = headerIndex + 1; i < lines.length; i++) {
                if (lines[i].startsWith('## ')) {
                    nextHeaderIndex = i;
                    break;
                }
            }

            // 在当前日期下追加内容
            lines.splice(nextHeaderIndex, 0, `- ${content}`);
            newContent = lines.join('\n');
        } else {
            // 今天的日期不存在，创建新的日期标题
            const newEntry = `\n${todayHeader}\n- ${content}\n`;
            
            // 在第一个日期标题之前插入
            const firstDateMatch = existingContent.match(/\n## \d{4}-\d{2}-\d{2}/);
            if (firstDateMatch) {
                const insertPos = existingContent.indexOf(firstDateMatch[0]);
                newContent = existingContent.slice(0, insertPos) + newEntry + existingContent.slice(insertPos);
            } else {
                // 如果没有日期标题，追加到末尾
                newContent = existingContent + newEntry;
            }
        }

        fs.writeFileSync(progressPath, newContent, 'utf-8');
    }

    /**
     * 获取项目名称
     */
    public getProjectName(): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return 'Unknown Project';
        }
        return path.basename(workspaceFolder.uri.fsPath);
    }

    /**
     * 追加日志条目到今天的日志文件
     */
    public async appendDailyLog(entry: LogEntry): Promise<void> {
        const dir = this.getOpenclawDir();
        if (!dir) {
            return; // 没有工作区，不记录
        }

        const memoryDir = path.join(dir, 'memory');
        if (!fs.existsSync(memoryDir)) {
            fs.mkdirSync(memoryDir, { recursive: true });
        }

        const today = new Date().toISOString().split('T')[0];
        const logPath = path.join(memoryDir, `${today}.md`);

        // 格式化时间
        const time = entry.time.toTimeString().split(' ')[0].substring(0, 5); // HH:MM

        // 构建日志条目
        let logEntry = '';

        if (entry.type === 'operation') {
            // 操作记录
            logEntry = `## ${time} - ${this._getOperationTitle(entry.operation || '')}\n`;
            logEntry += `- **操作**：${entry.operation}\n`;
            if (entry.params) {
                logEntry += `- **参数**：${JSON.stringify(entry.params)}\n`;
            }
            logEntry += `- **结果**：${entry.result === 'success' ? '成功' : '失败'}\n`;
        } else if (entry.type === 'progress') {
            // 进展记录
            logEntry = `## ${time} - ${entry.task}\n`;
            logEntry += `- **任务**：${entry.task}\n`;
            logEntry += `- **状态**：${entry.status === 'completed' ? '✅ 完成' : '🔄 进行中'}\n`;
            if (entry.files && entry.files.length > 0) {
                logEntry += `- **文件**：${entry.files.join(', ')}\n`;
            }
        } else if (entry.type === 'decision') {
            // 决策记录
            logEntry = `## ${time} - 决策：${entry.decision}\n`;
            logEntry += `- **决策**：${entry.decision}\n`;
            if (entry.reason) {
                logEntry += `- **理由**：${entry.reason}\n`;
            }
        } else if (entry.type === 'problem') {
            // 问题记录
            logEntry = `## ${time} - 遇到问题\n`;
            logEntry += `- **问题**：${entry.problem}\n`;
            if (entry.solution) {
                logEntry += `- **解决方案**：${entry.solution}\n`;
            }
            if (entry.lesson) {
                logEntry += `- **经验教训**：${entry.lesson}\n`;
            }
        }

        logEntry += '\n';

        // 追加到文件
        try {
            if (!fs.existsSync(logPath)) {
                // 文件不存在，创建新文件
                const header = `# ${today}\n\n`;
                fs.writeFileSync(logPath, header + logEntry, 'utf-8');
            } else {
                // 文件存在，追加内容
                fs.appendFileSync(logPath, logEntry, 'utf-8');
            }
        } catch (err) {
            console.error('[ProjectMemory] Failed to append log:', err);
        }
    }

    /**
     * 获取操作的标题
     */
    private _getOperationTitle(operation: string): string {
        const titles: { [key: string]: string } = {
            'createAgent': '创建 Agent',
            'deleteAgent': '删除 Agent',
            'switchAgent': '切换 Agent',
            'updateAgent': '更新 Agent',
            'initProjectMemory': '初始化项目记忆',
            'package': '打包发布'
        };
        return titles[operation] || operation;
    }

    // ========== 模板方法 ==========

    private getContextTemplate(): string {
        const projectName = this.getProjectName();
        return `# 项目上下文

## 快速入门（给新 Agent）

**项目是什么**:
${projectName} - （请填写项目简介）

**当前状态**:
- 版本：0.1.0
- 主要功能：（请填写）
- 正在进行：（请填写）

**最近的工作**:
- （请填写最近的工作内容）

**关键文件**:
- （请列出关键文件和说明）

**开发流程**:
1. （请填写开发流程）

**注意事项**:
- （请填写注意事项）
`;
    }

    private getProjectTemplate(): string {
        const projectName = this.getProjectName();
        return `# ${projectName}

## 概述
（请填写项目概述）

## 技术栈
- （请填写技术栈）

## 目录结构
\`\`\`
（请填写目录结构）
\`\`\`

## 关键模块
- （请填写关键模块）

## 开发指南
- 安装依赖：（请填写）
- 编译：（请填写）
- 测试：（请填写）
- 打包：（请填写）
`;
    }

    private getProgressTemplate(): string {
        const today = new Date().toISOString().split('T')[0];
        return `# 项目进展

## ${today}
- ✅ [完成] 初始化项目记忆
`;
    }

    private getMemoryTemplate(): string {
        return `# 项目记忆

## 关键决策
（记录重要的技术决策和理由）

## 重要信息
（记录项目的重要信息）

## 已知问题
（记录已知的问题和限制）

## 经验教训
（记录开发过程中的经验教训）
`;
    }

    private getDecisionsTemplate(): string {
        return `# 技术决策记录

（使用 ADR 格式记录技术决策）

## ADR-001: 示例决策

**日期**: ${new Date().toISOString().split('T')[0]}

**状态**: 已采纳 / 已拒绝 / 已废弃

**背景**:
（描述决策的背景和问题）

**决策**:
（描述做出的决策）

**理由**:
（解释为什么做出这个决策）

**影响**:
（描述决策的影响）

**替代方案**:
（列出考虑过的其他方案）
`;
    }

    private getTodoTemplate(): string {
        return `# 待办事项

## 高优先级
- [ ] （请填写高优先级任务）

## 中优先级
- [ ] （请填写中优先级任务）

## 低优先级
- [ ] （请填写低优先级任务）
`;
    }

    private getDailyLogTemplate(date: string): string {
        return `# ${date}

## 工作内容
- （记录今天的工作内容）

## 详细过程
（记录详细的工作过程）

## 遇到的问题
- （记录遇到的问题）

## 解决方案
- （记录解决方案）

## 经验教训
- （记录经验教训）
`;
    }
}
