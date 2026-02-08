# OpenClaw VSCode Extension v0.2.7

## 🤖 AI 头像与昵称显示

- 连续 assistant 消息组的首条显示 AI 头像和名称
- 连接后通过 `agent.identity.get` API 自动获取
- 支持 URL 图片、emoji 和字母头像（渐变圆形背景）

## ✏️ 计划模式自定义提示词

- 新增设置 `openclaw.planModePrompt`：自定义计划模式指令文本
- 多行文本编辑，留空使用内置默认（自动跟随语言）
- `---- 计划模式 ----` 标记自动包裹，过滤逻辑不受影响
