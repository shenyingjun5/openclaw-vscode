# OpenClaw VSCode Extension v0.2.21

**发布日期 / Release Date**: 2026-03-11

## ✨ 主要更新 / Key Updates

### 🔗 项目会话绑定 / Project Session Binding

这是本次更新的核心功能，实现了会话历史与项目的强绑定：

This is the core feature of this release, implementing strong binding between session history and projects:

#### 1. 项目路径哈希 / Project Path Hashing
- **中文**：使用项目路径的 MD5 哈希（前 8 位）作为稳定标识符
- **English**: Use MD5 hash (first 8 chars) of project path as stable identifier
- **示例 / Example**: `/Users/user/project` → `a1b2c3d4`

#### 2. 独立会话历史 / Independent Session History
- **中文**：每个项目拥有独立的会话历史，不同项目的对话不会混在一起
- **English**: Each project has its own session history, conversations from different projects won't mix
- **效果 / Effect**: 
  - 项目 A 的对话历史 → `agent:main:vm-a1b2c3d4`
  - 项目 B 的对话历史 → `agent:main:vm-e5f6g7h8`

#### 3. 会话持久化 / Session Persistence
- **中文**：关闭 VSCode 后重新打开同一项目，会话历史自动恢复
- **English**: Session history auto-restores when reopening the same project after closing VSCode
- **场景 / Scenario**:
  1. 在项目 A 中与 AI 对话
  2. 关闭 VSCode
  3. 重新打开项目 A
  4. 之前的对话历史自动恢复 ✅

#### 4. 自动切换 / Auto-Switch
- **中文**：切换项目时，会话历史自动切换到对应项目
- **English**: Session history auto-switches when changing projects
- **场景 / Scenario**:
  1. 在项目 A 中对话
  2. 切换到项目 B
  3. 会话历史自动切换到项目 B 的历史
  4. 切换回项目 A，历史恢复到项目 A

#### 5. 无项目降级 / No-Project Fallback
- **中文**：未打开项目时，使用 machineId 作为标识符
- **English**: Use machineId as identifier when no project is open
- **场景 / Scenario**: 打开单个文件（非项目）时，使用机器 ID 作为会话标识

## 🔧 技术细节 / Technical Details

### SessionKey 格式变化 / SessionKey Format Changes

#### 侧边栏 / Sidebar
- **旧格式 / Old**: `agent:main:vscode-main-${windowId}`
- **新格式 / New**: `agent:main:vm-${stableId}`
- **说明 / Note**: `vm` = vscode-main, `stableId` = 项目路径哈希或 machineId

#### 面板 / Panel
- **旧格式 / Old**: `agent:main:vscode-panel-${windowId}-${panelId}`
- **新格式 / New**: `agent:main:vp-${stableId}-${panelId}`
- **说明 / Note**: `vp` = vscode-panel

### Client ID 格式变化 / Client ID Format Changes

#### 侧边栏 / Sidebar
- **旧格式 / Old**: `vscode-main-${windowId}`
- **新格式 / New**: `vm-${stableId}`

#### 面板 / Panel
- **旧格式 / Old**: `vscode-panel-${windowId}-${panelId}`
- **新格式 / New**: `vp-${stableId}-${panelId}`

### 稳定标识符生成 / Stable Identifier Generation

```typescript
const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
const stableId = workspacePath
    ? crypto.createHash('md5').update(workspacePath).digest('hex').slice(0, 8)
    : vscode.env.machineId.slice(0, 8);
```

## 📦 安装说明 / Installation

### 方式 1：从 VSIX 安装 / Install from VSIX (Recommended)

1. 下载 / Download `openclaw-0.2.21.vsix`
2. 在 VSCode 中打开扩展面板 / Open Extensions panel in VSCode
3. 点击 `...` 菜单 / Click `...` menu
4. 选择 "从 VSIX 安装..." / Select "Install from VSIX..."
5. 选择下载的文件 / Select downloaded file

### 方式 2：从 OpenVSX 安装 / Install from OpenVSX

```bash
code --install-extension shenyingjun5.openclaw
```

### 方式 3：从 GitHub 安装 / Install from GitHub

```bash
# 下载最新版本 / Download latest version
wget https://github.com/shenyingjun5/openclaw-vscode/releases/download/v0.2.21/openclaw-0.2.21.vsix

# 安装 / Install
code --install-extension openclaw-0.2.21.vsix
```

## 🎯 使用说明 / Usage Guide

### 项目会话绑定示例 / Project Session Binding Example

#### 场景 1：多项目开发 / Scenario 1: Multi-Project Development

```
项目 A (~/work/project-a)
  ├── 会话历史: agent:main:vm-a1b2c3d4
  └── 对话内容: 关于项目 A 的讨论

项目 B (~/work/project-b)
  ├── 会话历史: agent:main:vm-e5f6g7h8
  └── 对话内容: 关于项目 B 的讨论
```

**中文说明**：
- 在项目 A 中与 AI 讨论项目 A 的问题
- 切换到项目 B，会话历史自动切换
- 在项目 B 中与 AI 讨论项目 B 的问题
- 切换回项目 A，之前的对话历史恢复

**English**:
- Discuss project A issues with AI in project A
- Switch to project B, session history auto-switches
- Discuss project B issues with AI in project B
- Switch back to project A, previous conversation history restores

#### 场景 2：会话持久化 / Scenario 2: Session Persistence

**中文说明**：
1. 在项目中与 AI 对话
2. 关闭 VSCode
3. 第二天重新打开项目
4. 昨天的对话历史自动恢复 ✅

**English**:
1. Chat with AI in project
2. Close VSCode
3. Reopen project next day
4. Yesterday's conversation history auto-restores ✅

## 🔄 迁移说明 / Migration Notes

### 旧会话数据 / Old Session Data

**中文**：
- 升级到 v0.2.21 后，旧的会话数据（基于 windowId）不会自动迁移
- 新的会话将使用项目路径哈希作为标识符
- 旧的会话数据仍然保留在 Gateway 上，可以手动访问

**English**:
- After upgrading to v0.2.21, old session data (based on windowId) won't auto-migrate
- New sessions will use project path hash as identifier
- Old session data is still preserved on Gateway and can be accessed manually

## 🐛 已知问题 / Known Issues

**中文**：
- 如果项目路径包含特殊字符，哈希计算可能受影响（已测试常见场景，无问题）
- 多根工作区（Multi-root workspace）只使用第一个根目录的路径

**English**:
- If project path contains special characters, hash calculation might be affected (tested common scenarios, no issues)
- Multi-root workspace only uses the first root directory's path

## 📊 性能数据 / Performance Metrics

- **VSIX 大小 / VSIX Size**: ~510 KB
- **哈希计算时间 / Hash Calculation Time**: < 1ms
- **会话切换时间 / Session Switch Time**: < 50ms

## 🔗 相关链接 / Related Links

- [GitHub Repository](https://github.com/shenyingjun5/openclaw-vscode)
- [OpenVSX Marketplace](https://open-vsx.org/extension/shenyingjun5/openclaw)
- [问题反馈 / Issue Tracker](https://github.com/shenyingjun5/openclaw-vscode/issues)

## 🎉 下一步计划 / Roadmap

- v0.2.22: Agent 更新和删除功能 / Agent update and delete features
- v0.2.23: Agent 模型配置 / Agent model configuration
- v0.2.24: Agent 导入导出功能 / Agent import/export features

## 🙏 致谢 / Acknowledgments

**中文**：感谢社区用户的反馈和建议，帮助我们不断改进 OpenClaw VSCode Extension！

**English**: Thanks to community users for feedback and suggestions, helping us continuously improve OpenClaw VSCode Extension!

---

**升级建议 / Upgrade Recommendation**: 
- **中文**：如果你在多个项目之间切换工作，强烈建议升级到此版本。
- **English**: If you work across multiple projects, strongly recommend upgrading to this version.
