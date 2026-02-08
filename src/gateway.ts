import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as yaml from 'js-yaml';
import * as vscode from 'vscode';
import { GatewayWSClient } from './gatewayWSClient';

export interface ModelInfo {
    id: string;
    name: string;
    provider: string;
    selected: boolean;
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
}

type ConnectionCallback = (connected: boolean) => void;
type MessageCallback = (message: Message) => void;
type StreamCallback = (chunk: string, done: boolean) => void;

export class GatewayClient {
    private _baseUrl: string;
    private _openclawPath: string;
    private _connected: boolean = false;
    private _connectionCallbacks: ConnectionCallback[] = [];
    private _messageCallbacks: MessageCallback[] = [];
    private _currentProcess: ChildProcess | null = null;
    private _wsClient: GatewayWSClient | null = null;
    private _mode: 'cli' | 'ws' = 'ws'; // 默认使用 WebSocket
    private _activeSessionKey: string | null = null;
    private _activeRunId: string | null = null;
    private _gatewayToken?: string;

    constructor(baseUrl: string, customPath?: string) {
        this._baseUrl = baseUrl;
        // 尝试常见的 openclaw 路径
        this._openclawPath = this._findOpenclawPath(customPath);
        // 读取 Gateway auth token
        this._gatewayToken = this._readGatewayToken();
    }

    /**
     * 从 OpenClaw 配置文件读取 Gateway auth token
     */
    private _readGatewayToken(): string | undefined {
        try {
            const jsonConfigPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
            if (fs.existsSync(jsonConfigPath)) {
                const content = fs.readFileSync(jsonConfigPath, 'utf-8');
                const config = JSON.parse(content);
                const token = config?.gateway?.auth?.token;
                if (token && typeof token === 'string') {
                    return token;
                }
            }
        } catch (err) {
            console.warn('[Gateway] Failed to read gateway token:', err);
        }
        return undefined;
    }

    /**
     * 是否允许 CLI 兜底（读取配置）
     */
    private _isCliFallbackEnabled(): boolean {
        return vscode.workspace.getConfiguration('openclaw').get('enableCliFallback', false);
    }

    private _findOpenclawPath(customPath?: string): string {
        // 优先使用用户自定义路径
        if (customPath && fs.existsSync(customPath)) {
            return customPath;
        }

        const isWindows = process.platform === 'win32';
        const isMac = process.platform === 'darwin';

        let possiblePaths: string[];

        if (isWindows) {
            const appData = process.env.APPDATA || '';
            const localAppData = process.env.LOCALAPPDATA || '';
            const userProfile = process.env.USERPROFILE || '';
            const programFiles = process.env.PROGRAMFILES || '';
            const programFilesX86 = process.env['PROGRAMFILES(X86)'] || '';
            
            // 获取 npm prefix（实际安装路径）
            const npmPrefix = this._getNpmPrefix();
            
            possiblePaths = [
                // npm global install (使用实际 npm prefix)
                npmPrefix ? path.join(npmPrefix, 'openclaw.cmd') : '',
                npmPrefix ? path.join(npmPrefix, 'openclaw') : '',
                path.join(appData, 'npm', 'openclaw.cmd'),
                path.join(userProfile, 'AppData', 'Roaming', 'npm', 'openclaw.cmd'),
                
                // scoop
                path.join(localAppData, 'Programs', 'openclaw', 'openclaw.exe'),
                path.join(userProfile, 'scoop', 'shims', 'openclaw.cmd'),
                path.join(userProfile, 'scoop', 'shims', 'openclaw.exe'),
                
                // chocolatey
                path.join('C:\\ProgramData', 'chocolatey', 'bin', 'openclaw.exe'),
                path.join('C:\\ProgramData', 'chocolatey', 'bin', 'openclaw.cmd'),
                
                // winget / msi 安装
                path.join(programFiles, 'OpenClaw', 'openclaw.exe'),
                path.join(programFilesX86, 'OpenClaw', 'openclaw.exe'),
                path.join(localAppData, 'Programs', 'OpenClaw', 'openclaw.exe'),
            ].filter(Boolean);
        } else if (isMac) {
            possiblePaths = [
                '/opt/homebrew/bin/openclaw',
                '/usr/local/bin/openclaw',
                '/usr/bin/openclaw',
            ];
        } else {
            // Linux
            possiblePaths = [
                '/usr/local/bin/openclaw',
                '/usr/bin/openclaw',
                path.join(os.homedir(), '.local', 'bin', 'openclaw'),
            ];
        }

        // 逐个验证，返回第一个存在的路径
        for (const p of possiblePaths) {
            if (p && fs.existsSync(p)) {
                return p;
            }
        }

        // 兜底：依赖系统 PATH
        return 'openclaw';
    }

    /**
     * 获取 npm 全局安装前缀路径（Windows 专用）
     */
    private _getNpmPrefix(): string | null {
        try {
            const { execSync } = require('child_process');
            const result = execSync('npm config get prefix', {
                encoding: 'utf-8',
                timeout: 3000,
                windowsHide: true
            });
            return result.trim();
        } catch {
            return null;
        }
    }

    /**
     * 获取跨平台 spawn 环境变量
     */
    private _getSpawnEnv(): NodeJS.ProcessEnv {
        const isWindows = process.platform === 'win32';

        if (isWindows) {
            // Windows: 不修改 PATH，直接使用系统 PATH
            return { ...process.env };
        }

        // macOS / Linux: 添加常见安装路径
        const extraPaths = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
        return {
            ...process.env,
            PATH: extraPaths + ':' + (process.env.PATH || '')
        };
    }

    /**
     * 获取正确的 spawn 命令（Windows .cmd 文件需要特殊处理）
     */
    private _getSpawnCommand(args: string[]): { cmd: string; args: string[] } {
        const isWindows = process.platform === 'win32';
        const isCmdFile = this._openclawPath.endsWith('.cmd');

        if (isWindows && isCmdFile) {
            // Windows .cmd 文件需要通过 cmd.exe /c 执行
            return {
                cmd: 'cmd.exe',
                args: ['/c', this._openclawPath, ...args]
            };
        }

        return {
            cmd: this._openclawPath,
            args: args
        };
    }

    public async connect(): Promise<void> {
        // 先尝试 WebSocket 模式
        if (this._mode === 'ws') {
            try {
                if (!this._wsClient) {
                    this._wsClient = new GatewayWSClient(this._baseUrl, this._gatewayToken);
                }
                await this._wsClient.connect();
                this._connected = true;
                this._notifyConnectionChange(true);
                return;
            } catch (err) {
                if (!this._isCliFallbackEnabled()) {
                    this._connected = false;
                    this._notifyConnectionChange(false);
                    throw new Error(`WebSocket 连接失败: ${err instanceof Error ? err.message : err}`);
                }
                console.warn('[Gateway] WebSocket connection failed, trying CLI mode:', err);
                // WebSocket 失败，切换到 CLI 模式
                this._mode = 'cli';
                this._wsClient = null;
            }
        }
        
        // CLI 模式：检查可用性
        try {
            await this._checkOpenclawAvailable();
            this._connected = true;
            this._notifyConnectionChange(true);
        } catch (err) {
            this._connected = false;
            this._notifyConnectionChange(false);
            throw err;
        }
    }

    public disconnect(): void {
        this.stopGeneration();
        this._connected = false;
        this._notifyConnectionChange(false);
    }

    public onConnectionChange(callback: ConnectionCallback): void {
        this._connectionCallbacks.push(callback);
    }

    public onMessage(callback: MessageCallback): void {
        this._messageCallbacks.push(callback);
    }

    /**
     * 检查是否已连接
     */
    public isConnected(): boolean {
        if (this._mode === 'ws') {
            return this._wsClient?.isConnected() || false;
        }
        return this._connected;
    }

    /**
     * 发送消息但不等回复（fire-and-forget），用于 context setup 等不需要响应的消息
     */
    public sendMessageFireAndForget(sessionKey: string, message: string): void {
        if (this._mode === 'ws' && this._wsClient) {
            const idempotencyKey = `vsc-setup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            this._wsClient.sendRpc('chat.send', {
                sessionKey,
                message,
                deliver: false,
                idempotencyKey,
            }).catch(err => {
                console.warn('[Gateway] fire-and-forget send failed:', err);
            });
        }
    }

    /**
     * 发送聊天消息（fire-and-forget），返回 idempotencyKey 作为 runId 追踪
     * 对齐 webchat: 不等 AI 回复，通过 chat 事件监听 final
     */
    public async sendChat(sessionKey: string, message: string): Promise<string | null> {
        if (this._mode === 'ws') {
            try {
                if (!this._wsClient) {
                    this._wsClient = new GatewayWSClient(this._baseUrl, this._gatewayToken);
                    await this._wsClient.connect();
                }
                const idempotencyKey = `vsc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                this._activeSessionKey = sessionKey;
                await this._wsClient.sendRpc('chat.send', {
                    sessionKey,
                    message,
                    deliver: false,
                    idempotencyKey,
                });
                return idempotencyKey;
            } catch (err) {
                this._activeSessionKey = null;
                throw err;
            }
        }
        return null;
    }

    /**
     * 监听 chat 事件
     */
    public onChatEvent(handler: (payload: any) => void): void {
        if (this._wsClient) {
            this._wsClient.on('chat', handler);
        }
    }

    /**
     * 移除 chat 事件监听
     */
    public offChatEvent(handler: (payload: any) => void): void {
        if (this._wsClient) {
            this._wsClient.off('chat', handler);
        }
    }

    /**
     * 发送消息并获取回复
     */
    public async sendMessage(
        sessionKey: string,
        message: string,
        onStream?: StreamCallback
    ): Promise<Message> {
        // 优先使用 WebSocket
        if (this._mode === 'ws') {
            try {
                if (!this._wsClient) {
                    this._wsClient = new GatewayWSClient(this._baseUrl, this._gatewayToken);
                    await this._wsClient.connect();
                }

                // 追踪当前运行的 session（用于 abort）
                this._activeSessionKey = sessionKey;

                const result = await this._wsClient.sendMessage(sessionKey, message, {
                    stream: !!onStream,
                    onStream: onStream ? (text) => onStream(text, false) : undefined
                });

                // 流式完成通知
                if (onStream) {
                    onStream('', true);
                }

                // 运行结束，清除追踪
                this._activeSessionKey = null;
                this._activeRunId = null;

                // 确保 timestamp 存在
                const responseMessage: Message = {
                    role: result.role,
                    content: result.content,
                    timestamp: result.timestamp || new Date().toISOString()
                };

                return responseMessage;
            } catch (err) {
                this._activeSessionKey = null;
                this._activeRunId = null;
                if (!this._isCliFallbackEnabled()) {
                    throw new Error(`WebSocket 发送失败: ${err instanceof Error ? err.message : err}`);
                }
                console.warn('[Gateway] WebSocket failed, falling back to CLI:', err);
                this._mode = 'cli'; // 回退到 CLI
            }
        }

        // CLI 模式（回退方案）
        return new Promise((resolve, reject) => {
            const args = [
                'agent',
                '--message', message,
                '--session-id', sessionKey,
                '--json',
                '--timeout', '300'
            ];

            const spawnCmd = this._getSpawnCommand(args);
            const proc = spawn(spawnCmd.cmd, spawnCmd.args, {
                env: this._getSpawnEnv()
            });

            this._currentProcess = proc;

            let stdout = '';
            let stderr = '';

            proc.stdout?.on('data', (data: Buffer) => {
                const chunk = data.toString();
                stdout += chunk;

                // 流式输出
                if (onStream) {
                    onStream(chunk, false);
                }
            });

            proc.stderr?.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            proc.on('close', (code) => {
                this._currentProcess = null;

                if (code !== 0 && code !== null) {
                    reject(new Error(`openclaw exited with code ${code}: ${stderr}`));
                    return;
                }

                // 解析 JSON 输出
                try {
                    const result = this._parseOutput(stdout);

                    // 从 openclaw agent --json 输出中提取文本
                    let content = '';
                    if (result.result?.payloads) {
                        // 标准格式: { result: { payloads: [{ text: "..." }] } }
                        content = result.result.payloads
                            .map((p: any) => p.text)
                            .filter(Boolean)
                            .join('\n');
                    } else if (result.reply?.payloads) {
                        // 备用格式: { reply: { payloads: [...] } }
                        content = result.reply.payloads
                            .map((p: any) => p.text)
                            .filter(Boolean)
                            .join('\n');
                    } else if (result.reply && typeof result.reply === 'string') {
                        content = result.reply;
                    } else if (result.text) {
                        content = result.text;
                    } else if (result.content) {
                        content = result.content;
                    }

                    const assistantMessage: Message = {
                        role: 'assistant',
                        content: content || '(无回复)',
                        timestamp: new Date().toISOString()
                    };

                    // 通知回调
                    this._messageCallbacks.forEach(cb => cb(assistantMessage));

                    if (onStream) {
                        onStream('', true);
                    }

                    resolve(assistantMessage);
                } catch (parseErr) {
                    // 如果解析失败，直接返回原始输出
                    const assistantMessage: Message = {
                        role: 'assistant',
                        content: stdout.trim() || stderr.trim() || '(无回复)',
                        timestamp: new Date().toISOString()
                    };
                    resolve(assistantMessage);
                }
            });

            proc.on('error', (err) => {
                this._currentProcess = null;
                reject(err);
            });
        });  // CLI Promise 结束
    }  // sendMessage 方法结束

    /**
     * 停止当前生成
     * WebSocket 模式：调用 chat.abort（与 webchat 一致）
     * CLI 模式：杀掉子进程
     */
    public stop(): void {
        // WebSocket 模式：通过 chat.abort 通知 Gateway
        if (this._mode === 'ws' && this._wsClient && this._activeSessionKey) {
            const sessionKey = this._activeSessionKey;
            const runId = this._activeRunId || undefined;
            this._activeSessionKey = null;
            this._activeRunId = null;
            
            this._wsClient.abortChat(sessionKey, runId).catch((err) => {
                console.warn('[Gateway] chat.abort failed:', err);
            });
            return;
        }

        // CLI 模式：杀掉子进程
        if (this._currentProcess) {
            this._currentProcess.kill('SIGTERM');
            this._currentProcess = null;
        }
    }

    /**
     * 停止当前生成（别名）
     */
    public stopGeneration(): void {
        this.stop();
    }

    /**
     * 获取会话历史
     */
    public async getHistory(sessionKey: string, limit?: number): Promise<Message[]> {
        // 优先使用 WebSocket
        if (this._mode === 'ws') {
            try {
                if (!this._wsClient) {
                    this._wsClient = new GatewayWSClient(this._baseUrl, this._gatewayToken);
                    await this._wsClient.connect();
                }
                
                // WebSocket 返回完整消息（包括 toolCall）
                const messages = await this._wsClient.getHistory(sessionKey, limit);
                // 确保 timestamp 存在
                return messages.map(m => ({
                    ...m,
                    timestamp: m.timestamp || new Date().toISOString()
                })) as Message[];
            } catch (err) {
                if (!this._isCliFallbackEnabled()) {
                    console.error('[Gateway] WebSocket getHistory failed:', err);
                    return [];
                }
                console.warn('[Gateway] WebSocket getHistory failed, falling back to CLI:', err);
                // 回退到 CLI
            }
        }
        
        // CLI 模式（回退方案）
        return this.getMessages(sessionKey);
    }

    /**
     * 获取会话列表
     */
    public async getSessions(): Promise<any[]> {
        // 优先使用 WebSocket
        if (this._mode === 'ws') {
            try {
                if (!this._wsClient) {
                    this._wsClient = new GatewayWSClient(this._baseUrl, this._gatewayToken);
                    await this._wsClient.connect();
                }
                
                return await this._wsClient.getSessions();
            } catch (err) {
                if (!this._isCliFallbackEnabled()) {
                    console.error('[Gateway] WebSocket getSessions failed:', err);
                    return [];
                }
                console.warn('[Gateway] WebSocket getSessions failed, falling back to CLI:', err);
                // 回退到 CLI
            }
        }
        
        // CLI 模式（回退方案）
        return new Promise((resolve, reject) => {
            const spawnCmd = this._getSpawnCommand(['sessions', 'list', '--json']);
            const proc = spawn(spawnCmd.cmd, spawnCmd.args, {
                env: this._getSpawnEnv()
            });

            let stdout = '';

            proc.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            proc.on('close', (code) => {
                try {
                    const result = JSON.parse(stdout);
                    resolve(result.sessions || []);
                } catch {
                    resolve([]);
                }
            });

            proc.on('error', () => {
                resolve([]);
            });
        });
    }

    /**
     * 获取会话消息历史
     */
    public async getMessages(sessionKey: string): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            const spawnCmd = this._getSpawnCommand([
                'sessions', 'history',
                '--session', sessionKey,
                '--json'
            ]);
            const proc = spawn(spawnCmd.cmd, spawnCmd.args, {
                env: this._getSpawnEnv()
            });

            let stdout = '';

            proc.stdout?.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            proc.on('close', (code) => {
                try {
                    const result = JSON.parse(stdout);
                    // 保留完整的消息对象
                    const messages = (result.messages || []).map((m: any) => ({
                        role: m.role || 'user',
                        content: m.content || '',
                        timestamp: m.timestamp || new Date().toISOString(),
                        // 保留工具调用信息
                        ...(m.toolCall && { toolCall: m.toolCall }),
                        // 保留工具名称
                        ...(m.name && { name: m.name }),
                        // 保留思考过程
                        ...(m.thinking && { thinking: m.thinking })
                    }));
                    resolve(messages);
                } catch {
                    resolve([]);
                }
            });

            proc.on('error', () => {
                resolve([]);
            });
        });
    }

    private async _checkOpenclawAvailable(): Promise<void> {
        return new Promise((resolve, reject) => {
            const spawnCmd = this._getSpawnCommand(['--version']);
            const proc = spawn(spawnCmd.cmd, spawnCmd.args, {
                env: this._getSpawnEnv()
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error('openclaw not found or not working'));
                }
            });

            proc.on('error', (err) => {
                reject(new Error(`Cannot find openclaw: ${err.message}`));
            });
        });
    }

    private _parseOutput(output: string): any {
        // 找到 JSON 开始位置（第一个 { 开头的行）
        const lines = output.split('\n');
        let jsonStartIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('{')) {
                jsonStartIndex = i;
                break;
            }
        }

        if (jsonStartIndex >= 0) {
            // 从 JSON 开始位置到末尾
            const jsonStr = lines.slice(jsonStartIndex).join('\n');
            try {
                return JSON.parse(jsonStr);
            } catch {
                // 如果解析失败，尝试找到完整的 JSON 对象
            }
        }

        // 尝试在整个输出中找 JSON
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch {
                // 继续尝试其他方法
            }
        }

        return { content: output };
    }

    private _notifyConnectionChange(connected: boolean): void {
        this._connectionCallbacks.forEach(cb => cb(connected));
    }

    /**
     * 设置会话 verbose level（控制工具事件推送）
     * 需要 "compact" 或 "full" 才能收到实时工具事件
     */
    public async setSessionVerbose(sessionKey: string, level: string): Promise<void> {
        if (this._mode === 'ws' && this._wsClient) {
            try {
                await this._wsClient.patchSession(sessionKey, { verboseLevel: level });
                console.log(`[Gateway] 会话 ${sessionKey} verbose 已设置为 ${level}`);
            } catch (err) {
                console.warn('[Gateway] 设置 verbose level 失败:', err);
            }
        }
    }

    /**
     * 获取可用模型列表（从配置文件读取）
     */
    public async getModels(): Promise<{ models: ModelInfo[], currentModel: string }> {
        // 读取本地配置文件中的模型（只显示用户配置的模型）
        const jsonConfigPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        const yamlConfigPath = path.join(os.homedir(), '.openclaw', 'config.yaml');

        try {
            let config: any = null;

            // 优先尝试 JSON 配置
            if (fs.existsSync(jsonConfigPath)) {
                const content = fs.readFileSync(jsonConfigPath, 'utf-8');
                config = JSON.parse(content);
            } else if (fs.existsSync(yamlConfigPath)) {
                const content = fs.readFileSync(yamlConfigPath, 'utf-8');
                config = yaml.load(content) as any;
            }

            if (!config) {
                throw new Error('No config file found');
            }

            const models: ModelInfo[] = [];
            let currentModel = 'default';

            // 读取当前模型
            if (config?.agents?.defaults?.model?.primary) {
                currentModel = config.agents.defaults.model.primary;
            }

            // 读取已配置的模型
            const configuredModels = config?.agents?.defaults?.models || {};
            for (const name of Object.keys(configuredModels)) {
                const provider = name.split('/')[0] || '';
                models.push({
                    id: name,
                    name: name,
                    provider: provider,
                    selected: name === currentModel
                });
            }

            // 如果当前模型不在列表中，添加它
            if (currentModel && currentModel !== 'default' && !models.find(m => m.id === currentModel)) {
                const provider = currentModel.split('/')[0] || '';
                models.unshift({
                    id: currentModel,
                    name: currentModel,
                    provider: provider,
                    selected: true
                });
            }

            return { models, currentModel };
        } catch (err) {
            // 无法读取配置，返回空列表
            return {
                models: [],
                currentModel: 'default'
            };
        }
    }

    /**
     * 设置会话模型
     */
    /**
     * 设置会话模型（会话级覆盖）
     */
    public async setSessionModel(sessionKey: string, model: string): Promise<void> {
        // 通过 chat.send 发送 /model 命令切换模型
        // 注意：sessions.patch 只写 session store 的 modelOverride，
        // 但 dispatchInboundMessage 内部的 agent context 不会读取该 override，
        // 必须通过 /model 命令走完整的模型切换流程
        if (this._mode === 'ws' && this._wsClient) {
            try {
                const modelCmd = (!model || model === 'default') ? '/model default' : `/model ${model}`;
                await this._wsClient.sendMessage(sessionKey, modelCmd);
                console.log(`OpenClaw: 会话 ${sessionKey} 模型已通过 /model 命令设置为 ${model || '默认'}`);
                return;
            } catch (err) {
                if (!this._isCliFallbackEnabled()) {
                    console.error('[Gateway] WebSocket /model command failed:', err);
                    throw new Error(`会话模型设置失败: ${err instanceof Error ? err.message : err}`);
                }
                console.warn('[Gateway] WebSocket /model command failed, falling back to CLI:', err);
            }
        }

        // CLI 回退方案（全局设置）
        if (!model || model === 'default') {
            return;
        }

        return new Promise((resolve, reject) => {
            const args = ['models', 'set', model];

            const spawnCmd = this._getSpawnCommand(args);
            const proc = spawn(spawnCmd.cmd, spawnCmd.args, {
                env: this._getSpawnEnv()
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    console.log(`OpenClaw: 全局模型已切换为 ${model}`);
                } else {
                    console.warn(`OpenClaw: 模型切换失败 (exit code ${code})`);
                }
                resolve();
            });

            proc.on('error', () => {
                resolve();
            });
        });
    }

    /**
     * 设置会话 thinking level
     * 通过 sessions.patch 设置 thinkingLevel
     */
    public async setSessionThinking(sessionKey: string, level: string): Promise<void> {
        if (this._mode === 'ws' && this._wsClient) {
            try {
                await this._wsClient.patchSession(sessionKey, { thinkingLevel: level });
                console.log(`OpenClaw: 会话 ${sessionKey} thinking 已设置为 ${level}`);
                return;
            } catch (err) {
                if (!this._isCliFallbackEnabled()) {
                    console.error('[Gateway] WebSocket sessions.patch failed:', err);
                    throw new Error(`思考深度设置失败: ${err instanceof Error ? err.message : err}`);
                }
                console.warn('[Gateway] WebSocket sessions.patch failed, falling back to CLI:', err);
            }
        }

        // CLI 兜底：通过 agent 命令发送 /think
        return new Promise((resolve) => {
            const args = ['agent', '-m', `/think ${level}`, '--session-id', sessionKey];
            const spawnCmd = this._getSpawnCommand(args);
            const proc = spawn(spawnCmd.cmd, spawnCmd.args, {
                env: this._getSpawnEnv()
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    console.log(`OpenClaw: thinking 已设置为 ${level}`);
                } else {
                    console.warn(`OpenClaw: thinking 设置失败 (exit code ${code})`);
                }
                resolve();
            });

            proc.on('error', () => {
                resolve();
            });
        });
    }

    /**
     * 获取会话的当前 thinking level
     * 通过 sessions.list 获取
     */
    public async getSessionThinkingLevel(sessionKey: string): Promise<string> {
        if (this._mode === 'ws' && this._wsClient) {
            try {
                const sessions = await this._wsClient.getSessions();
                // 匹配 session key（可能带 agent:main: 前缀）
                const session = sessions.find((s: any) => {
                    const key = s.key || '';
                    return key === sessionKey || key.endsWith(':' + sessionKey);
                });
                if (session && typeof session.thinkingLevel === 'string') {
                    return session.thinkingLevel;
                }
            } catch (err) {
                console.warn('[Gateway] Failed to get session thinking level:', err);
            }
        }
        // 默认返回 low
        return 'low';
    }

    /**
     * 删除会话
     */
    public async deleteSession(sessionKey: string): Promise<void> {
        // 优先使用 WebSocket
        if (this._mode === 'ws') {
            try {
                if (!this._wsClient) {
                    this._wsClient = new GatewayWSClient(this._baseUrl, this._gatewayToken);
                    await this._wsClient.connect();
                }
                
                await this._wsClient.deleteSession(sessionKey);
                return;
            } catch (err) {
                if (!this._isCliFallbackEnabled()) {
                    console.error('[Gateway] WebSocket deleteSession failed:', err);
                    return;
                }
                console.warn('[Gateway] WebSocket deleteSession failed, falling back to HTTP:', err);
                // 回退到 HTTP
            }
        }
        
        // HTTP 模式（回退方案）
        return this._deleteSessionHTTP(sessionKey);
    }

    private async _deleteSessionHTTP(sessionKey: string): Promise<void> {
        const http = require('http');
        const url = require('url');

        // 从 _baseUrl 解析主机名和端口
        const parsed = new URL(this._baseUrl);
        const hostname = parsed.hostname || 'localhost';
        const port = parseInt(parsed.port) || 18789;

        return new Promise((resolve) => {
            const postData = JSON.stringify({
                type: 'req',
                id: `delete-${Date.now()}`,
                method: 'sessions.delete',
                params: {
                    key: sessionKey,
                    deleteTranscript: true
                }
            });

            const options = {
                hostname,
                port,
                path: '/api/rpc',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };

            const req = http.request(options, (res: any) => {
                res.on('data', () => { });
                res.on('end', () => resolve());
            });

            req.on('error', () => resolve());
            req.setTimeout(5000, () => {
                req.destroy();
                resolve();
            });

            req.write(postData);
            req.end();
        });
    }

    /**
     * 获取 AI 身份信息（名称、头像）
     */
    public async getAgentIdentity(): Promise<{ name: string; avatar: string } | null> {
        if (this._mode === 'ws' && this._wsClient) {
            try {
                const result = await this._wsClient.sendRpc('agent.identity.get', {});
                return {
                    name: result?.name || '',
                    avatar: result?.avatar || ''
                };
            } catch (err) {
                console.warn('[Gateway] 获取 AI 身份失败:', err);
                return null;
            }
        }
        return null;
    }
}
