#!/usr/bin/env node

const WebSocket = require('ws');

let ws;
let requestId = 1;
const pendingRequests = new Map();

function connect() {
    return new Promise((resolve, reject) => {
        ws = new WebSocket('ws://localhost:18789');
        
        ws.on('open', () => {
            console.log('✓ Connected to Gateway');
            resolve();
        });
        
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                console.log('← Received:', JSON.stringify(msg, null, 2));
                
                if (msg.id && pendingRequests.has(msg.id)) {
                    const { resolve, reject } = pendingRequests.get(msg.id);
                    pendingRequests.delete(msg.id);
                    
                    if (msg.error) {
                        reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                    } else {
                        resolve(msg.result);
                    }
                }
            } catch (err) {
                console.error('Parse error:', err);
            }
        });
        
        ws.on('error', (err) => {
            console.error('✗ WebSocket error:', err.message);
            reject(err);
        });
        
        ws.on('close', () => {
            console.log('Connection closed');
        });
    });
}

function sendRpc(method, params) {
    return new Promise((resolve, reject) => {
        const id = requestId++;
        const req = {
            type: 'req',
            id,
            method,
            params
        };
        
        console.log('→ Sending:', JSON.stringify(req, null, 2));
        pendingRequests.set(id, { resolve, reject });
        ws.send(JSON.stringify(req));
        
        // 超时
        setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error('Request timeout'));
            }
        }, 10000);
    });
}

async function testCreateAgent() {
    try {
        await connect();
        
        console.log('\n=== Test 1: agents.create with name parameter ===');
        const result = await sendRpc('agents.create', {
            name: 'test-rpc-agent',
            workspace: '~/.openclaw/workspace/agents/test-rpc-agent',
            emoji: '🧪'
        });
        
        console.log('✓ Success:', result);
        
        // 清理：删除测试 agent
        console.log('\n=== Cleanup: delete test agent ===');
        const { exec } = require('child_process');
        exec('openclaw agents delete test-rpc-agent --force', (err, stdout, stderr) => {
            if (err) {
                console.log('Cleanup failed (agent may not exist):', err.message);
            } else {
                console.log('✓ Test agent deleted');
            }
            ws.close();
        });
        
    } catch (err) {
        console.error('✗ Test failed:', err.message);
        ws.close();
        process.exit(1);
    }
}

testCreateAgent();
