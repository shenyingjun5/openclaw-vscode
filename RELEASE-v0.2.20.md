# OpenClaw VSCode Extension v0.2.20

**发布日期**: 2026-03-11

## ✨ 主要更新

### 🔑 Token 读取优化

这是本次更新的核心改进，解决了多实例环境下的 token 读取问题：

#### 1. Profile 端口匹配
- 支持按端口匹配 profile 配置
- 自动扫描 `~/.openclaw/profiles/` 目录
- 根据 Gateway URL 端口匹配正确的配置文件
- 自动读取对应实例的 token

#### 2. 多实例支持
- 完美支持多个 OpenClaw Gateway 实例
- 每个实例使用独立的 profile 配置
- 自动识别并连接到正确的实例
- 避免 token 混用导致的认证失败

### 🧹 会话清理优化

#### 保留会话历史
- 关闭聊天面板时不再删除 Gateway 上的会话
- 避免意外丢失聊天历史
- 用户可以随时重新打开面板继续对话
- 提升用户体验，减少数据丢失风险

### 🆔 Client ID 优化

#### 唯一标识符
- 使用 `vscode-panel-${windowId}-${panelId}` 作为 client.id
- 确保每个面板有唯一标识
- 避免多个面板之间的冲突
- 提高 WebSocket 连接的稳定性

## 🔧 技术细节

### Token 读取策略（优先级）

1. **VSCode Settings** - 从扩展设置中读取
2. **Profile 端口匹配** - 扫描 profiles 目录，按端口匹配（新增）
3. **根配置文件** - 从 `~/.openclaw/openclaw.json` 读取
4. **YAML 配置** - 从 `~/.openclaw/config.yaml` 读取

### 多实例场景示例

```
~/.openclaw/profiles/
├── dev/
│   └── openclaw.json (port: 3777)
├── prod/
│   └── openclaw.json (port: 3778)
└── test/
    └── openclaw.json (port: 3779)
```

当连接到 `ws://localhost:3777` 时，自动读取 `dev/openclaw.json` 中的 token。

## 📦 安装说明

### 方式 1：从 VSIX 安装（推荐）

1. 下载 `openclaw-0.2.20.vsix`
2. 在 VSCode 中打开扩展面板
3. 点击 `...` 菜单
4. 选择 "从 VSIX 安装..."
5. 选择下载的文件

### 方式 2：从 OpenVSX 安装

```bash
code --install-extension shenyingjun5.openclaw
```

### 方式 3：从 GitHub 安装

```bash
# 下载最新版本
wget https://github.com/shenyingjun5/openclaw-vscode/releases/download/v0.2.20/openclaw-0.2.20.vsix

# 安装
code --install-extension openclaw-0.2.20.vsix
```

## 🎯 使用说明

### 多实例配置

如果你运行多个 OpenClaw Gateway 实例：

1. 确保每个实例使用独立的 profile：
   ```bash
   openclaw gateway start --profile dev --port 3777
   openclaw gateway start --profile prod --port 3778
   ```

2. 在 VSCode 设置中配置 Gateway URL：
   ```json
   {
     "openclaw.gatewayUrl": "ws://localhost:3777"
   }
   ```

3. 扩展会自动匹配端口并读取正确的 token

### 会话管理

- 关闭聊天面板不会删除会话
- 重新打开面板会恢复之前的对话
- 如需清空会话，使用 "清空对话" 按钮

## 🐛 Bug 修复

- 修复多实例环境下 token 读取错误的问题
- 修复关闭面板导致会话丢失的问题
- 修复 client.id 冲突导致的连接问题

## 📊 性能数据

- VSIX 大小：~500 KB
- Token 读取时间：< 50ms
- Profile 扫描时间：< 100ms

## 🔗 相关链接

- [GitHub Repository](https://github.com/shenyingjun5/openclaw-vscode)
- [OpenVSX Marketplace](https://open-vsx.org/extension/shenyingjun5/openclaw)
- [问题反馈](https://github.com/shenyingjun5/openclaw-vscode/issues)

## 🎉 下一步计划

- v0.2.21: Agent 更新和删除功能
- v0.2.22: Agent 模型配置
- v0.2.23: Agent 导入导出功能

## 🙏 致谢

感谢社区用户的反馈和建议，帮助我们不断改进 OpenClaw VSCode Extension！

---

**升级建议**: 如果你使用多个 OpenClaw Gateway 实例，强烈建议升级到此版本。
