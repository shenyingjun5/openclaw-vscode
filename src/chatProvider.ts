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
        },
        noActiveEditor: {
            en: 'No active editor',
            zh: '没有活动的编辑器'
        },
        noSelection: {
            en: 'No code selected',
            zh: '没有选中任何代码'
        },
        newSession: {
            en: 'New session',
            zh: '新会话'
        },
        selectedCode: {
            en: 'Selected code',
            zh: '选中代码'
        },
        sentFile: {
            en: 'Sent file',
            zh: '发送文件'
        },
        projectInit: {
            en: 'Project initialized',
            zh: '项目已初始化'
        },
        noSkills: {
            en: 'No skills found in project',
            zh: '项目中未发现技能'
        }
    };
    return messages[key]?.[locale] || messages[key]?.['en'] || key;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _sessionId: string;
    private _planMode: boolean = false;
    private _isSending: boolean = false;
    private _sessionManager: ChatSessionManager;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gateway: GatewayClient
    ) {
        // Use VS Code window session ID for isolation between multiple windows
        const windowId = vscode.env.sessionId.slice(0, 8);
        this._sessionId = `vscode-main-${windowId}`;

        const config = vscode.workspace.getConfiguration('openclaw');
        this._planMode = config.get<boolean>('planMode') || false;

        // 初始化 SessionManager
        this._sessionManager = new ChatSessionManager(_extensionUri);
        
        // 🔧 监听工具调用事件
        this._setupToolCallListener();
    }
    
    private _setupToolCallListener() {
        // 如果 gateway 使用 WebSocket 模式，监听工具调用事件
        const wsClient = (this._gateway as any)._wsClient;
        if (wsClient) {
            wsClient.on('tool.call', (payload: { name: string; args?: any }) => {
                this._view?.webview.postMessage({
                    type: 'addToolCall',
                    name: payload.name,
                    args: payload.args
                });
            });
        }
    }

    private async _initProjectConfig(forceRescan = false) {
        await this._sessionManager.initProjectConfig(forceRescan);
    }

    private _sendProjectStatus() {
        if (!this._view) return;
        const status = this._sessionManager.getProjectStatus();
        this._view.webview.postMessage(status);
    }

    private _sendSkillsList() {
        if (!this._view) return;
        const message = this._sessionManager.getSkillsList(t);
        if (message) {
            this._view.webview.postMessage(message);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview'),
                vscode.Uri.joinPath(this._extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Auto-scan project
        this._initProjectConfig();

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'ready':
                    // Send locale to webview
                    this._view?.webview.postMessage({
                        type: 'setLocale',
                        locale: vscode.env.language
                    });
                    await this._loadHistory();
                    this._sendModels();
                    this._sendProjectStatus();
                    this._view?.webview.postMessage({
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
                    this._view?.webview.postMessage({ type: 'sendingComplete' });
                    // 发送停止提示
                    this._view?.webview.postMessage({
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
                    this._view?.webview.postMessage({ type: 'refreshComplete' });
                    // 更新连接状态
                    this._checkConnection();
                    break;

                case 'checkConnection':
                    this._checkConnection();
                    break;

                case 'getAutoRefreshInterval':
                    const interval = vscode.workspace.getConfiguration('openclaw').get('autoRefreshInterval', 10000);
                    this._view?.webview.postMessage({ 
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

                case 'initProject':
                    await this._initProjectConfig(true);
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
        });
    }

    private _getHtmlContent(webview: vscode.Webview): string {
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
        this._view?.webview.postMessage({
            type: 'updateModels',
            models
        });
    }

    private async _sendMessage(content: string) {
        if (this._isSending) return;

        this._isSending = true;

        // 自动接受待处理的变更集
        const changeManager = ChangeManager.getInstance();
        await changeManager.autoAcceptPending();

        // Check for /skillname or /.workflowname prefix
        let forceSkillName: string | undefined;
        let forceWorkflow = false;
        let actualContent = content;

        const slashMatch = content.match(/^\/(\S+)\s*(.*)/);
        if (slashMatch) {
            const prefix = slashMatch[1];
            const rest = slashMatch[2];

            if (prefix.startsWith('.')) {
                // Force workflow: /.cursorrules
                forceWorkflow = true;
                actualContent = rest;
            } else {
                // Try as skill name — 只在技能存在时才拆分
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

        // Notify UI about triggered skill
        if (triggeredSkill) {
            this._view?.webview.postMessage({
                type: 'skillTriggered',
                skill: {
                    name: triggeredSkill.name,
                    trigger: forceSkillName ? '/' + triggeredSkill.name : triggeredSkill.triggers.find(t =>
                        actualContent.toLowerCase().includes(t.toLowerCase())
                    ) || triggeredSkill.triggers[0]
                }
            });
        }

        // Add plan mode suffix if needed
        let messageToSend = effectiveMessage;

        // 空消息检查（如 /mode 等无内容的斜杠命令）
        if (!messageToSend.trim()) {
            this._view?.webview.postMessage({
                type: 'error',
                content: '消息内容为空',
                context: 'send'
            });
            this._isSending = false;
            this._view?.webview.postMessage({ type: 'sendingComplete' });
            return;
        }

        if (this._planMode) {
            const confirmCommands = ['执行', '继续', '确认', '开始', 'go', 'yes', 'ok', 'y', 'execute', 'run'];
            const isConfirm = confirmCommands.some(cmd =>
                content.toLowerCase().trim() === cmd.toLowerCase()
            );

            if (!isConfirm) {
                messageToSend += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ [Plan Mode - Do Not Execute]

You must:
1. Output plan only, do not call any tools
2. List each step and its impact
3. Wait for user to say "execute" before calling tools

Violation = Task failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
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
                this._view?.webview.postMessage({
                    type: 'addChange',
                    changeSet: changeSet
                });
            }

            if (replyContent) {
                this._view?.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: replyContent
                });
            }
        } catch (err: any) {
            this._view?.webview.postMessage({
                type: 'error',
                content: err.message || String(err),
                context: 'send'
            });
        } finally {
            this._isSending = false;
            this._view?.webview.postMessage({ type: 'sendingComplete' });
        }
    }

    private async _executeSlashCommand(command: string) {
        switch (command) {
            case 'init':
                await this._initProjectConfig(true);
                this._sendSkillsList();
                break;
            case 'skills':
                this._sendSkillsList();
                break;
            case 'workflow':
                const workflowMessage = this._sessionManager.getWorkflowsList();
                this._view?.webview.postMessage(workflowMessage);
                break;
            case 'clear':
                this._view?.webview.postMessage({ type: 'clearMessages' });
                break;
        }
        this._view?.webview.postMessage({ type: 'commandExecuted' });
    }

    private async _handleCommand(content: string): Promise<boolean> {
        const parts = content.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);

        switch (cmd) {
            case '/init':
                await this._initProjectConfig(true);
                this._sendSkillsList();
                return true;

            case '/skills':
                this._sendSkillsList();
                return true;

            case '/skill':
                if (args.length > 0 && this._sessionManager.hasProjectConfig()) {
                    const config = this._sessionManager.getProjectConfig();
                    if (config) {
                        const skill = config.skills.find(s => s.name === args[0]);
                    if (skill) {
                        this._view?.webview.postMessage({
                            type: 'addMessage',
                            role: 'system',
                            content: `🎯 Skill "${skill.name}" will be applied to your next message.`
                        });
                    } else {
                        this._view?.webview.postMessage({
                            type: 'addMessage',
                            role: 'system',
                            content: `Skill "${args[0]}" not found.`
                        });
                        }
                    }
                }
                return true;

            case '/workflow':
                const workflowMsg = this._sessionManager.getWorkflowsList();
                this._view?.webview.postMessage(workflowMsg);
                return true;

            default:
                return false;
        }
    }

    private async _loadHistory() {
        const messages = await this._sessionManager.loadHistory(this._gateway, this._sessionId);
        this._view?.webview.postMessage({
            type: 'loadHistory',
            messages
        });
    }

    private _checkConnection() {
        // 检查 Gateway 连接状态
        const isConnected = this._gateway.isConnected();
        this._view?.webview.postMessage({
            type: 'connectionStatus',
            status: isConnected ? 'connected' : 'disconnected'
        });
    }

    private async _ensureConnection() {
        try {
            // 发送连接中状态
            this._view?.webview.postMessage({
                type: 'connectionStatus',
                status: 'connecting'
            });
            
            // 尝试连接
            await this._gateway.connect();
            
            // 连接成功
            this._view?.webview.postMessage({
                type: 'connectionStatus',
                status: 'connected'
            });
        } catch (err) {
            // 连接失败
            this._view?.webview.postMessage({
                type: 'connectionStatus',
                status: 'disconnected'
            });
        }
    }

    private async _handleGetFiles() {
        const files = await this._sessionManager.getWorkspaceFiles();
        this._view?.webview.postMessage({ type: 'files', files });
    }

    private async _handleSelectFile() {
        const files = await this._sessionManager.handleFileSelection();
        for (const file of files) {
            this._view?.webview.postMessage({
                type: 'fileSelected',
                name: file.name,
                path: file.path
            });
        }
    }

    private async _handleFileDrop(files: { name: string; path: string }[]) {
        for (const file of files) {
            this._view?.webview.postMessage({
                type: 'fileDropped',
                name: file.name,
                path: file.path
            });
        }
    }

    private async _saveImage(base64Data: string, name: string) {
        const result = await this._sessionManager.saveImage(base64Data, name);
        if (result) {
            this._view?.webview.postMessage({
                type: 'fileSaved',
                name: result.name,
                path: result.path
            });
        }
    }

    public updatePlanMode(enabled: boolean) {
        this._planMode = enabled;
        this._view?.webview.postMessage({ type: 'updatePlanMode', enabled });
    }

    public newSession() {
        this._sessionId = `vscode-${Date.now()}`;
        this._sessionManager.resetSession(this._sessionId);
        this._view?.webview.postMessage({ type: 'clearMessages' });
        vscode.window.showInformationMessage(`${t('newSession')}: ${this._sessionId}`);
    }

    public clearChat() {
        this._view?.webview.postMessage({ type: 'clearMessages' });
    }

    public async sendSelection() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(t('noActiveEditor'));
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text) {
            vscode.window.showWarningMessage(t('noSelection'));
            return;
        }

        const fileName = path.basename(editor.document.fileName);
        const lang = editor.document.languageId;

        const content = `Please analyze this code:\n\n\`${fileName}\`:\n\`\`\`${lang}\n${text}\n\`\`\``;

        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: `[${t('selectedCode')}: ${fileName}]`
        });

        await this._sendMessage(content);
    }

    public async sendFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(t('noActiveEditor'));
            return;
        }

        const text = editor.document.getText();
        const fileName = path.basename(editor.document.fileName);
        const lang = editor.document.languageId;

        const content = `Please analyze this file:\n\n\`${fileName}\`:\n\`\`\`${lang}\n${text}\n\`\`\``;

        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: `[${t('sentFile')}: ${fileName}]`
        });

        await this._sendMessage(content);
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
