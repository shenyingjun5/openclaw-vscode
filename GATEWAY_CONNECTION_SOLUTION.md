# OpenClaw VSCode 扩展 Gateway 连接问题解决方案

## 问题分析

通过研究 OpenClaw 源代码（`~/Documents/github/openclaw/src/gateway`），我发现了问题的根本原因和解决方案。

### 根本原因

OpenClaw Gateway 升级后，WebSocket 握手需要 **device identity**（设备身份验证），包括：
- publicKey（公钥）
- signature（签名）
- signedAt（签名时间）
- nonce（随机数）

这是一个安全增强功能，用于防止中间人攻击。

### 解决方案

根据 `src/gateway/role-policy.ts` 的代码：

```typescript
export function roleCanSkipDeviceIdentity(role: GatewayRole, sharedAuthOk: boolean): boolean {
  return role === "operator" && sharedAuthOk;
}
```

**关键发现**：如果满足以下条件，可以跳过 device identity：
1. `role` 为 `"operator"`
2. `sharedAuthOk` 为 `true`（提供了有效的共享认证 token）

## 实施步骤

### 步骤 1：获取 Gateway Token

首先需要获取 Gateway 的共享认证 token。

**方法 1：从配置文件读取**
```bash
# 查看 Gateway 配置
openclaw config get gateway.auth.sharedSecret

# 或者查看配置文件
cat ~/.openclaw/config.yaml | grep -A 5 "gateway:"
```

**方法 2：生成新的 token**
```bash
# 如果没有配置，可以生成一个
openclaw gateway config --set-auth-token
```

### 步骤 2：在 VSCode 中配置 Token

1. 打开 VSCode 设置（Cmd+,）
2. 搜索 "OpenClaw"
3. 找到 "Gateway Token" 设置
4. 输入从步骤 1 获取的 token

**或者通过 settings.json 配置**：
```json
{
  "openclaw.gatewayToken": "your-token-here"
}
```

### 步骤 3：验证连接

1. 重新加载 VSCode 窗口（Cmd+Shift+P -> "Reload Window"）
2. 打开 OpenClaw 聊天面板
3. 检查连接状态（应该显示"已连接"）
4. 发送一条测试消息

## 代码验证

VSCode 扩展的代码已经正确实现了 token 认证：

**文件**：`src/gatewayWSClient.ts`（第 145-148 行）

```typescript
// 如果配置了 token，添加认证
if (this.token) {
    (connectReq.params as any).auth = { token: this.token };
}
```

**文件**：`src/gateway.ts`（初始化时传递 token）

```typescript
const config = vscode.workspace.getConfiguration('openclaw');
const gatewayToken = config.get<string>('gatewayToken') || '';
gatewayClient = new GatewayClient(gatewayUrl, gatewayToken);
```

## 测试验证

### 测试脚本

我已经创建了一个测试脚本来验证这个解决方案。更新测试脚本以支持 token：

```javascript
// 在 test-websocket-gateway.js 中添加 token 参数
const gateway = new SimpleGatewayClient('ws://localhost:18789', 'your-token-here');
```

### 预期结果

配置 token 后：
- ✓ WebSocket 连接成功
- ✓ 握手成功（跳过 device identity）
- ✓ 可以发送消息
- ✓ 可以接收回复

## 替代方案

如果不想使用 token，还有其他方案：

### 方案 1：使用 localhost + allowInsecureAuth

在 Gateway 配置中启用 `allowInsecureAuth`：

```yaml
gateway:
  controlUi:
    allowInsecureAuth: true
```

这样 localhost 连接可以跳过 device identity（但仅限 localhost）。

### 方案 2：实现完整的 device identity

如果需要支持远程连接且不使用 token，需要实现完整的 device identity 加密签名逻辑：

1. 生成 Ed25519 密钥对
2. 使用私钥对连接参数签名
3. 在握手时提供 publicKey、signature、signedAt、nonce

这个方案比较复杂，不推荐用于 VSCode 扩展。

## 总结

**推荐方案**：配置 Gateway Token

这是最简单、最安全的方案：
1. 获取 Gateway 的 sharedSecret token
2. 在 VSCode 设置中配置 `openclaw.gatewayToken`
3. 重新加载 VSCode 窗口

**优点**：
- ✅ 简单易用
- ✅ 安全可靠
- ✅ 代码已经实现，无需修改
- ✅ 支持远程连接

**缺点**：
- ⚠️ 需要用户手动配置 token
- ⚠️ Token 泄露会有安全风险（但可以随时更换）

## 下一步

1. 获取 Gateway token
2. 配置到 VSCode 设置中
3. 测试连接
4. 如果还有问题，查看 VSCode 开发者工具控制台的错误信息

---

## 附录：相关源代码位置

- Gateway 握手逻辑：`~/Documents/github/openclaw/src/gateway/server/ws-connection/connect-policy.ts`
- 角色权限策略：`~/Documents/github/openclaw/src/gateway/role-policy.ts`
- VSCode 扩展 WebSocket 客户端：`~/Desktop/openclaw-vscode/src/gatewayWSClient.ts`
- VSCode 扩展 Gateway 客户端：`~/Desktop/openclaw-vscode/src/gateway.ts`
