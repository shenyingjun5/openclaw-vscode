# OpenClaw VSCode Extension v0.2.6

## 🧠 AI 思考过程展示

- AI 的 thinking 内容以可折叠区域展示在回复上方
- 默认折叠，点击「🧠 思考过程」展开查看完整推理链路
- 数据对齐 webchat，从 `chat.history` 提取 thinking 块

## 🌍 计划模式国际化

- 中文环境：`---- 计划模式 ----`，英文：`---- Plan Mode ----`
- 上下文设置消息国际化：`[系统设置 - 无需回复]` / `[System Setup - No reply needed]`
- 向后兼容旧格式分隔线

## 🐛 计划模式显示修复

- 修复 `loadHistory` 刷新后计划模式后缀泄漏到聊天显示的问题
- 通过正则从用户消息中剥离计划模式指令后缀
