#!/usr/bin/env node

/**
 * 详细的消息发送和接收测试
 */

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createConnectParams } = require('./test/gateway-config.js');

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

// 从 openclaw.json 读取 Gateway token
function loadGatewayToken() {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config?.gateway?.auth?.token;
}

// 简单的 WebSocket Gateway 客户端
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
            this.ws.on('close', () => { this.connected = false; });
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
            }, 30000);
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

// 主测试函数
async function main() {
    log('\n=== OpenClaw 消息发送和接收详细测试 ===\n', 'blue');
    
    const token = loadGatewayToken();
    log(`✓ 从 openclaw.json 读取到 token: ${token.substring(0, 10)}...\n`, 'green');
    
    const gateway = new GatewayClient('ws://localhost:18789', token);
    
    try {
        // 连接
        log('步骤 1: 连接到 Gateway...', 'cyan');
        await gateway.connect();
        log('✓ 连接成功\n', 'green');
        
        // 监听 chat 事件
        const messages = [];
        let fullContent = '';
        
        gateway.on('chat', (payload) => {
            messages.push(payload);
            
            // 解析消息内容
            let content = '';
            if (payload.message?.content) {
                if (Array.isArray(payload.message.content)) {
                    // 新格式：content 是数组
                    content = payload.message.content
                        .filter(item => item.type === 'text')
                        .map(item => item.text)
                        .join('');
                } else if (typeof payload.message.content === 'string') {
                    // 旧格式：content 是字符串
                    content = payload.message.content;
                }
            }
            
            if (payload.state === 'delta' && content) {
                process.stdout.write(colors.gray + content + colors.reset);
                fullContent = content; // 保存最新的完整内容
            } else if (payload.state === 'final') {
                if (content) {
                    fullContent = content;
                }
                log('\n✓ 收到完整回复\n', 'green');
            }
        });
        
        // 发送消息
        const sessionKey = 'agent:main:test-' + Date.now();
        const testMessage = '你好！这是一条测试消息。请简短回复"收到"，并说明你是谁。';
        
        log('步骤 2: 发送测试消息', 'cyan');
        log(`  Session Key: ${sessionKey}`, 'gray');
        log(`  消息内容: ${testMessage}\n`, 'gray');
        
        await gateway.sendRpc('chat.send', {
            sessionKey,
            message: testMessage,
            deliver: false,
            idempotencyKey: 'test-' + Date.now()
        });
        
        log('✓ 消息已发送，等待回复...\n', 'green');
        log('Agent 回复:', 'cyan');
        log('─'.repeat(60), 'gray');
        
        // 等待回复（最多 30 秒）
        let receivedFinal = false;
        for (let i = 0; i < 300; i++) {
            const finalMsg = messages.find(m => m.state === 'final');
            if (finalMsg) {
                receivedFinal = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        log('─'.repeat(60), 'gray');
        
        if (!receivedFinal) {
            log('✗ 未收到完整回复（超时）\n', 'red');
        } else {
            const finalMsg = messages.find(m => m.state === 'final');
            log(`\n✓ 测试成功！`, 'green');
            log(`  消息数量: ${messages.length}`, 'gray');
            log(`  最终状态: ${finalMsg.state}`, 'gray');
            log(`  回复内容: ${fullContent}`, 'cyan');
            log(`  回复长度: ${fullContent.length} 字符\n`, 'gray');
        }
        
        // 获取历史记录
        log('步骤 3: 获取会话历史', 'cyan');
        const history = await gateway.sendRpc('chat.history', { sessionKey });
        log(`✓ 历史记录数量: ${history.messages?.length || 0}\n`, 'green');
        
        if (history.messages && history.messages.length > 0) {
            log('最近的消息:', 'cyan');
            history.messages.slice(-2).forEach((msg, idx) => {
                const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                log(`  ${idx + 1}. [${msg.role}] ${content.substring(0, 50)}...`, 'gray');
            });
            log('');
        }
        
        // 断开连接
        gateway.disconnect();
        log('✓ 测试完成，连接已关闭\n', 'green');
        
    } catch (err) {
        log(`\n✗ 测试失败: ${err.message}\n`, 'red');
        gateway.disconnect();
        process.exit(1);
    }
}

main().catch(err => {
    log(`\n✗ 错误: ${err.message}\n`, 'red');
    process.exit(1);
});
