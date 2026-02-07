# OpenClaw VS Code Extension

AI coding assistant for VS Code, powered by OpenClaw.

## Features

- 💬 **Chat with AI** - Sidebar and popup panel chat interface
- 🔄 **Diff Preview & Apply** - Visual preview and apply code changes (NEW in v0.2.0)
- 🎯 **Skills Integration** - Auto-detect and use project skills
- 📋 **Workflow Support** - Inject and execute project workflows
- 📋 **Plan Mode / Execute Mode** - Control when AI can execute actions
- 📎 **File & Image Attachments** - Attach code files and images to your messages
- 🖼️ **Image Paste** - Paste images directly from clipboard
- 🔄 **Multi-window Support** - Up to 5 parallel chat sessions
- 🌍 **Multi-language** - Auto-detect system language for UI and AI responses
- 🪟 **Windows Support** - Enhanced Windows compatibility (95% coverage)

## What's New in v0.2.0

### 🎉 Diff Preview & Apply Feature

AI can now return structured file changes that you can preview and apply visually!

**Change Card UI:**
```
┌─────────────────────────────────────────────────────────┐
│ 📁 File Changes                       3 files           │
├─────────────────────────────────────────────────────────┤
│ 📝 src/Header.tsx (Modify)               ✓    ✗        │
│ ➕ src/utils.ts (Create)                 ✓    ✗        │
│ 🗑️ src/old.js (Delete)                   ✓    ✗        │
├─────────────────────────────────────────────────────────┤
│                 [ Accept All ]  [ Reject All ]          │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Click filename → Preview diff in VS Code native view
- Click ✓ → Apply this file
- Click ✗ → Skip this file
- [Accept All] / [Reject All] → Batch operations
- Auto-accept pending changes when sending new message

### 🌍 Multi-language Support

**New Setting:** `openclaw.aiOutputLanguage`
- `auto` - Follow system language (default)
- `zh-CN` - 简体中文
- `en` - English
- `ja` - 日本語
- `ko` - 한국어

AI responses automatically adapt to your selected language!

### 🎨 UI Improvements
- Compact icon buttons (✓ ✗) save space
- Smart path truncation for long filenames
- Status indicators (✅ applied, ⏭️ skipped)
- Smooth animations for state changes

## What's New in v0.1.9

### 🎯 Project Skills & Workflows
- **Auto-detection**: Automatically scans your workspace for `skills/` folders
- **Skill Matching**: Triggers skills based on keywords in your messages
- **Workflow Injection**: Injects workflow content into AI context
- **Slash Commands**: Use `/init`, `/skills`, `/workflow` to manage project features

### 🎨 Dark Mode Icons
- Fixed icon visibility in dark themes
- Icons now auto-adapt to VSCode theme

### 🪟 Windows Platform
- Supports 14+ OpenClaw installation paths
- Auto-detects npm prefix
- Fixes `.cmd` execution issues

### 🔍 File Search
- `@` search now matches filenames only (more precise)
- Recursive scanning for skills and workflows

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

### Project Skills & Workflows

#### Skills
Skills are auto-detected from any `skills/` folder in your workspace.

**Structure:**
```
project/
├── skills/
│   ├── debug/
│   │   └── skill.md
│   └── refactor/
│       └── skill.md
```

**Skill Format (`skill.md`):**
```markdown
---
name: debug
triggers:
  - debug
  - fix bug
category: debugging
---

# Debug Skill
Instructions for debugging...
```

**Usage:**
- Type a trigger keyword: "help me debug this code"
- Or use slash command: `/debug`
- Or run `/skills` to list all available skills

#### Workflows
Workflows are auto-detected from `workflows/` folder.

**Structure:**
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

- `/init` - Initialize project (scan skills/workflows)
- `/skills` - List all detected skills
- `/workflow` - List all workflows
- `/clear` - Clear chat history
- `/<skill-name>` - Force use a specific skill (e.g., `/debug`)
- `/.<workflow>` - Inject a workflow (e.g., `/.cursorrules`)

### File Reference

Type `@` in the input box to open file picker:
- Search by filename
- Drag & drop files
- Paste images from clipboard

### Plan Mode vs Execute Mode
- **Execute Mode** (default): AI can call tools and make changes
- **Plan Mode**: AI outputs a plan only, waits for confirmation before executing

Toggle in the bottom toolbar.

### Keyboard Shortcuts
- `Enter` - Send message
- `Shift+Enter` - New line
- `@` in input - Open file picker

## Configuration

Open VS Code Settings (`Ctrl+,`) and search for "OpenClaw":

- `openclaw.gatewayUrl` - Gateway URL (default: `http://127.0.0.1:18789`)
- `openclaw.openclawPath` - Path to openclaw binary (auto-detected if empty)
- `openclaw.defaultSession` - Default session ID (default: `main`)
- `openclaw.planMode` - Default to Plan Mode (default: `false`)
- `openclaw.aiOutputLanguage` - AI response language (default: `auto`) **NEW**

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

**Symptom**: "OpenClaw: 连接失败 - Cannot find openclaw"

**Solution**:
1. Ensure OpenClaw is installed: `openclaw --version`
2. On Windows, configure the path in VS Code settings
3. Check Gateway is running: `openclaw gateway status`

### Skills Not Detected

**Solution**:
1. Ensure you have a `skills/` folder in your workspace
2. Run `/init` command to force re-scan
3. Check skill.md format (YAML frontmatter required)

### Dark Mode Icons Not Visible

**Solution**: Update to v0.1.9 or later

## Roadmap

- [ ] Gateway WebSocket API support
- [ ] Streaming output UI
- [ ] Custom keybindings
- [ ] Multi-session management
- [ ] Publish to VSCode Marketplace

## Contributing

Contributions are welcome! Please open an issue or PR.

## License

MIT

---

# OpenClaw VS Code 插件

VS Code 的 AI 编程助手，由 OpenClaw 驱动。

## 功能特性

- 💬 **与 AI 对话** - 侧边栏和弹出面板聊天界面
- 🎯 **技能集成** - 自动检测并使用项目技能
- 📋 **工作流支持** - 注入并执行项目工作流
- 📋 **计划模式 / 执行模式** - 控制 AI 何时可以执行操作
- 📎 **文件和图片附件** - 将代码文件和图片附加到消息中
- 🖼️ **图片粘贴** - 直接从剪贴板粘贴图片
- 🔄 **多窗口支持** - 最多 5 个并行聊天会话
- 🌍 **多语言** - 根据系统语言显示中文或英文界面
- 🪟 **Windows 支持** - 增强的 Windows 兼容性（95% 覆盖率）

## v0.1.9 新特性

### 🎯 项目技能与工作流
- **自动检测**：自动扫描工作区中的 `skills/` 文件夹
- **技能匹配**：根据消息中的关键词触发技能
- **工作流注入**：将工作流内容注入 AI 上下文
- **斜杠命令**：使用 `/init`、`/skills`、`/workflow` 管理项目功能

### 🎨 深色模式图标
- 修复深色主题下图标可见性
- 图标自动适配 VSCode 主题

### 🪟 Windows 平台
- 支持 14+ OpenClaw 安装路径
- 自动检测 npm prefix
- 修复 `.cmd` 执行问题

### 🔍 文件搜索
- `@` 搜索现在只匹配文件名（更精确）
- 递归扫描技能和工作流

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

### 项目技能与工作流

#### 技能
技能会从工作区中的任意 `skills/` 文件夹自动检测。

**目录结构：**
```
project/
├── skills/
│   ├── debug/
│   │   └── skill.md
│   └── refactor/
│       └── skill.md
```

**技能格式 (`skill.md`)：**
```markdown
---
name: debug
triggers:
  - debug
  - fix bug
category: debugging
---

# Debug Skill
调试说明...
```

**使用方式：**
- 输入触发关键词："help me debug this code"
- 或使用斜杠命令：`/debug`
- 或运行 `/skills` 列出所有可用技能

#### 工作流
工作流从 `workflows/` 文件夹自动检测。

**目录结构：**
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

- `/init` - 初始化项目（扫描技能/工作流）
- `/skills` - 列出所有检测到的技能
- `/workflow` - 列出所有工作流
- `/clear` - 清空聊天历史
- `/<技能名>` - 强制使用特定技能（如 `/debug`）
- `/.<工作流>` - 注入工作流（如 `/.cursorrules`）

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

打开 VS Code 设置 (`Ctrl+,`) 并搜索 "OpenClaw"：

- `openclaw.gatewayUrl` - Gateway 地址（默认：`http://127.0.0.1:18789`）
- `openclaw.openclawPath` - openclaw 二进制文件路径（留空自动检测）
- `openclaw.defaultSession` - 默认会话 ID（默认：`main`）
- `openclaw.planMode` - 默认使用计划模式（默认：`false`）

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

**症状**："OpenClaw: 连接失败 - Cannot find openclaw"

**解决方案**：
1. 确保已安装 OpenClaw：`openclaw --version`
2. Windows 用户需在 VS Code 设置中配置路径
3. 检查 Gateway 是否运行：`openclaw gateway status`

### 技能未检测到

**解决方案**：
1. 确保工作区中有 `skills/` 文件夹
2. 运行 `/init` 命令强制重新扫描
3. 检查 skill.md 格式（需要 YAML frontmatter）

### 深色模式图标不可见

**解决方案**：更新到 v0.1.9 或更高版本

## 路线图

- [ ] Gateway WebSocket API 支持
- [ ] 流式输出 UI
- [ ] 自定义快捷键
- [ ] 多会话管理
- [ ] 发布到 VSCode 市场

## 贡献

欢迎贡献！请提交 Issue 或 PR。

## 许可证

MIT
