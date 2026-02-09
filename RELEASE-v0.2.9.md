# OpenClaw VSCode Extension v0.2.9

## 🔄 chatRunId 竞态修复 / Chat Race Condition Fix

- 发送前设置 chatRunId + 监听器，再发 RPC / Set chatRunId before RPC to eliminate race condition
- idempotencyKey 在 controller 层生成 / Generate idempotencyKey in controller layer

## 🔌 chat 事件监听器可靠性 / Chat Event Listener Reliability

- 新增 `_pendingChatHandlers` 缓存机制 / New handler caching mechanism
- wsClient 重连后自动恢复监听器 / Auto-reattach listeners after reconnect

## 🚨 错误分类增强 / Enhanced Error Classification

- 新增认证失败 (401/Unauthorized) / New auth failure detection
- 新增余额不足 (quota/billing) / New billing detection
- Token 超限匹配对齐 Gateway 实际格式 (context_length) / Token limit matching aligned with Gateway format
- 限流匹配增强 (429/rate_limit) / Rate limit detection enhanced
- 模型不可用增强 (model_not_found) / Model unavailable detection enhanced

## 📦 安装 / Install

```bash
# 从 GitHub Release 下载 / Download from GitHub Release
# 或从 Open VSX 搜索 "OpenClaw" / Or search "OpenClaw" on Open VSX
```
