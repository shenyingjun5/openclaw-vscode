# OpenClaw VS Code Extension

AI coding assistant for VS Code, powered by OpenClaw.

## Features

- 💬 **Chat with AI** - Sidebar and popup panel chat interface
- 🔄 **Diff Preview & Apply** - Visual preview and apply code changes
- 🎯 **Session-level Model Switching** - Per-session model override, multi-window independent
- 🔌 **Real-time Connection Status** - Live WebSocket connection indicator
- 📨 **Message Queue** - Send messages while AI is responding, auto-queued
- 🔧 **Tool Call Display** - Real-time tool invocation feedback via auto-refresh polling
- 💡 **Friendly Error Messages** - Smart error classification with actionable suggestions
- 🎯 **Skills & Workflows** - Auto-detect and use project skills
- 📎 **File & Image Attachments** - Attach code files and images to your messages
- 🖼️ **Image Paste** - Paste images directly from clipboard
- 🔄 **Multi-window Support** - Up to 5 parallel chat sessions with independent history
- 🌍 **Multi-language** - Full i18n for UI and AI responses (zh-CN, en, ja, ko)
- 🪟 **Windows Support** - Enhanced Windows compatibility (95% coverage)

## What's New in v0.2.5

### 🧠 Thinking Depth Control

Fine-tune AI reasoning depth per session:

- **Think selector** — New dropdown in the bottom toolbar: off/minimal/low/medium/high/xhigh
- **Per-session** — Each chat session remembers its own thinking level
- **Model-aware** — Resets to medium when switching models; xhigh only shown for supported models
- **Bilingual** — Labels auto-switch between Chinese and English

### 🪟 Windows WSL Support

Use OpenClaw installed in WSL directly from Windows VS Code:

- **Zero config** — Default `localhost:18789` auto-maps to WSL
- **Setup guide** — Just bind Gateway to `0.0.0.0` in WSL, and you're done

### 🏗️ Chat State Machine Overhaul (Aligned with Webchat)

Completely rearchitected the message sending and reply tracking to match OpenClaw's official webchat implementation. This fixes premature completion issues where the AI appeared to finish while still processing.

- **Fire-and-forget messaging** — `chat.send` RPC returns immediately, no longer blocks waiting for AI reply
- **RunId-based tracking** — Each message gets a unique `runId` (idempotencyKey); the send button stays disabled until the matching `chat final` event arrives via WebSocket
- **Event-driven completion** — Reply completion is determined by Gateway's `chat` event (state=final/error/aborted), not by Promise resolution
- **Robust busy state** — `isBusy = isSending || !!chatRunId`, matching webchat's `Qr` function exactly

### 🔄 Smart Auto-Refresh

Rebuilt the auto-refresh system for reliability during AI tool calls:

- **`setInterval`-based** — Fixed 2-second interval, no chain-breaking issues
- **Only during AI reply** — Auto-refresh activates when `chatRunId` is set (waiting for AI), stops when reply completes
- **Crash-proof history loading** — `_loadHistory` wrapped in try-catch so a single failure can't permanently disable auto-refresh
- **No flicker** — Content fingerprint (`lastHistoryHash`) skips DOM rebuild when history hasn't changed

### 🔧 Context Setup No Longer Blocks

Fixed a critical bug where `sendContextSetup` (language/workspace setup) could block all subsequent messages for up to 10 minutes:

- **Root cause** — `sendMessage()` awaited the AI reply to a "[No reply needed]" message; Gateway never sent `final` → 600s timeout
- **Fix** — Context setup now uses fire-and-forget (`sendRpc('chat.send')`) with `deliver: false`

### 📋 Independent Session History

- Each VSCode window's `sessionKey` is prefixed with `agent:main:` to match Gateway's internal key format
- Fixes issue where all windows shared the same chat history

## What's New in v0.2.0

### 🎉 Diff Preview & Apply

AI can return structured file changes that you preview and apply visually:

```
┌────────────────────────────────────────────────────┐
│ 📁 File Changes                     3 files         │
├────────────────────────────────────────────────────┤
│ 📝 src/Header.tsx (Modify)             ✓    ✗      │
│ ➕ src/utils.ts (Create)               ✓    ✗      │
│ 🗑️ src/old.js (Delete)                 ✓    ✗      │
├────────────────────────────────────────────────────┤
│               [ Accept All ]  [ Reject All ]        │
└────────────────────────────────────────────────────┘
```

- Click filename → Preview diff in VS Code native view
- ✓ / ✗ → Apply or skip individual files
- Batch accept/reject all
- Auto-accept pending changes when sending new message

### 🌍 Multi-language AI Output

**Setting:** `openclaw.aiOutputLanguage`
- `auto` - Follow system language (default)
- `zh-CN` / `en` / `ja` / `ko`

## Installation

### From GitHub Releases (Recommended)

1. Download the latest `.vsix` from [Releases](https://github.com/shenyingjun5/openclaw-vscode/releases)
2. Open VS Code
3. Press `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
4. Select the downloaded file

### From Open VSX

1. Open VS Code / VSCodium
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "OpenClaw"
4. Click Install

## Requirements

- [OpenClaw](https://github.com/openclaw/openclaw) must be installed and running
- Gateway should be accessible at `http://localhost:18789` (default)

### Windows Users

If you encounter "Cannot find openclaw" error:

1. Find your OpenClaw path:
   ```cmd
   where openclaw
   ```

2. Configure in VS Code Settings (`Ctrl+,`):
   - Search for "OpenClaw: Openclaw Path"
   - Enter the path, e.g.:
     - npm: `C:\Users\YourName\AppData\Roaming\npm\openclaw.cmd`
     - scoop: `C:\Users\YourName\scoop\shims\openclaw.cmd`
     - chocolatey: `C:\ProgramData\chocolatey\bin\openclaw.exe`

### Using OpenClaw in WSL (Windows Subsystem for Linux)

If you installed OpenClaw inside WSL, you need to make Gateway accessible from Windows:

#### Step 1: Configure Gateway to bind to all interfaces

In WSL, modify Gateway to listen on `0.0.0.0` instead of `127.0.0.1`:

```bash
# Stop current Gateway
openclaw gateway stop

# Edit Gateway config
nano ~/.openclaw/openclaw.json
```

Find the `gateway` section and change the host:

```json
{
  "gateway": {
    "host": "0.0.0.0",
    "port": 18789
  }
}
```

Or start Gateway with command-line flag:

```bash
openclaw gateway start --host 0.0.0.0
```

#### Step 2: Use the extension in Windows

The extension is **pre-configured** to work with WSL out-of-the-box:
- Default Gateway URL: `http://localhost:18789` (automatically maps to WSL)
- No additional configuration needed in Windows VS Code
- WebSocket connection works seamlessly

**How it works:**
- Windows `localhost` is automatically forwarded to WSL's `127.0.0.1` by WSL 2 networking
- The extension connects to `http://localhost:18789` which reaches your WSL Gateway

That's it! Open VS Code in Windows, install the extension, and start chatting.

## Usage

### Sidebar Chat
Click the OpenClaw icon in the activity bar to open the chat sidebar.

### Popup Panel
Run command "OpenClaw: Open Chat Panel" or click the 🦞 button in the status bar. You can open up to 5 panels simultaneously.

### Model Switching

Click the model selector in the chat toolbar to switch models per-session:
- Each session remembers its model choice independently
- Use "default" to reset to the global default model
- Configure `openclaw.defaultModel` in settings for new sessions

### Project Skills & Workflows

#### Skills
Skills are auto-detected from any `skills/` folder in your workspace.

```
project/
├── skills/
│   ├── debug/
│   │   └── skill.md
│   └── refactor/
│       └── skill.md
```

**Usage:**
- Type a trigger keyword: "help me debug this code"
- Or use slash command: `/debug`
- Or run `/skills` to list all available skills

#### Workflows
Workflows are auto-detected from `workflows/` folder.

```
project/
└── workflows/
    ├── .cursorrules
    └── code-review.md
```

**Usage:**
- Use slash prefix: `/.cursorrules what should I do?`
- Or run `/workflow` to list all workflows

### Slash Commands

| Command | Description |
|---------|-------------|
| `/init` | Initialize project (scan skills/workflows) |
| `/skills` | List all detected skills |
| `/workflow` | List all workflows |
| `/clear` | Clear chat history |
| `/<skill>` | Force use a specific skill |
| `/.<workflow>` | Inject a workflow |

### File Reference

Type `@` in the input box to open file picker:
- Search by filename
- Drag & drop files
- Paste images from clipboard

### Plan Mode vs Execute Mode
- **Execute Mode** (default): AI can call tools and make changes
- **Plan Mode**: AI outputs a plan only, waits for confirmation

Toggle in the bottom toolbar.

### Keyboard Shortcuts
- `Enter` - Send message
- `Shift+Enter` - New line
- `@` in input - Open file picker

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for "OpenClaw":

| Setting | Default | Description |
|---------|---------|-------------|
| `openclaw.gatewayUrl` | `http://localhost:18789` | Gateway URL |
| `openclaw.gatewayToken` | | Gateway authentication token |
| `openclaw.openclawPath` | (auto-detect) | Path to openclaw binary |
| `openclaw.defaultSession` | `main` | Default session ID |
| `openclaw.defaultModel` | | Default model for new sessions |
| `openclaw.planMode` | `false` | Default to Plan Mode |
| `openclaw.aiOutputLanguage` | `auto` | AI response language |
| `openclaw.autoRefreshInterval` | `2000` | Auto-refresh interval (ms, 0 to disable) |
| `openclaw.enableCliFallback` | `true` | Enable CLI fallback when WebSocket fails |

## Development

```bash
# Clone and install
git clone https://github.com/shenyingjun5/openclaw-vscode
cd openclaw-vscode
npm install

# Compile
npm run compile

# Watch mode
npm run watch

# Package
npx @vscode/vsce package
```

## Troubleshooting

### Connection Failed

**Symptom**: Red dot in title bar, "连接失败"

**Solution**:
1. Ensure OpenClaw is installed: `openclaw --version`
2. Check Gateway is running: `openclaw gateway status`
3. On Windows, configure the binary path in VS Code settings
4. Verify Gateway URL matches your config

### Skills Not Detected

1. Ensure you have a `skills/` folder in your workspace
2. Run `/init` command to force re-scan
3. Check skill.md format (YAML frontmatter required)

### Model Switch Not Working

- The extension uses `/model` command via WebSocket (most reliable)
- If WebSocket fails, CLI fallback is used automatically
- Check `openclaw.enableCliFallback` is enabled (default: true)

## Roadmap

- [x] Gateway WebSocket API support
- [x] Streaming output UI
- [x] Multi-session management
- [x] Publish to Open VSX
- [ ] Custom keybindings
- [ ] Inline diff editing
- [ ] Voice input support

## Contributing

Contributions are welcome! Please open an issue or PR.

## License

MIT

---

# OpenClaw VS Code 插件

VS Code 的 AI 编程助手，由 OpenClaw 驱动。

## 功能特性

- 💬 **与 AI 对话** - 侧边栏和弹出面板聊天界面
- 🔄 **变更预览与应用** - 可视化预览和应用代码变更
- 🎯 **会话级模型切换** - 每个会话独立模型，多窗口互不干扰
- 🔌 **实时连接状态** - WebSocket 连接状态指示器
- 📨 **消息队列** - AI 回复时可继续发送，自动排队
- 🔧 **工具调用展示** - 通过自动刷新轮询实时展示工具调用
- 💡 **友好错误提示** - 智能分类错误并提供解决建议
- 🎯 **技能与工作流集成** - 自动检测并使用项目技能
- 📎 **文件和图片附件** - 附加代码文件和图片
- 🖼️ **图片粘贴** - 从剪贴板直接粘贴图片
- 🔄 **多窗口支持** - 最多 5 个并行聊天会话，各自独立历史
- 🌍 **多语言** - 界面和 AI 输出完整国际化（zh-CN、en、ja、ko）
- 🪟 **Windows 支持** - 95% 平台兼容性

## v0.2.5 新特性

### 🧠 思考深度控制

按会话调节 AI 推理深度：

- **Think 选择器** — 底部工具栏新增下拉框：off/minimal/low/medium/high/xhigh
- **会话级控制** — 每个聊天会话独立记忆思考深度
- **模型联动** — 切换模型后自动重置为 medium；xhigh 仅在支持的模型上显示
- **双语标签** — 根据 VS Code 语言自动切换中英文

### 🪟 Windows WSL 支持

在 WSL 中安装 OpenClaw，Windows VS Code 直接使用：

- **零配置** — 默认 `localhost:18789` 自动映射到 WSL
- **配置引导** — 只需在 WSL 中将 Gateway 绑定到 `0.0.0.0` 即可

### 🏗️ 聊天状态机重构（对齐 Webchat）

完全重构消息发送和回复追踪逻辑，对齐 OpenClaw 官方 webchat 实现。修复了 AI 实际仍在处理但界面显示已完成的过早结束问题。

- **Fire-and-forget 发送** — `chat.send` RPC 立即返回，不再阻塞等待 AI 回复
- **RunId 追踪** — 每条消息生成唯一 `runId`（idempotencyKey），发送按钮保持禁用直到收到匹配的 `chat final` 事件
- **事件驱动完成** — 回复完成由 Gateway 的 `chat` 事件（state=final/error/aborted）决定，而非 Promise 解析
- **稳健的忙碌状态** — `isBusy = isSending || !!chatRunId`，完全对齐 webchat 的 `Qr` 函数

### 🔄 智能自动刷新

重建自动刷新系统，确保 AI 工具调用期间的可靠性：

- **基于 `setInterval`** — 固定 2 秒间隔，不会出现链条断裂问题
- **仅在等待回复时刷新** — `chatRunId` 非空时启动自动刷新，回复完成后停止
- **历史加载防崩溃** — `_loadHistory` 包裹 try-catch，单次失败不会永久禁用自动刷新
- **无闪烁** — 内容指纹（`lastHistoryHash`）在历史未变化时跳过 DOM 重建

### 🔧 上下文设置不再阻塞

修复了一个关键 Bug：`sendContextSetup`（语言/工作区设置）可能阻塞后续所有消息长达 10 分钟：

- **根本原因** — `sendMessage()` 等待 AI 回复 "[No reply needed]" 消息，Gateway 不发 `final` → 600 秒超时
- **修复方案** — 上下文设置改用 fire-and-forget（`sendRpc('chat.send')`），加 `deliver: false`

### 📋 独立会话历史

- 每个 VSCode 窗口的 `sessionKey` 加上 `agent:main:` 前缀，匹配 Gateway 内部 key 格式
- 修复了所有窗口共享同一聊天历史的问题

## v0.2.0 新特性

### 🎉 变更预览与应用

AI 可以返回结构化的文件变更，支持可视化预览和应用：

```
┌────────────────────────────────────────────────────┐
│ 📁 File Changes                     3 files         │
├────────────────────────────────────────────────────┤
│ 📝 src/Header.tsx (Modify)             ✓    ✗      │
│ ➕ src/utils.ts (Create)               ✓    ✗      │
│ 🗑️ src/old.js (Delete)                 ✓    ✗      │
├────────────────────────────────────────────────────┤
│               [ Accept All ]  [ Reject All ]        │
└────────────────────────────────────────────────────┘
```

- 点击文件名 → 在 VS Code 原生 Diff 视图中预览
- ✓ / ✗ → 应用或跳过单个文件
- 批量接受/拒绝所有变更
- 发送新消息时自动接受待处理变更

### 🌍 多语言 AI 输出

**设置项：** `openclaw.aiOutputLanguage`
- `auto` - 跟随系统语言（默认）
- `zh-CN` / `en` / `ja` / `ko`

## 安装

### 从 GitHub Releases 安装（推荐）

1. 从 [Releases](https://github.com/shenyingjun5/openclaw-vscode/releases) 下载最新的 `.vsix`
2. 打开 VS Code
3. 按 `Ctrl+Shift+P` → "Extensions: Install from VSIX..."
4. 选择下载的文件

### 从 Open VSX 安装

1. 打开 VS Code / VSCodium
2. 进入扩展 (`Ctrl+Shift+X`)
3. 搜索 "OpenClaw"
4. 点击安装

## 前置要求

- 必须安装并运行 [OpenClaw](https://github.com/openclaw/openclaw)
- Gateway 需要在 `http://localhost:18789` 可访问（默认）

### Windows 用户

如遇 "Cannot find openclaw" 错误：

1. 查找 OpenClaw 路径：
   ```cmd
   where openclaw
   ```

2. 在 VS Code 设置中配置 (`Ctrl+,`)：
   - 搜索 "OpenClaw: Openclaw Path"
   - 输入路径，例如：
     - npm: `C:\Users\YourName\AppData\Roaming\npm\openclaw.cmd`
     - scoop: `C:\Users\YourName\scoop\shims\openclaw.cmd`
     - chocolatey: `C:\ProgramData\chocolatey\bin\openclaw.exe`

### 在 WSL（Windows Linux 子系统）中使用 OpenClaw

如果您在 WSL 中安装了 OpenClaw，需要让 Gateway 能从 Windows 访问：

#### 步骤 1：配置 Gateway 绑定所有接口

在 WSL 中，修改 Gateway 监听 `0.0.0.0` 而非 `127.0.0.1`：

```bash
# 停止当前 Gateway
openclaw gateway stop

# 编辑 Gateway 配置
nano ~/.openclaw/openclaw.json
```

找到 `gateway` 部分，修改 host：

```json
{
  "gateway": {
    "host": "0.0.0.0",
    "port": 18789
  }
}
```

或使用命令行参数启动：

```bash
openclaw gateway start --host 0.0.0.0
```

#### 步骤 2：在 Windows 中使用插件

插件已**预配置**开箱即用 WSL：
- 默认 Gateway URL：`http://localhost:18789`（自动映射到 WSL）
- Windows VS Code 中无需额外配置
- WebSocket 连接自动工作

**工作原理：**
- Windows 的 `localhost` 会通过 WSL 2 网络桥接自动转发到 WSL 的 `127.0.0.1`
- 插件连接到 `http://localhost:18789` 即可访问 WSL 内的 Gateway

完成！在 Windows 中打开 VS Code，安装插件，即可开始对话。

## 使用方法

### 侧边栏聊天
点击活动栏中的 OpenClaw 图标打开聊天侧边栏。

### 弹出面板
运行命令 "OpenClaw: Open Chat Panel" 或点击状态栏中的 🦞 按钮。可以同时打开最多 5 个面板。

### 模型切换

点击聊天工具栏中的模型选择器，按会话切换模型：
- 每个会话独立记忆模型选择
- 选择 "default" 恢复全局默认模型
- 在设置中配置 `openclaw.defaultModel` 设定新会话默认模型

### 项目技能与工作流

#### 技能
技能会从工作区中的任意 `skills/` 文件夹自动检测。

```
project/
├── skills/
│   ├── debug/
│   │   └── skill.md
│   └── refactor/
│       └── skill.md
```

**使用方式：**
- 输入触发关键词："help me debug this code"
- 或使用斜杠命令：`/debug`
- 或运行 `/skills` 列出所有可用技能

#### 工作流
工作流从 `workflows/` 文件夹自动检测。

```
project/
└── workflows/
    ├── .cursorrules
    └── code-review.md
```

**使用方式：**
- 使用斜杠前缀：`/.cursorrules what should I do?`
- 或运行 `/workflow` 列出所有工作流

### 斜杠命令

| 命令 | 描述 |
|------|------|
| `/init` | 初始化项目（扫描技能/工作流） |
| `/skills` | 列出所有检测到的技能 |
| `/workflow` | 列出所有工作流 |
| `/clear` | 清空聊天历史 |
| `/<技能名>` | 强制使用特定技能 |
| `/.<工作流>` | 注入工作流 |

### 文件引用

在输入框中输入 `@` 打开文件选择器：
- 按文件名搜索
- 拖放文件
- 从剪贴板粘贴图片

### 计划模式 vs 执行模式
- **执行模式**（默认）：AI 可以调用工具并进行更改
- **计划模式**：AI 只输出计划，等待确认后才执行

在底部工具栏中切换。

### 快捷键
- `Enter` - 发送消息
- `Shift+Enter` - 换行
- 输入 `@` - 打开文件选择器

## 配置

打开 VS Code 设置 (`Ctrl+,`) 搜索 "OpenClaw"：

| 设置项 | 默认值 | 描述 |
|--------|--------|------|
| `openclaw.gatewayUrl` | `http://localhost:18789` | Gateway 地址 |
| `openclaw.gatewayToken` | | Gateway 认证 Token |
| `openclaw.openclawPath` | (自动检测) | openclaw 二进制文件路径 |
| `openclaw.defaultSession` | `main` | 默认会话 ID |
| `openclaw.defaultModel` | | 新会话默认模型 |
| `openclaw.planMode` | `false` | 默认使用计划模式 |
| `openclaw.aiOutputLanguage` | `auto` | AI 输出语言 |
| `openclaw.autoRefreshInterval` | `2000` | 自动刷新间隔（ms，0 禁用） |
| `openclaw.enableCliFallback` | `true` | WebSocket 失败时启用 CLI 兜底 |

## 开发

```bash
# 克隆并安装
git clone https://github.com/shenyingjun5/openclaw-vscode
cd openclaw-vscode
npm install

# 编译
npm run compile

# 监视模式
npm run watch

# 打包
npx @vscode/vsce package
```

## 故障排查

### 连接失败

**症状**：顶栏红点，"连接失败"

**解决方案**：
1. 确保已安装 OpenClaw：`openclaw --version`
2. 检查 Gateway 是否运行：`openclaw gateway status`
3. Windows 用户需在 VS Code 设置中配置路径
4. 确认 Gateway URL 与配置一致

### 技能未检测到

1. 确保工作区中有 `skills/` 文件夹
2. 运行 `/init` 命令强制重新扫描
3. 检查 skill.md 格式（需要 YAML frontmatter）

### 模型切换不生效

- 扩展使用 WebSocket 发送 `/model` 命令（最可靠）
- WebSocket 失败时自动使用 CLI 兜底
- 检查 `openclaw.enableCliFallback` 是否启用（默认：true）

## 路线图

- [x] Gateway WebSocket API 支持
- [x] 流式输出 UI
- [x] 多会话管理
- [x] 发布到 Open VSX
- [ ] 自定义快捷键
- [ ] 内联 Diff 编辑
- [ ] 语音输入

## 贡献

欢迎贡献！请提交 Issue 或 PR。

## 许可证

MIT
