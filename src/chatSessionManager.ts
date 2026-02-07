import * as vscode from 'vscode';
import { getProjectConfig, ProjectConfig, ProjectSkill, ProjectWorkflow } from './projectScanner';
import { getSkillMatcher } from './skillMatcher';
import { getMessageBuilder } from './messageBuilder';

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
        sessionId: string,
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
            builder.resetSession(sessionId);
        }

        const { message, triggeredSkill } = builder.build(
            userMessage,
            this._projectConfig,
            matchedSkill,
            sessionId
        );

        return {
            message,
            triggeredSkill
        };
    }

    /**
     * 重置会话（清除 workflow 已发送标记）
     */
    resetSession(sessionId: string): void {
        const builder = getMessageBuilder();
        builder.resetSession(sessionId);
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
     * 加载会话历史（清理 think/final 标签）
     */
    async loadHistory(gateway: any, sessionId: string): Promise<Array<{ role: string; content: string }>> {
        try {
            const history = await gateway.getHistory(sessionId);
            return history.map((msg: any) => {
                let content = msg.content;
                content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
                content = content.replace(/<\/?final>/g, '');
                content = content.trim();
                return { role: msg.role, content };
            }).filter((m: any) => m.content);
        } catch (err) {
            return [];
        }
    }
}
