# v0.2.6 设计方案：AI 头像/昵称 + Thinking 展示

## 一、AI 头像与昵称显示

### Webchat 的做法
- **数据来源**：通过 `agent.identity.get` API 获取 `name` 和 `avatar`（URL 或 emoji）
- **头像来源**：`chatAvatarUrl`（通过 `/avatar/{agentId}?meta=1` HTTP 接口获取）或 `assistantAvatar`（identity 里的 avatar 字段）
- **显示逻辑**：消息会被 **分组**（`group`），同一 role 的连续消息合并为一个 group，group 只在最外层渲染一次头像
  - 工具调用消息（`role=tool`）不显示头像
  - 只有 `role=assistant` 的消息组显示 AI 头像和名称
  - 流式回复期间有一个 "reading indicator"（打字动画），也带头像

### 我们的方案

**获取头像/昵称：**
1. 连接成功后调用 `agent.identity.get`（通过 `sendRpc`），获取 `name` 和 `avatar`
2. 缓存到 `ChatController` 中，通过 `postMessage` 传给 webview

**显示规则（对齐主人需求）：**
- ❌ 每条工具调用消息 **不显示** 头像
- ❌ 中间的分析/思考片段 **不显示** 头像
- ✅ **最终结论输出**（最后一条 assistant 消息）**显示** 头像和名称

**实现方式：**
- 历史消息渲染时，找到每个 "连续 assistant 消息组" 的 **最后一条文本消息**，在它前面显示头像和名称
- 工具调用卡片不算 assistant 消息组的一部分
- 头像样式：圆形，左侧显示，旁边是名称。如果是 URL 用 `<img>`，如果是 emoji 用 `<span>`

**数据流：**
```
连接成功 → sendRpc('agent.identity.get') → 获取 {name, avatar, avatarUrl}
         → postMessage({type: 'assistantIdentity', name, avatar})
         → webview 缓存，渲染时使用
```

---

## 二、Thinking（思考过程）展示

### Webchat 的做法

**数据来源：**
1. **`chat.history` 返回数据**：每条消息的 `content` 数组里包含 `{type: "thinking", thinking: "..."}` 类型的元素
2. **提取函数 `Qa()`**：遍历 `content` 数组，收集所有 `type === "thinking"` 的 `thinking` 字段，拼接返回
3. **显示控制**：`showThinking` 开关（UI 上有一个 toggle），关闭时不渲染 thinking 内容
4. **reasoning level**：sessions 列表返回 `reasoningLevel` 字段（off/low/medium/high），`showThinking` 只在 `reasoningLevel !== "off"` 时有效

**关键代码：**
```js
// 提取 thinking 内容
function Qa(message) {
    const content = message.content;
    const thinkingBlocks = [];
    if (Array.isArray(content)) {
        for (const block of content) {
            if (block.type === "thinking" && typeof block.thinking === "string") {
                const text = block.thinking.trim();
                if (text) thinkingBlocks.push(text);
            }
        }
    }
    return thinkingBlocks.length > 0 ? thinkingBlocks.join("\n") : "";
}

// 渲染时
if (showThinking && thinkingText) {
    render(`<div class="chat-thinking">${markdown(thinkingText)}</div>`);
}
```

**`/reasoning on` 的作用：**
- 这个命令设置 session 的 `reasoningLevel`（通过 `sessions.patch`）
- Gateway 的 AI agent 运行时会根据 `reasoningLevel` 决定是否在回复中包含 `thinking` 内容块
- **不需要 `/reasoning on` 也能拿到 thinking 数据** — 关键是模型本身是否支持 thinking（如 Claude 的 extended thinking），以及 session 的 `thinkingLevel` 是否开启
- `reasoningLevel` 和 `thinkingLevel` 是两个不同的概念：
  - `thinkingLevel` = 模型思考深度（off/minimal/low/medium/high/xhigh），控制 AI 用多少 token 思考
  - `reasoningLevel` = 是否在回复中暴露 reasoning 过程给用户看

### 我们的方案

**数据获取：**
- `chat.history` API 返回的消息 `content` 数组已经包含 `{type: "thinking", thinking: "..."}` — **不需要额外操作**
- 我们的 `loadHistory` 已经在用 `chat.history`，只需要在解析消息时提取 thinking 数据

**前端展示：**
1. 解析历史消息时，检查 `content` 数组中的 `type === "thinking"` 元素
2. 将 thinking 内容渲染为折叠区域（默认折叠），点击展开
3. 样式参考 webchat：灰色斜体，左侧有竖线装饰

**UI 设计：**
```
┌─ 🧠 思考过程 ──────────────────────┐
│ > 点击展开                           │  ← 默认折叠
│                                     │
│ 用户要求修改文件头部的注释...          │  ← 展开后显示 thinking 内容
│ 我需要先读取文件内容...              │
│ ...                                 │
└─────────────────────────────────────┘
```

**配置：**
- 不需要新增设置项 — thinking 数据如果存在就显示（折叠状态）
- 用户可以通过已有的 Think 选择器控制 AI 是否思考

---

## 三、实施优先级

1. **P0 - Thinking 展示**：改动最小，只需在 `loadHistory` 解析消息时提取 thinking 数据，前端加折叠区域
2. **P1 - AI 头像/昵称**：需要新增 API 调用 + 前端渲染逻辑 + 分组判断

## 四、涉及文件

### Thinking 展示
- `src/chatSessionManager.ts` — 解析 `chat.history` 返回的 thinking 数据
- `webview/main.js` — 渲染 thinking 折叠区域
- `webview/styles.css` — thinking 样式

### AI 头像/昵称
- `src/chatController.ts` — 调用 `agent.identity.get`，传递给 webview
- `src/gateway.ts` — 新增 `getAgentIdentity()` 方法
- `webview/main.js` — 渲染头像和名称
- `webview/styles.css` — 头像样式
