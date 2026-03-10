#!/usr/bin/env node

/**
 * OpenClaw VSCode 扩展功能模拟测试
 * 
 * 不依赖 VSCode API，直接测试核心逻辑
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

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

function warn(message) {
    log('⚠ ' + message, 'yellow');
}

function debug(message) {
    log('  ' + message, 'gray');
}

// 简单的 HTTP 客户端
class SimpleHttpClient {
    async request(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const reqOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers || {}
            };

            const req = client.request(reqOptions, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        resolve({ status: res.statusCode, data: json });
                    } catch (err) {
                        resolve({ status: res.statusCode, data: data });
                    }
                });
            });

            req.on('error', reject);
            
            if (options.body) {
                req.write(JSON.stringify(options.body));
            }
            
            req.end();
        });
    }

    async post(url, body, headers = {}) {
        return this.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body
        });
    }

    async get(url, headers = {}) {
        return this.request(url, {
            method: 'GET',
            headers
        });
    }
}

// 模拟 Gateway 客户端
class MockGatewayClient {
    constructor(baseUrl = 'http://localhost:18789') {
        this.baseUrl = baseUrl;
        this.client = new SimpleHttpClient();
        this.connected = false;
    }

    async connect() {
        try {
            // 尝试连接 Gateway（检查健康状态）
            const response = await this.client.get(`${this.baseUrl}/health`);
            if (response.status === 200) {
                this.connected = true;
                return true;
            }
            return false;
        } catch (err) {
            this.connected = false;
            throw new Error(`无法连接到 Gateway: ${err.message}`);
        }
    }

    async sendMessage(sessionKey, message) {
        if (!this.connected) {
            throw new Error('Gateway 未连接');
        }

        try {
            const response = await this.client.post(`${this.baseUrl}/api/chat`, {
                sessionKey,
                message,
                deliver: false
            });

            if (response.status === 200) {
                return response.data;
            } else {
                throw new Error(`发送消息失败: ${response.status}`);
            }
        } catch (err) {
            throw new Error(`发送消息失败: ${err.message}`);
        }
    }

    async sendRpc(method, params) {
        if (!this.connected) {
            throw new Error('Gateway 未连接');
        }

        try {
            const response = await this.client.post(`${this.baseUrl}/api/rpc`, {
                method,
                params
            });

            if (response.status === 200) {
                return response.data;
            } else {
                throw new Error(`RPC 调用失败: ${response.status}`);
            }
        } catch (err) {
            throw new Error(`RPC 调用失败: ${err.message}`);
        }
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
        log('\n=== OpenClaw VSCode 扩展功能测试 ===\n', 'blue');
        
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
    const gateway = new MockGatewayClient();

    // 测试 1: Gateway 连接
    suite.test('Gateway 连接', async () => {
        debug('尝试连接到 http://localhost:18789...');
        const connected = await gateway.connect();
        if (!connected) {
            throw new Error('连接失败');
        }
        debug('连接成功');
    });

    // 测试 2: 发送简单消息
    suite.test('发送简单消息', async () => {
        const sessionKey = 'agent:main:test-' + Date.now();
        const message = '你好，这是一条测试消息。请简短回复"收到"。';
        
        debug(`Session Key: ${sessionKey}`);
        debug(`消息: ${message}`);
        
        const response = await gateway.sendMessage(sessionKey, message);
        
        if (!response || !response.content) {
            throw new Error('未收到回复');
        }
        
        debug(`回复: ${response.content.substring(0, 50)}...`);
    });

    // 测试 3: 获取 Agent 列表
    suite.test('获取 Agent 列表', async () => {
        debug('调用 agents.list RPC...');
        
        const result = await gateway.sendRpc('agents.list', {});
        
        if (!result || !result.agents) {
            throw new Error('未获取到 Agent 列表');
        }
        
        debug(`找到 ${result.agents.length} 个 Agent`);
        if (result.agents.length > 0) {
            debug(`第一个 Agent: ${result.agents[0].id}`);
        }
    });

    // 测试 4: 会话历史
    suite.test('会话历史', async () => {
        const sessionKey = 'agent:main:test-' + Date.now();
        
        debug('发送第一条消息...');
        await gateway.sendMessage(sessionKey, '第一条消息');
        
        debug('发送第二条消息...');
        await gateway.sendMessage(sessionKey, '第二条消息');
        
        debug('会话历史测试完成');
    });

    // 测试 5: 错误处理
    suite.test('错误处理', async () => {
        debug('测试空消息...');
        
        try {
            await gateway.sendMessage('agent:main:test', '');
            throw new Error('应该抛出错误');
        } catch (err) {
            if (err.message === '应该抛出错误') {
                throw err;
            }
            debug('正确处理了空消息错误');
        }
    });

    // 运行测试
    const success = await suite.run();
    
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
