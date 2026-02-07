import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GatewayClient } from './gateway';
import { ChatSessionManager } from './chatSessionManager';
import { ProjectSkill } from './projectScanner';
import { ChangeParser } from './changeParser';
import { ChangeManager } from './changeManager';
import { DiffProvider } from './diffProvider';
import { LanguageManager } from './languageManager';

// i18n helper
function getLocale(): string {
    const lang = vscode.env.language;
    return lang.startsWith('zh') ? 'zh' : 'en';
}

function t(key: string): string {
    const locale = getLocale() as 'en' | 'zh';
    const messages: { [key: string]: { en: string; zh: string } } = {
        maxPanels: {
            en: 'Maximum parallel sessions reached (5). Please close a window first.',
            zh: '已达最大并行会话数 (5)，请关闭一个窗口后再试'
        },
        cannotAllocate: {
            en: 'Cannot allocate new session window',
            zh: '无法分配新的会话窗口'
        },
        sendFailed: {
            en: 'Send failed',
            zh: '发送失败'
        },
        saveImageFailed: {
            en: 'Failed to save image',
            zh: '保存图片失败'
        },
        defaultModel: {
            en: 'Default Model',
            zh: '默认模型'
        },
        addAttachment: {
            en: 'Add attachment',
            zh: '添加附件'
        }
    };
    return messages[key]?.[locale] || messages[key]?.['en'] || key;
}

/**
 * Panel session pool manager
 * Manages up to 5 panel slots
 */
class PanelSessionPool {
    private static instance: PanelSessionPool;
    private activePanels = new Set<number>();
    private static readonly MAX_PANELS = 5;

    private constructor() {}

    public static getInstance(): PanelSessionPool {
        if (!PanelSessionPool.instance) {
            PanelSessionPool.instance = new PanelSessionPool();
        }
        return PanelSessionPool.instance;
    }

    public allocate(): number | null {
        for (let i = 1; i <= PanelSessionPool.MAX_PANELS; i++) {
            if (!this.activePanels.has(i)) {
                this.activePanels.add(i);
                return i;
            }
        }
        return null;
    }

    public release(id: number): void {
        this.activePanels.delete(id);
    }

    public isFull(): boolean {
        return this.activePanels.size >= PanelSessionPool.MAX_PANELS;
    }
}

export class ChatPanel {
    private static panels: Map<number, ChatPanel> = new Map();
    private static readonly viewType = 'openclaw.chatPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _gateway: GatewayClient;
    private readonly _panelId: number;
    private _sessionId: string;
    private _planMode: boolean = false;
    private _isSending: boolean = false;
    private _sessionManager: ChatSessionManager;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, gateway: GatewayClient) {
        const column = vscode.ViewColumn.Beside;
        const pool = PanelSessionPool.getInstance();

        if (pool.isFull()) {
            vscode.window.showWarningMessage(t('maxPanels'));
            return;
        }

        const panelId = pool.allocate();
        if (panelId === null) {
            vscode.window.showWarningMessage(t('cannotAllocate'));
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ChatPanel.viewType,
            '🦞',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview'),
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        const chatPanel = new ChatPanel(panel, extensionUri, gateway, panelId);
        ChatPanel.panels.set(panelId, chatPanel);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gateway: GatewayClient,
        panelId: number
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gateway = gateway;
        this._panelId = panelId;
        
        // Include window ID for multi-window isolation
        const windowId = vscode.env.sessionId.slice(0, 8);
        this._sessionId = `vscode-panel-${windowId}-${panelId}`;

        const config = vscode.workspace.getConfiguration('openclaw');
        this._planMode = config.get<boolean>('planMode') || false;

        // 初始化 SessionManager
        this._sessionManager = new ChatSessionManager(extensionUri);
        
        // 🔧 监听工具调用事件
        this._setupToolCallListener();

        this._panel.webview.html = this._getHtmlContent();

        // Auto-scan project
        this._sessionManager.initProjectConfig();

        this._panel.webview.onDidReceiveMessage(
            async (data) => {
                switch (data.type) {
                    case 'ready':
                        // Send locale to webview
                        this._panel.webview.postMessage({
                            type: 'setLocale',
                            locale: vscode.env.language
                        });
                        await this._loadHistory();
                        this._sendModels();
                        this._sendThinkingLevel();
                        this._sendProjectStatus();
                        this._panel.webview.postMessage({ 
                            type: 'updatePlanMode', 
                            enabled: this._planMode 
                        });
                        
                        // 主动建立连接并更新状态
                        await this._ensureConnection();
                        break;
                        
                    case 'sendMessage':
                        if (data.planMode !== undefined) {
                            this._planMode = data.planMode;
                        }
                        await this._sendMessage(data.content);
                        break;
                        
                    case 'stop':
                        this._gateway.stop();
                        this._isSending = false;
                        this._panel.webview.postMessage({ type: 'sendingComplete' });
                        // 发送停止提示
                        this._panel.webview.postMessage({
                            type: 'systemMessage',
                            error: {
                                message: 'stopped',
                                context: 'user_stop'
                            }
                        });
                        break;
                        
                    case 'refresh':
                        await this._loadHistory();
                        // 发送刷新完成消息
                        this._panel.webview.postMessage({ type: 'refreshComplete' });
                        // 更新连接状态
                        this._checkConnection();
                        break;

                    case 'checkConnection':
                        this._checkConnection();
                        break;

                    case 'getAutoRefreshInterval':
                        const interval = vscode.workspace.getConfiguration('openclaw').get('autoRefreshInterval', 10000);
                        this._panel.webview.postMessage({ 
                            type: 'autoRefreshInterval', 
                            interval: interval 
                        });
                        break;
                        
                    case 'openSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'openclaw');
                        break;
                        
                    case 'getFiles':
                        await this._handleGetFiles();
                        break;
                        
                    case 'selectFile':
                        await this._handleSelectFile();
                        break;
                        
                    case 'handleDrop':
                        await this._handleFileDrop(data.files);
                        break;
                        
                    case 'saveImage':
                        await this._saveImage(data.data, data.name);
                        break;
                        
                    case 'setPlanMode':
                        this._planMode = data.enabled;
                        break;
                        
                    case 'setModel':
                        try {
                            await this._gateway.setSessionModel(this._sessionId, data.model);
                            vscode.window.showInformationMessage(`模型已切换为: ${data.model}`);
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`模型切换失败: ${err.message || err}`);
                        }
                        break;

                    case 'setThinking':
                        try {
                            await this._gateway.setSessionThinking(this._sessionId, data.level);
                        } catch (err: any) {
                            vscode.window.showErrorMessage(`思考深度设置失败: ${err.message || err}`);
                        }
                        break;
                        
                    case 'initProject':
                        await this._sessionManager.initProjectConfig(true);
                        this._sendProjectStatus();
                        break;
                        
                    case 'listSkills':
                        this._sendSkillsList();
                        break;
                        
                    case 'executeCommand':
                        await this._executeSlashCommand(data.command);
                        break;

                    case 'previewDiff':
                        await this._handlePreviewDiff(data.changeSetId, data.filePath);
                        break;

                    case 'applyFile':
                        await this._handleApplyFile(data.changeSetId, data.filePath);
                        break;

                    case 'skipFile':
                        this._handleSkipFile(data.changeSetId, data.filePath);
                        break;

                    case 'acceptAll':
                        await this._handleAcceptAll(data.changeSetId);
                        break;

                    case 'rejectAll':
                        this._handleRejectAll(data.changeSetId);
                        break;

                    case 'openFile':
                        await this._handleOpenFile(data.filePath);
                        break;
                }
            },
            null,
            this._disposables
        );

        this._panel.onDidDispose(
            () => this.dispose(),
            null,
            this._disposables
        );
    }
    
    private _setupToolCallListener() {
        // 如果 gateway 使用 WebSocket 模式，监听工具调用事件
        const wsClient = (this._gateway as any)._wsClient;
        if (wsClient) {
            wsClient.on('tool.call', (payload: { name: string; args?: any }) => {
                this._panel.webview.postMessage({
                    type: 'addToolCall',
                    name: payload.name,
                    args: payload.args
                });
            });
        }
    }

    private _getHtmlContent(): string {
        const webview = this._panel.webview;
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'styles.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js')
        );
        const changeCardScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'changeCard.js')
        );

        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${changeCardScriptUri}/g, changeCardScriptUri.toString());

        return html;
    }

    private async _sendModels() {
        const models = await this._sessionManager.getModels(this._gateway);
        this._panel.webview.postMessage({
            type: 'updateModels',
            models
        });
    }

    private async _sendThinkingLevel() {
        try {
            const level = await this._gateway.getSessionThinkingLevel(this._sessionId);
            this._panel.webview.postMessage({
                type: 'updateThinking',
                level
            });
        } catch (err) {
            console.warn('Failed to get thinking level:', err);
        }
    }

    private async _sendMessage(content: string) {
        if (this._isSending) return;

        this._isSending = true;

        // 自动接受待处理的变更集
        const changeManager = ChangeManager.getInstance();
        await changeManager.autoAcceptPending();

        // 解析 slash 命令
        let forceSkillName: string | undefined;
        let forceWorkflow = false;
        let actualContent = content;

        const slashMatch = content.match(/^\/(\S+)\s*(.*)/);
        if (slashMatch) {
            const prefix = slashMatch[1];
            const rest = slashMatch[2];

            if (prefix.startsWith('.')) {
                // Force workflow
                forceWorkflow = true;
                actualContent = rest;
            } else {
                // Try as skill name
                forceSkillName = prefix;
                actualContent = rest;
            }
        }

        // 使用 SessionManager 构建消息
        const { message: finalMessage, triggeredSkill } = this._sessionManager.buildMessage(
            actualContent,
            this._sessionId,
            forceSkillName,
            forceWorkflow
        );

        // 如果 /xxx 没命中任何技能，按原文放行给 AI
        const effectiveMessage = (forceSkillName && !triggeredSkill)
            ? this._sessionManager.buildMessage(content, this._sessionId, undefined, false).message
            : finalMessage;

        // 通知 UI 触发的技能
        if (triggeredSkill) {
            this._panel.webview.postMessage({
                type: 'skillTriggered',
                skill: {
                    name: triggeredSkill.name,
                    trigger: forceSkillName ? '/' + triggeredSkill.name : triggeredSkill.triggers[0]
                }
            });
        }

        // Plan Mode 后缀
        let messageToSend = effectiveMessage;

        // 空消息检查
        if (!messageToSend.trim()) {
            this._panel.webview.postMessage({
                type: 'error',
                content: '消息内容为空',
                context: 'send'
            });
            this._isSending = false;
            this._panel.webview.postMessage({ type: 'sendingComplete' });
            return;
        }

        if (this._planMode) {
            const confirmCommands = ['执行', '继续', '确认', '开始', 'go', 'yes', 'ok', 'y', 'execute', 'run'];
            const isConfirm = confirmCommands.some(cmd =>
                content.toLowerCase().trim() === cmd.toLowerCase()
            );

            if (!isConfirm) {
                messageToSend += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⚠️ [Plan Mode - Do Not Execute]\n\nYou must:\n1. Output plan only, do not call any tools\n2. List each step and its impact\n3. Wait for user to say \"execute\" before calling tools\n\nViolation = Task failed\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            }
        }

        try {
            const reply = await this._gateway.sendMessage(this._sessionId, messageToSend);

            let replyContent = reply.content;
            replyContent = replyContent.replace(/<think>[\s\S]*?<\/think>/g, '');
            replyContent = replyContent.replace(/<\/?final>/g, '');
            replyContent = replyContent.trim();

            // 检测变更数据
            const changeSet = ChangeParser.parseFromResponse(replyContent);
            
            if (changeSet) {
                // 注册变更集
                const changeManager = ChangeManager.getInstance();
                changeManager.registerChangeSet(changeSet);

                // 发送变更数据到 webview
                this._panel.webview.postMessage({
                    type: 'addChange',
                    changeSet: changeSet
                });
            }

            if (replyContent) {
                this._panel.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: replyContent
                });
            }
        } catch (err: any) {
            this._panel.webview.postMessage({
                type: 'error',
                content: err.message || String(err),
                context: 'send'
            });
        } finally {
            this._isSending = false;
            this._panel.webview.postMessage({ type: 'sendingComplete' });
        }
    }

    private async _loadHistory() {
        const messages = await this._sessionManager.loadHistory(this._gateway, this._sessionId);
        this._panel.webview.postMessage({
            type: 'loadHistory',
            messages
        });
    }

    private _checkConnection() {
        // 检查 Gateway 连接状态
        const isConnected = this._gateway.isConnected();
        this._panel.webview.postMessage({
            type: 'connectionStatus',
            status: isConnected ? 'connected' : 'disconnected'
        });
    }

    private async _ensureConnection() {
        try {
            // 发送连接中状态
            this._panel.webview.postMessage({
                type: 'connectionStatus',
                status: 'connecting'
            });
            
            // 尝试连接
            await this._gateway.connect();
            
            // 连接成功
            this._panel.webview.postMessage({
                type: 'connectionStatus',
                status: 'connected'
            });
        } catch (err) {
            // 连接失败
            this._panel.webview.postMessage({
                type: 'connectionStatus',
                status: 'disconnected'
            });
        }
    }

    private async _handleGetFiles() {
        const files = await this._sessionManager.getWorkspaceFiles();
        this._panel.webview.postMessage({ type: 'files', files });
    }

    private async _handleSelectFile() {
        const files = await this._sessionManager.handleFileSelection();
        for (const file of files) {
            this._panel.webview.postMessage({
                type: 'fileSelected',
                name: file.name,
                path: file.path
            });
        }
    }

    private async _handleFileDrop(files: { name: string; path: string }[]) {
        for (const file of files) {
            this._panel.webview.postMessage({
                type: 'fileDropped',
                name: file.name,
                path: file.path
            });
        }
    }

    private async _saveImage(base64Data: string, name: string) {
        const result = await this._sessionManager.saveImage(base64Data, name);
        if (result) {
            this._panel.webview.postMessage({
                type: 'fileSaved',
                name: result.name,
                path: result.path
            });
        }
    }

    private _sendProjectStatus() {
        const status = this._sessionManager.getProjectStatus();
        this._panel.webview.postMessage(status);
    }

    private _sendSkillsList() {
        const message = this._sessionManager.getSkillsList(t);
        if (message) {
            this._panel.webview.postMessage(message);
        }
    }

    private async _executeSlashCommand(command: string) {
        switch (command) {
            case 'init':
                await this._sessionManager.initProjectConfig(true);
                this._sendSkillsList();
                break;
            case 'skills':
                this._sendSkillsList();
                break;
            case 'workflow':
                const workflowMessage = this._sessionManager.getWorkflowsList();
                this._panel.webview.postMessage(workflowMessage);
                break;
            case 'clear':
                this._panel.webview.postMessage({ type: 'clearMessages' });
                break;
        }
        this._panel.webview.postMessage({ type: 'commandExecuted' });
    }

    public dispose() {
        ChatPanel.panels.delete(this._panelId);
        PanelSessionPool.getInstance().release(this._panelId);
        
        // Reset session manager
        this._sessionManager.resetSession(this._sessionId);
        
        // Delete session asynchronously
        this._gateway.deleteSession(this._sessionId).catch(() => {});
        
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }

    // ========== 变更管理方法 ==========

    private async _handlePreviewDiff(changeSetId: string, filePath: string) {
        const changeManager = ChangeManager.getInstance();
        const changeSet = changeManager.getChangeSet(changeSetId);
        
        if (!changeSet) {
            return;
        }

        const file = changeSet.files.find(f => f.path === filePath);
        if (!file) {
            return;
        }

        const diffProvider = DiffProvider.getInstance();
        await diffProvider.showDiff(changeSetId, file);
    }

    private async _handleApplyFile(changeSetId: string, filePath: string) {
        const changeManager = ChangeManager.getInstance();
        await changeManager.applyFileChange(changeSetId, filePath);
    }

    private _handleSkipFile(changeSetId: string, filePath: string) {
        const changeManager = ChangeManager.getInstance();
        changeManager.skipFileChange(changeSetId, filePath);
    }

    private async _handleAcceptAll(changeSetId: string) {
        const changeManager = ChangeManager.getInstance();
        await changeManager.applyAllChanges(changeSetId);
    }

    private _handleRejectAll(changeSetId: string) {
        const changeManager = ChangeManager.getInstance();
        changeManager.rejectAllChanges(changeSetId);
    }

    private async _handleOpenFile(filePath: string) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
        
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Cannot open file: ${filePath}`);
        }
    }
}
