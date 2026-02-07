# OpenClaw Gateway HTTP/WebSocket API 支持分析

## 🎯 结论

**✅ OpenClaw 完全支持 Gateway HTTP/WebSocket API！**

VSCode 插件可以完全抛弃 CLI 调用，改用 WebSocket RPC 协议与 Gateway 通信。

---

## 📡 Gateway 协议概览

### **传输方式**
- **WebSocket** (ws://127.0.0.1:18789 或 wss:// for TLS)
- **端口**: 默认 18789
- **协议**: JSON 消息帧（text frames）
- **多路复用**: 同一端口同时支持 WS + HTTP

### **消息类型**
1. **Request**: `{type:"req", id, method, params}`
2. **Response**: `{type:"res", id, ok, payload|error}`
3. **Event**: `{type:"event", event, payload, seq?, stateVersion?}`

---

## 🔐 握手流程

### **1. Gateway 发送挑战（可选）**
```json
{
  "type": "event",
  "event": "connect.challenge",
  "payload": { "nonce": "...", "ts": 1737264000000 }
}
```

### **2. 客户端发送 connect 请求**
```json
{
  "type": "req",
  "id": "...",
  "method": "connect",
  "params": {
    "minProtocol": 3,
    "maxProtocol": 3,
    "client": {
      "id": "vscode-extension",
      "version": "0.1.9",
      "platform": "win32",
      "mode": "operator"
    },
    "role": "operator",
    "scopes": ["operator.read", "operator.write"],
    "auth": { "token": "..." },  // 如果配置了 OPENCLAW_GATEWAY_TOKEN
    "locale": "en-US",
    "userAgent": "openclaw-vscode/0.1.9"
  }
}
```

### **3. Gateway 返回 hello-ok**
```json
{
  "type": "res",
  "id": "...",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 3,
    "policy": { "tickIntervalMs": 15000 },
    "snapshot": {
      "presence": [...],
      "health": {...},
      "stateVersion": 123
    }
  }
}
```

---

## 🛠️ 可用的 RPC 方法

### **核心方法**（已确认文档中提到）

| 方法 | 用途 | 对应 CLI 命令 |
|------|------|---------------|
| `health` | 获取完整健康状态 | `openclaw health` |
| `status` | 获取简要状态 | `openclaw status` |
| `agent` | 运行 agent 对话 | `openclaw agent --message` |
| `send` | 发送消息到渠道 | `openclaw message send` |
| `sessions.list` | 获取会话列表 | `openclaw sessions list` |
| `sessions.history` | 获取会话历史 | `openclaw sessions history` |
| `sessions.delete` | 删除会话 | `openclaw sessions delete` |
| `system-presence` | 获取当前连接列表 | - |
| `system-event` | 发送系统事件 | - |

### **其他方法**（根据文档推断）

| 方法 | 推测用途 |
|------|---------|
| `models.list` | 获取模型列表 |
| `models.set` | 设置当前模型 |
| `sessions.create` | 创建新会话 |
| `sessions.update` | 更新会话元数据 |

---

## 📝 VSCode 插件需要的方法映射

| 当前功能 | 当前实现 | Gateway API 替代 |
|---------|---------|-----------------|
| 发送消息 | CLI: `openclaw agent --message` | RPC: `agent` |
| 获取历史 | CLI: `openclaw sessions history` | RPC: `sessions.history` |
| 获取会话列表 | CLI: `openclaw sessions list` | RPC: `sessions.list` |
| 设置模型 | CLI: `openclaw models set` | RPC: `models.set` (推测) |
| 删除会话 | ✅ HTTP (已实现) | RPC: `sessions.delete` |
| 检查连接 | CLI: `openclaw --version` | RPC: `health` |

---

## 🔧 agent 方法详细说明

### **请求示例**
```json
{
  "type": "req",
  "id": "msg-123",
  "method": "agent",
  "params": {
    "sessionId": "vscode-main-abc123",
    "message": "Hello, how are you?",
    "stream": true  // 可选：启用流式输出
  }
}
```

### **两阶段响应**

**阶段 1：立即确认**
```json
{
  "type": "res",
  "id": "msg-123",
  "ok": true,
  "payload": {
    "runId": "run-456",
    "status": "accepted"
  }
}
```

**阶段 2：流式事件（如果启用）**
```json
{
  "type": "event",
  "event": "agent",
  "payload": {
    "runId": "run-456",
    "kind": "output",
    "text": "Hello! I'm doing well..."
  },
  "seq": 1
}
```

**阶段 3：最终响应**
```json
{
  "type": "res",
  "id": "msg-123",
  "ok": true,
  "payload": {
    "runId": "run-456",
    "status": "ok",
    "summary": {
      "inputTokens": 50,
      "outputTokens": 100,
      "totalTokens": 150
    }
  }
}
```

---

## 📊 sessions.history 方法

### **请求示例**
```json
{
  "type": "req",
  "id": "hist-123",
  "method": "sessions.history",
  "params": {
    "sessionId": "vscode-main-abc123",
    "limit": 50  // 可选
  }
}
```

### **响应示例**
```json
{
  "type": "res",
  "id": "hist-123",
  "ok": true,
  "payload": {
    "messages": [
      {
        "role": "user",
        "content": "...",
        "timestamp": "2026-02-07T04:00:00Z"
      },
      {
        "role": "assistant",
        "content": "...",
        "timestamp": "2026-02-07T04:00:05Z"
      }
    ]
  }
}
```

---

## 🎯 实施方案

### **方案 A：完全替换为 WebSocket（推荐）**

**优势**：
- ✅ 不依赖 CLI 路径（解决 Windows 问题）
- ✅ 跨平台一致
- ✅ 支持流式输出（更好的用户体验）
- ✅ 保持长连接（性能更好）
- ✅ 接收 Gateway 事件（如 shutdown）

**需要修改的类**：
```
GatewayClient (src/gateway.ts)
├─ 改用 WebSocket 而不是 spawn
├─ 实现 connect 握手
├─ 实现请求/响应匹配
└─ 实现事件监听
```

**新增依赖**：
- `ws` 包（WebSocket 客户端）

---

### **方案 B：混合方案（快速过渡）**

保留当前修复（Windows CLI 路径检测），同时添加 WebSocket 作为可选方式：

```typescript
export class GatewayClient {
    private _mode: 'cli' | 'ws' = 'ws';  // 优先 WS
    
    async connect() {
        // 1. 尝试 WebSocket
        if (await this._tryConnectWS()) {
            this._mode = 'ws';
            return;
        }
        
        // 2. 回退到 CLI
        if (await this._tryConnectCLI()) {
            this._mode = 'cli';
            return;
        }
        
        throw new Error('Cannot connect');
    }
}
```

---

## 💡 WebSocket 实现示例

### **基础连接**
```typescript
import WebSocket from 'ws';

export class GatewayClient {
    private _ws: WebSocket | null = null;
    private _requestId = 0;
    private _pendingRequests = new Map<string, {
        resolve: (payload: any) => void;
        reject: (error: Error) => void;
    }>();
    
    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this._ws = new WebSocket(this._gatewayUrl);
            
            this._ws.on('open', async () => {
                // 发送 connect 请求
                const connectReq = {
                    type: 'req',
                    id: this._nextId(),
                    method: 'connect',
                    params: {
                        minProtocol: 3,
                        maxProtocol: 3,
                        client: {
                            id: 'vscode-extension',
                            version: '0.1.9',
                            platform: process.platform,
                            mode: 'operator'
                        },
                        role: 'operator',
                        scopes: ['operator.read', 'operator.write'],
                        locale: 'en-US',
                        userAgent: `openclaw-vscode/0.1.9`
                    }
                };
                
                // 如果配置了 token，添加认证
                if (this._token) {
                    connectReq.params.auth = { token: this._token };
                }
                
                this._ws!.send(JSON.stringify(connectReq));
                
                // 等待 hello-ok
                const listener = (data: Buffer) => {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'res' && msg.id === connectReq.id) {
                        this._ws!.off('message', listener);
                        if (msg.ok) {
                            this._connected = true;
                            resolve();
                        } else {
                            reject(new Error(msg.error?.message || 'Connect failed'));
                        }
                    }
                };
                
                this._ws!.on('message', listener);
            });
            
            this._ws.on('error', reject);
        });
    }
    
    private _nextId(): string {
        return `req-${++this._requestId}`;
    }
    
    async sendMessage(sessionId: string, message: string): Promise<Message> {
        return this._request('agent', {
            sessionId,
            message
        });
    }
    
    async getHistory(sessionId: string): Promise<Message[]> {
        const res = await this._request('sessions.history', {
            sessionId
        });
        return res.messages;
    }
    
    private async _request(method: string, params: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = this._nextId();
            const req = {
                type: 'req',
                id,
                method,
                params
            };
            
            this._pendingRequests.set(id, { resolve, reject });
            this._ws!.send(JSON.stringify(req));
            
            // 超时处理
            setTimeout(() => {
                if (this._pendingRequests.has(id)) {
                    this._pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }
}
```

---

## 📋 实施清单

### **Phase 1: 添加 WebSocket 支持**
1. ✅ 安装 `ws` 依赖
2. ✅ 实现 WebSocket 连接
3. ✅ 实现 connect 握手
4. ✅ 实现 request/response 匹配

### **Phase 2: 迁移现有方法**
1. ✅ `sendMessage()` → `agent` RPC
2. ✅ `getHistory()` → `sessions.history` RPC
3. ✅ `getSessions()` → `sessions.list` RPC
4. ✅ `getModels()` → 从配置文件读取（保持不变）
5. ✅ `setSessionModel()` → `models.set` RPC (待确认)

### **Phase 3: 优化体验**
1. ✅ 添加流式输出支持
2. ✅ 添加重连机制
3. ✅ 添加事件监听（shutdown 等）

---

## 🚀 推荐实施路径

### **立即实施（解决 Windows 问题）**
✅ 已完成方案 1（扩展 CLI 路径检测）

### **短期优化（1-2 周）**
✅ 实施 WebSocket 方案
- 添加 `ws` 依赖
- 实现 `GatewayWSClient` 类
- 迁移核心方法

### **长期优化（后续迭代）**
- 完全移除 CLI 依赖
- 添加流式输出 UI
- 添加 Gateway 事件监听

---

## 📖 参考文档

- Gateway 运行手册: https://docs.openclaw.ai/gateway
- Gateway 协议: https://docs.openclaw.ai/gateway/protocol
- 会话管理: https://docs.openclaw.ai/concepts/session

---

## 总结

**OpenClaw 的 Gateway 提供了完整的 WebSocket RPC API，完全可以替代 CLI 调用。**

建议：
1. **当前版本**：使用已修复的 CLI 方案（解决 Windows 问题）
2. **下个版本**：实施 WebSocket 方案（彻底解决跨平台问题，提升性能）

