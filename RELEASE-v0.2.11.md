# Release v0.2.11

## 🐛 Bug Fixes

### Dialog Mode Permission Fix

This release fixes a critical issue where the Dialog Mode (Webview Chat) failed with a "missing scope: operator.write" error when using Gateway Token authentication.

**What was fixed:**
- ✅ Added missing `operator.read` and `operator.write` scopes to WebSocket handshake
- ✅ Corrected `client.id` from `gateway-client` to `openclaw-control-ui`
- ✅ Added Origin header to WebSocket connection for proper CORS handling

**Impact:**
- Dialog Mode now works correctly with both Gateway Token and Device Token
- No more "Permission error - missing scope: operator.write" popup
- No more infinite "thinking/loading" state

**Fixes:** [#1](https://github.com/shenyingjun5/openclaw-vscode/issues/1)

---

## 🐛 Bug 修复

### Dialog Mode 权限修复

此版本修复了一个关键问题：使用 Gateway Token 认证时，Dialog Mode（Webview 聊天）会因 "missing scope: operator.write" 错误而失败。

**修复内容：**
- ✅ 在 WebSocket 握手时添加缺失的 `operator.read` 和 `operator.write` scope
- ✅ 将 `client.id` 从 `gateway-client` 修正为 `openclaw-control-ui`
- ✅ 为 WebSocket 连接添加 Origin header，正确处理 CORS

**影响：**
- Dialog Mode 现在可以正确使用 Gateway Token 和 Device Token
- 不再出现 "Permission error - missing scope: operator.write" 弹窗
- 不再出现无限 "thinking/loading" 状态

**修复问题：** [#1](https://github.com/shenyingjun5/openclaw-vscode/issues/1)

---

## Installation / 安装

### VS Code Marketplace
```
ext install shenyingjun5.openclaw
```

### Open VSX
```
https://open-vsx.org/extension/shenyingjun5/openclaw
```

### Manual Installation / 手动安装
Download the `.vsix` file from this release and install via:
从此版本下载 `.vsix` 文件，通过以下方式安装：
```
code --install-extension openclaw-0.2.11.vsix
```

---

## Requirements / 要求

- OpenClaw Server 2026.2.21 or later / OpenClaw 服务器 2026.2.21 或更高版本
- VS Code 1.85.0 or later / VS Code 1.85.0 或更高版本
