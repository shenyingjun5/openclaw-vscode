import * as vscode from 'vscode';
import { getProjectConfig, ProjectConfig, ProjectSkill, ProjectWorkflow } from './projectScanner';
import { getSkillMatcher } from './skillMatcher';
import { getMessageBuilder } from './messageBuilder';
import { LanguageManager } from './languageManager';

export interface ProjectStatusMessage {
    type: 'projectStatus';
    initialized: boolean;
    skills: Array<{ name: string; triggers: string[]; category?: string }>;
    workflows: Array<{ name: string; relativePath: string; category?: string }>;
    configSource?: string[];
}

export interface SkillsListMessage {
    type: 'addMessage';
    role: 'system';
    content: string;
}

export interface WorkflowsListMessage {
    type: 'addMessage';
    role: 'system';
    content: string;
}

export interface MessageBuildResult {
    message: string;
    triggeredSkill: ProjectSkill | null;
}

/**
 * ChatSessionManager - 管理项目配置、技能匹配、消息构建等共享逻辑
 * 供 ChatProvider 和 ChatPanel 共同使用
 */
export class ChatSessionManager {
    private _projectConfig: ProjectConfig | null = null;
    private _languageSentSessions = new Set<string>();

    constructor(
        private readonly _extensionUri: vscode.Uri
    ) {}

    /**
     * 获取工作区目录
     */
    private _getWorkspaceDir(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return null;
    }

    /**
     * 初始化项目配置（扫描 skills 和 workflows）
     */
    async initProjectConfig(forceRescan = false): Promise<void> {
        const workspaceDir = this._getWorkspaceDir();
        if (!workspaceDir) {
            this._projectConfig = null;
            return;
        }

        try {
            this._projectConfig = await getProjectConfig(workspaceDir, forceRescan);
        } catch (e) {
            this._projectConfig = null;
        }
    }

    /**
     * 获取项目状态消息（用于发送给 webview）
     */
    getProjectStatus(): ProjectStatusMessage {
        if (!this._projectConfig) {
            return {
                type: 'projectStatus',
                initialized: false,
                skills: [],
                workflows: []
            };
        }

        return {
            type: 'projectStatus',
            initialized: true,
            skills: this._projectConfig.skills.map(s => ({
                name: s.name,
                triggers: s.triggers,
                category: s.category
            })),
            workflows: this._projectConfig.workflows.map(w => ({
                name: w.name,
                relativePath: w.relativePath,
                category: w.category
            })),
            configSource: this._projectConfig.configSource
        };
    }

    /**
     * 获取 Skills 列表消息
     */
    getSkillsList(t: (key: string) => string): SkillsListMessage | null {
        if (!this._projectConfig || this._projectConfig.skills.length === 0) {
            return {
                type: 'addMessage',
                role: 'system',
                content: t('noSkills')
            };
        }

        const skillsList = this._projectConfig.skills.map(s =>
            `• **${s.name}** (${s.triggers.join(', ')})`
        ).join('\n');

        return {
            type: 'addMessage',
            role: 'system',
            content: `📦 ${t('projectInit')}\n\n${skillsList}`
        };
    }

    /**
     * 获取 Workflows 列表消息
     */
    getWorkflowsList(): WorkflowsListMessage {
        if (!this._projectConfig?.workflows || this._projectConfig.workflows.length === 0) {
            return {
                type: 'addMessage',
                role: 'system',
                content: 'No workflows defined in this project.'
            };
        }

        const workflowsList = this._projectConfig.workflows.map(w =>
            `• **${w.name}** (${w.relativePath})`
        ).join('\n');

        return {
            type: 'addMessage',
            role: 'system',
            content: `📋 Available Workflows:\n\n${workflowsList}`
        };
    }

    /**
     * 构建消息（包含技能匹配和上下文注入）
     */
    buildMessage(
        userMessage: string,
        sessionKey: string,
        forceSkillName?: string,
        forceWorkflow?: boolean
    ): MessageBuildResult {
        const matcher = getSkillMatcher();
        const builder = getMessageBuilder();

        let matchedSkill: ProjectSkill | null = null;

        // 强制使用指定技能
        if (forceSkillName && this._projectConfig) {
            matchedSkill = matcher.findByName(forceSkillName, this._projectConfig.skills);
        }
        // 自动匹配技能
        else if (this._projectConfig) {
            matchedSkill = matcher.match(userMessage, this._projectConfig.skills);
        }

        // 强制 workflow 时重置已发送标记
        if (forceWorkflow) {
            builder.resetSession(sessionKey);
        }

        const { message, triggeredSkill } = builder.build(
            userMessage,
            this._projectConfig,
            matchedSkill,
            sessionKey
        );

        return {
            message,
            triggeredSkill
        };
    }

    /**
     * 重置会话（清除 workflow 已发送标记）
     */
    resetSession(sessionKey: string): void {
        const builder = getMessageBuilder();
        builder.resetSession(sessionKey);
        this._languageSentSessions.delete(sessionKey);
    }

    /**
     * 检查是否有项目配置
     */
    hasProjectConfig(): boolean {
        return this._projectConfig !== null;
    }

    /**
     * 获取项目配置（只读）
     */
    getProjectConfig(): ProjectConfig | null {
        return this._projectConfig;
    }

    /**
     * 获取工作区文件和目录（用于 @ 文件选择器）
     */
    async getWorkspaceFiles(): Promise<Array<{
        name: string;
        path: string;
        relativePath: string;
        isDirectory: boolean;
    }>> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return [];
        }

        // 获取文件（限100个）
        const files = await vscode.workspace.findFiles(
            '**/*.{ts,tsx,js,jsx,py,go,rs,java,c,cpp,h,hpp,md,json,yaml,yml,toml,css,scss,html,vue,svelte,swift}',
            '**/node_modules/**',
            100
        );

        const fileList = files.map(f => {
            const relativePath = vscode.workspace.asRelativePath(f);
            return {
                name: require('path').basename(f.fsPath),
                path: f.fsPath,
                relativePath,
                isDirectory: false
            };
        });

        // 从文件路径中提取目录（限30个）
        const dirSet = new Set<string>();
        for (const f of files) {
            const rel = vscode.workspace.asRelativePath(f);
            const parts = rel.split('/');
            let current = '';
            for (let i = 0; i < parts.length - 1; i++) {
                current = current ? `${current}/${parts[i]}` : parts[i];
                dirSet.add(current);
            }
        }

        const dirList = Array.from(dirSet).slice(0, 30).map(d => ({
            name: d.split('/').pop() || d,
            path: require('path').join(workspaceFolders[0].uri.fsPath, d),
            relativePath: d,
            isDirectory: true
        }));

        // 组合：目录优先，然后文件
        return [...dirList, ...fileList];
    }

    /**
     * 处理文件选择（系统对话框）
     */
    async handleFileSelection(): Promise<Array<{ name: string; path: string }>> {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: 'Add Attachment'
        });

        if (files) {
            return files.map(file => ({
                name: require('path').basename(file.fsPath),
                path: file.fsPath
            }));
        }
        return [];
    }

    /**
     * 保存图片到临时目录
     */
    async saveImage(base64Data: string, name: string): Promise<{ name: string; path: string } | null> {
        try {
            const tmpDir = require('os').tmpdir();
            const filePath = require('path').join(tmpDir, name);
            const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64, 'base64');
            require('fs').writeFileSync(filePath, buffer);
            
            return { name, path: filePath };
        } catch (err: any) {
            vscode.window.showErrorMessage(`Save image failed: ${err.message}`);
            return null;
        }
    }

    /**
     * 获取可用模型列表
     */
    async getModels(gateway: any): Promise<any[]> {
        try {
            const { models } = await gateway.getModels();
            return models;
        } catch (err) {
            return [{ id: 'default', name: 'Default Model', selected: true }];
        }
    }


    /**
     * 发送语言设置消息（系统级）
     */
    /**
     * 发送上下文设置（语言 + VSCode 工作区），fire-and-forget 不等回复
     */
    async sendContextSetup(gateway: any, sessionKey: string): Promise<void> {
        const parts: string[] = [];

        // 语言指令
        const languageManager = LanguageManager.getInstance();
        const instruction = languageManager.getLanguageInstruction();
        if (instruction) {
            parts.push(instruction);
        }

        // 判断当前语言
        const lang = languageManager.getAIOutputLanguage();
        const isZh = lang.startsWith('zh');

        // VSCode 工作区上下文
        const workspaceDir = this._getWorkspaceDir();
        if (workspaceDir) {
            const projectName = require('path').basename(workspaceDir);
            if (isZh) {
                parts.push(
                    `[VSCode 上下文]\n` +
                    `用户正在 VSCode 中编辑项目：\n` +
                    `- 项目路径: ${workspaceDir}\n` +
                    `- 项目名称: ${projectName}\n\n` +
                    `当用户询问代码、文件或项目相关任务时，请在此项目目录下操作，而非默认工作区。`
                );
            } else {
                parts.push(
                    `[VSCode Context]\n` +
                    `The user is currently editing a project in VSCode:\n` +
                    `- Project path: ${workspaceDir}\n` +
                    `- Project name: ${projectName}\n\n` +
                    `When the user asks about code, files, or project-related tasks, operate in this project directory, not your default workspace.`
                );
            }
        }

        if (parts.length === 0) return;

        const header = isZh ? '[系统设置 - 无需回复]' : '[System Setup - No reply needed]';
        const setupMessage = `${header}\n\n${parts.join('\n\n')}`;

        try {
            // Fire-and-forget: 只发送不等回复，避免阻塞后续用户消息
            gateway.sendMessageFireAndForget(sessionKey, setupMessage);
            this._languageSentSessions.add(sessionKey);
        } catch (err) {
            console.error('Failed to send context setup:', err);
        }
    }

    /**
     * 检查是否已发送上下文设置
     */
    hasSentContextSetup(sessionKey: string): boolean {
        return this._languageSentSessions.has(sessionKey);
    }

    /**
     * 加载会话历史（清理 think/final 标签，保留工具调用）
     * limit: 200 对齐 webchat
     */
    async loadHistory(gateway: any, sessionKey: string): Promise<Array<{ role: string; content: string; toolCalls?: any[]; thinking?: string }>> {
        try {
            const history = await gateway.getHistory(sessionKey, 200);

            // 如果有历史记录，说明不是新会话，标记语言指令已发送
            if (history && history.length > 0) {
                this._languageSentSessions.add(sessionKey);
            }

            const result: Array<{ role: string; content: string; toolCalls?: any[]; thinking?: string }> = [];
            let skipNextAssistant = false;

            for (const msg of history) {
                let content = msg.content;
                const toolCalls: any[] = [];
                const thinkingParts: string[] = [];

                // 处理 content 数组格式（Gateway 返回 [{type, text}] 结构）
                if (Array.isArray(content)) {
                    const textParts: string[] = [];
                    for (const c of content) {
                        if (!c || typeof c !== 'object') continue;
                        const type = (c.type || '').toLowerCase();
                        if (type === 'text' || type === 'output_text') {
                            if (c.text) textParts.push(c.text);
                        } else if (type === 'toolcall' || type === 'tool_call' || type === 'tool_use') {
                            toolCalls.push({
                                name: c.name || 'tool',
                                args: c.arguments || c.args || c.input
                            });
                        } else if (type === 'thinking') {
                            // 提取 thinking 内容块（对齐 webchat 的 Qa() 函数）
                            const text = (c.thinking || '').trim();
                            if (text) thinkingParts.push(text);
                        }
                        // 跳过 toolResult 等
                    }
                    content = textParts.join('');
                }

                // 跳过 toolResult 消息
                const role = (msg.role || '').toLowerCase();
                if (role === 'toolresult' || role === 'tool_result' || role === 'tool') continue;
                
                // 字符串格式兜底
                content = String(content || '');
                content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
                content = content.replace(/<\/?final>/g, '');

                // 剥离计划模式后缀，只显示用户原始输入
                if (role === 'user') {
                    // 匹配新格式: ---- Plan Mode ---- 或 ---- 计划模式 ----
                    // 用 \s+ 匹配任意空白（Gateway 可能将 \n\n 转为空格）
                    const planNewIdx = content.search(/\s+---- (?:Plan Mode|计划模式) ----/);
                    if (planNewIdx !== -1) {
                        content = content.substring(0, planNewIdx);
                    } else {
                        // 兼容旧格式: ━━━ + [Plan Mode]
                        const planOldIdx = content.search(/\s+━━━━━━━━/);
                        if (planOldIdx !== -1 && content.includes('[Plan Mode')) {
                            content = content.substring(0, planOldIdx);
                        }
                    }
                }

                content = content.trim();
                
                // 过滤掉上下文设置相关的系统消息和回复
                const isSetupMessage = content.includes('[System Setup - No reply needed]') ||
                    content.includes('[系统设置 - 无需回复]') ||
                    content.includes('Please confirm with "Language settings updated"');
                if (isSetupMessage) {
                    skipNextAssistant = true;
                    continue;
                }
                if (skipNextAssistant && (msg.role === 'assistant')) {
                    skipNextAssistant = false;
                    // 也过滤掉旧格式的确认回复
                    continue;
                }
                skipNextAssistant = false;
                // 过滤旧格式的独立确认回复
                if (content.includes('Language settings updated')) {
                    continue;
                }

                // 跳过没有内容也没有工具调用的消息
                if (!content && toolCalls.length === 0) continue;

                const entry: any = { role: msg.role, content };
                if (toolCalls.length > 0) {
                    entry.toolCalls = toolCalls;
                }
                // 附加 thinking 数据
                const thinking = thinkingParts.join('\n');
                if (thinking) {
                    entry.thinking = thinking;
                }
                result.push(entry);
            }

            return result;
        } catch (err) {
            return [];
        }
    }
}
