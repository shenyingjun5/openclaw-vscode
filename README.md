# OpenClaw VS Code Extension

AI coding assistant for VS Code, powered by OpenClaw.

## Features

- 💬 **Chat with AI** - Sidebar and popup panel chat interface
- 📋 **Plan Mode / Execute Mode** - Control when AI can execute actions
- 📎 **File & Image Attachments** - Attach code files and images to your messages
- 🖼️ **Image Paste** - Paste images directly from clipboard
- 🔄 **Multi-window Support** - Up to 5 parallel chat sessions
- 🌍 **Multi-language** - English and Chinese UI based on system language

## Installation

### From Open VSX (Recommended)

1. Open VS Code / VSCodium
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "OpenClaw"
4. Click Install

### Manual Installation

1. Download the `.vsix` file
2. Open VS Code
3. Press Ctrl+Shift+P → "Extensions: Install from VSIX..."
4. Select the downloaded file

## Requirements

- [OpenClaw](https://github.com/openclaw/openclaw) must be installed and running
- Gateway should be accessible at `http://127.0.0.1:18789`

## Usage

### Sidebar Chat
Click the OpenClaw icon in the activity bar to open the chat sidebar.

### Popup Panel
Click the 🐱 button in the status bar to open a floating chat panel. You can open up to 5 panels simultaneously.

### Plan Mode vs Execute Mode
- **Execute Mode** (default): AI can call tools and make changes
- **Plan Mode**: AI outputs a plan only, waits for confirmation before executing

### Keyboard Shortcuts
- `Enter` - Send message
- `Shift+Enter` - New line
- `@` in input - Open file picker to reference files

## Configuration

Open VS Code Settings and search for "OpenClaw":

- `openclaw.gatewayUrl` - Gateway URL (default: `http://127.0.0.1:18789`)
- `openclaw.planMode` - Default to Plan Mode

## Development

```bash
# Clone and install
git clone https://github.com/openclaw/openclaw-vscode
cd openclaw-vscode
npm install

# Compile
npm run compile

# Package
npx vsce package
```

---

# OpenClaw VS Code 插件

VS Code 的 AI 编程助手，由 OpenClaw 驱动。

## 功能特性

- 💬 **与 AI 对话** - 侧边栏和弹出面板聊天界面
- 📋 **计划模式 / 执行模式** - 控制 AI 何时可以执行操作
- 📎 **文件和图片附件** - 将代码文件和图片附加到消息中
- 🖼️ **图片粘贴** - 直接从剪贴板粘贴图片
- 🔄 **多窗口支持** - 最多 5 个并行聊天会话
- 🌍 **多语言** - 根据系统语言显示中文或英文界面

## 安装

### 从 Open VSX 安装（推荐）

1. 打开 VS Code / VSCodium
2. 进入扩展 (Ctrl+Shift+X)
3. 搜索 "OpenClaw"
4. 点击安装

### 手动安装

1. 下载 `.vsix` 文件
2. 打开 VS Code
3. 按 Ctrl+Shift+P → "Extensions: Install from VSIX..."
4. 选择下载的文件

## 前置要求

- 必须安装并运行 [OpenClaw](https://github.com/openclaw/openclaw)
- Gateway 需要在 `http://127.0.0.1:18789` 可访问

## 使用方法

### 侧边栏聊天
点击活动栏中的 OpenClaw 图标打开聊天侧边栏。

### 弹出面板
点击状态栏中的 🐱 按钮打开浮动聊天面板。可以同时打开最多 5 个面板。

### 计划模式 vs 执行模式
- **执行模式**（默认）：AI 可以调用工具并进行更改
- **计划模式**：AI 只输出计划，等待确认后才执行

### 快捷键
- `Enter` - 发送消息
- `Shift+Enter` - 换行
- 输入 `@` - 打开文件选择器引用文件

## 配置

打开 VS Code 设置并搜索 "OpenClaw"：

- `openclaw.gatewayUrl` - Gateway 地址（默认：`http://127.0.0.1:18789`）
- `openclaw.planMode` - 默认使用计划模式

## 开发

```bash
# 克隆并安装
git clone https://github.com/openclaw/openclaw-vscode
cd openclaw-vscode
npm install

# 编译
npm run compile

# 打包
npx vsce package
```

## License

MIT
