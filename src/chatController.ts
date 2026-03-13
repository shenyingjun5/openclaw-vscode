import * as vscode from 'vscode';
import * as path from 'path';
import { GatewayClient } from './gateway';
import { ChatSessionManager } from './chatSessionManager';
import { ChangeParser } from './changeParser';
import { ChangeManager } from './changeManager';
import { DiffProvider } from './diffProvider';
import { LanguageManager } from './languageManager';
import { getAgentId, buildSessionKey } from './agentConfig';
import { GroupChatManager, GroupMessage, AgentMember, GroupWarningCallback, GroupLoopModeCallback, GroupAutoMessageCallback, GroupWaitingReplyCallback } from './groupChatManager';

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
    private _planMode: boolean = true;
    private _isSending: boolean = false;       // chat.send RPC 正在发送
    private _chatRunId: string | null = null;   // 当前运行的 runId，非 null = 等待 AI 回复
    private _chatEventHandler: ((payload: any) => void) | null = null;
    private _webview: WebviewAdapter | null = null;
    private _disposables: vscode.Disposable[] = [];

    // Group chat
    private _groupManager: GroupChatManager;
    private _groupMessageCallback: ((msg: GroupMessage) => void) | null = null;
    private _groupStateCallback: ((agents: AgentMember[]) => void) | null = null;
    private _groupWarningCallback: GroupWarningCallback | null = null;
    private _groupChainProgressCallback: ((progress: { current: string; queued: string[] }) => void) | null = null;
    private _groupLoopModeCallback: GroupLoopModeCallback | null = null;
    private _groupAutoMessageCallback: GroupAutoMessageCallback | null = null;
    private _groupWaitingReplyCallback: GroupWaitingReplyCallback | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gateway: GatewayClient,
        private readonly _sessionManager: ChatSessionManager,
        private _sessionKey: string
    ) {
        const config = vscode.workspace.getConfiguration('openclaw');
        this._planMode = config.get<boolean>('planMode') !== false;  // default to true (plan mode)

        // Initialize group chat manager singleton.
        // Extract a stable windowId from the VSCode session — NOT from the sessionKey,
        // because panel keys use a different format (vscode-panel-{windowId}-{panelId})
        // and split('-').pop() would wrongly return the panelId instead of windowId.
        this._groupManager = GroupChatManager.getInstance();
        const windowId = vscode.env.sessionId.slice(0, 8);
        this._groupManager.initialize(_gateway, windowId);

        // 监听 Group Chat delegation depth 配置变化
        this._disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('openclaw.groupChat.maxDelegationDepth')) {
                    const depth = vscode.workspace.getConfiguration('openclaw').get<number>('groupChat.maxDelegationDepth', 3);
                    this._groupManager.setMaxDelegationDepth(depth);
                }
            })
        );

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
        this._registerGroupCallbacks();
    }

    private _registerGroupCallbacks(): void {
        // Remove old callbacks
        if (this._groupMessageCallback) {
            this._groupManager.offMessage(this._groupMessageCallback);
        }
        if (this._groupStateCallback) {
            this._groupManager.offStateChange(this._groupStateCallback);
        }
        if (this._groupWarningCallback) {
            this._groupManager.offWarning(this._groupWarningCallback);
        }
        if (this._groupChainProgressCallback) {
            this._groupManager.offChainProgress(this._groupChainProgressCallback);
        }
        if (this._groupLoopModeCallback) {
            this._groupManager.offLoopModeChange(this._groupLoopModeCallback);
        }
        if (this._groupAutoMessageCallback) {
            this._groupManager.offAutoMessage(this._groupAutoMessageCallback);
        }
        if (this._groupWaitingReplyCallback) {
            this._groupManager.offWaitingReply(this._groupWaitingReplyCallback);
        }

        // Group message → forward to webview
        this._groupMessageCallback = (msg: GroupMessage) => {
            this._webview?.postMessage({ type: 'groupMessage', ...msg });
        };
        this._groupManager.onMessage(this._groupMessageCallback);

        // Group state change (agents added/removed/model changed) → notify webview
        this._groupStateCallback = (agents: AgentMember[]) => {
            this._webview?.postMessage({ type: 'groupStateUpdate', agents });
        };
        this._groupManager.onStateChange(this._groupStateCallback);

        // Loop guard warning → notify webview
        this._groupWarningCallback = (reason: 'loop_limit') => {
            this._webview?.postMessage({ type: 'groupLoopWarning', reason });
        };
        this._groupManager.onWarning(this._groupWarningCallback);

        // Chain progress (current + queued agents) → notify webview
        this._groupChainProgressCallback = (progress: { current: string; queued: string[] }) => {
            this._webview?.postMessage({ type: 'chainProgress', current: progress.current, queued: progress.queued });
        };
        this._groupManager.onChainProgress(this._groupChainProgressCallback);

        // Loop Mode toggle → notify webview
        this._groupLoopModeCallback = (enabled: boolean) => {
            this._webview?.postMessage({ type: 'loopModeToggled', enabled });
        };
        this._groupManager.onLoopModeChange(this._groupLoopModeCallback);

        // Auto-loop message → forward to webview
        this._groupAutoMessageCallback = (msg: { type: 'autoLoop'; content: string }) => {
            this._webview?.postMessage({ type: 'autoLoopMessage', content: msg.content });
        };
        this._groupManager.onAutoMessage(this._groupAutoMessageCallback);

        // Waiting reply (for thinking indicators during auto-send) → forward to webview
        this._groupWaitingReplyCallback = (agentIds: string[]) => {
            this._webview?.postMessage({ type: 'waitingGroupReply', agentIds });
        };
        this._groupManager.onWaitingReply(this._groupWaitingReplyCallback);
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

            case 'openUrl':
                if (data.url && typeof data.url === 'string') {
                    vscode.env.openExternal(vscode.Uri.parse(data.url));
                }
                break;

            // ── Group chat ────────────────────────────────────────────────────
            case 'addAgentToGroup':
                vscode.commands.executeCommand('openclaw.addAgentToGroup');
                break;

            case 'removeAgentFromGroup':
                if (data.agentId) {
                    this._groupManager.removeAgent(data.agentId);
                }
                break;

            case 'leaveGroupChat':
                this._groupManager.leaveGroup();
                this._webview?.postMessage({ type: 'groupStateUpdate', agents: [] });
                break;

            case 'getGroupAgents':
                this._webview?.postMessage({
                    type: 'groupStateUpdate',
                    agents: this._groupManager.getAgents(),
                });
                // Also send current loop mode state (for restore on ready)
                this._webview?.postMessage({
                    type: 'loopModeToggled',
                    enabled: this._groupManager.isLoopModeEnabled(),
                });
                break;

            case 'sendGroupMessage':
                await this._sendGroupMessage(data.content);
                break;

            case 'toggleLoopMode':
                {
                    const newState = this._groupManager.toggleLoopMode();
                    // Callback already notifies webview via _groupLoopModeCallback
                    console.log(`[ChatController] Loop Mode toggled: ${newState}`);
                }
                break;

            case 'toggleGroupMode':
                if (this._groupManager.isGroupMode()) {
                    this._groupManager.leaveGroup();
                    this._webview?.postMessage({ type: 'groupStateUpdate', agents: [] });
                }
                break;

            case 'setAgentModel':
                if (data.agentId) {
                    await this._groupManager.setAgentModel(data.agentId, data.model || undefined);
                }
                break;

            case 'openFile':
                await this._handleOpenFile(data.filePath);
                break;

            case 'showConnectionStatus':
                vscode.commands.executeCommand('openclaw.showConnectionStatus');
                break;

            case 'reconnect':
                try {
                    await this._gateway.reloadTokenAndReconnect();
                    // Connected: push green status, clear error
                    this._webview?.postMessage({
                        type: 'connectionStatus',
                        status: 'connected',
                        mode: this._gateway.getMode(),
                        url: this._gateway.getConnectedUrl(),
                        lastError: ''
                    });
                    vscode.window.showInformationMessage('OpenClaw: Reconnected successfully');
                } catch (err) {
                    // Failed: push red status, show latest error
                    this._webview?.postMessage({
                        type: 'connectionStatus',
                        status: 'disconnected',
                        mode: this._gateway.getMode(),
                        url: this._gateway.getConnectedUrl(),
                        lastError: this._gateway.getLastError()
                    });
                    vscode.window.showWarningMessage(`OpenClaw: Reconnect failed - ${err instanceof Error ? err.message : err}`);
                }
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

        // 连接成功后获取 AI 身份（头像/昵称）
        this._fetchAssistantIdentity();

        // 连接成功后获取 thinking level
        this._sendThinkingLevel();

        // 连接成功后，如果是新会话，发送上下文设置（语言 + 工作区）
        if (this._gateway.isConnected() && !this._sessionManager.hasSentContextSetup(this._sessionKey)) {
            try {
                await this._sessionManager.sendContextSetup(this._gateway, this._sessionKey);
                // Also set for group chat agents
                const contextMsg = this._sessionManager.buildContextSetupMessage();
                if (contextMsg) {
                    this._groupManager.setContextSetupMessage(contextMsg);
                }
            } catch (err) {
                console.warn('上下文设置发送失败:', err);
            }
        }
    }

    // ========== 模型 & 思考深度 ==========

    private async _handleSetModel(model: string) {
        try {
            await this._gateway.setSessionModel(this._sessionKey, model);
            vscode.window.showInformationMessage(`Model switched to: ${model}`);

            // Propagate global model to group manager (used as default for agents without override)
            this._groupManager.setGlobalModel(model || undefined);

            // Small delay to let /model command be processed before context setup
            await new Promise(resolve => setTimeout(resolve, 300));

            // Resend context setup (language + workspace)
            await this._sessionManager.sendContextSetup(this._gateway, this._sessionKey);
            // Also update for group chat agents
            const contextMsg = this._sessionManager.buildContextSetupMessage();
            if (contextMsg) {
                this._groupManager.setContextSetupMessage(contextMsg);
            }
        } catch (err: any) {
            vscode.window.showErrorMessage(`Model switch failed: ${err.message || err}`);
        }
    }

    /**
     * 重新发送上下文设置（语言/工作区变化时调用）
     */
    private async _resendContextSetup() {
        if (!this._gateway.isConnected() || this._isSending) return;
        try {
            await this._sessionManager.sendContextSetup(this._gateway, this._sessionKey);
            // Also update for group chat agents
            const contextMsg = this._sessionManager.buildContextSetupMessage();
            if (contextMsg) {
                // broadcastNow=true sends to all current agents immediately
                this._groupManager.setContextSetupMessage(contextMsg, this._groupManager.isGroupMode());
            }
        } catch (err) {
            console.warn('上下文设置重发失败:', err);
        }
    }

    private async _handleSetThinking(level: string) {
        try {
            await this._gateway.setSessionThinking(this._sessionKey, level);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Thinking level setting failed: ${err.message || err}`);
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

        // 使用 SessionManager 构建消息
        const { message: finalMessage } = this._sessionManager.buildMessage(
            content,
            this._sessionKey,
            undefined,
            false
        );

        // Plan Mode 后缀
        let messageToSend = finalMessage;

        // Empty message check
        if (!messageToSend.trim()) {
            this._webview?.postMessage({
                type: 'error',
                content: 'Message content is empty',
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
                const customPrompt = vscode.workspace.getConfiguration('openclaw').get<string>('planModePrompt', '').trim();
                const marker = isZh ? '---- 计划模式 ----' : '---- Plan Mode ----';
                const body = customPrompt || (isZh
                    ? '⚠️ 计划模式\n允许: 读取、搜索、列表\n禁止: 写入、修改、删除、执行\n步骤: 1) 理解任务 2) 拆分为小的子任务 3) 描述每个步骤的目标和影响\n输出: 逐步计划\n等待用户输入 "执行" 后再执行任何写操作'
                    : '⚠️ PLAN MODE\nAllowed: read, search, list\nForbidden: write, modify, delete, execute\nSteps: 1) Understand the task 2) Break into small sub-tasks 3) Describe goal and impact for each step\nOutput: step-by-step plan\nWait for user "execute" before any write action');
                messageToSend += `\n\n${marker}\n${body}\n${marker}`;
            }
        }

        try {
            // 先生成 runId 并设置状态 + 监听器（对齐 WebChat：避免 chat 事件先于 RPC 响应到达时被跳过）
            const runId = crypto.randomUUID();
            this._chatRunId = runId;
            this._setupChatEventListener();

            // 通知 webview：进入等待回复阶段
            this._isSending = false;
            this._webview?.postMessage({
                type: 'waitingReply',
                runId
            });

            // 发送 RPC
            await this._gateway.sendChat(this._sessionKey, messageToSend, runId);

        } catch (err: any) {
            this._isSending = false;
            this._chatRunId = null;
            this._removeChatEventListener();
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
            // Dynamic suffix extraction — strips "agent:{agentId}:" prefix
            const sessionSuffix = this._sessionKey.replace(/^agent:[^:]+:/, '');
            if (!eventSessionKey.includes(sessionSuffix)) return;

            // runId 匹配：如果事件有 runId 且与 chatRunId 不同，忽略 delta
            if (payload.runId && payload.runId !== this._chatRunId) {
                if (payload.state === 'final') {
                    // 子 agent 完成 → 刷新历史（子 agent 结果会追加到主会话）
                    this._loadHistory();
                }
                return;
            }

            const state = payload.state;

            if (state === 'final' || state === 'aborted' || state === 'error') {
                // AI 回复完成
                this._chatRunId = null;
                this._removeChatEventListener();

                if (state === 'error') {
                    const errorMsg = payload.errorMessage || 'AI response error';
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
            status: isConnected ? 'connected' : 'disconnected',
            mode: this._gateway.getMode(),
            url: this._gateway.getConnectedUrl(),
            lastError: this._gateway.getLastError()
        });
    }

    private async _ensureConnection() {
        try {
            this._webview?.postMessage({
                type: 'connectionStatus',
                status: 'connecting',
                mode: this._gateway.getMode(),
                url: this._gateway.getConnectedUrl(),
                lastError: ''
            });

            await this._gateway.connect();

            this._webview?.postMessage({
                type: 'connectionStatus',
                status: 'connected',
                mode: this._gateway.getMode(),
                url: this._gateway.getConnectedUrl(),
                lastError: ''
            });

            // 连接成功后设置 verbose level
            await this._gateway.setSessionVerbose(this._sessionKey, 'off');
        } catch (err) {
            this._webview?.postMessage({
                type: 'connectionStatus',
                status: 'disconnected',
                mode: this._gateway.getMode(),
                url: this._gateway.getConnectedUrl(),
                lastError: this._gateway.getLastError()
            });
        }
    }

    private async _fetchAssistantIdentity() {
        if (!this._gateway.isConnected()) return;
        try {
            const identity = await this._gateway.getAgentIdentity();
            if (identity) {
                this._webview?.postMessage({
                    type: 'assistantIdentity',
                    name: identity.name || '',
                    avatar: identity.avatar || ''
                });
            }
        } catch (err) {
            console.warn('[identity] 获取 AI 身份失败:', err);
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

    /**
     * 处理 text/uri-list 拖放（VSCode 文件树 / 编辑器 tab）
     */
    private async _handleUriDrop(uris: string[]) {
        for (const uriStr of uris) {
            try {
                const uri = vscode.Uri.parse(uriStr);
                if (uri.scheme !== 'file') continue;

                const fsPath = uri.fsPath;
                const stat = await vscode.workspace.fs.stat(uri);
                const isDirectory = (stat.type & vscode.FileType.Directory) !== 0;
                const name = fsPath.split('/').pop() || fsPath;

                this._webview?.postMessage({
                    type: 'fileDropped',
                    name: isDirectory ? name + '/' : name,
                    path: fsPath
                });
            } catch {
                // 文件不存在或无法访问，跳过
            }
        }
    }

    /**
     * 处理通过 FileReader 读取的文件内容（新版 Electron File.path 不可用时兜底）
     */
    private async _handleDropContent(name: string, base64: string, _mimeType: string) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const tmpDir = workspaceFolder
                ? vscode.Uri.joinPath(workspaceFolder.uri, '.openclaw', 'tmp')
                : vscode.Uri.file(require('os').tmpdir());

            await vscode.workspace.fs.createDirectory(tmpDir);
            const fileUri = vscode.Uri.joinPath(tmpDir, name);
            const buffer = Buffer.from(base64, 'base64');
            await vscode.workspace.fs.writeFile(fileUri, buffer);

            this._webview?.postMessage({
                type: 'fileDropped',
                name: name,
                path: fileUri.fsPath
            });
        } catch {
            // 保存失败，跳过
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
        const agentId = getAgentId();
        this._sessionKey = buildSessionKey(agentId, `vscode-${Date.now()}`);
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

        const content = `Analyze:\n\n\`${fileName}\`:\n\`\`\`${lang}\n${text}\n\`\`\``;

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

        const content = `Analyze:\n\n\`${fileName}\`:\n\`\`\`${lang}\n${text}\n\`\`\``;

        this._webview?.postMessage({
            type: 'addMessage',
            role: 'user',
            content: `[${t('sentFile')}: ${fileName}]`
        });

        await this._sendMessage(content);
    }

    // ── Group chat public API ─────────────────────────────────────────────────

    public async addAgentToGroup(agentId: string, model?: string): Promise<void> {
        const member = await this._groupManager.addAgent(agentId);
        
        // Set model if specified
        if (model) {
            await this._groupManager.setAgentModel(agentId, model);
        }

        this._webview?.postMessage({
            type: 'groupStateUpdate',
            agents: this._groupManager.getAgents(),
        });
        vscode.window.showInformationMessage(
            `OpenClaw Group: Added agent "${member.name || member.agentId}"${model ? ` (using ${model})` : ''}`
        );
    }

    public removeAgentFromGroup(agentId: string): void {
        this._groupManager.removeAgent(agentId);
    }

    public leaveGroupChat(): void {
        this._groupManager.leaveGroup();
        this._webview?.postMessage({ type: 'groupStateUpdate', agents: [] });
    }

    // ── Group message send ────────────────────────────────────────────────────

    private async _sendGroupMessage(content: string): Promise<void> {
        if (!content.trim()) {
            return;
        }
        try {
            // Returns ordered list of all target agentIds (chain order)
            const agentIds = await this._groupManager.sendGroupMessage(content, this._planMode);
            this._webview?.postMessage({ type: 'waitingGroupReply', agentIds });
        } catch (err: any) {
            this._webview?.postMessage({
                type: 'error',
                content: err.message || String(err),
                context: 'group_send',
            });
        }
    }

    /**
     * Restore webview state when sidebar becomes visible again.
     * Sends current group state, plan mode, and other UI state to rebuild the UI.
     */
    public restoreWebviewState() {
        if (!this._webview) return;

        // Restore locale
        this._webview.postMessage({
            type: 'setLocale',
            locale: LanguageManager.getInstance().getAIOutputLanguage()
        });

        // Restore group state (always send to ensure UI state is correct)
        const agents = this._groupManager.getAgents();
        this._webview.postMessage({
            type: 'groupStateUpdate',
            agents: agents.map(a => ({
                agentId: a.agentId,
                name: a.name,
                color: a.color,
                modelOverride: a.modelOverride
            }))
        });

        // Restore loop mode state
        this._webview.postMessage({
            type: 'loopModeToggled',
            enabled: this._groupManager.isLoopModeEnabled()
        });

        // Restore plan mode state
        this._webview.postMessage({
            type: 'updatePlanMode',
            enabled: this._planMode
        });

        // Refresh models to get current selection
        this._sendModels();
    }

    public dispose() {
        this._removeChatEventListener();
        if (this._groupMessageCallback) {
            this._groupManager.offMessage(this._groupMessageCallback);
        }
        if (this._groupStateCallback) {
            this._groupManager.offStateChange(this._groupStateCallback);
        }
        if (this._groupWarningCallback) {
            this._groupManager.offWarning(this._groupWarningCallback);
        }
        if (this._groupChainProgressCallback) {
            this._groupManager.offChainProgress(this._groupChainProgressCallback);
        }
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
}
