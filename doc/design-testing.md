# 自动化测试方案

## 测试框架选型

**Vitest** — 轻量、零配置、兼容 TypeScript，不依赖 VSCode 运行环境。

```bash
npm install -D vitest
```

## 核心思路

把需要 `vscode` API 的模块做最小化 mock，只测试**纯逻辑**部分。不启动 VSCode Extension Host，不实际安装插件。

## 可测试模块清单

### 1. loadHistory 消息解析（核心，优先级最高）

`chatSessionManager.ts` → `loadHistory()` 内部的消息处理逻辑。

**测试点：**

| 用例 | 输入 | 预期 |
|------|------|------|
| 计划模式剥离（中文新格式） | `"修改文件\n\n---- 计划模式 ----\n⚠️ 请勿执行..."` | `"修改文件"` |
| 计划模式剥离（英文新格式） | `"fix bug\n\n---- Plan Mode ----\n⚠️ Do Not..."` | `"fix bug"` |
| 计划模式剥离（旧格式 ━━━） | `"修改\n\n━━━━━━━━━━\n⚠️ [Plan Mode..."` | `"修改"` |
| 无计划模式（不误剥离） | `"这是普通消息"` | `"这是普通消息"` |
| content 含 ---- 但不是计划模式 | `"用 ---- 分隔段落"` | 原样保留 |
| 系统设置消息过滤（英文） | `"[System Setup - No reply needed]..."` | 跳过 |
| 系统设置消息过滤（中文） | `"[系统设置 - 无需回复]..."` | 跳过 |
| setup 后的 assistant 回复过滤 | setup 消息后紧跟的 assistant 消息 | 跳过 |
| thinking 提取 | content: `[{type:"thinking",thinking:"分析..."},{type:"text",text:"回复"}]` | `thinking: "分析..."`, `content: "回复"` |
| thinking 为空不附加 | content: `[{type:"text",text:"hello"}]` | 无 thinking 字段 |
| 多个 thinking 块拼接 | content: `[{type:"thinking",thinking:"A"},{type:"thinking",thinking:"B"},{type:"text",text:"C"}]` | `thinking: "A\nB"` |
| toolCall 提取 | content: `[{type:"toolCall",name:"read"},{type:"text",text:"ok"}]` | `toolCalls: [{name:"read"}]`, `content: "ok"` |
| toolResult 消息跳过 | `{role:"toolresult", content:"..."}` | 不出现在结果中 |
| think/final 标签清理 | `"<think>内部</think>正文<final>结论</final>"` | `"正文结论"` |
| 空消息跳过 | `{role:"assistant", content:""}` | 不出现在结果中 |
| Language settings 过滤 | `"Language settings updated"` | 跳过 |
| content 为字符串（非数组） | `{role:"assistant", content: "hello"}` | `content: "hello"` |
| content 数组只有 toolCall | `[{type:"toolCall",name:"exec"}]` | `content: ""`, `toolCalls: [...]` |

### 2. 计划模式后缀生成

`chatController.ts` → `_sendMessage()` 中的计划模式拼接逻辑。

提取为纯函数测试：

**测试点：**

| 用例 | 语言 | 输入 | 预期 |
|------|------|------|------|
| 中文+非确认 | zh | `"重构代码"` | 末尾包含 `---- 计划模式 ----` |
| 英文+非确认 | en | `"refactor"` | 末尾包含 `---- Plan Mode ----` |
| 确认命令跳过 | zh | `"执行"` | 无后缀 |
| 确认命令跳过 | en | `"execute"` | 无后缀 |
| 确认命令大小写 | en | `"Yes"` | 无后缀 |
| planMode=false 不拼接 | - | `"hello"` | 原样 |

### 3. sendContextSetup 消息构建

**测试点：**

| 用例 | 语言 | 预期 |
|------|------|------|
| 中文 + 有工作区 | zh-CN | 包含 `[系统设置 - 无需回复]`, `[VSCode 上下文]` |
| 英文 + 有工作区 | en | 包含 `[System Setup - No reply needed]`, `[VSCode Context]` |
| 无工作区 | - | 不含 VSCode 上下文部分 |
| 含语言指令 | zh-CN | 包含 `respond in Chinese` |

### 4. 语言管理器

**测试点：**

| 用例 | 预期 |
|------|------|
| `getLanguageInstruction()` zh-CN | `"Please respond in Chinese (Simplified)..."` |
| `getLanguageInstruction()` en | `"Please respond in English..."` |
| `getLanguageDisplayName()` zh-CN | `"简体中文"` |
| 未知 locale 降级 | 返回原始字符串 |

## 实现架构

```
tests/
├── setup.ts               # vscode mock + 全局 setup
├── loadHistory.test.ts     # loadHistory 消息解析测试
├── planMode.test.ts        # 计划模式后缀测试
├── contextSetup.test.ts    # sendContextSetup 测试
└── languageManager.test.ts # 语言管理器测试
```

### vscode mock（`tests/setup.ts`）

```typescript
// 最小化 mock，只 mock 用到的 API
const vscode = {
    workspace: {
        getConfiguration: () => ({
            get: (key: string, def?: any) => def
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
        workspaceFolders: undefined
    },
    env: {
        language: 'zh-cn',
        sessionId: 'test-session'
    },
    window: {
        showOpenDialog: async () => undefined,
        showInformationMessage: async () => undefined
    },
    Uri: { file: (p: string) => ({ fsPath: p }) },
    extensions: {
        getExtension: () => ({ packageJSON: { version: '0.2.5' } })
    }
};

// 注册到 require 缓存
jest.mock('vscode', () => vscode, { virtual: true });
```

### 关键：提取纯函数

`loadHistory` 当前是 `ChatSessionManager` 的方法，内部调用 `gateway.getHistory()`。为了测试，需要：

**方案：mock gateway 参数**

```typescript
const mockGateway = {
    getHistory: async (key: string, limit: number) => mockMessages
};

const mgr = new ChatSessionManager();
const result = await mgr.loadHistory(mockGateway, 'test-session');
```

`gateway` 是通过参数传入的，天然可 mock，不需要重构代码。

## vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
        alias: {
            'vscode': './tests/mocks/vscode.ts'
        }
    }
});
```

## package.json 脚本

```json
{
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest"
    }
}
```

## 不测什么

- **webview/main.js** — DOM 操作，需要浏览器环境，成本大收益小
- **gatewayWSClient.ts** — WebSocket 连接，需要实际 Gateway 或 mock server
- **changeManager.ts / diffProvider.ts** — 依赖 VSCode Diff API，mock 成本高
- **extension.ts** — 入口注册，VSCode Extension Host 才能跑

## 实施优先级

1. **P0**: `loadHistory` 测试（覆盖消息解析、过滤、thinking 提取、计划模式剥离 — 这是最关键、最容易出 bug 的逻辑）
2. **P1**: 计划模式后缀 + contextSetup 测试
3. **P2**: languageManager 测试
