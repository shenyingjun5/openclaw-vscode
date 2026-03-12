# Release v0.2.23

发布日期 / Release Date: 2026-03-12

## 🎯 本次更新 / Highlights

本次版本聚焦 **多网关（multi-profile）场景的一致性与安全性**。
This release focuses on **consistency and safety in multi-gateway (multi-profile) environments**.

---

## ✅ 变更 / Changes

### 1) Agent 列表加载链路升级
- 优先使用 Gateway RPC `agents.list`
- RPC 失败时，按当前 `gatewayUrl` 端口匹配 profile 配置文件读取 agents
- 最后才回退文件系统扫描（共享目录场景）

### 1) Improved agent loading strategy
- Prefer Gateway RPC `agents.list`
- If RPC fails, load agents from profile config matched by current `gatewayUrl` port
- Use filesystem scan only as final fallback

### 2) CLI 兜底自动注入 profile
- 多 profile 场景下，CLI fallback 命令自动追加 `--profile <name>`
- 重连后会重置 profile 缓存并重新匹配，避免串实例

### 2) Profile-aware CLI fallback
- Automatically append `--profile <name>` to CLI fallback commands in multi-profile setups
- Profile cache resets and re-resolves on reconnect to avoid cross-instance operations

---

## 🐛 修复 / Fixes

- Agent 创建在 CLI 兜底路径下，现可准确落到当前网关对应 profile
- Fixed agent creation fallback to correctly target the active profile instance

---

## 📦 安装 / Installation

### VSIX
```bash
code --install-extension openclaw-0.2.23.vsix
```

### Open VSX
https://open-vsx.org/extension/shenyingjun5/openclaw

### GitHub Release
https://github.com/shenyingjun5/openclaw-vscode/releases/tag/v0.2.23
