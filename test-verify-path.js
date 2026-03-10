#!/usr/bin/env node
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 读取 token
const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf8'));
const token = config?.gateway?.auth?.token;

console.log('=== 测试 RPC 创建 + 文件系统写入 ===');
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
        console.log('[Step 1] 握手...');
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
        console.log('  ✓ 握手成功\n');

        // Step 2: 创建 agent
        console.log('[Step 2] RPC 创建 agent...');
        const result = await sendRpc('agents.create', {
            name: 'test-verify-path',
            workspace: '~/.openclaw/workspace/agents/test-verify-path',
            emoji: '🔍'
        });
        console.log('  ✓ 创建成功');
        console.log('  返回的 workspace:', result.workspace);
        console.log('');

        // Step 3: 使用文件系统写入
        console.log('[Step 3] 文件系统写入...');
        const agentPath = path.join(os.homedir(), '.openclaw', 'workspace', 'agents', 'test-verify-path');
        console.log('  写入路径:', agentPath);
        
        // 检查目录是否存在
        if (!fs.existsSync(agentPath)) {
            console.log('  ✗ 目录不存在！');
            throw new Error('Agent directory does not exist');
        }
        console.log('  ✓ 目录存在');
        
        // 写入文件
        const identityContent = '# IDENTITY.md\n\n- **Name:** Test Verify\n- **Emoji:** 🔍\n';
        fs.writeFileSync(path.join(agentPath, 'IDENTITY.md'), identityContent, 'utf-8');
        console.log('  ✓ IDENTITY.md 已写入');
        
        const soulContent = '# SOUL.md\n\nTest agent for path verification.\n';
        fs.writeFileSync(path.join(agentPath, 'SOUL.md'), soulContent, 'utf-8');
        console.log('  ✓ SOUL.md 已写入');
        console.log('');

        // Step 4: 验证文件
        console.log('[Step 4] 验证文件...');
        const identityExists = fs.existsSync(path.join(agentPath, 'IDENTITY.md'));
        const soulExists = fs.existsSync(path.join(agentPath, 'SOUL.md'));
        console.log('  IDENTITY.md:', identityExists ? '✓ 存在' : '✗ 不存在');
        console.log('  SOUL.md:', soulExists ? '✓ 存在' : '✗ 不存在');
        
        if (identityExists) {
            const content = fs.readFileSync(path.join(agentPath, 'IDENTITY.md'), 'utf-8');
            console.log('  IDENTITY.md 内容预览:', content.substring(0, 50) + '...');
        }
        console.log('');

        // Step 5: 清理
        console.log('[Step 5] 清理...');
        const { exec } = require('child_process');
        exec('openclaw agents delete test-verify-path --force', (err, stdout, stderr) => {
            if (err) {
                console.log('  ⚠ 清理失败:', err.message);
            } else {
                console.log('  ✓ 测试 agent 已删除');
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
}, 20000);
