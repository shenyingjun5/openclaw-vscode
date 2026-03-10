#!/usr/bin/env node
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 读取 token
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf8'));
const token = config?.gateway?.auth?.token;

console.log('=== 测试 agents.create RPC ===');
console.log('Token:', token ? '✓' : '✗');
console.log('');

const ws = new WebSocket('ws://localhost:18789', {
    headers: { 'Origin': 'http://localhost:18789' }
});

let reqId = 0;
const pending = new Map();

function sendRpc(method, params) {
    return new Promise((resolve, reject) => {
        const id = `req-${++reqId}`;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ type: 'req', id, method, params }));
        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error(`${method} timeout (10s)`));
            }
        }, 10000);
    });
}

ws.on('message', (data) => {
    const frame = JSON.parse(data.toString());
    console.log('← Received:', JSON.stringify(frame, null, 2));
    
    if (frame.type === 'res') {
        const p = pending.get(frame.id);
        if (p) {
            pending.delete(frame.id);
            frame.ok ? p.resolve(frame.payload) : p.reject(new Error(JSON.stringify(frame.error)));
        }
    }
});

ws.on('open', async () => {
    try {
        // Step 1: 握手
        console.log('[Step 1] 握手 connect...');
        console.log('→ Sending connect request');
        await sendRpc('connect', {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
                id: 'gateway-client',
                version: '0.2.19',
                platform: 'darwin',
                mode: 'ui'
            },
            role: 'operator',
            scopes: ['operator.admin', 'operator.read', 'operator.write'],
            locale: 'zh-CN',
            userAgent: 'openclaw-vscode/0.2.19',
            auth: { token }
        });
        console.log('✓ 握手成功\n');

        // Step 2: 创建 agent
        console.log('[Step 2] 创建 agent (agents.create)...');
        console.log('→ Sending agents.create request');
        const result = await sendRpc('agents.create', {
            name: 'test-ws-agent',
            workspace: '~/.openclaw/workspace/agents/test-ws-agent',
            emoji: '🧪'
        });
        console.log('✓ 创建成功:', result);
        console.log('');

        // Step 3: 清理 - 删除测试 agent
        console.log('[Step 3] 清理...');
        const { exec } = require('child_process');
        exec('openclaw agents delete test-ws-agent --force', (err, stdout, stderr) => {
            if (err) {
                console.log('⚠ 清理失败 (agent 可能不存在):', err.message);
            } else {
                console.log('✓ 测试 agent 已删除');
            }
            
            console.log('\n=== 测试完成 ===');
            ws.close();
            process.exit(0);
        });

    } catch (e) {
        console.error('\n✗ 测试失败:', e.message);
        ws.close();
        process.exit(1);
    }
});

ws.on('error', (e) => {
    console.error('WebSocket Error:', e.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('\n全局超时退出');
    ws.close();
    process.exit(1);
}, 15000);
