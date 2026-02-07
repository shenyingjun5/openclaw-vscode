#!/bin/bash
# 快速验证多语言支持

echo "🔍 检查翻译文件..."
ls -lh package.nls*.json

echo ""
echo "📦 检查 VSIX 包内容..."
unzip -l openclaw-0.2.2.vsix | grep -E "package\.nls"

echo ""
echo "✅ 验证 package.json 占位符..."
grep -c "%.*%" package.json && echo "   找到 $(grep -c '%.*%' package.json) 个翻译占位符"

echo ""
echo "🌍 翻译键统计..."
echo "   英文翻译键: $(jq 'keys | length' package.nls.json)"
echo "   中文翻译键: $(jq 'keys | length' package.nls.zh-cn.json)"

echo ""
echo "🎯 快速测试命令:"
echo "   英文界面: code --locale=en"
echo "   中文界面: code --locale=zh-cn"

echo ""
echo "📝 安装测试:"
echo "   code --install-extension openclaw-0.2.2.vsix --force"

echo ""
echo "✨ 完成！"
