import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProjectMemoryManager } from './projectMemoryManager';

const execAsync = promisify(exec);

export interface AgentInfo {
    id: string;           // agent id，如 "dev2"
    name: string;         // 显示名称
    emoji: string;        // 图标
    description: string;  // 描述
    workspace: string;    // workspace 路径
    model?: string;       // 默认模型
    isDefault?: boolean;  // 是否为默认 agent
}

export interface AgentCreateConfig {
    id: string;
    name: string;
    emoji: string;
    role: string;
    description?: string;
    model?: string;  // 可选的模型配置
}

/**
 * Agent 管理器
 */
export class AgentManager {
    private agentsCache: AgentInfo[] = [];
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 5000; // 5秒缓存

    constructor(private gateway?: any) { }

    /**
     * 设置 Gateway 客户端
     */
    setGateway(gateway: any) {
        this.gateway = gateway;
    }

    /**
     * 获取所有可用的 Agent
     */
    async getAvailableAgents(): Promise<AgentInfo[]> {
        // 检查缓存
        const now = Date.now();
        if (this.agentsCache.length > 0 && (now - this.cacheTimestamp) < this.CACHE_TTL) {
            return this.agentsCache;
        }

        try {
            // 方式1：通过 Gateway RPC API
            if (this.gateway && this.gateway.isConnected()) {
                const result = await this.gateway.sendRpc('agents.list', {});

                this.agentsCache = result.agents.map((a: any) => ({
                    id: a.id,
                    name: a.identity?.name || a.name || a.id,
                    emoji: a.identity?.emoji || '🤖',
                    description: a.identity?.theme || '',
                    workspace: '', // RPC 不返回 workspace 路径
                    model: a.model,
                    isDefault: a.id === result.defaultId
                }));

                this.cacheTimestamp = now;
                return this.agentsCache;
            }

            // 方式2：通过 CLI 命令
            const { stdout } = await execAsync('openclaw agents list --json');
            const agents = JSON.parse(stdout);

            this.agentsCache = agents.map((a: any) => ({
                id: a.id,
                name: a.identityName || a.name || a.id,
                emoji: a.identityEmoji || '🤖',
                description: '',
                workspace: a.workspace,
                model: a.model,
                isDefault: a.isDefault || false
            }));

            this.cacheTimestamp = now;
            return this.agentsCache;
        } catch (err) {
            console.error('[AgentManager] Failed to get agents via RPC/CLI:', err);

            // 方式3（托底）：直接读取文件系统
            const fsAgents = await this._getAgentsFromFileSystem();
            this.agentsCache = fsAgents;
            this.cacheTimestamp = now;
            return fsAgents;
        }
    }

    /**
     * 从文件系统读取 Agent 列表（托底方式）
     */
    private async _getAgentsFromFileSystem(): Promise<AgentInfo[]> {
        const agentsDir = path.join(os.homedir(), '.openclaw', 'workspace', 'agents');

        if (!fs.existsSync(agentsDir)) {
            return [];
        }

        const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
        const agents: AgentInfo[] = [];

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const agentId = entry.name;
            const agentPath = path.join(agentsDir, agentId);

            // 读取 IDENTITY.md
            const identityPath = path.join(agentPath, 'IDENTITY.md');
            let name = agentId;
            let emoji = '🤖';

            if (fs.existsSync(identityPath)) {
                const identityContent = fs.readFileSync(identityPath, 'utf-8');
                const nameMatch = identityContent.match(/Name:\s*(.+)/i);
                const emojiMatch = identityContent.match(/Emoji:\s*(.+)/i);

                if (nameMatch) name = nameMatch[1].trim();
                if (emojiMatch) emoji = emojiMatch[1].trim();
            }

            agents.push({
                id: agentId,
                name,
                emoji,
                description: '',
                workspace: agentPath,
                isDefault: agentId === 'main'
            });
        }

        return agents;
    }

    /**
     * 创建新 Agent
     */
    async createAgent(config: AgentCreateConfig): Promise<void> {
        try {
            // 方式1：优先通过 Gateway RPC API
            if (this.gateway && this.gateway.isConnected()) {
                try {
                    // 1. 创建 agent
                    const result = await this.gateway.sendRpc('agents.create', {
                        name: config.name,
                        workspace: `~/.openclaw/workspace/agents/${config.id}`,
                        emoji: config.emoji
                    });

                    // 2. 写入 IDENTITY.md 和 SOUL.md（使用文件系统，因为 agents.files.set RPC 不可用）
                    const agentPath = path.join(os.homedir(), '.openclaw', 'workspace', 'agents', config.id);

                    const identityContent = this._getIdentityTemplate(config.role, config.name, config.emoji);
                    fs.writeFileSync(path.join(agentPath, 'IDENTITY.md'), identityContent, 'utf-8');

                    const soulContent = this._getRoleTemplate(config.role, config.description);
                    fs.writeFileSync(path.join(agentPath, 'SOUL.md'), soulContent, 'utf-8');

                    // 清除缓存
                    this.agentsCache = [];

                    // 记录成功
                    await ProjectMemoryManager.getInstance().appendDailyLog({
                        time: new Date(),
                        type: 'operation',
                        operation: 'createAgent',
                        params: { id: config.id, name: config.name, role: config.role },
                        result: 'success'
                    });

                    return;
                } catch (rpcErr: any) {
                    console.warn('[AgentManager] RPC create failed, falling back to CLI:', rpcErr.message);

                    // 检查 agent 是否已经创建成功（可能是写入文件失败）
                    const exists = await this.agentExists(config.id);
                    if (exists) {
                        // Agent 已创建，但文件写入失败，使用文件系统方式写入
                        console.log('[AgentManager] Agent exists, writing files via filesystem');
                        const agentPath = path.join(os.homedir(), '.openclaw', 'workspace', 'agents', config.id);

                        const identityContent = this._getIdentityTemplate(config.role, config.name, config.emoji);
                        fs.writeFileSync(path.join(agentPath, 'IDENTITY.md'), identityContent, 'utf-8');

                        const soulContent = this._getRoleTemplate(config.role, config.description);
                        fs.writeFileSync(path.join(agentPath, 'SOUL.md'), soulContent, 'utf-8');

                        this.agentsCache = [];

                        await ProjectMemoryManager.getInstance().appendDailyLog({
                            time: new Date(),
                            type: 'operation',
                            operation: 'createAgent',
                            params: { id: config.id, name: config.name, role: config.role },
                            result: 'success'
                        });

                        return;
                    }
                    // RPC 失败且 agent 不存在，继续使用 CLI 方式
                }
            }

            // 方式2：通过 CLI 创建 agent（兜底）
            const workspace = `~/.openclaw/workspace/agents/${config.id}`;
            await execAsync(`openclaw agents add ${config.id} --non-interactive --workspace ${workspace}`);

            // 写入 IDENTITY.md
            const agentPath = path.join(os.homedir(), '.openclaw', 'workspace', 'agents', config.id);
            const identityContent = this._getIdentityTemplate(config.role, config.name, config.emoji);
            fs.writeFileSync(path.join(agentPath, 'IDENTITY.md'), identityContent, 'utf-8');

            // 写入 SOUL.md（使用预设模板）
            const soulContent = this._getRoleTemplate(config.role, config.description);
            fs.writeFileSync(path.join(agentPath, 'SOUL.md'), soulContent, 'utf-8');

            // 清除缓存
            this.agentsCache = [];

            // 记录到项目日志
            await ProjectMemoryManager.getInstance().appendDailyLog({
                time: new Date(),
                type: 'operation',
                operation: 'createAgent',
                params: { id: config.id, name: config.name, role: config.role },
                result: 'success'
            });

        } catch (err: any) {
            // 记录失败
            await ProjectMemoryManager.getInstance().appendDailyLog({
                time: new Date(),
                type: 'operation',
                operation: 'createAgent',
                params: { id: config.id, name: config.name },
                result: 'failure'
            });

            throw new Error(`Failed to create agent: ${err.message}`);
        }
    }

    /**
     * 获取 IDENTITY 模板
     */
    private _getIdentityTemplate(role: string, name: string, emoji: string): string {
        // 尝试从模板文件读取
        const templatePath = path.join(__dirname, '..', 'agent-templates', `${role}-IDENTITY.md`);

        if (fs.existsSync(templatePath)) {
            // 读取模板并替换占位符
            let template = fs.readFileSync(templatePath, 'utf-8');
            // 如果用户自定义了名称和 emoji，使用用户的
            // 否则使用模板中的默认值
            return template;
        }

        // 如果模板文件不存在，使用简单格式
        return `# IDENTITY.md

- **Name:** ${name}
- **Emoji:** ${emoji}
`;
    }

    /**
     * 获取角色模板
     */
    private _getRoleTemplate(role: string, description?: string): string {
        // 尝试从模板文件读取
        const templatePath = path.join(__dirname, '..', 'agent-templates', `${role}-SOUL.md`);

        if (fs.existsSync(templatePath)) {
            let template = fs.readFileSync(templatePath, 'utf-8');

            // 如果有自定义描述，追加到模板后面
            if (description && description.trim()) {
                template += `\n\n## 自定义描述\n${description}\n`;
            }

            return template;
        }

        // 如果模板文件不存在，使用内置模板（向后兼容）
        const templates: { [key: string]: string } = {
            'fullstack': `# SOUL.md - 全栈开发

## 核心
我是全栈开发专家，精通前后端技术栈。

## 专长
- 前端：React / Vue / Angular
- 后端：Node.js / Python / Java / Go
- 数据库：SQL / NoSQL
- DevOps：Docker / K8s / CI/CD

## 风格
- 注重代码质量和架构设计
- 遵循最佳实践和设计模式
- 关注性能优化和可扩展性
`,
            'frontend': `# SOUL.md - 前端专家

## 核心
我是前端专家，专注于现代前端技术栈。

## 专长
- React / Vue / Angular
- TypeScript / JavaScript
- CSS / Tailwind / Styled Components
- 性能优化
- 用户体验设计

## 风格
- 注重代码质量和可维护性
- 关注用户体验和性能
- 遵循最佳实践和设计模式
`,
            'backend': `# SOUL.md - 后端专家

## 核心
我是后端专家，专注于服务端开发和架构设计。

## 专长
- API 设计（RESTful / GraphQL）
- 数据库设计与优化
- 微服务架构
- 性能优化和缓存策略
- 安全性和认证授权

## 风格
- 注重系统稳定性和可扩展性
- 关注性能和安全
- 遵循最佳实践
`,
            'devops': `# SOUL.md - DevOps 工程师

## 核心
我是 DevOps 工程师，专注于自动化和基础设施。

## 专长
- CI/CD 流水线
- 容器化（Docker / K8s）
- 云原生架构
- 基础设施即代码（Terraform / Ansible）
- 监控和日志

## 风格
- 注重自动化和效率
- 关注系统稳定性和可靠性
- 遵循 DevOps 最佳实践
`,
            'tester': `# SOUL.md - 测试工程师

## 核心
我是测试工程师，专注于软件质量保证。

## 专长
- 单元测试（Jest / Pytest / JUnit）
- 集成测试
- 端到端测试（Cypress / Selenium）
- 测试驱动开发（TDD）
- 性能测试和压力测试

## 风格
- 注重测试覆盖率和质量
- 关注边界情况和异常处理
- 遵循测试最佳实践
`,
            'architect': `# SOUL.md - 架构师

## 核心
我是架构师，专注于系统设计和技术选型。

## 专长
- 系统架构设计
- 技术选型和评估
- 性能优化和可扩展性
- 微服务和分布式系统
- 安全架构

## 风格
- 注重系统的长期演进
- 关注性能、可扩展性、可维护性
- 平衡技术和业务需求
`
        };

        let template = templates[role] || templates['fullstack'];

        // 如果有自定义描述，追加到模板后面
        if (description && description.trim()) {
            template += `\n## 自定义描述\n${description}\n`;
        }

        return template;
    }

    /**
     * 检查 Agent 是否存在
     */
    async agentExists(agentId: string): Promise<boolean> {
        const agents = await this.getAvailableAgents();
        return agents.some(a => a.id === agentId);
    }

    /**
     * 为 Agent 创建项目软连接
     */
    async linkProjectToAgent(agentId: string, projectPath: string): Promise<void> {
        const projectName = path.basename(projectPath);
        const agentWorkspace = path.join(os.homedir(), '.openclaw', 'workspace', 'agents', agentId);
        const projectsDir = path.join(agentWorkspace, 'projects');
        const linkPath = path.join(projectsDir, projectName);

        // 确保 projects 目录存在
        if (!fs.existsSync(projectsDir)) {
            fs.mkdirSync(projectsDir, { recursive: true });
        }

        // 如果链接已存在，先删除
        if (fs.existsSync(linkPath)) {
            if (process.platform === 'win32') {
                // Windows: 删除 junction
                await execAsync(`rmdir "${linkPath}"`);
            } else {
                // Mac/Unix: 删除符号链接
                fs.unlinkSync(linkPath);
            }
        }

        // 创建软连接
        try {
            if (process.platform === 'win32') {
                // Windows: 使用 Junction（不需要管理员权限）
                await execAsync(`mklink /J "${linkPath}" "${projectPath}"`);
            } else {
                // Mac/Unix: 使用符号链接
                fs.symlinkSync(projectPath, linkPath);
            }
        } catch (err: any) {
            // Windows 上如果 Junction 失败，尝试符号链接
            if (process.platform === 'win32') {
                try {
                    await execAsync(`mklink /D "${linkPath}" "${projectPath}"`);
                } catch (err2: any) {
                    throw new Error(`Failed to create project link. Please enable Developer Mode in Windows Settings. Error: ${err2.message}`);
                }
            } else {
                throw err;
            }
        }
    }

    /**
     * 获取 Workspace 关联的 Agent
     */
    async getAgentForWorkspace(workspacePath: string): Promise<string | null> {
        // 1. 优先读取项目目录下的 .openclaw/agent
        const projectAgentFile = path.join(workspacePath, '.openclaw', 'agent');
        if (fs.existsSync(projectAgentFile)) {
            return fs.readFileSync(projectAgentFile, 'utf-8').trim();
        }

        // 2. 读取全局映射文件
        const mappingFile = path.join(os.homedir(), '.openclaw', 'workspace-mappings.json');
        if (fs.existsSync(mappingFile)) {
            try {
                const mappings = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
                if (mappings[workspacePath]) {
                    return mappings[workspacePath];
                }
            } catch (err) {
                console.error('[AgentManager] Failed to read workspace mappings:', err);
            }
        }

        return null;
    }

    /**
     * 保存 Workspace 关联的 Agent
     */
    async saveAgentForWorkspace(workspacePath: string, agentId: string): Promise<void> {
        // 1. 保存到项目本地 .openclaw/agent 文件
        try {
            const projectOpenclawDir = path.join(workspacePath, '.openclaw');
            if (!fs.existsSync(projectOpenclawDir)) {
                fs.mkdirSync(projectOpenclawDir, { recursive: true });
            }

            const projectAgentFile = path.join(projectOpenclawDir, 'agent');
            fs.writeFileSync(projectAgentFile, agentId, 'utf-8');
            console.log('[AgentManager] Saved agent to project:', projectAgentFile);
        } catch (err) {
            console.error('[AgentManager] Failed to save agent to project:', err);
        }

        // 2. 同时保存到全局映射文件（兜底）
        try {
            const mappingFile = path.join(os.homedir(), '.openclaw', 'workspace-mappings.json');

            let mappings: { [key: string]: string } = {};
            if (fs.existsSync(mappingFile)) {
                try {
                    mappings = JSON.parse(fs.readFileSync(mappingFile, 'utf-8'));
                } catch (err) {
                    console.error('[AgentManager] Failed to read workspace mappings:', err);
                }
            }

            mappings[workspacePath] = agentId;

            // 确保目录存在
            const dir = path.dirname(mappingFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(mappingFile, JSON.stringify(mappings, null, 2), 'utf-8');
            console.log('[AgentManager] Saved agent to global mappings');
        } catch (err) {
            console.error('[AgentManager] Failed to save agent to global mappings:', err);
        }
    }

    /**
     * 删除 Agent
     */
    async deleteAgent(agentId: string, deleteFiles: boolean = true): Promise<void> {
        try {
            // 通过 Gateway RPC API 删除
            if (this.gateway && this.gateway.isConnected()) {
                await this.gateway.sendRpc('agents.delete', {
                    agentId: agentId,
                    deleteFiles: deleteFiles
                });

                // 清除缓存
                this.agentsCache = [];

                // 记录到项目日志
                await ProjectMemoryManager.getInstance().appendDailyLog({
                    time: new Date(),
                    type: 'operation',
                    operation: 'deleteAgent',
                    params: { id: agentId, deleteFiles: deleteFiles },
                    result: 'success'
                });

                return;
            }

            // 如果 Gateway 不可用，抛出错误
            throw new Error('Gateway not connected. Cannot delete agent via CLI.');

        } catch (err: any) {
            // 记录失败
            await ProjectMemoryManager.getInstance().appendDailyLog({
                time: new Date(),
                type: 'operation',
                operation: 'deleteAgent',
                params: { id: agentId },
                result: 'failure'
            });

            throw new Error(`Failed to delete agent: ${err.message}`);
        }
    }

    /**
     * 更新 Agent
     */
    async updateAgent(agentId: string, updates: {
        name?: string;
        workspace?: string;
        model?: string;
        emoji?: string;
    }): Promise<void> {
        try {
            // 通过 Gateway RPC API 更新
            if (this.gateway && this.gateway.isConnected()) {
                await this.gateway.sendRpc('agents.update', {
                    agentId: agentId,
                    ...updates
                });

                // 清除缓存
                this.agentsCache = [];
                return;
            }

            // 如果 Gateway 不可用，抛出错误
            throw new Error('Gateway not connected. Cannot update agent via CLI.');

        } catch (err: any) {
            throw new Error(`Failed to update agent: ${err.message}`);
        }
    }
}
