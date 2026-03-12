# Release v0.2.22

发布日期 / Release Date: 2026-03-12

## 🎯 本次更新 / Highlights

本次版本聚焦在 **连接稳定性** 与 **重连恢复能力**。
This release focuses on **connection stability** and **reconnect recovery**.

---

## ✅ 修复 / Fixes

### 1) 断线重连后发送卡死
- 重连前主动重置发送状态（`_isSending`、`_chatRunId`、事件监听器）
- 避免 UI 长时间停留在“发送中”

### 1) Stuck sending state after reconnect
- Reset sending states (`_isSending`, `_chatRunId`, event listeners) before reconnect
- Prevent UI from staying in "sending" state forever

### 2) 连接关闭时状态通知缺失
- WebSocket 关闭时向 chat 处理器主动派发 error 状态
- 业务层可立即执行恢复流程

### 2) Missing state propagation on disconnect
- Emit error state to chat handlers when WebSocket closes
- Allow upper layer to recover immediately

---

## 🔧 行为调整 / Behavior Changes

### 模型切换优化 / Model switch optimization
- 切换模型后不再重复发送上下文 setup
- 减少不必要 RPC 请求，降低状态抖动

- Stop sending redundant context setup after model switch
- Reduce unnecessary RPC calls and state jitter

---

## 📦 安装 / Installation

### VSIX
```bash
code --install-extension openclaw-0.2.22.vsix
```

### Open VSX
https://open-vsx.org/extension/shenyingjun5/openclaw

### GitHub
https://github.com/shenyingjun5/openclaw-vscode/releases/tag/v0.2.22
