# OpenClaw VSCode Extension v0.2.19

**发布日期**: 2026-03-10

## ✨ 主要更新

### 🤖 Agent 管理功能

这是本次更新的核心功能，为 OpenClaw 带来了完整的 Agent 管理能力：

#### 1. Agent 选择器
- 在聊天面板顶部添加 Agent 下拉选择器
- 支持快速切换不同的 Agent
- 显示当前 Agent 的名称和 Emoji
- 自动加载项目关联的 Agent

#### 2. Agent 创建面板
- 可视化创建界面，简化 Agent 创建流程
- 支持 6 种预设角色模板：
  - 🌐 **全栈开发** - 前后端通吃的全能开发者
  - 🎨 **前端开发** - 专注用户界面和交互体验
  - ⚙️ **后端开发** - 专注服务端逻辑和数据处理
  - 🚀 **DevOps** - 自动化部署和运维专家
  - 🧪 **测试工程师** - 质量保证和测试自动化
  - 🏗️ **架构师** - 系统设计和技术决策
- 支持自定义角色，灵活定义 Agent 能力
- Emoji 字段可选，默认使用 🤖

#### 3. 项目本地配置
- Agent 配置保存到项目 `.openclaw/agent` 文件
- 支持团队共享 Agent 配置
- 自动初始化：打开项目时自动加载关联的 Agent
- 降级策略：如果保存的 Agent 不存在，自动使用默认 Agent

### 🔧 功能改进

#### 思考指示器修复
- 修复思考指示器在自动刷新时消失的问题
- 在 `waitingReply` 事件中重新显示指示器
- 确保用户始终能看到 AI 的思考状态

#### Agent 创建优化
- **RPC 优先策略**：优先使用 WebSocket RPC API 创建 Agent
- **文件系统写入**：使用文件系统写入 IDENTITY.md 和 SOUL.md（因 `agents.files.set` RPC 不可用）
- **智能降级**：RPC 失败时自动降级到 CLI 命令
- **错误处理**：检测 Agent 是否已创建，避免重复创建

### 🌐 技术优化

#### WebSocket RPC 改进
- 使用 `gateway-client` 作为 client.id
- 支持 token 认证
- 统一连接配置，提高稳定性

## 📦 安装说明

### 方式 1：从 VSIX 安装（推荐）

1. 下载 `openclaw-0.2.19.vsix` (499.82 KB)
2. 在 VSCode 中打开扩展面板
3. 点击 `...` 菜单
4. 选择 "从 VSIX 安装..."
5. 选择下载的文件

### 方式 2：从 OpenVSX 安装

```bash
code --install-extension shenyingjun5.openclaw
```

## 🎯 使用说明

### 创建 Agent

1. 打开 OpenClaw 聊天面板
2. 点击顶部的 Agent 选择器
3. 选择 "创建新 Agent"
4. 填写 Agent 信息：
   - Agent ID（必填）：唯一标识符，如 `dev1`
   - 显示名称（必填）：如 "开发助手"
   - Emoji（可选）：默认 🤖
   - 选择角色模板或自定义
   - 填写角色描述
5. 点击 "创建" 按钮

### 切换 Agent

1. 点击聊天面板顶部的 Agent 选择器
2. 从下拉列表中选择要切换的 Agent
3. 聊天历史会自动切换到新 Agent 的会话

### 项目关联 Agent

创建 Agent 后，配置会自动保存到项目的 `.openclaw/agent` 文件。下次打开项目时，会自动加载关联的 Agent。

## 🐛 已知问题

- Agent 创建后需要手动刷新才能在选择器中看到（将在下个版本修复）
- 删除 Agent 功能暂未实现（计划在 v0.2.20 添加）

## 📊 性能数据

- VSIX 大小：499.82 KB
- 编译后代码：197 个文件
- Agent 创建时间：< 2 秒（RPC 方式）

## 🔗 相关链接

- [GitHub Repository](https://github.com/shenyingjun5/openclaw-vscode)
- [OpenVSX Marketplace](https://open-vsx.org/extension/shenyingjun5/openclaw)
- [问题反馈](https://github.com/shenyingjun5/openclaw-vscode/issues)

## 🎉 下一步计划

- v0.2.20: Agent 更新和删除功能
- v0.2.21: Agent 模型配置
- v0.2.22: Agent 导入导出功能

---

感谢使用 OpenClaw VSCode Extension！
