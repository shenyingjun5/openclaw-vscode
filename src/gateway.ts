import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as yaml from 'js-yaml';

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
    private _openclawPath: string;
    private _connected: boolean = false;
    private _connectionCallbacks: ConnectionCallback[] = [];
    private _messageCallbacks: MessageCallback[] = [];
    private _currentProcess: ChildProcess | null = null;

    constructor(baseUrl: string, customPath?: string) {
        // baseUrl 暂时不用，直接调用 CLI
        // 尝试常见的 openclaw 路径
        this._openclawPath = this._findOpenclawPath(customPath);
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
        try {
            // 检查 openclaw 是否可用
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

    public isConnected(): boolean {
        return this._connected;
    }

    /**
     * 发送消息并获取回复
     */
    public async sendMessage(
        sessionId: string,
        message: string,
        onStream?: StreamCallback
    ): Promise<Message> {
        return new Promise((resolve, reject) => {
            const args = [
                'agent',
                '--message', message,
                '--session-id', sessionId,
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
        });
    }

    /**
     * 停止当前生成
     */
    public stop(): void {
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
    public async getHistory(sessionId: string): Promise<Message[]> {
        return this.getMessages(sessionId);
    }

    /**
     * 获取会话列表
     */
    public async getSessions(): Promise<any[]> {
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
    public async getMessages(sessionId: string): Promise<Message[]> {
        return new Promise((resolve, reject) => {
            const spawnCmd = this._getSpawnCommand([
                'sessions', 'history',
                '--session', sessionId,
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
                    const messages = (result.messages || []).map((m: any) => ({
                        role: m.role || 'user',
                        content: m.content || '',
                        timestamp: m.timestamp || new Date().toISOString()
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
     * 获取可用模型列表（从配置文件读取）
     */
    public async getModels(): Promise<{ models: ModelInfo[], currentModel: string }> {
        // 优先读取 JSON 配置，兼容旧版 YAML
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
            if (currentModel && !models.find(m => m.id === currentModel)) {
                const provider = currentModel.split('/')[0] || '';
                models.unshift({
                    id: currentModel,
                    name: currentModel,
                    provider: provider,
                    selected: true
                });
            }

            // 添加默认选项
            if (!models.find(m => m.id === 'default')) {
                models.unshift({
                    id: 'default',
                    name: '默认模型',
                    provider: '',
                    selected: currentModel === 'default' || !currentModel
                });
            }

            return { models, currentModel };
        } catch (err) {
            // 返回默认模型
            return {
                models: [{ id: 'default', name: '默认模型', provider: '', selected: true }],
                currentModel: 'default'
            };
        }
    }

    /**
     * 设置会话模型
     */
    public async setSessionModel(sessionId: string, model: string): Promise<void> {
        // default 模型不需要显式设置
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
                    console.log(`OpenClaw: 模型已切换为 ${model}`);
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
     * 删除会话
     */
    public async deleteSession(sessionKey: string): Promise<void> {
        const http = require('http');

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
                hostname: '127.0.0.1',
                port: 18789,
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
}
