# OpenClaw VSCode Extension v0.2.8

## 📁 拖拽文件支持 / Drag & Drop File Support

- 全窗口拖放区域，可视化蒙层提示 / Full-window drop zone with visual overlay
- 支持 VSCode 文件树、编辑器标签页、系统文件管理器 / Supports file tree, editor tabs, OS file manager
- `text/uri-list` → `File.path` → `FileReader` 三级兜底 / Triple fallback for max compatibility

## 🔑 Gateway Token 设置 / Gateway Token Setting

- 新增 `openclaw.gatewayToken` 设置项 / New VS Code setting for token
- WSL 环境无需共享配置文件 / No config file sharing needed for WSL
- 修改 Token 或地址后自动重连 / Auto-reconnect on config change

## 🪟 WSL 连接修复 / WSL Connection Fix

- `localhost` 失败时自动回退 `127.0.0.1` / Auto-fallback from localhost to 127.0.0.1
- 解决 WSL 2 DNS 解析异常 / Fixes WSL 2 DNS resolution edge cases

## 🔌 连接状态 UI / Connection Status UI

- 可点击的绿灯/红灯，查看连接详情 / Clickable status indicator with details popup
- 智能错误分类（ECONNREFUSED、超时、认证等）/ Smart error classification
- 快捷操作：重连、打开设置 / Quick actions: reconnect, open settings
- 侧边栏新增关闭对话按钮 / New close chat button in sidebar

## 🔄 聊天可靠性增强 / Chat Reliability Improvements

- chatRunId 发送前设置，消除竞态条件 / Set chatRunId before RPC to eliminate race condition
- chat 事件监听器重连后自动恢复 / Chat event listeners auto-reattach after reconnect
- 错误分类增强：认证失败、余额不足、Token 超限等 / Enhanced error classification: auth, billing, token limit, etc.

## 📦 安装 / Install

```bash
# 从 GitHub Release 下载 / Download from GitHub Release
# 或从 Open VSX 搜索 "OpenClaw" / Or search "OpenClaw" on Open VSX
```
