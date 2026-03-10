#!/usr/bin/env node

/**
 * OpenClaw VSCode 扩展功能模拟测试（使用 WebSocket）
 * 
 * 测试 Gateway WebSocket 连接和消息发送
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
    gray: '\x1b[90m'
};

function log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
}

function success(message) {
    log('✓ ' + message, 'green');
}

function error(message) {
    log('✗ ' + message, 'red');
}

function info(message) {
    log('ℹ ' + message, 'blue');
}

function debug(message) {
    log('  ' + message, 'gray');
}

// 从 openclaw.json 读取 Gateway token
function loadGatewayToken() {
    try {
        const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
        if (!fs.existsSync(configPath)) {
            warn('未找到 openclaw.json 配置文件');
            return null;
        }
        
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const token = config?.gateway?.auth?.token;
        
        if (!token) {
            warn('openclaw.json 中未配置 gateway.auth.token');
            return null;
        }
        
        debug(`从 openclaw.json 读取到 token: ${token.substring(0, 10)}...`);
        return token;
    } catch (err) {
        error(`读取 openclaw.json 失败: ${err.message}`);
        return null;
    }
}

// 简单的 WebSocket Gateway 客户端
class SimpleGatewayClient {
    constructor(url = 'ws://localhost:18789', token = null) {
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
            debug(`连接到 ${this.url}...`);
            
            // 添加 Origin 头
            const originUrl = this.url.replace(/^ws/, 'http').replace(/\/$/, '');
            this.ws = new WebSocket(this.url, {
                headers: {
                    'Origin': originUrl
                }
            });

            this.ws.on('open', async () => {
                debug('WebSocket 连接已建立');
                
                // 设置消息处理器
                this.ws.on('message', (data) => {
                    this._handleMessage(data);
                });
                
                try {
                    // 发送握手请求
                    debug('发送握手请求...');
                    debug('使用统一的连接配置（来自 test/gateway-config.js）');
                    
                    const handshakeResult = await this.sendRpc('connect', createConnectParams({
                        version: '0.2.19',
                        platform: process.platform,
                        locale: 'zh-CN',
                        token: this.token
                    }));
                    
                    debug('握手成功');
                    this.connected = true;
                    resolve();
                } catch (err) {
                    debug(`握手失败: ${err.message}`);
                    reject(err);
                }
            });

            this.ws.on('error', (err) => {
                debug(`WebSocket 错误: ${err.message}`);
                reject(err);
            });

            this.ws.on('close', () => {
                debug('WebSocket 连接已关闭');
                this.connected = false;
            });

            // 超时处理
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('连接超时'));
                }
            }, 10000);
        });
    }

    _handleMessage(data) {
        try {
            const frame = JSON.parse(data.toString());
            
            if (frame.type === 'res') {
                // 响应消息
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
                // 事件消息
                const handlers = this.eventHandlers.get(frame.event);
                if (handlers) {
                    handlers.forEach(handler => handler(frame.payload));
                }
            }
        } catch (err) {
            debug(`解析消息失败: ${err.message}`);
        }
    }

    async sendRpc(method, params) {
        // 握手请求不需要检查连接状态
        const isHandshake = method === 'connect';
        
        if (!isHandshake && !this.connected) {
            throw new Error('未连接');
        }

        return new Promise((resolve, reject) => {
            const id = String(++this.requestId);
            
            const frame = {
                type: 'req',
                id,
                method,
                params
            };

            this.pendingRequests.set(id, { resolve, reject });

            this.ws.send(JSON.stringify(frame));

            // 超时处理
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

// 测试套件
class TestSuite {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        log('\n=== OpenClaw VSCode 扩展功能测试 (WebSocket) ===\n', 'blue');
        
        for (const test of this.tests) {
            try {
                info(`测试: ${test.name}`);
                await test.fn();
                success(`通过: ${test.name}\n`);
                this.passed++;
            } catch (err) {
                error(`失败: ${test.name}`);
                error(`  错误: ${err.message}\n`);
                this.failed++;
            }
        }

        log('\n=== 测试结果 ===', 'blue');
        log(`总计: ${this.tests.length} 个测试`);
        success(`通过: ${this.passed} 个`);
        if (this.failed > 0) {
            error(`失败: ${this.failed} 个`);
        }
        log('');

        return this.failed === 0;
    }
}

// 主测试函数
async function main() {
    const suite = new TestSuite();
    
    // 从 openclaw.json 读取 token
    const token = loadGatewayToken();
    if (!token) {
        error('无法获取 Gateway token，测试可能失败');
    }
    
    const gateway = new SimpleGatewayClient('ws://localhost:18789', token);

    // 测试 1: WebSocket 连接
    suite.test('WebSocket 连接', async () => {
        await gateway.connect();
        debug('连接成功');
    });

    // 测试 2: 获取 Agent 列表
    suite.test('获取 Agent 列表', async () => {
        debug('调用 agents.list RPC...');
        
        const result = await gateway.sendRpc('agents.list', {});
        
        if (!result || !result.agents) {
            throw new Error('未获取到 Agent 列表');
        }
        
        debug(`找到 ${result.agents.length} 个 Agent`);
        if (result.agents.length > 0) {
            debug(`第一个 Agent: ${result.agents[0].id}`);
            debug(`默认 Agent: ${result.defaultId}`);
        }
    });

    // 测试 3: 发送消息
    suite.test('发送消息', async () => {
        const sessionKey = 'agent:main:test-' + Date.now();
        const message = '你好，这是一条测试消息。请简短回复"收到"。';
        
        debug(`Session Key: ${sessionKey}`);
        debug(`消息: ${message}`);
        
        // 监听 chat 事件
        let receivedReply = false;
        gateway.on('chat', (payload) => {
            if (payload.sessionKey === sessionKey && payload.state === 'final') {
                receivedReply = true;
                debug(`收到回复: ${payload.content?.substring(0, 50)}...`);
            }
        });
        
        // 发送消息
        await gateway.sendRpc('chat.send', {
            sessionKey,
            message,
            deliver: false,
            idempotencyKey: 'test-' + Date.now()
        });
        
        debug('消息已发送，等待回复...');
        
        // 等待回复（最多 10 秒）
        for (let i = 0; i < 100; i++) {
            if (receivedReply) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (!receivedReply) {
            throw new Error('未收到回复（超时）');
        }
    });

    // 测试 4: 获取会话历史
    suite.test('获取会话历史', async () => {
        const sessionKey = 'agent:main:test-history-' + Date.now();
        
        debug('发送第一条消息...');
        await gateway.sendRpc('chat.send', {
            sessionKey,
            message: '第一条消息',
            deliver: false,
            idempotencyKey: 'test-1-' + Date.now()
        });
        
        // 等待一下
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        debug('获取历史记录...');
        const history = await gateway.sendRpc('chat.history', {
            sessionKey
        });
        
        if (!history || !history.messages) {
            throw new Error('未获取到历史记录');
        }
        
        debug(`历史记录数量: ${history.messages.length}`);
    });

    // 测试 5: Agent 身份获取
    suite.test('获取 Agent 身份', async () => {
        debug('调用 agent.identity.get RPC...');
        
        const identity = await gateway.sendRpc('agent.identity.get', {
            agentId: 'main'
        });
        
        if (!identity) {
            throw new Error('未获取到 Agent 身份');
        }
        
        debug(`Agent 名称: ${identity.name || '未设置'}`);
        debug(`Agent Emoji: ${identity.emoji || '未设置'}`);
    });

    // 运行测试
    const success = await suite.run();
    
    // 断开连接
    gateway.disconnect();
    
    process.exit(success ? 0 : 1);
}

// 错误处理
process.on('unhandledRejection', (err) => {
    error('\n未处理的错误:');
    console.error(err);
    process.exit(1);
});

// 运行测试
main().catch(err => {
    error('\n测试过程中发生错误:');
    console.error(err);
    process.exit(1);
});
