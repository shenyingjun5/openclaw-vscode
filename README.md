# OpenClaw VS Code 插件

> 🐱 将 OpenClaw AI 助手集成到 VS Code，让招财帮你写代码！

---

## ✨ 功能特性

### 💬 对话面板
- **侧边栏聊天** - 在 VS Code 侧边栏直接与招财对话
- **独立窗口** - 可打开独立的聊天面板，支持分屏操作
- **Markdown 渲染** - AI 回复支持代码高亮、表格、列表等格式
- **流式输出** - 实时显示 AI 回复，无需等待完整响应

### 📁 文件引用
- **@ 引用** - 输入 `@filename` 快速引用工作区文件
- **智能补全** - 输入 `@` 后自动弹出文件列表
- **多文件引用** - 支持同时引用多个文件作为上下文

### 📝 代码操作
- **复制代码** - 一键复制 AI 生成的代码块
- **插入到光标** - 将代码直接插入到编辑器当前位置
- **应用更改** - 智能应用 AI 建议的代码修改

### 🎯 计划模式
- **先计划后执行** - AI 先制定详细计划，确认后再执行
- **可中断** - 随时调整或取消计划
- **步骤可视** - 清晰展示每个执行步骤

### 🖱️ 右键菜单
- **发送选中代码** - 选中代码后右键发送给招财分析
- **发送整个文件** - 右键发送当前文件内容

### 📊 状态栏
- **连接状态** - 实时显示与 OpenClaw Gateway 的连接状态
- **快捷入口** - 点击状态栏图标快速打开对话窗口

---

## 📦 安装方式

### 方式一：从 VSIX 文件安装（推荐）

1. 下载 `openclaw-0.1.0.vsix` 文件

2. 在 VS Code 中安装：
   - 打开 VS Code
   - 按 `Cmd+Shift+P` (macOS) 或 `Ctrl+Shift+P` (Windows/Linux)
   - 输入 `Extensions: Install from VSIX...`
   - 选择下载的 `.vsix` 文件

3. 或使用命令行安装：
   ```bash
   code --install-extension openclaw-0.1.0.vsix
   ```

### 方式二：从源码安装

```bash
# 克隆代码
git clone <repo> openclaw-vscode
cd openclaw-vscode

# 安装依赖
npm install

# 编译
npm run compile

# 打包
npm run package

# 安装生成的 vsix 文件
code --install-extension openclaw-0.1.0.vsix
```

---

## ⚙️ 配置说明

打开 VS Code 设置 (`Cmd+,` 或 `Ctrl+,`)，搜索 `openclaw`：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `openclaw.gatewayUrl` | `http://127.0.0.1:18789` | OpenClaw Gateway 地址 |
| `openclaw.defaultSession` | `main` | 默认会话 ID |
| `openclaw.planMode` | `false` | 是否默认开启计划模式 |

### 配置示例

在 `settings.json` 中添加：

```json
{
  "openclaw.gatewayUrl": "http://127.0.0.1:18789",
  "openclaw.defaultSession": "coding",
  "openclaw.planMode": true
}
```

---

## 🚀 使用方法

### 1. 确保 OpenClaw 运行中

插件需要连接到本地运行的 OpenClaw Gateway。确保已启动：

```bash
# 检查 OpenClaw 状态
openclaw status

# 如果未运行，启动 Gateway
openclaw gateway start
```

### 2. 打开对话面板

三种方式：
- 点击左侧活动栏的 🐱 图标
- 点击右下角状态栏的「招财」
- 按 `Cmd+Shift+P`，输入「打开招财对话窗口」

### 3. 开始对话

```
你好，帮我写一个 Python 快速排序函数
```

### 4. 引用文件

使用 `@` 符号引用工作区文件：

```
@utils.ts 这个文件有什么问题？帮我优化一下
```

### 5. 发送选中代码

1. 在编辑器中选中代码
2. 右键 → 「发送选中代码到招财」
3. 在对话框中描述你的需求

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift+Enter` | 换行 |
| `Cmd/Ctrl+Shift+P` → `openclaw` | 查看所有命令 |

---

## 📋 命令列表

按 `Cmd+Shift+P` 可使用以下命令：

| 命令 | 说明 |
|------|------|
| `打开招财对话窗口` | 打开独立的聊天面板 |
| `发送选中代码到招财` | 发送当前选中的代码 |
| `发送文件到招财` | 发送当前文件内容 |
| `切换计划模式` | 开启/关闭计划模式 |
| `新建会话` | 创建新的对话会话 |
| `清空聊天` | 清除当前聊天记录 |

---

## 🔧 前置要求

- **VS Code** 1.85.0 或更高版本
- **OpenClaw** 已安装并运行
- **Node.js** 18+ (仅开发时需要)

### 检查 OpenClaw 安装

```bash
# 检查版本
openclaw --version

# 检查 Gateway 状态
openclaw gateway status

# 如果未安装，使用 npm 安装
npm install -g openclaw
```

---

## ❓ 常见问题

### Q: 显示「未连接」怎么办？

1. 确认 OpenClaw Gateway 正在运行：
   ```bash
   openclaw gateway status
   ```

2. 如果未运行，启动它：
   ```bash
   openclaw gateway start
   ```

3. 检查配置的 Gateway 地址是否正确

### Q: @ 引用文件不生效？

- 确保文件在当前打开的工作区内
- 文件名区分大小写
- 尝试使用相对路径：`@src/utils.ts`

### Q: 如何连接远程 Gateway？

修改设置：
```json
{
  "openclaw.gatewayUrl": "http://your-server:18789"
}
```

---

## 🛠️ 开发说明

### 项目结构

```
openclaw-vscode/
├── src/
│   ├── extension.ts      # 插件入口
│   ├── chatProvider.ts   # 侧边栏聊天视图
│   ├── chatPanel.ts      # 独立聊天面板
│   └── gateway.ts        # Gateway 客户端
├── webview/              # 聊天界面 HTML/CSS/JS
├── media/                # 图标资源
├── package.json          # 插件配置
└── tsconfig.json         # TypeScript 配置
```

### 本地开发

```bash
# 安装依赖
npm install

# 监听模式编译
npm run watch

# 按 F5 启动调试
```

### 打包发布

```bash
npm run package
# 生成 openclaw-x.x.x.vsix
```

---

## 📄 许可证

MIT License

---

## 🔗 相关链接

- [OpenClaw 文档](https://docs.openclaw.ai)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [问题反馈](https://github.com/openclaw/openclaw/issues)
