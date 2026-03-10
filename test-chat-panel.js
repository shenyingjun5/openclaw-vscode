#!/usr/bin/env node

/**
 * 模拟 VSCode Chat Panel 的消息对话测试
 * 
 * 模拟用户在 chat panel 中发送消息并接收回复的完整流程
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { createConnectParams } = require('./test/gateway-config.js');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m',
    bold: '\x1b[1m'
};

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

// 从 openclaw.json 读取配置
function loadConfig() {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
        token: config?.gateway?.auth?.token,
        port: config?.gateway?.port || 18789
    };
}

// Gateway 客户端
class GatewayClient {
    constructor(url, token) {
        this.url = url;
        this.token = token;
        this.ws = null;
        this.connected = false;
        this.requestId = 0;
        this.pendingRequests = new Map();
        this.eventHandlers = new Map();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const originUrl = this.url.replace(/^ws/, 'http').replace(/\/$/, '');
            this.ws = new WebSocket(this.url, {
                headers: { 'Origin': originUrl }
            });

            this.ws.on('open', async () => {
                this.ws.on('message', (data) => this._handleMessage(data));
                
                try {
                    await this.sendRpc('connect', createConnectParams({
                        version: '0.2.19',
                        platform: process.platform,
                        locale: 'zh-CN',
                        token: this.token
                    }));
                    
                    this.connected = true;
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });

            this.ws.on('error', reject);
            this.ws.on('close', () => { 
                this.connected = false;
                log('\n[系统] 连接已断开', 'red');
            });
        });
    }

    _handleMessage(data) {
        try {
            const frame = JSON.parse(data.toString());
            
            if (frame.type === 'res') {
                const pending = this.pendingRequests.get(frame.id);
                if (pending) {
                    this.pendingRequests.delete(frame.id);
                    if (frame.ok) {
                        pending.resolve(frame.payload);
                    } else {
                        pending.reject(new Error(frame.error?.message || 'RPC 调用失败'));
                    }
                }
            } else if (frame.type === 'event') {
                const handlers = this.eventHandlers.get(frame.event);
                if (handlers) {
                    handlers.forEach(handler => handler(frame.payload));
                }
            }
        } catch (err) {
            // ignore
        }
    }

    async sendRpc(method, params) {
        const isHandshake = method === 'connect';
        if (!isHandshake && !this.connected) {
            throw new Error('未连接');
        }

        return new Promise((resolve, reject) => {
            const id = String(++this.requestId);
            const frame = { type: 'req', id, method, params };
            this.pendingRequests.set(id, { resolve, reject });
            this.ws.send(JSON.stringify(frame));
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('请求超时'));
                }
            }, 60000);
        });
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }
}

// Chat Panel 模拟器
class ChatPanel {
    constructor(gateway, agentId = 'main') {
        this.gateway = gateway;
        this.agentId = agentId;
        this.sessionKey = `agent:${agentId}:vscode-${Date.now()}`;
        this.messageHistory = [];
        this.currentRunId = null;
        this.isReceiving = false;
        
        // 监听 chat 事件
        this.gateway.on('chat', (payload) => this._handleChatEvent(payload));
    }

    _handleChatEvent(payload) {
        if (payload.sessionKey !== this.sessionKey) {
            return; // 不是当前会话的消息
        }

        // 解析消息内容
        let content = '';
        if (payload.message?.content) {
            if (Array.isArray(payload.message.content)) {
                content = payload.message.content
                    .filter(item => item.type === 'text')
                    .map(item => item.text)
                    .join('');
            } else if (typeof payload.message.content === 'string') {
                content = payload.message.content;
            }
        }

        if (payload.state === 'delta' && content) {
            if (!this.isReceiving) {
                process.stdout.write(colors.cyan + '\n[Agent] ' + colors.reset);
                this.isReceiving = true;
            }
            process.stdout.write(colors.gray + content + colors.reset);
        } else if (payload.state === 'final') {
            if (this.isReceiving) {
                console.log(''); // 换行
                this.isReceiving = false;
            }
            this.messageHistory.push({
                role: 'assistant',
                content: content,
                timestamp: new Date()
            });
        }
    }

    async sendMessage(message) {
        // 显示用户消息
        log(`\n[You] ${message}`, 'green');
        
        // 记录到历史
        this.messageHistory.push({
            role: 'user',
            content: message,
            timestamp: new Date()
        });

        // 发送消息
        try {
            const runId = 'run-' + Date.now();
            this.currentRunId = runId;
            
            await this.gateway.sendRpc('chat.send', {
                sessionKey: this.sessionKey,
                message: message,
                deliver: false,
                idempotencyKey: runId
            });
            
            // 等待回复完成
            await this._waitForReply();
            
        } catch (err) {
            log(`\n[错误] 发送消息失败: ${err.message}`, 'red');
        }
    }

    async _waitForReply() {
        // 等待 final 状态（最多 60 秒）
        return new Promise((resolve) => {
            let finalReceived = false;
            const startTime = Date.now();
            
            const checkInterval = setInterval(() => {
                // 检查是否收到 final 状态
                if (!this.isReceiving && this.messageHistory.length > 0) {
                    const lastMsg = this.messageHistory[this.messageHistory.length - 1];
                    if (lastMsg.role === 'assistant') {
                        finalReceived = true;
                    }
                }
                
                // 超时或收到回复
                if (finalReceived || Date.now() - startTime > 60000) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    }

    async getHistory() {
        try {
            const history = await this.gateway.sendRpc('chat.history', {
                sessionKey: this.sessionKey
            });
            return history.messages || [];
        } catch (err) {
            log(`[错误] 获取历史失败: ${err.message}`, 'red');
            return [];
        }
    }

    showHistory() {
        log('\n=== 对话历史 ===', 'cyan');
        this.messageHistory.forEach((msg, idx) => {
            const role = msg.role === 'user' ? '[You]' : '[Agent]';
            const color = msg.role === 'user' ? 'green' : 'cyan';
            const time = msg.timestamp.toLocaleTimeString('zh-CN');
            log(`${idx + 1}. ${role} (${time})`, color);
            log(`   ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`, 'gray');
        });
        log('');
    }
}

// 主程序
async function main() {
    log('\n' + '='.repeat(60), 'blue');
    log('  OpenClaw VSCode Chat Panel 模拟测试', 'bold');
    log('='.repeat(60) + '\n', 'blue');
    
    // 加载配置
    const config = loadConfig();
    log(`[系统] 从 openclaw.json 读取配置`, 'gray');
    log(`[系统] Gateway 端口: ${config.port}`, 'gray');
    log(`[系统] Token: ${config.token.substring(0, 10)}...`, 'gray');
    
    // 连接 Gateway
    log(`\n[系统] 正在连接到 Gateway...`, 'yellow');
    const gateway = new GatewayClient(`ws://localhost:${config.port}`, config.token);
    
    try {
        await gateway.connect();
        log(`[系统] ✓ 连接成功`, 'green');
    } catch (err) {
        log(`[系统] ✗ 连接失败: ${err.message}`, 'red');
        process.exit(1);
    }

    // 创建 Chat Panel
    const chatPanel = new ChatPanel(gateway, 'main');
    log(`[系统] ✓ Chat Panel 已初始化`, 'green');
    log(`[系统] Session Key: ${chatPanel.sessionKey}`, 'gray');
    
    log('\n' + '='.repeat(60), 'blue');
    log('  开始对话测试', 'bold');
    log('='.repeat(60), 'blue');
    
    // 测试对话
    const testMessages = [
        '你好！',
        '你是谁？',
        '你能做什么？'
    ];
    
    for (const msg of testMessages) {
        await chatPanel.sendMessage(msg);
        await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒
    }
    
    // 显示历史
    log('\n' + '='.repeat(60), 'blue');
    chatPanel.showHistory();
    log('='.repeat(60), 'blue');
    
    // 交互模式
    log('\n[系统] 进入交互模式（输入 /quit 退出，/history 查看历史）\n', 'yellow');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: colors.green + '[You] ' + colors.reset
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        
        if (!input) {
            rl.prompt();
            return;
        }
        
        if (input === '/quit' || input === '/exit') {
            log('\n[系统] 正在退出...', 'yellow');
            gateway.disconnect();
            rl.close();
            process.exit(0);
        } else if (input === '/history') {
            chatPanel.showHistory();
            rl.prompt();
        } else {
            await chatPanel.sendMessage(input);
            rl.prompt();
        }
    });

    rl.on('close', () => {
        log('\n[系统] 再见！', 'yellow');
        gateway.disconnect();
        process.exit(0);
    });
}

// 错误处理
process.on('unhandledRejection', (err) => {
    log(`\n[错误] ${err.message}`, 'red');
    process.exit(1);
});

process.on('SIGINT', () => {
    log('\n\n[系统] 收到中断信号，正在退出...', 'yellow');
    process.exit(0);
});

// 运行
main().catch(err => {
    log(`\n[错误] ${err.message}`, 'red');
    process.exit(1);
});
