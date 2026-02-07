# Installation Guide / 安装指南

## Prerequisites / 前置要求

1. **OpenClaw** must be installed
   - Install via npm: `npm install -g openclaw`
   - Or via Homebrew: `brew install openclaw`

2. **OpenClaw Gateway** must be running
   - Start with: `openclaw gateway start`
   - Default port: 18789

---

1. **OpenClaw** 必须已安装
   - 通过 npm 安装：`npm install -g openclaw`
   - 或通过 Homebrew：`brew install openclaw`

2. **OpenClaw Gateway** 必须正在运行
   - 启动命令：`openclaw gateway start`
   - 默认端口：18789

---

## Install from Open VSX / 从 Open VSX 安装

1. Open VS Code or VSCodium
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "OpenClaw"
4. Click "Install"

---

1. 打开 VS Code 或 VSCodium
2. 进入扩展 (Ctrl+Shift+X / Cmd+Shift+X)
3. 搜索 "OpenClaw"
4. 点击"安装"

---

## Install from VSIX / 从 VSIX 安装

### Download / 下载

Download the latest `.vsix` file from:
- [Open VSX](https://open-vsx.org/extension/shenyingjun5/openclaw)
- [GitHub Releases](https://github.com/openclaw/openclaw-vscode/releases)

从以下位置下载最新的 `.vsix` 文件：
- [Open VSX](https://open-vsx.org/extension/shenyingjun5/openclaw)
- [GitHub Releases](https://github.com/openclaw/openclaw-vscode/releases)

### Install / 安装

**Via Command Palette / 通过命令面板:**
1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
2. Type "Extensions: Install from VSIX..."
3. Select the downloaded `.vsix` file

**Via CLI / 通过命令行:**
```bash
code --install-extension openclaw-x.x.x.vsix
```

---

## Verify Installation / 验证安装

1. Look for the OpenClaw icon in the activity bar (left sidebar)
2. Look for the 🦞 button in the status bar (bottom)
3. Click either to start chatting!

---

1. 在活动栏（左侧边栏）中查找 OpenClaw 图标
2. 在状态栏（底部）中查找 🦞 按钮
3. 点击任一按钮开始聊天！

---

## Troubleshooting / 故障排除

### "OpenClaw: Connection failed" / "OpenClaw: 连接失败"

Make sure OpenClaw Gateway is running:
确保 OpenClaw Gateway 正在运行：

```bash
openclaw gateway status
openclaw gateway start
```

### Extension not showing / 扩展未显示

Try reloading the window:
尝试重新加载窗口：

`Ctrl+Shift+P` → "Developer: Reload Window"
