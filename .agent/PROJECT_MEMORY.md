# openclaw-vscode - PROJECT_MEMORY

## 长期记忆（可跨会话复用）

### 项目目标
OpenClaw VS Code 扩展。AI 编程助手，连接 OpenClaw Gateway，提供聊天、Diff 预览、多窗口、文件/图片附件、技能自动检测等功能。

### 核心约束
- Gateway 默认地址：http://localhost:18789
- 最多 5 个并行聊天会话（多窗口独立）
- 发布到 Open VSX（非微软官方市场）
- vsix 文件在项目根目录（openclaw-0.2.10.vsix）

### 关键决策
- v0.2.10：链接渲染优化（Markdown auto-links + 纯文本 URL + 代码块保护）+ 重连状态反馈
- v0.2.9：chatRunId 竞态修复 + chat 事件监听器修复 + 错误分类增强
- v0.2.8：拖拽文件 + Gateway Token 设置 + 连接状态 UI
- 会话级模型切换，多窗口独立
- 消息队列：AI 响应中可继续发消息，自动排队

### 风险与坑点
- Windows/WSL 需要特殊兼容处理（auto-fallback）
- chatRunId 竞态：先设状态+监听器再发 RPC
- webview 外部链接必须通过系统浏览器打开（不能内部导航）

### 常用命令
```bash
# 开发
npm install && npm run compile
# 打包
vsce package
# 安装
code --install-extension openclaw-*.vsix
# 发布
npm run publish
```

## 最近更新
- 2026-02-10 v0.2.10：链接渲染 + 重连反馈
- 2026-02-09 v0.2.9：竞态修复
- 2026-02-09 v0.2.8：拖拽文件支持
- 2026-03-01 回填整理
