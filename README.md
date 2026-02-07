# OpenClaw VS Code Extension

AI coding assistant for VS Code, powered by OpenClaw.

## Features

- 💬 **Chat with AI** - Sidebar and popup panel chat interface
- 🔄 **Diff Preview & Apply** - Visual preview and apply code changes
- 🎯 **Session-level Model Switching** - Per-session model override, multi-window independent
- 🔌 **Real-time Connection Status** - Live WebSocket connection indicator
- 📨 **Message Queue** - Send messages while AI is responding, auto-queued
- 🔧 **Tool Call Display** - Real-time tool invocation feedback
- 💡 **Friendly Error Messages** - Smart error classification with actionable suggestions
- 🎯 **Skills & Workflows** - Auto-detect and use project skills
- 📎 **File & Image Attachments** - Attach code files and images to your messages
- 🖼️ **Image Paste** - Paste images directly from clipboard
- 🔄 **Multi-window Support** - Up to 5 parallel chat sessions
- 🌍 **Multi-language** - Full i18n for UI and AI responses (zh-CN, en, ja, ko)
- 🪟 **Windows Support** - Enhanced Windows compatibility (95% coverage)

## What's New in v0.2.2

### 🎯 Session-level Model Switching

Switch models per-session without affecting other windows or the global config.

- **Per-session override** - Each VS Code window can use a different model
- **Instant effect** - Switch takes effect immediately, no restart needed
- **Persistent** - Model selection saved in session store, survives restarts
- **Default model config** - Configure default model for new sessions in settings

### 🌐 Settings i18n

- All settings, commands, and descriptions support Chinese and English
- Auto-switches based on VS Code display language
- Uses official `package.nls.json` mechanism

### 📨 Message Queue System

- Send messages while AI is still responding — they queue automatically
- Visual queue display above input box
- Individual queue items can be removed
- Auto-processes next message when AI finishes

### 🔌 Connection Status Indicator

- Live connection state in title bar (🟢 connected / 🔴 disconnected / 🟡 connecting)
- WebSocket event-driven, zero-polling
- Pulse animation on disconnect

### 🔧 Tool Call Streaming

- Real-time display of tool invocations (exec, read, write, etc.)
- Click to expand full parameters
- Smart summary (command, path, etc.)

### 💡 Friendly Error Handling

- Errors appear as styled chat messages (info/warning/error/stop)
- 11 error types recognized (connection, token, model, auth, etc.)
- Actionable suggestions for each error type
- "Stopped" shows friendly message (auto-dismiss in 2s)

### 🔄 Auto Refresh

- Manual refresh with spin animation
- Configurable auto-refresh interval (default 1000ms, 0 to disable)
- Smart WebSocket reconnect on refresh

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
- Gateway should be accessible at `http://127.0.0.1:18789`

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
| `openclaw.gatewayUrl` | `http://127.0.0.1:18789` | Gateway URL |
| `openclaw.gatewayToken` | | Gateway authentication token |
| `openclaw.openclawPath` | (auto-detect) | Path to openclaw binary |
| `openclaw.defaultSession` | `main` | Default session ID |
| `openclaw.defaultModel` | | Default model for new sessions |
| `openclaw.planMode` | `false` | Default to Plan Mode |
| `openclaw.aiOutputLanguage` | `auto` | AI response language |
| `openclaw.autoRefreshInterval` | `1000` | Auto-refresh interval (ms, 0 to disable) |
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
- 🔧 **工具调用展示** - 实时工具调用反馈
- 💡 **友好错误提示** - 智能分类错误并提供解决建议
- 🎯 **技能与工作流集成** - 自动检测并使用项目技能
- 📎 **文件和图片附件** - 附加代码文件和图片
- 🖼️ **图片粘贴** - 从剪贴板直接粘贴图片
- 🔄 **多窗口支持** - 最多 5 个并行聊天会话
- 🌍 **多语言** - 界面和 AI 输出完整国际化（zh-CN、en、ja、ko）
- 🪟 **Windows 支持** - 95% 平台兼容性

## v0.2.2 新特性

### 🎯 会话级模型切换

按会话切换模型，不影响其他窗口或全局配置。

- **会话级覆盖** - 每个 VS Code 窗口可使用不同模型
- **即时生效** - 切换后立即使用新模型，无需重启
- **持久化** - 模型选择保存在会话存储中，重启后保持
- **默认模型配置** - 在设置中为新会话配置默认模型

### 🌐 设置界面国际化

- 所有设置项、命令、描述支持中英文
- 根据 VS Code 显示语言自动切换
- 使用官方 `package.nls.json` 机制

### 📨 消息队列系统

- AI 回复时可继续发送消息，自动排队处理
- 队列可视化显示在输入框上方
- 每个队列项可单独删除
- AI 完成后自动处理下一条

### 🔌 连接状态指示器

- 顶栏实时显示连接状态（🟢 已连接 / 🔴 未连接 / 🟡 连接中）
- WebSocket 事件驱动，零轮询
- 断线时脉冲动画提醒

### 🔧 工具调用流式显示

- AI 调用工具时实时显示（exec、read、write 等）
- 点击展开查看完整参数
- 智能摘要（命令、路径等关键信息）

### 💡 友好错误处理

- 错误作为带样式的聊天消息展示（信息/警告/错误/停止）
- 11 种错误类型智能识别（连接、Token、模型、权限等）
- 每种错误提供可操作的解决建议
- "已停止" 显示友好提示（2 秒自动消失）

### 🔄 自动刷新

- 手动刷新带旋转动画
- 可配置自动刷新间隔（默认 1000ms，0 禁用）
- 刷新时自动尝试重连 WebSocket

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
- Gateway 需要在 `http://127.0.0.1:18789` 可访问

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
| `openclaw.gatewayUrl` | `http://127.0.0.1:18789` | Gateway 地址 |
| `openclaw.gatewayToken` | | Gateway 认证 Token |
| `openclaw.openclawPath` | (自动检测) | openclaw 二进制文件路径 |
| `openclaw.defaultSession` | `main` | 默认会话 ID |
| `openclaw.defaultModel` | | 新会话默认模型 |
| `openclaw.planMode` | `false` | 默认使用计划模式 |
| `openclaw.aiOutputLanguage` | `auto` | AI 输出语言 |
| `openclaw.autoRefreshInterval` | `1000` | 自动刷新间隔（ms，0 禁用） |
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
