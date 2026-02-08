# CHANGELOG

## [0.2.6] - 2026-02-08

### Added - 新功能 ✨

#### AI 思考过程展示 🧠
- **折叠展示** — AI 的 thinking 内容以可折叠 `<details>` 区域展示在回复上方
- **默认折叠** — 点击「🧠 思考过程」可展开查看完整推理链路
- **数据对齐 webchat** — 从 `chat.history` 的 `content` 数组中提取 `{type: "thinking"}` 块

#### 计划模式国际化 🌍
- **中文分隔线** — 中文环境使用 `---- 计划模式 ----`，英文使用 `---- Plan Mode ----`
- **上下文设置国际化** — 系统设置消息根据语言切换：`[系统设置 - 无需回复]` / `[System Setup - No reply needed]`
- **兼容旧格式** — `loadHistory` 正则同时匹配新旧两种格式的分隔线

### Fixed - Bug 修复 🐛

#### 计划模式后缀过滤
- **问题** — 用户发送的计划模式消息在 `loadHistory` 刷新后显示完整后缀（`---- 计划模式 ---- ⚠️ 请勿执行...`）
- **根因** — Gateway 将消息中的 `\n\n` 转为空格，但过滤正则能正确处理（`\s+` 匹配空格和换行）
- **修复** — 在 `loadHistory` 中对 `role=user` 的消息执行正则截断，剥离计划模式后缀

#### 上下文设置消息过滤
- **问题** — 系统设置消息（语言指令 + 工作区路径）显示在聊天历史中
- **修复** — `loadHistory` 过滤包含 `[系统设置 - 无需回复]` 或 `[System Setup - No reply needed]` 的消息及其 AI 回复

### Technical
- `chatSessionManager.ts` 新增 thinking 提取逻辑，从 content 数组中解析 `type === 'thinking'` 块
- `webview/main.js` hash 指纹增加 `thinking.length` 维度，确保 thinking 变化触发 DOM 重建
- `.vscodeignore` 增加 `test-*.mjs` 和 `test-*.cjs` 排除规则
