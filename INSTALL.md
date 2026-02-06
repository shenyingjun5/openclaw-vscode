# 安装指南

## 快速安装

### 1. 下载插件

从项目目录获取 `openclaw-0.1.0.vsix` 文件。

### 2. 安装到 VS Code

**方法 A：图形界面安装**
1. 打开 VS Code
2. 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows)
3. 输入 `Extensions: Install from VSIX...`
4. 选择 `openclaw-0.1.0.vsix` 文件
5. 重启 VS Code

**方法 B：命令行安装**
```bash
code --install-extension openclaw-0.1.0.vsix
```

### 3. 启动 OpenClaw

确保 OpenClaw Gateway 正在运行：

```bash
# 检查状态
openclaw gateway status

# 如果没运行，启动它
openclaw gateway start
```

### 4. 开始使用

- 点击左侧活动栏的 🐱 图标打开聊天面板
- 或点击右下角状态栏的「招财」

---

## 配置（可选）

在 VS Code 设置中搜索 `openclaw`：

- **Gateway 地址**: 默认 `http://127.0.0.1:18789`
- **默认会话**: 默认 `main`
- **计划模式**: 默认关闭

---

## 卸载

```bash
code --uninstall-extension openclaw.openclaw
```

或在 VS Code 扩展面板中找到 OpenClaw，点击卸载。
