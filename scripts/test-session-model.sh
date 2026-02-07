#!/bin/bash
# 测试会话级模型切换功能

echo "🧪 测试会话级模型切换"
echo ""

echo "1️⃣ 检查代码改动..."
echo "   GatewayWSClient.patchSession():"
grep -c "patchSession" ~/Desktop/openclaw-vscode/src/gatewayWSClient.ts && echo "   ✅ 已添加"

echo ""
echo "   Gateway.setSessionModel() 使用 WebSocket:"
grep -c "_wsClient.patchSession" ~/Desktop/openclaw-vscode/src/gateway.ts && echo "   ✅ 已修改"

echo ""
echo "2️⃣ 检查配置项..."
grep -q "openclaw.defaultModel" ~/Desktop/openclaw-vscode/package.json && echo "   ✅ defaultModel 配置已添加"

echo ""
echo "3️⃣ 检查翻译..."
echo "   英文: $(jq -r '.["config.defaultModel.description"]' ~/Desktop/openclaw-vscode/package.nls.json | cut -c1-40)..."
echo "   中文: $(jq -r '.["config.defaultModel.description"]' ~/Desktop/openclaw-vscode/package.nls.zh-cn.json | cut -c1-40)..."

echo ""
echo "4️⃣ 编译检查..."
cd ~/Desktop/openclaw-vscode && npm run compile 2>&1 | grep -q "error" && echo "   ❌ 编译失败" || echo "   ✅ 编译成功"

echo ""
echo "5️⃣ 包大小..."
ls -lh ~/Desktop/openclaw-vscode/openclaw-0.2.2.vsix | awk '{print "   " $9 ": " $5}'

echo ""
echo "📋 测试步骤:"
echo "   1. code --install-extension ~/Desktop/openclaw-vscode/openclaw-0.2.2.vsix --force"
echo "   2. 打开两个 VS Code 窗口"
echo "   3. 窗口 A 选择 GPT-4，窗口 B 选择 Claude Sonnet"
echo "   4. 发送消息验证各自使用不同模型"
echo "   5. 检查 ~/.openclaw/sessions.json 中的 modelOverride 字段"

echo ""
echo "✨ 准备就绪！"
