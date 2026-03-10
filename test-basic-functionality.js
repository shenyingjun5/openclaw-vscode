#!/usr/bin/env node

/**
 * OpenClaw VSCode 扩展基础功能测试
 * 
 * 测试内容：
 * 1. Gateway 连接
 * 2. 发送消息
 * 3. 接收回复
 */

const { GatewayClient } = require('./out/gateway');

async function testBasicFunctionality() {
    console.log('=== OpenClaw VSCode 扩展基础功能测试 ===\n');

    // 1. 创建 Gateway 客户端
    console.log('1. 创建 Gateway 客户端...');
    const gateway = new GatewayClient('http://localhost:18789');
    console.log('   ✓ Gateway 客户端已创建\n');

    // 2. 连接 Gateway
    console.log('2. 连接 Gateway...');
    try {
        await gateway.connect();
        console.log('   ✓ Gateway 连接成功');
        console.log('   - 模式:', gateway.getMode());
        console.log('   - URL:', gateway.getConnectedUrl());
        console.log('   - 状态:', gateway.isConnected() ? '已连接' : '未连接');
        console.log('');
    } catch (err) {
        console.error('   ✗ Gateway 连接失败:', err.message);
        console.log('\n测试失败：无法连接到 Gateway');
        console.log('请确保 OpenClaw Gateway 正在运行：openclaw gateway start');
        process.exit(1);
    }

    // 3. 发送测试消息
    console.log('3. 发送测试消息...');
    const sessionKey = 'agent:main:test-' + Date.now();
    const testMessage = '你好，这是一条测试消息。请简短回复"收到"。';
    
    try {
        console.log('   - Session Key:', sessionKey);
        console.log('   - 消息内容:', testMessage);
        
        const response = await gateway.sendMessage(sessionKey, testMessage);
        
        console.log('   ✓ 消息发送成功');
        console.log('   - 回复角色:', response.role);
        console.log('   - 回复内容:', response.content.substring(0, 100) + (response.content.length > 100 ? '...' : ''));
        console.log('');
    } catch (err) {
        console.error('   ✗ 消息发送失败:', err.message);
        console.log('\n测试失败：无法发送消息');
        process.exit(1);
    }

    // 4. 测试 Agent 列表获取
    console.log('4. 测试 Agent 列表获取...');
    try {
        const result = await gateway.sendRpc('agents.list', {});
        console.log('   ✓ Agent 列表获取成功');
        console.log('   - Agent 数量:', result.agents.length);
        console.log('   - 默认 Agent:', result.defaultId);
        if (result.agents.length > 0) {
            console.log('   - 第一个 Agent:', result.agents[0].id);
        }
        console.log('');
    } catch (err) {
        console.error('   ✗ Agent 列表获取失败:', err.message);
        console.log('   (这可能是正常的，如果 Gateway 不支持此 RPC)');
        console.log('');
    }

    // 5. 断开连接
    console.log('5. 断开连接...');
    gateway.disconnect();
    console.log('   ✓ 已断开连接\n');

    console.log('=== 测试完成 ===');
    console.log('✓ 所有基础功能正常');
}

// 运行测试
testBasicFunctionality().catch(err => {
    console.error('\n测试过程中发生错误:', err);
    process.exit(1);
});
