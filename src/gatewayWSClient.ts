import * as vscode from 'vscode';
import WebSocket from 'ws';

/**
 * Gateway WebSocket 客户端
 * 参考 OpenClaw 源码实现
 */

interface RequestFrame {
    type: 'req';
    id: string;
    method: string;
    params: any;
}

interface ResponseFrame {
    type: 'res';
    id: string;
    ok: boolean;
    payload?: any;
    error?: {
        code: string;
        message: string;
    };
}

interface EventFrame {
    type: 'event';
    event: string;
    payload: any;
    seq?: number;
    stateVersion?: {
        presence?: number;
        health?: number;
    };
}

type MessageFrame = RequestFrame | ResponseFrame | EventFrame;

interface PendingRequest {
    resolve: (payload: any) => void;
    reject: (error: Error) => void;
    onStream?: (text: string) => void;
}

export interface Message {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
    toolCall?: {
        name: string;
        args?: any;
    };
}

export class GatewayWSClient {
    private ws: WebSocket | null = null;
    private requestId = 0;
    private pendingRequests = new Map<string, PendingRequest>();
    private eventHandlers = new Map<string, ((payload: any) => void)[]>();
    private connected = false;
    private connecting = false;
    private gatewayUrl: string;
    private token?: string;

    constructor(gatewayUrl: string, token?: string) {
        this.gatewayUrl = gatewayUrl;
        this.token = token;
    }

    /**
     * 检查是否已连接
     */
    isConnected(): boolean {
        return this.connected && this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * 连接并握手
     */
    async connect(): Promise<void> {
        if (this.connected) {
            return;
        }

        if (this.connecting) {
            throw new Error('Already connecting');
        }

        this.connecting = true;

        try {
            await this._doConnect();
        } finally {
            this.connecting = false;
        }
    }

    private async _doConnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const wsUrl = this.gatewayUrl.replace(/^http/, 'ws');
            this.ws = new WebSocket(wsUrl);

            const timeout = setTimeout(() => {
                if (!this.connected) {
                    this.ws?.close();
                    reject(new Error('Connection timeout'));
                }
            }, 10000);

            this.ws.on('open', async () => {
                try {
                    const extVersion = vscode.extensions.getExtension('shenyingjun5.openclaw')?.packageJSON.version || '0.2.2';

                    // 发送 connect 请求
                    // 使用 gateway-client 作为 client.id（Gateway 枚举值）
                    // mode=ui，只传 auth.token 即可跳过 device identity
                    // 注意：webchat-ui/webchat 会触发 origin 检查，不适合 VSCode 插件
                    const connectReq: RequestFrame = {
                        type: 'req',
                        id: this._nextId(),
                        method: 'connect',
                        params: {
                            minProtocol: 3,
                            maxProtocol: 3,
                            client: {
                                id: 'gateway-client',
                                version: extVersion,
                                platform: process.platform,
                                mode: 'ui'
                            },
                            role: 'operator',
                            scopes: ['operator.admin'],
                            locale: vscode.env.language || 'en-US',
                            userAgent: `openclaw-vscode/${extVersion}`
                        }
                    };

                    // 如果配置了 token，添加认证
                    if (this.token) {
                        (connectReq.params as any).auth = { token: this.token };
                    }

                    // 等待 hello-ok
                    const listener = (data: WebSocket.Data) => {
                        try {
                            const msg = JSON.parse(data.toString()) as MessageFrame;
                            if (msg.type === 'res' && msg.id === connectReq.id) {
                                this.ws!.off('message', listener);
                                clearTimeout(timeout);
                                
                                if (msg.ok) {
                                    this.connected = true;
                                    console.log('[GatewayWS] Connected successfully');
                                    resolve();
                                } else {
                                    reject(new Error(msg.error?.message || 'Connect failed'));
                                }
                            }
                        } catch (err) {
                            reject(err);
                        }
                    };

                    if (!this.ws) {
                        reject(new Error('WebSocket closed'));
                        return;
                    }

                    this.ws.on('message', listener);
                    this.ws.send(JSON.stringify(connectReq));

                } catch (err) {
                    clearTimeout(timeout);
                    reject(err);
                }
            });

            this.ws.on('error', (err) => {
                clearTimeout(timeout);
                console.error('[GatewayWS] Error:', err);
                reject(err);
            });

            this.ws.on('close', (code, reason) => {
                clearTimeout(timeout);
                this.connected = false;
                console.log(`[GatewayWS] Closed: code=${code} reason=${reason}`);
                this._handleDisconnect();
            });

            // 设置消息处理器（在握手之后继续监听）
            this.ws.on('message', (data) => {
                this._handleMessage(data);
            });
        });
    }

    private _handleMessage(data: WebSocket.Data): void {
        try {
            const msg = JSON.parse(data.toString()) as MessageFrame;

            if (msg.type === 'res') {
                // 响应消息
                const pending = this.pendingRequests.get(msg.id);
                if (pending) {
                    this.pendingRequests.delete(msg.id);
                    if (msg.ok) {
                        pending.resolve(msg.payload);
                    } else {
                        pending.reject(new Error(msg.error?.message || 'Request failed'));
                    }
                }
            } else if (msg.type === 'event') {
                // 事件消息
                this._emitEvent(msg.event, msg.payload);

                // 特殊处理：流式输出事件
                if (msg.event === 'agent' && msg.payload?.kind === 'output') {
                    const runId = msg.payload.runId;
                    // 查找对应的 pending request（通过 runId 关联）
                    for (const [id, pending] of this.pendingRequests.entries()) {
                        if (pending.onStream) {
                            pending.onStream(msg.payload.text || '');
                        }
                    }
                }
                
                // 🔧 新增：处理工具调用事件
                if (msg.event === 'agent' && msg.payload?.kind === 'tool.call') {
                    this._emitEvent('tool.call', {
                        name: msg.payload.name,
                        args: msg.payload.args
                    });
                }
            }
        } catch (err) {
            console.error('[GatewayWS] Failed to parse message:', err);
        }
    }

    private _handleDisconnect(): void {
        // 清理所有 pending requests
        for (const [id, pending] of this.pendingRequests.entries()) {
            pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
    }

    private _nextId(): string {
        return `req-${++this.requestId}`;
    }

    /**
     * 发送消息到会话
     */
    async sendMessage(
        sessionId: string,
        message: string,
        options?: {
            stream?: boolean;
            onStream?: (text: string) => void;
        }
    ): Promise<Message> {
        if (!this.connected) {
            await this.connect();
        }

        // Generate idempotency key (required by Gateway)
        const idempotencyKey = `vsc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Use chat.send (webchat protocol) — results come via 'chat' events
        // Set up a listener for streaming chat events before sending
        let fullContent = '';
        const chatDone = new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.off('chat', handler);
                reject(new Error('Request timeout'));
            }, 120000); // 2 min timeout for agent runs

            const handler = (payload: any) => {
                // Only handle events for our session
                // Gateway may prefix sessionKey with "agent:<agentId>:"
                const eventKey = payload?.sessionKey ?? '';
                if (eventKey !== sessionId && !eventKey.endsWith(':' + sessionId)) return;

                if (payload.state === 'delta') {
                    // Extract text from delta message
                    const text = this._extractText(payload.message);
                    if (typeof text === 'string') {
                        fullContent = text;
                        if (options?.onStream) {
                            options.onStream(text);
                        }
                    }
                } else if (payload.state === 'final') {
                    clearTimeout(timeout);
                    this.off('chat', handler);
                    // Extract final text
                    const finalText = this._extractText(payload.message);
                    if (typeof finalText === 'string') {
                        fullContent = finalText;
                    }
                    resolve(fullContent);
                } else if (payload.state === 'error') {
                    clearTimeout(timeout);
                    this.off('chat', handler);
                    reject(new Error(payload.errorMessage || 'chat error'));
                } else if (payload.state === 'aborted') {
                    clearTimeout(timeout);
                    this.off('chat', handler);
                    resolve(fullContent || '(已中止)');
                }
            };

            this.on('chat', handler);
        });

        // Send the message
        await this._request('chat.send', {
            sessionKey: sessionId,
            message,
            deliver: false,
            idempotencyKey,
        });

        // Wait for the response via chat events
        const content = await chatDone;

        return {
            role: 'assistant',
            content: content || '',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Extract text content from a message payload
     */
    private _extractText(msg: any): string | null {
        if (!msg) return null;
        if (typeof msg.text === 'string') return msg.text;
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
            return msg.content
                .map((c: any) => (c?.type === 'text' && typeof c.text === 'string') ? c.text : '')
                .filter(Boolean)
                .join('\n');
        }
        return null;
    }

    /**
     * 获取会话历史
     */
    async getHistory(sessionId: string, limit?: number): Promise<Message[]> {
        if (!this.connected) {
            await this.connect();
        }

        const payload = await this._request('chat.history', {
            sessionKey: sessionId,
            limit
        });

        return payload.messages || [];
    }

    /**
     * 获取会话列表
     */
    async getSessions(): Promise<any[]> {
        if (!this.connected) {
            await this.connect();
        }

        const payload = await this._request('sessions.list', {});
        return payload.sessions || [];
    }

    /**
     * 获取可用模型列表
     */
    async listModels(): Promise<any[]> {
        if (!this.connected) {
            await this.connect();
        }

        const payload = await this._request('models.list', {});
        return payload.models || [];
    }

    /**
     * 中止当前运行（与 webchat 的 chat.abort 一致）
     * @param sessionKey - 会话 key
     * @param runId - 可选，指定要中止的 runId
     */
    async abortChat(sessionKey: string, runId?: string): Promise<{ aborted: boolean; runIds: string[] }> {
        if (!this.connected) {
            throw new Error('Not connected');
        }

        const params: any = { sessionKey };
        if (runId) {
            params.runId = runId;
        }

        const payload = await this._request('chat.abort', params);
        return {
            aborted: payload?.aborted ?? false,
            runIds: payload?.runIds ?? []
        };
    }

    /**
     * 删除会话
     */
    async deleteSession(sessionId: string): Promise<void> {
        if (!this.connected) {
            await this.connect();
        }

        await this._request('sessions.delete', { key: sessionId });
    }

    /**
     * 修改会话设置（模型、thinking、verbose 等）
     * @param sessionKey - 会话 key（如 "vscode-12345678"）
     * @param patch - 要修改的字段
     */
    async patchSession(sessionKey: string, patch: {
        model?: string | null;  // 模型覆盖（null = 清除覆盖）
        thinkingLevel?: string | null;
        verboseLevel?: string | null;
    }): Promise<void> {
        if (!this.connected) {
            await this.connect();
        }

        await this._request('sessions.patch', {
            key: sessionKey,
            ...patch
        });
    }

    /**
     * 通用 RPC 请求
     */
    private async _request(method: string, params: any, onStream?: (text: string) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this._nextId();
            const req: RequestFrame = {
                type: 'req',
                id,
                method,
                params
            };

            this.pendingRequests.set(id, { resolve, reject, onStream });
            this.ws!.send(JSON.stringify(req));

            // 超时处理
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 60000); // 60秒超时
        });
    }

    /**
     * 注册事件监听器
     */
    on(event: string, handler: (payload: any) => void): void {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event)!.push(handler);
    }

    /**
     * 移除事件监听器
     */
    off(event: string, handler: (payload: any) => void): void {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    private _emitEvent(event: string, payload: any): void {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            for (const handler of handlers) {
                try {
                    handler(payload);
                } catch (err) {
                    console.error(`[GatewayWS] Event handler error for ${event}:`, err);
                }
            }
        }
    }

    /**
     * 断开连接
     */
    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
}
