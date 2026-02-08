import * as vscode from 'vscode';
import * as path from 'path';
import { GatewayClient } from './gateway';
import { ChatSessionManager } from './chatSessionManager';
import { ChangeParser } from './changeParser';
import { ChangeManager } from './changeManager';
import { DiffProvider } from './diffProvider';
import { LanguageManager } from './languageManager';

// i18n helper - 语言跟随 openclaw.aiOutputLanguage 设置
function getLocale(): string {
    const lang = LanguageManager.getInstance().getAIOutputLanguage();
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
        },
        maxPanels: {
            en: 'Maximum parallel sessions reached (5). Please close a window first.',
            zh: '已达最大并行会话数 (5)，请关闭一个窗口后再试'
        },
        cannotAllocate: {
            en: 'Cannot allocate new session window',
            zh: '无法分配新的会话窗口'
        }
    };
    return messages[key]?.[locale] || messages[key]?.['en'] || key;
}

export { t };

/**
 * Webview 适配器接口
 * 抹平 WebviewView（侧边栏）和 WebviewPanel（独立面板）的差异
 */
export interface WebviewAdapter {
    postMessage(message: any): void;
}

/**
 * ChatController - 聊天核心业务逻辑
 * 供 ChatProvider（侧边栏）和 ChatPanel（独立面板）共同使用
 */
export class ChatController {
    private _planMode: boolean = false;
    private _isSending: boolean = false;       // chat.send RPC 正在发送
    private _chatRunId: string | null = null;   // 当前运行的 runId，非 null = 等待 AI 回复
    private _chatEventHandler: ((payload: any) => void) | null = null;
    private _webview: WebviewAdapter | null = null;
        private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gateway: GatewayClient,
        private readonly _sessionManager: ChatSessionManager,
        private _sessionKey: string
    ) {
        const config = vscode.workspace.getConfiguration('openclaw');
        this._planMode = config.get<boolean>('planMode') || false;

        // 监听语言设置变化，实时更新 UI 并重新发送上下文
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('openclaw.aiOutputLanguage')) {
                    this._webview?.postMessage({
                        type: 'setLocale',
                        locale: LanguageManager.getInstance().getAIOutputLanguage()
                    });
                    // 语言变化时重新发送上下文设置
                    this._resendContextSetup();
                }
            })
        );

        // 监听工作区变化，重新发送上下文
        this._disposables.push(
            vscode.workspace.onDidChangeWorkspaceFolders(() => {
                this._resendContextSetup();
            })
        );
    }

    /**
     * 绑定 webview（延迟绑定，因为侧边栏 webview 在 resolve 时才可用）
     */
    setWebview(webview: WebviewAdapter) {
        this._webview = webview;
    }

    get sessionKey(): string {
        return this._sessionKey;
    }

    set sessionKey(id: string) {
        this._sessionKey = id;
    }

    get sessionManager(): ChatSessionManager {
        return this._sessionManager;
    }

    /**
     * 处理 webview 消息
     */
    async handleMessage(data: any) {
        switch (data.type) {
            case 'ready':
                await this._handleReady();
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
                this._webview?.postMessage({ type: 'sendingComplete' });
                this._webview?.postMessage({
                    type: 'systemMessage',
                    error: {
                        message: 'stopped',
                        context: 'user_stop'
                    }
                });
                break;

            case 'refresh':
                await this._loadHistory();
                this._webview?.postMessage({ type: 'refreshComplete' });
                this._checkConnection();
                break;

            case 'checkConnection':
                this._checkConnection();
                break;

            case 'getAutoRefreshInterval':
                const interval = vscode.workspace.getConfiguration('openclaw').get('autoRefreshInterval', 2000);
                this._webview?.postMessage({
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
                await this._handleSetModel(data.model);
                break;

            case 'setThinking':
                await this._handleSetThinking(data.level);
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
    }

    // ========== 初始化流程 ==========

    private async _handleReady() {
        // 发送 locale（跟随 aiOutputLanguage 设置）
        this._webview?.postMessage({
            type: 'setLocale',
            locale: LanguageManager.getInstance().getAIOutputLanguage()
        });

        // 加载历史
        await this._loadHistory();

        // 发送模型列表
        this._sendModels();

        // 发送项目状态
        this._sendProjectStatus();

        // 发送 plan mode 状态
        this._webview?.postMessage({
            type: 'updatePlanMode',
            enabled: this._planMode
        });

        // 主动建立连接并更新状态
        await this._ensureConnection();

        // 连接成功后获取 thinking level
        this._sendThinkingLevel();

        // 连接成功后，如果是新会话，发送上下文设置（语言 + 工作区）
        if (this._gateway.isConnected() && !this._sessionManager.hasSentContextSetup(this._sessionKey)) {
            try {
                await this._sessionManager.sendContextSetup(this._gateway, this._sessionKey);
            } catch (err) {
                console.warn('上下文设置发送失败:', err);
            }
        }
    }

    // ========== 模型 & 思考深度 ==========

    private async _handleSetModel(model: string) {
        try {
            await this._gateway.setSessionModel(this._sessionKey, model);
            vscode.window.showInformationMessage(`模型已切换为: ${model}`);

            // 重新发送上下文设置（语言 + 工作区）
            await this._sessionManager.sendContextSetup(this._gateway, this._sessionKey);
        } catch (err: any) {
            vscode.window.showErrorMessage(`模型切换失败: ${err.message || err}`);
        }
    }

    /**
     * 重新发送上下文设置（语言/工作区变化时调用）
     */
    private async _resendContextSetup() {
        if (!this._gateway.isConnected() || this._isSending) return;
        try {
            await this._sessionManager.sendContextSetup(this._gateway, this._sessionKey);
        } catch (err) {
            console.warn('上下文设置重发失败:', err);
        }
    }

    private async _handleSetThinking(level: string) {
        try {
            await this._gateway.setSessionThinking(this._sessionKey, level);
        } catch (err: any) {
            vscode.window.showErrorMessage(`思考深度设置失败: ${err.message || err}`);
        }
    }

    private async _sendModels() {
        const models = await this._sessionManager.getModels(this._gateway);
        this._webview?.postMessage({
            type: 'updateModels',
            models
        });
    }

    private async _sendThinkingLevel() {
        try {
            const level = await this._gateway.getSessionThinkingLevel(this._sessionKey);
            this._webview?.postMessage({
                type: 'updateThinking',
                level
            });
        } catch (err) {
            console.warn('Failed to get thinking level:', err);
        }
    }

    // ========== 消息发送 ==========

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
                forceWorkflow = true;
                actualContent = rest;
            } else {
                forceSkillName = prefix;
                actualContent = rest;
            }
        }

        // 使用 SessionManager 构建消息
        const { message: finalMessage, triggeredSkill } = this._sessionManager.buildMessage(
            actualContent,
            this._sessionKey,
            forceSkillName,
            forceWorkflow
        );

        // 如果 /xxx 没命中任何技能，按原文放行给 AI
        const effectiveMessage = (forceSkillName && !triggeredSkill)
            ? this._sessionManager.buildMessage(content, this._sessionKey, undefined, false).message
            : finalMessage;

        // 通知 UI 触发的技能
        if (triggeredSkill) {
            this._webview?.postMessage({
                type: 'skillTriggered',
                skill: {
                    name: triggeredSkill.name,
                    trigger: forceSkillName ? '/' + triggeredSkill.name : triggeredSkill.triggers.find(t =>
                        actualContent.toLowerCase().includes(t.toLowerCase())
                    ) || triggeredSkill.triggers[0]
                }
            });
        }

        // Plan Mode 后缀
        let messageToSend = effectiveMessage;

        // 空消息检查
        if (!messageToSend.trim()) {
            this._webview?.postMessage({
                type: 'error',
                content: '消息内容为空',
                context: 'send'
            });
            this._isSending = false;
            this._webview?.postMessage({ type: 'sendingComplete' });
            return;
        }

        if (this._planMode) {
            const confirmCommands = ['执行', '继续', '确认', '开始', 'go', 'yes', 'ok', 'y', 'execute', 'run'];
            const isConfirm = confirmCommands.some(cmd =>
                content.toLowerCase().trim() === cmd.toLowerCase()
            );

            if (!isConfirm) {
                const isZh = getLocale() === 'zh';
                if (isZh) {
                    messageToSend += `\n\n---- 计划模式 ----\n⚠️ 请勿执行，仅输出计划\n\n要求：\n1. 仅输出计划，不要调用任何工具\n2. 列出每个步骤及其影响\n3. 等用户说"执行"后再调用工具\n\n违反 = 任务失败\n---- 计划模式 ----`;
                } else {
                    messageToSend += `\n\n---- Plan Mode ----\n⚠️ Do Not Execute - Plan Only\n\nYou must:\n1. Output plan only, do not call any tools\n2. List each step and its impact\n3. Wait for user to say "execute" before calling tools\n\nViolation = Task failed\n---- Plan Mode ----`;
                }
            }
        }

        try {
            // 生成 idempotencyKey 并发送 RPC（fire-and-forget，不等 AI 回复）
            const runId = await this._gateway.sendChat(this._sessionKey, messageToSend);
            
            if (!runId) {
                throw new Error('发送失败：无法获取 runId');
            }

            // 设置 chatRunId，开始监听 chat 事件
            this._chatRunId = runId;
            this._isSending = false;
            this._setupChatEventListener();

            // 通知 webview：进入等待回复阶段（chatRunId 非空 = 按钮禁用 + 自动刷新）
            this._webview?.postMessage({ 
                type: 'waitingReply',
                runId
            });

        } catch (err: any) {
            this._isSending = false;
            this._chatRunId = null;
            this._webview?.postMessage({
                type: 'error',
                content: err.message || String(err),
                context: 'send'
            });
            this._webview?.postMessage({ type: 'sendingComplete' });
        }
    }

    /**
     * 监听 chat 事件，匹配 runId，处理 final/error/aborted
     * 对齐 webchat 的 Uu 函数逻辑
     */
    private _setupChatEventListener(): void {
        // 移除旧的监听器
        this._removeChatEventListener();

        const handler = (payload: any) => {
            if (!payload || !this._chatRunId) return;

            // sessionKey 匹配
            const eventSessionKey = payload.sessionKey || '';
            if (!eventSessionKey.includes(this._sessionKey.replace('agent:main:', ''))) return;

            // runId 匹配：如果事件有 runId 且与 chatRunId 不同，忽略 delta（但 final 仍处理）
            if (payload.runId && payload.runId !== this._chatRunId) {
                if (payload.state === 'final') {
                    // 其他 run 的 final，忽略
                    return;
                }
                return;
            }

            const state = payload.state;

            if (state === 'final' || state === 'aborted' || state === 'error') {
                // AI 回复完成
                this._chatRunId = null;
                this._removeChatEventListener();

                if (state === 'error') {
                    const errorMsg = payload.errorMessage || 'AI 回复出错';
                    this._webview?.postMessage({
                        type: 'error',
                        content: errorMsg,
                        context: 'send'
                    });
                }

                // 通知 webview：回复完成
                this._webview?.postMessage({ type: 'sendingComplete' });

                // final 时做一次历史刷新，确保拿到完整数据
                if (state === 'final') {
                    this._loadHistory();
                }
            }
        };

        this._chatEventHandler = handler;
        this._gateway.onChatEvent(handler);
    }

    /**
     * 移除 chat 事件监听器
     */
    private _removeChatEventListener(): void {
        if (this._chatEventHandler) {
            this._gateway.offChatEvent(this._chatEventHandler);
            this._chatEventHandler = null;
        }
    }

    // ========== 工具调用 ==========
    // 工具调用数据通过 loadHistory（自动刷新 2s）获取，toolCalls 包含在历史消息中

    // ========== 连接管理 ==========

    private async _loadHistory() {
        try {
            const messages = await this._sessionManager.loadHistory(this._gateway, this._sessionKey);
            this._webview?.postMessage({
                type: 'loadHistory',
                messages
            });
        } catch (err) {
            console.warn('[loadHistory] 加载失败:', err);
        }
    }

    private _checkConnection() {
        const isConnected = this._gateway.isConnected();
        this._webview?.postMessage({
            type: 'connectionStatus',
            status: isConnected ? 'connected' : 'disconnected'
        });
    }

    private async _ensureConnection() {
        try {
            this._webview?.postMessage({
                type: 'connectionStatus',
                status: 'connecting'
            });

            await this._gateway.connect();

            this._webview?.postMessage({
                type: 'connectionStatus',
                status: 'connected'
            });

            // 连接成功后设置 verbose level
            await this._gateway.setSessionVerbose(this._sessionKey, 'off');
        } catch (err) {
            this._webview?.postMessage({
                type: 'connectionStatus',
                status: 'disconnected'
            });
        }
    }

    // ========== 项目 & 技能 ==========

    private _sendProjectStatus() {
        const status = this._sessionManager.getProjectStatus();
        this._webview?.postMessage(status);
    }

    private _sendSkillsList() {
        const message = this._sessionManager.getSkillsList(t);
        if (message) {
            this._webview?.postMessage(message);
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
                this._webview?.postMessage(workflowMessage);
                break;
            case 'clear':
                this._webview?.postMessage({ type: 'clearMessages' });
                break;
        }
        this._webview?.postMessage({ type: 'commandExecuted' });
    }

    // ========== 文件管理 ==========

    private async _handleGetFiles() {
        const files = await this._sessionManager.getWorkspaceFiles();
        this._webview?.postMessage({ type: 'files', files });
    }

    private async _handleSelectFile() {
        const files = await this._sessionManager.handleFileSelection();
        for (const file of files) {
            this._webview?.postMessage({
                type: 'fileSelected',
                name: file.name,
                path: file.path
            });
        }
    }

    private async _handleFileDrop(files: { name: string; path: string }[]) {
        for (const file of files) {
            this._webview?.postMessage({
                type: 'fileDropped',
                name: file.name,
                path: file.path
            });
        }
    }

    private async _saveImage(base64Data: string, name: string) {
        const result = await this._sessionManager.saveImage(base64Data, name);
        if (result) {
            this._webview?.postMessage({
                type: 'fileSaved',
                name: result.name,
                path: result.path
            });
        }
    }

    // ========== 变更管理 ==========

    private async _handlePreviewDiff(changeSetId: string, filePath: string) {
        const changeManager = ChangeManager.getInstance();
        const changeSet = changeManager.getChangeSet(changeSetId);

        if (!changeSet) return;

        const file = changeSet.files.find(f => f.path === filePath);
        if (!file) return;

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
        if (!workspaceFolder) return;

        const uri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);

        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Cannot open file: ${filePath}`);
        }
    }

    // ========== 公共方法（供外部调用） ==========

    public updatePlanMode(enabled: boolean) {
        this._planMode = enabled;
        this._webview?.postMessage({ type: 'updatePlanMode', enabled });
    }

    public newSession() {
        this._sessionKey = `agent:main:vscode-${Date.now()}`;
        this._sessionManager.resetSession(this._sessionKey);
        this._webview?.postMessage({ type: 'clearMessages' });
        vscode.window.showInformationMessage(`${t('newSession')}: ${this._sessionKey}`);
    }

    public clearChat() {
        this._webview?.postMessage({ type: 'clearMessages' });
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

        this._webview?.postMessage({
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

        this._webview?.postMessage({
            type: 'addMessage',
            role: 'user',
            content: `[${t('sentFile')}: ${fileName}]`
        });

        await this._sendMessage(content);
    }

    public dispose() {
        this._removeChatEventListener();
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
}
