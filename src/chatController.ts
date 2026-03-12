import * as vscode from 'vscode';
import * as path from 'path';
import { GatewayClient } from './gateway';
import { ChatSessionManager } from './chatSessionManager';
import { ChangeParser } from './changeParser';
import { ChangeManager } from './changeManager';
import { DiffProvider } from './diffProvider';
import { LanguageManager } from './languageManager';
import { AgentManager, AgentInfo } from './agentManager';
import { ProjectMemoryManager } from './projectMemoryManager';

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
    private _agentManager: AgentManager;
    private _currentAgentId: string = 'main';
    private _windowId: string;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gateway: GatewayClient,
        private readonly _sessionManager: ChatSessionManager,
        private _sessionKey: string,
        private readonly _context: vscode.ExtensionContext,
        windowId?: string
    ) {
        this._agentManager = new AgentManager();
        this._agentManager.setGateway(_gateway);
        this._windowId = windowId || 'main';

        // 从 sessionKey 中提取 agentId（格式：agent:<agentId>:<sessionId>）
        const match = _sessionKey.match(/^agent:([^:]+):/);
        if (match) {
            this._currentAgentId = match[1];
        }

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

            case 'openProjectMemory':
                vscode.commands.executeCommand('openclaw.openProjectMemory');
                break;

            case 'getFiles':
                await this._handleGetFiles();
                break;

            case 'selectFile':
                await this._handleSelectFile();
                break;

            case 'handleDrop':
                if (data.uris) {
                    await this._handleUriDrop(data.uris);
                } else if (data.files) {
                    await this._handleFileDrop(data.files);
                }
                break;

            case 'handleDropContent':
                await this._handleDropContent(data.name, data.base64, data.mimeType);
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

            case 'openFile':
                await this._handleOpenFile(data.filePath);
                break;

            case 'showConnectionStatus':
                vscode.commands.executeCommand('openclaw.showConnectionStatus');
                break;

            case 'reconnect':
                // 重置业务层状态，解除 UI 卡死
                this._resetSendingState();

                try {
                    await this._gateway.reloadTokenAndReconnect();
                    // 连接成功：推送绿灯状态，清除错误信息
                    this._webview?.postMessage({
                        type: 'connectionStatus',
                        status: 'connected',
                        mode: this._gateway.getMode(),
                        url: this._gateway.getConnectedUrl(),
                        lastError: ''
                    });
                    vscode.window.showInformationMessage('招财: 重新连接成功');
                } catch (err) {
                    // 连接失败：推送红灯状态，展示最新错误
                    this._webview?.postMessage({
                        type: 'connectionStatus',
                        status: 'disconnected',
                        mode: this._gateway.getMode(),
                        url: this._gateway.getConnectedUrl(),
                        lastError: this._gateway.getLastError()
                    });
                    vscode.window.showWarningMessage(`招财: 重新连接失败 - ${err instanceof Error ? err.message : err}`);
                }
                break;

            case 'getAgents':
                await this._handleGetAgents();
                break;

            case 'switchAgent':
                await this._handleSwitchAgent(data.agentId);
                break;

            case 'createAgent':
                await this._handleCreateAgent(data.config);
                break;

            case 'deleteAgent':
                await this._handleDeleteAgent(data.agentId);
                break;

            case 'updateAgent':
                await this._handleUpdateAgent(data.agentId, data.updates);
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

        // 加载项目记忆
        await this._loadProjectMemory();

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

        // 连接成功后获取 Agent 列表（确保 dropdown 显示正确的当前 Agent）
        await this._handleGetAgents();

        // 发送当前 Agent 信息（确保前端显示正确的 Agent）
        this._webview?.postMessage({
            type: 'agentSwitched',
            agentId: this._currentAgentId,
            sessionKey: this._sessionKey
        });

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

    /**
     * 重置发送状态（reconnect / disconnect 时调用，解除 UI 卡死）
     */
    private _resetSendingState(): void {
        this._isSending = false;
        this._chatRunId = null;
        this._removeChatEventListener();
        this._webview?.postMessage({ type: 'sendingComplete' });
    }

    private async _sendMessage(content: string) {
        if (this._isSending) return;

        this._isSending = true;

        try {
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
                    const customPrompt = vscode.workspace.getConfiguration('openclaw').get<string>('planModePrompt', '').trim();
                    const marker = isZh ? '---- 计划模式 ----' : '---- Plan Mode ----';
                    const body = customPrompt || (isZh
                        ? '⚠️ 请勿执行，仅输出计划\n\n要求：\n1. 仅输出计划，不要调用任何工具\n2. 列出每个步骤及其影响\n3. 等用户说"执行"后再调用工具\n\n违反 = 任务失败'
                        : '⚠️ Do Not Execute - Plan Only\n\nYou must:\n1. Output plan only, do not call any tools\n2. List each step and its impact\n3. Wait for user to say "execute" before calling tools\n\nViolation = Task failed');
                    messageToSend += `\n\n${marker}\n${body}\n${marker}`;
                }
            }

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
            if (!eventSessionKey.includes(this._sessionKey.replace('agent:main:', ''))) return;

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

    /**
     * 加载项目记忆
     */
    private async _loadProjectMemory() {
        try {
            const projectMemoryManager = ProjectMemoryManager.getInstance();

            // 检查项目记忆是否已初始化
            if (!projectMemoryManager.isInitialized()) {
                return;
            }

            // 加载项目记忆
            const memory = projectMemoryManager.loadProjectMemory();
            if (!memory) {
                return;
            }

            // 构建项目记忆消息
            const memoryParts: string[] = [];

            if (memory.context) {
                memoryParts.push('# 项目上下文\n' + memory.context);
            }

            if (memory.progress) {
                // 只取最近的进展（前 20 行）
                const progressLines = memory.progress.split('\n').slice(0, 20).join('\n');
                memoryParts.push('# 最近进展\n' + progressLines);
            }

            if (memory.memory) {
                memoryParts.push('# 项目记忆\n' + memory.memory);
            }

            if (memoryParts.length === 0) {
                return;
            }

            const projectName = projectMemoryManager.getProjectName();
            const memoryContent = memoryParts.join('\n\n---\n\n');

            // 发送给 Webview（显示提示）
            this._webview?.postMessage({
                type: 'projectMemoryLoaded',
                projectName: projectName,
                hasMemory: true
            });

            // 不发送消息给 Agent，避免干扰对话流程
            // 项目记忆已经在 Agent 启动时通过文件系统加载了
            console.log('[ProjectMemory] 项目记忆已加载:', projectName);

        } catch (err) {
            console.warn('[ProjectMemory] 加载项目记忆失败:', err);
        }
    }

    /**
     * 发送项目记忆给 Agent（切换 agent 后调用）
     */
    private async _sendProjectMemoryToAgent(sessionKey: string) {
        const projectMemoryManager = ProjectMemoryManager.getInstance();
        if (!projectMemoryManager.isInitialized()) {
            return;
        }

        const memory = projectMemoryManager.loadProjectMemory();
        if (!memory) {
            return;
        }

        const parts: string[] = [];

        if (memory.context) {
            parts.push('# 项目上下文\n' + memory.context);
        }

        if (memory.progress) {
            const progressLines = memory.progress.split('\n').slice(0, 20).join('\n');
            parts.push('# 最近进展\n' + progressLines);
        }

        if (memory.memory) {
            parts.push('# 项目记忆\n' + memory.memory);
        }

        if (parts.length === 0) {
            return;
        }

        const projectName = projectMemoryManager.getProjectName();
        const memoryContent = parts.join('\n\n---\n\n');
        const message = `[系统设置 - 项目背景，无需回复]\n\n你正在为项目「${projectName}」服务，以下是项目的关键信息，请了解后直接等待用户指令：\n\n${memoryContent}`;

        try {
            this._gateway.sendMessageFireAndForget(sessionKey, message);
            console.log('[ChatController] 项目记忆已发送给 agent:', projectName);
        } catch (err) {
            console.warn('[ChatController] 发送项目记忆失败:', err);
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

    // ========== Agent 管理 ==========

    /**
     * 获取所有可用的 Agent
     */
    private async _handleGetAgents() {
        try {
            const agents = await this._agentManager.getAvailableAgents();
            this._webview?.postMessage({
                type: 'agentsList',
                agents: agents,
                currentAgentId: this._currentAgentId
            });
        } catch (err) {
            console.error('[ChatController] Failed to get agents:', err);
            vscode.window.showErrorMessage(`Failed to get agents: ${err instanceof Error ? err.message : err}`);
        }
    }

    /**
     * 切换 Agent
     * @param isManualSwitch 是否是用户手动切换（true=手动切换，发送项目背景；false=初始化恢复，不发送）
     */
    private async _handleSwitchAgent(agentId: string, isManualSwitch: boolean = true) {
        try {
            // 1. 检查 Agent 是否存在
            const exists = await this._agentManager.agentExists(agentId);
            if (!exists) {
                vscode.window.showErrorMessage(`Agent "${agentId}" does not exist`);
                return;
            }

            // 2. 更新当前 Agent
            this._currentAgentId = agentId;

            // 3. 生成新的 sessionKey（格式：agent:<agentId>:<windowId>）
            const newSessionKey = `agent:${agentId}:${this._windowId}`;
            this._sessionKey = newSessionKey;

            // 4. 重置会话管理器
            this._sessionManager.resetSession(newSessionKey);

            // 5. 加载新 Agent 的历史记录
            await this._loadHistory();

            // 6. 加载项目记忆（仅手动切换时，初始化恢复由 _handleReady 负责）
            if (isManualSwitch) {
                await this._loadProjectMemory();
            }

            // 7. 通知 webview Agent 已切换
            this._webview?.postMessage({
                type: 'agentSwitched',
                agentId: agentId,
                sessionKey: newSessionKey
            });

            // 8. 保存到 Workspace 关联
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                await this._agentManager.saveAgentForWorkspace(workspaceFolder.uri.fsPath, agentId);

                // 9. 创建项目软连接
                try {
                    await this._agentManager.linkProjectToAgent(agentId, workspaceFolder.uri.fsPath);
                } catch (err) {
                    console.warn('[ChatController] Failed to create project link:', err);
                    // 不阻塞切换流程，只是警告
                }
            }

            // 10. 重新发送上下文设置
            if (this._gateway.isConnected()) {
                try {
                    await this._sessionManager.sendContextSetup(this._gateway, newSessionKey);
                } catch (err) {
                    console.warn('[ChatController] Failed to send context setup:', err);
                }

                // 11. 发送项目记忆给新 agent，让它了解项目（仅用户手动切换时发送）
                if (isManualSwitch) {
                    try {
                        await this._sendProjectMemoryToAgent(newSessionKey);
                    } catch (err) {
                        console.warn('[ChatController] Failed to send project memory to agent:', err);
                    }
                }
            }

            vscode.window.showInformationMessage(`Switched to agent: ${agentId}`);

        } catch (err) {
            console.error('[ChatController] Failed to switch agent:', err);
            vscode.window.showErrorMessage(`Failed to switch agent: ${err instanceof Error ? err.message : err}`);
        }
    }

    /**
     * 创建新 Agent（打开多步骤对话框）
     */
    private async _handleCreateAgent(config: any) {
        try {
            // 如果没有传入 config，打开 CreateAgentPanel
            if (!config) {
                // 执行 openclaw.createAgent 命令，打开独立的创建 Agent 面板
                vscode.commands.executeCommand('openclaw.createAgent');
                return;
            }

            // 1. 验证 Agent ID
            if (!config.id || !/^[a-z0-9-]+$/.test(config.id)) {
                vscode.window.showErrorMessage('Invalid agent ID. Use lowercase letters, numbers, and hyphens only.');
                return;
            }

            // 2. 检查 Agent 是否已存在
            const exists = await this._agentManager.agentExists(config.id);
            if (exists) {
                vscode.window.showErrorMessage(`Agent "${config.id}" already exists`);
                return;
            }

            // 3. 创建 Agent
            await this._agentManager.createAgent(config);

            // 4. 刷新 Agent 列表
            await this._handleGetAgents();

            // 5. 询问是否切换到新 Agent
            const choice = await vscode.window.showInformationMessage(
                `Agent "${config.name}" created successfully!`,
                'Switch to this agent',
                'Later'
            );

            if (choice === 'Switch to this agent') {
                await this._handleSwitchAgent(config.id);
            }

        } catch (err) {
            console.error('[ChatController] Failed to create agent:', err);
            vscode.window.showErrorMessage(`Failed to create agent: ${err instanceof Error ? err.message : err}`);
        }
    }

    /**
     * 显示创建 Agent 对话框（多步骤）
     */
    private async _showCreateAgentDialog(): Promise<any | null> {
        // 步骤 1: Agent ID
        const id = await vscode.window.showInputBox({
            prompt: 'Agent ID (lowercase letters, numbers, and hyphens only)',
            placeHolder: 'frontend-expert',
            validateInput: (value) => {
                if (!value) {
                    return 'Agent ID is required';
                }
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Only lowercase letters, numbers, and hyphens are allowed';
                }
                return null;
            }
        });

        if (!id) return null;

        // 步骤 2: 显示名称
        const name = await vscode.window.showInputBox({
            prompt: 'Display Name',
            placeHolder: 'Frontend Expert',
            value: id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        });

        if (!name) return null;

        // 步骤 3: Emoji
        const emoji = await vscode.window.showInputBox({
            prompt: 'Emoji Icon (optional, default: 🤖)',
            placeHolder: '⚛️',
            value: '🤖'
        });

        if (emoji === undefined) return null;

        // 步骤 4: 角色选择
        const roles = [
            { label: '🌐 Full Stack Developer', description: 'Frontend + Backend, code quality and architecture', value: 'fullstack' },
            { label: '⚛️ Frontend Expert', description: 'React/Vue/Angular, performance optimization, UX', value: 'frontend' },
            { label: '🔧 Backend Expert', description: 'API design, database optimization, microservices', value: 'backend' },
            { label: '🚀 DevOps Engineer', description: 'CI/CD, containerization, cloud native', value: 'devops' },
            { label: '🧪 Test Engineer', description: 'Unit testing, integration testing, automation', value: 'tester' },
            { label: '🏗️ Architect', description: 'System design, technology selection, scalability', value: 'architect' },
            { label: '✏️ Custom...', description: 'Define your own role', value: 'custom' }
        ];

        const roleChoice = await vscode.window.showQuickPick(roles, {
            placeHolder: 'Select a preset role'
        });

        if (!roleChoice) return null;

        let role = roleChoice.value;
        let description = '';

        // 步骤 5: 自定义描述（如果选择了 custom 或想要添加描述）
        if (roleChoice.value === 'custom') {
            const customRole = await vscode.window.showInputBox({
                prompt: 'Custom Role Name',
                placeHolder: 'My Custom Role'
            });
            if (!customRole) return null;
            role = 'fullstack'; // 使用默认模板
            description = `Role: ${customRole}\n\n`;
        }

        const addDesc = await vscode.window.showQuickPick(
            [
                { label: 'Use preset template', value: false },
                { label: 'Add custom description', value: true }
            ],
            { placeHolder: 'Do you want to add a custom description?' }
        );

        if (!addDesc) return null;

        if (addDesc.value) {
            const customDesc = await vscode.window.showInputBox({
                prompt: 'Custom Description (optional)',
                placeHolder: 'I am a specialist in...',
                value: description
            });
            if (customDesc !== undefined) {
                description = customDesc;
            }
        }

        return {
            id,
            name,
            emoji: emoji || '🤖',
            role,
            description
        };
    }

    /**
     * 删除 Agent
     */
    private async _handleDeleteAgent(agentId: string) {
        try {
            // 1. 确认删除
            const choice = await vscode.window.showWarningMessage(
                `Are you sure you want to delete agent "${agentId}"?`,
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (choice !== 'Delete') {
                return;
            }

            // 2. 检查是否是当前 Agent
            if (agentId === this._currentAgentId) {
                vscode.window.showErrorMessage('Cannot delete the currently active agent. Please switch to another agent first.');
                return;
            }

            // 3. 检查是否是 main agent
            if (agentId === 'main') {
                vscode.window.showErrorMessage('Cannot delete the main agent.');
                return;
            }

            // 4. 询问是否删除文件
            const deleteFiles = await vscode.window.showQuickPick(
                [
                    { label: 'Delete agent and all files', value: true },
                    { label: 'Delete agent only (keep files)', value: false }
                ],
                { placeHolder: 'Do you want to delete the agent files?' }
            );

            if (!deleteFiles) {
                return;
            }

            // 5. 删除 Agent
            if (this._gateway && this._gateway.isConnected()) {
                await this._gateway.sendRpc('agents.delete', {
                    agentId: agentId,
                    deleteFiles: deleteFiles.value
                });
            } else {
                // 使用 CLI 删除（如果有的话）
                vscode.window.showErrorMessage('Gateway not connected. Cannot delete agent.');
                return;
            }

            // 6. 刷新 Agent 列表
            await this._handleGetAgents();

            vscode.window.showInformationMessage(`Agent "${agentId}" deleted successfully.`);

        } catch (err) {
            console.error('[ChatController] Failed to delete agent:', err);
            vscode.window.showErrorMessage(`Failed to delete agent: ${err instanceof Error ? err.message : err}`);
        }
    }

    /**
     * 更新 Agent
     */
    private async _handleUpdateAgent(agentId: string, updates: any) {
        try {
            // 如果没有传入 updates，打开对话框收集信息
            if (!updates) {
                updates = await this._showUpdateAgentDialog(agentId);
                if (!updates) {
                    return;
                }
            }

            // 更新 Agent
            if (this._gateway && this._gateway.isConnected()) {
                await this._gateway.sendRpc('agents.update', {
                    agentId: agentId,
                    ...updates
                });
            } else {
                vscode.window.showErrorMessage('Gateway not connected. Cannot update agent.');
                return;
            }

            // 刷新 Agent 列表
            await this._handleGetAgents();

            vscode.window.showInformationMessage(`Agent "${agentId}" updated successfully.`);

        } catch (err) {
            console.error('[ChatController] Failed to update agent:', err);
            vscode.window.showErrorMessage(`Failed to update agent: ${err instanceof Error ? err.message : err}`);
        }
    }

    /**
     * 显示更新 Agent 对话框
     */
    private async _showUpdateAgentDialog(agentId: string): Promise<any | null> {
        // 获取当前 Agent 信息
        const agents = await this._agentManager.getAvailableAgents();
        const agent = agents.find(a => a.id === agentId);
        if (!agent) {
            vscode.window.showErrorMessage(`Agent "${agentId}" not found.`);
            return null;
        }

        // 选择要更新的字段
        const field = await vscode.window.showQuickPick(
            [
                { label: 'Name', description: `Current: ${agent.name}`, value: 'name' },
                { label: 'Emoji', description: `Current: ${agent.emoji}`, value: 'emoji' },
                { label: 'Model', description: `Current: ${agent.model || 'default'}`, value: 'model' }
            ],
            { placeHolder: 'What do you want to update?' }
        );

        if (!field) return null;

        const updates: any = {};

        if (field.value === 'name') {
            const newName = await vscode.window.showInputBox({
                prompt: 'New Name',
                value: agent.name
            });
            if (!newName) return null;
            updates.name = newName;
        } else if (field.value === 'emoji') {
            const newEmoji = await vscode.window.showInputBox({
                prompt: 'New Emoji',
                value: agent.emoji
            });
            if (!newEmoji) return null;
            updates.emoji = newEmoji;
        } else if (field.value === 'model') {
            const newModel = await vscode.window.showInputBox({
                prompt: 'New Model (leave empty for default)',
                value: agent.model || ''
            });
            if (newModel === undefined) return null;
            updates.model = newModel || null;
        }

        return updates;
    }

    /**
     * 初始化 Agent（从 Workspace 关联恢复）
     */
    public async initializeAgent() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        // 1. 尝试从 Workspace 关联读取
        const savedAgent = await this._agentManager.getAgentForWorkspace(workspaceFolder.uri.fsPath);

        if (savedAgent) {
            // 2. 检查 Agent 是否存在
            const exists = await this._agentManager.agentExists(savedAgent);
            if (exists) {
                // 3. 切换到保存的 Agent（初始化恢复，不发送项目背景）
                await this._handleSwitchAgent(savedAgent, false);
                return;
            } else {
                console.warn(`[ChatController] Saved agent "${savedAgent}" does not exist, falling back to default`);
            }
        }

        // 4. 如果没有保存的 Agent 或 Agent 不存在，使用默认 Agent
        const config = vscode.workspace.getConfiguration('openclaw');
        const defaultAgent = config.get<string>('defaultAgent', 'main');

        if (defaultAgent !== 'main') {
            const exists = await this._agentManager.agentExists(defaultAgent);
            if (exists) {
                await this._handleSwitchAgent(defaultAgent, false);
                return;
            } else {
                console.warn(`[ChatController] Default agent "${defaultAgent}" does not exist, using main`);
            }
        }

        // 5. 最终回退到 main agent
        // main agent 总是存在的，不需要检查
        console.log('[ChatController] Using main agent');
    }
}
