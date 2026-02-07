# Windows 下 OpenClaw VSCode 插件找不到 CLI 的问题分析

## 🔍 问题描述

**错误信息**: `OpenClaw: 连接失败 - Cannot find openclaw: spawn openclaw ENOENT`

**原因**: Windows 系统中找不到 `openclaw` 命令

---

## 📊 当前实现分析

### 1️⃣ **CLI 查找逻辑** (`src/gateway.ts`)

```typescript
private _findOpenclawPath(customPath?: string): string {
    // 1. 优先使用用户自定义路径
    if (customPath && fs.existsSync(customPath)) {
        return customPath;
    }

    // 2. 根据平台预设路径
    if (isWindows) {
        possiblePaths = [
            path.join(appData, 'npm', 'openclaw.cmd'),            // npm global
            path.join(localAppData, 'Programs', 'openclaw', 'openclaw.exe'),  // scoop
            path.join('C:\\ProgramData', 'chocolatey', 'bin', 'openclaw.exe'), // chocolatey
            path.join(userProfile, 'AppData', 'Roaming', 'npm', 'openclaw.cmd'),
        ];
    }

    // 3. 逐个验证，返回第一个存在的路径
    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            return p;
        }
    }

    // 4. 兜底：依赖系统 PATH
    return 'openclaw';
}
```

### 2️⃣ **用户配置方式**

**已存在的配置项** (`package.json`):

```json
{
  "openclaw.openclawPath": {
    "type": "string",
    "default": "",
    "description": "Path to openclaw binary (auto-detected if empty). Example: C:\\Users\\you\\AppData\\Roaming\\npm\\openclaw.cmd"
  }
}
```

**初始化** (`src/extension.ts`):

```typescript
const config = vscode.workspace.getConfiguration('openclaw');
const openclawPath = config.get<string>('openclawPath') || '';

gatewayClient = new GatewayClient(gatewayUrl, openclawPath || undefined);
```

### 3️⃣ **当前通信方式**

插件使用 **两种通信方式**：

| 功能 | 通信方式 | 实现 |
|------|----------|------|
| 发送消息 | CLI (`spawn`) | `openclaw agent --message "..." --session-id "..." --json` |
| 获取历史 | CLI (`spawn`) | `openclaw sessions history --session "..." --json` |
| 获取会话列表 | CLI (`spawn`) | `openclaw sessions list --json` |
| 设置模型 | CLI (`spawn`) | `openclaw models set <model>` |
| 删除会话 | **Gateway HTTP** | `POST http://127.0.0.1:18789/api/rpc` |

**问题**: 大部分功能依赖 CLI，只有删除会话用了 HTTP。

---

## 🚨 Windows 特有问题

### 问题 1: npm 全局安装路径不固定

Windows npm 全局安装路径可能在：
- `%APPDATA%\npm\openclaw.cmd` (默认)
- `%USERPROFILE%\AppData\Roaming\npm\openclaw.cmd`
- `C:\Program Files\nodejs\openclaw.cmd`
- 自定义 npm prefix 路径

### 问题 2: `.cmd` 文件需要通过 `cmd.exe` 执行

Windows 下 `.cmd` 文件不是可执行文件，需要：
```javascript
spawn('cmd.exe', ['/c', 'openclaw.cmd', ...args])
```

### 问题 3: PATH 环境变量可能不包含 npm 全局路径

VSCode 进程继承的 PATH 可能不包含 npm 全局路径。

---

## 🔧 解决方案

### 方案 A: 增强自动检测（推荐用于快速修复）

#### A1. 扩展 Windows 检测路径

```typescript
if (isWindows) {
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const programFiles = process.env.PROGRAMFILES || '';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || '';
    
    // 获取 npm prefix
    const npmPrefix = this._getNpmPrefix();
    
    possiblePaths = [
        // npm global (多种可能)
        npmPrefix ? path.join(npmPrefix, 'openclaw.cmd') : '',
        path.join(appData, 'npm', 'openclaw.cmd'),
        path.join(userProfile, 'AppData', 'Roaming', 'npm', 'openclaw.cmd'),
        path.join(programFiles, 'nodejs', 'openclaw.cmd'),
        
        // scoop
        path.join(localAppData, 'Programs', 'openclaw', 'openclaw.exe'),
        path.join(userProfile, 'scoop', 'shims', 'openclaw.cmd'),
        
        // chocolatey
        'C:\\ProgramData\\chocolatey\\bin\\openclaw.exe',
        
        // winget / msi 安装
        path.join(programFiles, 'OpenClaw', 'openclaw.exe'),
        path.join(programFilesX86, 'OpenClaw', 'openclaw.exe'),
    ].filter(Boolean);
}

private _getNpmPrefix(): string | null {
    try {
        const result = execSync('npm config get prefix', { 
            encoding: 'utf-8',
            timeout: 3000 
        });
        return result.trim();
    } catch {
        return null;
    }
}
```

#### A2. 修复 `.cmd` 文件执行

```typescript
private _getSpawnCommand(args: string[]): { cmd: string; args: string[] } {
    const isWindows = process.platform === 'win32';
    const isCmdFile = this._openclawPath.endsWith('.cmd');
    
    if (isWindows && isCmdFile) {
        // Windows .cmd 文件需要通过 cmd.exe 执行
        return {
            cmd: 'cmd.exe',
            args: ['/c', this._openclawPath, ...args]
        };
    }
    
    return {
        cmd: this._openclawPath,
        args: args
    };
}

// 在 spawn 时调用
public async sendMessage(...) {
    const spawnCmd = this._getSpawnCommand(['agent', '--message', ...]);
    const proc = spawn(spawnCmd.cmd, spawnCmd.args, {
        env: this._getSpawnEnv()
    });
    // ...
}
```

---

### 方案 B: 完全切换到 Gateway HTTP API（推荐用于长期）

**优势**:
- ✅ 不依赖 CLI 路径
- ✅ 跨平台一致
- ✅ 性能更好（无需启动新进程）
- ✅ 支持更多功能（如流式输出）

**需要确认的 Gateway API 端点**:

| 功能 | CLI 命令 | Gateway API 端点（推测） |
|------|----------|-------------------------|
| 发送消息 | `openclaw agent --message` | `POST /api/rpc` → `agent.send` |
| 获取历史 | `openclaw sessions history` | `POST /api/rpc` → `sessions.history` |
| 获取会话列表 | `openclaw sessions list` | `POST /api/rpc` → `sessions.list` |
| 设置模型 | `openclaw models set` | `POST /api/rpc` → `models.set` |
| 删除会话 | ✅ 已实现 | `POST /api/rpc` → `sessions.delete` |

**实现示例**:

```typescript
export class GatewayClient {
    private _gatewayUrl: string;
    private _useHttp: boolean = true;  // 优先使用 HTTP
    
    constructor(gatewayUrl: string, customPath?: string) {
        this._gatewayUrl = gatewayUrl;
        this._openclawPath = this._findOpenclawPath(customPath);
        
        // 如果找不到 CLI 路径，强制使用 HTTP
        if (this._openclawPath === 'openclaw') {
            this._useHttp = true;
        }
    }
    
    public async sendMessage(sessionId: string, message: string): Promise<Message> {
        if (this._useHttp) {
            return this._sendMessageViaHttp(sessionId, message);
        } else {
            return this._sendMessageViaCli(sessionId, message);
        }
    }
    
    private async _sendMessageViaHttp(sessionId: string, message: string): Promise<Message> {
        const response = await fetch(`${this._gatewayUrl}/api/rpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'req',
                id: `msg-${Date.now()}`,
                method: 'agent.send',
                params: {
                    sessionId: sessionId,
                    message: message
                }
            })
        });
        
        const result = await response.json();
        return {
            role: 'assistant',
            content: result.result?.content || '',
            timestamp: new Date().toISOString()
        };
    }
    
    private async _sendMessageViaCli(sessionId: string, message: string): Promise<Message> {
        // 原有 CLI 实现
        // ...
    }
}
```

---

### 方案 C: 提供友好的手动配置引导

**当找不到 CLI 时，显示配置引导**:

```typescript
private async _showConfigurationGuide(): Promise<void> {
    const action = await vscode.window.showErrorMessage(
        'OpenClaw CLI not found. Please configure the path to openclaw.',
        'Open Settings',
        'Learn More'
    );
    
    if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'openclaw.openclawPath');
    } else if (action === 'Learn More') {
        vscode.env.openExternal(vscode.Uri.parse('https://docs.openclaw.ai/vscode-extension#windows-setup'));
    }
}
```

**在 README 中添加 Windows 配置说明**:

```markdown
### Windows Setup

If you encounter "Cannot find openclaw" error:

1. Find your openclaw path:
   ```cmd
   where openclaw
   ```

2. Open VS Code Settings (`Ctrl+,`)
3. Search for "OpenClaw: Openclaw Path"
4. Set the path, for example:
   - npm: `C:\Users\YourName\AppData\Roaming\npm\openclaw.cmd`
   - Chocolatey: `C:\ProgramData\chocolatey\bin\openclaw.exe`
```

---

### 方案 D: 混合方案（推荐最终实施）

**分层策略**:

```
1. 尝试 Gateway HTTP API (优先)
   ↓ 失败
2. 尝试用户配置的 CLI 路径
   ↓ 失败
3. 尝试自动检测的 CLI 路径
   ↓ 失败
4. 显示配置引导
```

**实现**:

```typescript
export class GatewayClient {
    private _connectionMode: 'http' | 'cli' | 'none' = 'none';
    
    public async connect(): Promise<void> {
        // 1. 尝试 HTTP
        if (await this._tryConnectHttp()) {
            this._connectionMode = 'http';
            this._connected = true;
            return;
        }
        
        // 2. 尝试 CLI
        if (await this._tryConnectCli()) {
            this._connectionMode = 'cli';
            this._connected = true;
            return;
        }
        
        // 3. 显示配置引导
        await this._showConfigurationGuide();
        throw new Error('Cannot connect to OpenClaw');
    }
    
    private async _tryConnectHttp(): Promise<boolean> {
        try {
            const response = await fetch(`${this._gatewayUrl}/api/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }
    
    private async _tryConnectCli(): Promise<boolean> {
        try {
            await this._checkOpenclawAvailable();
            return true;
        } catch {
            return false;
        }
    }
}
```

---

## 📋 推荐实施方案

### **阶段 1: 快速修复（立即实施）**

1. ✅ **扩展 Windows 路径检测** (方案 A1)
   - 添加 `npm config get prefix` 检测
   - 添加更多常见安装路径
   
2. ✅ **修复 `.cmd` 文件执行** (方案 A2)
   - 检测 `.cmd` 后缀
   - 通过 `cmd.exe /c` 执行

3. ✅ **添加配置引导** (方案 C)
   - 连接失败时显示友好提示
   - 提供设置跳转

### **阶段 2: 长期优化（后续实施）**

1. ✅ **实现 Gateway HTTP API 支持** (方案 B)
   - 调研并实现所有必要的 RPC 方法
   - 优先使用 HTTP，CLI 作为备选

2. ✅ **混合连接策略** (方案 D)
   - HTTP → 用户配置 CLI → 自动检测 CLI → 引导配置

---

## 🎯 最小修改快速修复（仅针对当前问题）

**只需修改 `src/gateway.ts` 两处**:

### 修改 1: 扩展 Windows 路径

```typescript
if (isWindows) {
    const npmPrefix = this._getNpmPrefix();
    possiblePaths = [
        npmPrefix ? path.join(npmPrefix, 'openclaw.cmd') : '',
        path.join(appData, 'npm', 'openclaw.cmd'),
        path.join(userProfile, 'AppData', 'Roaming', 'npm', 'openclaw.cmd'),
        path.join(userProfile, 'scoop', 'shims', 'openclaw.cmd'),
        path.join(localAppData, 'Programs', 'openclaw', 'openclaw.exe'),
        'C:\\ProgramData\\chocolatey\\bin\\openclaw.exe',
    ].filter(Boolean);
}

private _getNpmPrefix(): string | null {
    try {
        const { execSync } = require('child_process');
        const result = execSync('npm config get prefix', { 
            encoding: 'utf-8',
            timeout: 3000 
        });
        return result.trim();
    } catch {
        return null;
    }
}
```

### 修改 2: 修复 `.cmd` 执行

在所有 `spawn(this._openclawPath, args, ...)` 调用前添加：

```typescript
let cmd = this._openclawPath;
let cmdArgs = args;

if (process.platform === 'win32' && this._openclawPath.endsWith('.cmd')) {
    cmd = 'cmd.exe';
    cmdArgs = ['/c', this._openclawPath, ...args];
}

const proc = spawn(cmd, cmdArgs, { env: this._getSpawnEnv() });
```

---

## 总结

**当前问题根源**: 
1. Windows npm 全局路径多样化
2. `.cmd` 文件需要特殊处理
3. PATH 环境变量可能不正确

**推荐优先级**:
1. 🔥 **立即**: 实施阶段 1（扩展检测 + 修复 .cmd + 配置引导）
2. ⚠️ **短期**: 调研 Gateway HTTP API 可行性
3. ✅ **长期**: 完全切换到 HTTP API，CLI 作为备选

