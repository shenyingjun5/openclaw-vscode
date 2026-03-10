import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AgentManager, AgentCreateConfig } from './agentManager';

/**
 * 创建 Agent 的 Webview 面板
 */
export class CreateAgentPanel {
    private static currentPanel: CreateAgentPanel | undefined;
    private static readonly viewType = 'openclaw.createAgent';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _agentManager: AgentManager;
    private _disposables: vscode.Disposable[] = [];

    /**
     * 创建或显示面板
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        agentManager: AgentManager
    ) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // 如果已经有面板打开，就显示它
        if (CreateAgentPanel.currentPanel) {
            CreateAgentPanel.currentPanel._panel.reveal(column);
            return;
        }

        // 创建新面板
        const panel = vscode.window.createWebviewPanel(
            CreateAgentPanel.viewType,
            '创建 Agent',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview'),
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        CreateAgentPanel.currentPanel = new CreateAgentPanel(
            panel,
            extensionUri,
            agentManager
        );
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        agentManager: AgentManager
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._agentManager = agentManager;

        // 设置 HTML 内容
        this._panel.webview.html = this._getHtmlForWebview();

        // 监听面板关闭事件
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // 处理来自 Webview 的消息
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                await this._handleMessage(message);
            },
            null,
            this._disposables
        );

        // 发送初始化数据
        this._sendInitData();
    }

    /**
     * 处理来自 Webview 的消息
     */
    private async _handleMessage(message: any) {
        switch (message.type) {
            case 'checkAgentId':
                await this._handleCheckAgentId(message.id);
                break;

            case 'createAgent':
                await this._handleCreateAgent(message.config);
                break;

            case 'cancelCreateAgent':
                this._panel.dispose();
                break;

            case 'requestInitData':
                await this._sendInitData();
                break;
        }
    }

    /**
     * 检查 Agent ID 是否已存在
     */
    private async _handleCheckAgentId(id: string) {
        try {
            const exists = await this._agentManager.agentExists(id);
            this._panel.webview.postMessage({
                type: 'agentIdCheckResult',
                id: id,
                exists: exists
            });
        } catch (err: any) {
            console.error('[CreateAgentPanel] Failed to check agent ID:', err);
            this._panel.webview.postMessage({
                type: 'agentIdCheckResult',
                id: id,
                exists: false
            });
        }
    }

    /**
     * 创建 Agent
     */
    private async _handleCreateAgent(config: AgentCreateConfig) {
        try {
            // 验证配置
            if (!config.id || !config.name || !config.emoji || !config.role) {
                throw new Error('缺少必填字段');
            }

            // 检查 ID 是否已存在
            const exists = await this._agentManager.agentExists(config.id);
            if (exists) {
                throw new Error(`Agent ID "${config.id}" 已存在`);
            }

            // 创建 Agent
            await this._agentManager.createAgent(config);

            // 发送成功消息
            this._panel.webview.postMessage({
                type: 'createAgentResult',
                success: true,
                agentId: config.id
            });

            // 显示成功提示
            vscode.window.showInformationMessage(
                `Agent "${config.name}" 创建成功！`
            );

            // 关闭面板
            setTimeout(() => {
                this._panel.dispose();
            }, 1000);

        } catch (err: any) {
            console.error('[CreateAgentPanel] Failed to create agent:', err);

            // 发送失败消息
            this._panel.webview.postMessage({
                type: 'createAgentResult',
                success: false,
                error: err.message || '创建失败'
            });

            // 显示错误提示
            vscode.window.showErrorMessage(
                `创建 Agent 失败: ${err.message}`
            );
        }
    }

    /**
     * 发送初始化数据
     */
    private async _sendInitData() {
        // 定义角色列表（放在 try 外面，确保一定能发送）
        const roles = [
            {
                id: 'fullstack',
                name: '全栈开发',
                description: '前后端通吃，代码质量与架构设计并重',
                icon: '🌐',
                template: '我是一名全栈开发专家，精通前端（React/Vue/Angular）和后端（Node.js/Python/Java）技术栈。我注重代码质量、系统架构设计，能够独立完成从需求分析到部署上线的全流程开发。'
            },
            {
                id: 'frontend',
                name: '前端专家',
                description: 'React/Vue/Angular，性能优化，用户体验',
                icon: '⚛️',
                template: '我是一名前端开发专家，精通现代前端框架（React/Vue/Angular），擅长性能优化、响应式设计和用户体验提升。我关注代码可维护性和最佳实践。'
            },
            {
                id: 'backend',
                name: '后端专家',
                description: 'API 设计，数据库优化，微服务架构',
                icon: '🔧',
                template: '我是一名后端开发专家，精通服务端开发、API 设计、数据库优化和微服务架构。我注重系统性能、安全性和可扩展性。'
            },
            {
                id: 'devops',
                name: 'DevOps 工程师',
                description: 'CI/CD，容器化，云原生',
                icon: '🚀',
                template: '我是一名 DevOps 工程师，精通 CI/CD、容器化（Docker/Kubernetes）、云原生技术和基础设施即代码。我致力于提升开发效率和系统稳定性。'
            },
            {
                id: 'tester',
                name: '测试工程师',
                description: '单元测试，集成测试，自动化测试',
                icon: '🧪',
                template: '我是一名测试工程师，精通单元测试、集成测试、端到端测试和自动化测试。我注重代码质量和测试覆盖率，确保软件的可靠性。'
            },
            {
                id: 'architect',
                name: '架构师',
                description: '系统设计，技术选型，可扩展性',
                icon: '🏗️',
                template: '我是一名系统架构师，精通系统设计、技术选型、性能优化和可扩展性设计。我从全局视角把控技术方向，确保系统的长期演进能力。'
            },
            {
                id: 'custom',
                name: '自定义角色',
                description: '自己定义角色和描述',
                icon: '✏️',
                template: ''
            }
        ];

        let existingAgents: any[] = [];

        try {
            // 获取已有的 Agent 列表
            const agents = await this._agentManager.getAvailableAgents();
            existingAgents = agents.map(a => ({
                id: a.id,
                name: a.name,
                emoji: a.emoji
            }));
        } catch (err) {
            console.error('[CreateAgentPanel] Failed to get existing agents:', err);
            // 即使获取失败，也继续发送角色列表
        }

        // 发送初始化数据（确保一定会发送）
        try {
            this._panel.webview.postMessage({
                type: 'initData',
                roles: roles,
                existingAgents: existingAgents
            });
        } catch (err) {
            console.error('[CreateAgentPanel] Failed to send init data:', err);
        }
    }

    /**
     * 获取 Webview 的 HTML 内容
     */
    private _getHtmlForWebview(): string {
        const webviewPath = path.join(
            this._extensionUri.fsPath,
            'webview',
            'create-agent.html'
        );

        let html = fs.readFileSync(webviewPath, 'utf-8');

        // 替换资源路径
        const scriptUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'create-agent.js')
        );
        const stylesUri = this._panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'styles.css')
        );

        html = html.replace(/\${cspSource}/g, this._panel.webview.cspSource);
        html = html.split('{{scriptUri}}').join(scriptUri.toString());
        html = html.split('{{stylesUri}}').join(stylesUri.toString());

        return html;
    }

    /**
     * 清理资源
     */
    public dispose() {
        CreateAgentPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
