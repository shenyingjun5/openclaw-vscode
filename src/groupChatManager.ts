/**
 * groupChatManager.ts
 * Manages agent group chat: members, message routing, context injection.
 * Singleton — shared across ChatController instances.
 */

import { GatewayClient } from './gateway';
import { buildSessionKey } from './agentConfig';
import { parseMentions } from './mentionParser';

// ─── Color palette ────────────────────────────────────────────────────────────
export const AGENT_COLORS = [
    '#3b82f6', // blue
    '#22c55e', // green
    '#a855f7', // purple
    '#f59e0b', // amber
    '#ef4444', // red
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
];

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AgentMember {
    agentId: string;
    sessionKey: string;
    name: string;
    avatar: string;
    color: string;
}

export interface GroupMessage {
    id: string;
    role: 'user' | 'agent';
    agentId?: string;
    agentName?: string;
    agentColor?: string;
    content: string;
    mentions: string[];    // parsed @mentions
    timestamp: number;     // Date.now()
}

export type GroupMessageCallback = (msg: GroupMessage) => void;
export type GroupStateCallback = (agents: AgentMember[]) => void;

// ─── Manager ──────────────────────────────────────────────────────────────────
export class GroupChatManager {
    private static _instance: GroupChatManager | null = null;

    private _gateway: GatewayClient | null = null;
    private _windowId: string = '';
    private _agents: Map<string, AgentMember> = new Map();
    private _messages: GroupMessage[] = [];
    private _colorIndex: number = 0;

    // runId → agentId mapping for in-flight requests
    private _pendingRunIds: Map<string, string> = new Map();

    // Callbacks
    private _messageCallbacks: GroupMessageCallback[] = [];
    private _stateCallbacks: GroupStateCallback[] = [];

    // Gateway chat event handler
    private _chatEventHandler: ((payload: any) => void) | null = null;

    private constructor() {}

    public static getInstance(): GroupChatManager {
        if (!GroupChatManager._instance) {
            GroupChatManager._instance = new GroupChatManager();
        }
        return GroupChatManager._instance;
    }

    // ── Initialization ────────────────────────────────────────────────────────

    public initialize(gateway: GatewayClient, windowId: string): void {
        this._gateway = gateway;
        this._windowId = windowId;
        this._setupChatEventListener();
    }

    private _setupChatEventListener(): void {
        if (!this._gateway) {
            return;
        }

        // Remove old handler first
        if (this._chatEventHandler) {
            this._gateway.offChatEvent(this._chatEventHandler);
        }

        const handler = (payload: any) => {
            if (!payload) {
                return;
            }

            const eventSessionKey: string = payload.sessionKey || '';
            const eventRunId: string = payload.runId || '';
            const state: string = payload.state || '';

            // Find which agent this event belongs to
            let matchedAgent: AgentMember | undefined;
            for (const agent of this._agents.values()) {
                const suffix = agent.sessionKey.replace(/^agent:[^:]+:/, '');
                if (eventSessionKey.includes(suffix)) {
                    matchedAgent = agent;
                    break;
                }
            }

            if (!matchedAgent) {
                return;
            }

            if (state === 'final') {
                if (eventRunId) {
                    this._pendingRunIds.delete(eventRunId);
                }
                this._fetchLatestAgentMessage(matchedAgent);
            } else if (state === 'error' || state === 'aborted') {
                if (eventRunId) {
                    this._pendingRunIds.delete(eventRunId);
                }
                // Notify with empty so UI can clear thinking indicator
                this._notifyMessage({
                    id: `agent-err-${Date.now()}`,
                    role: 'agent',
                    agentId: matchedAgent.agentId,
                    agentName: matchedAgent.name,
                    agentColor: matchedAgent.color,
                    content: '',
                    mentions: [],
                    timestamp: Date.now(),
                });
            }
        };

        this._chatEventHandler = handler;
        this._gateway.onChatEvent(handler);
    }

    // ── Agent Management ──────────────────────────────────────────────────────

    public async addAgent(agentId: string): Promise<AgentMember> {
        if (this._agents.has(agentId)) {
            return this._agents.get(agentId)!;
        }

        const color = AGENT_COLORS[this._colorIndex % AGENT_COLORS.length];
        this._colorIndex++;

        const sessionKey = buildSessionKey(agentId, `vscode-group-${this._windowId}`);

        // Try to get identity from gateway
        let name = agentId;
        let avatar = '';
        if (this._gateway) {
            try {
                const identity = await this._gateway.getAgentIdentity(agentId);
                if (identity) {
                    name = identity.name || agentId;
                    avatar = identity.avatar || '';
                }
            } catch {
                // Use defaults
            }
        }

        const member: AgentMember = { agentId, sessionKey, name, avatar, color };
        this._agents.set(agentId, member);

        this._notifyState();
        return member;
    }

    public removeAgent(agentId: string): void {
        const agent = this._agents.get(agentId);
        if (!agent) {
            return;
        }

        // Delete gateway session asynchronously
        if (this._gateway) {
            this._gateway.deleteSession(agent.sessionKey).catch(() => {});
        }

        this._agents.delete(agentId);
        this._notifyState();
    }

    public getAgents(): AgentMember[] {
        return Array.from(this._agents.values());
    }

    public hasAgent(agentId: string): boolean {
        return this._agents.has(agentId);
    }

    public isGroupMode(): boolean {
        return this._agents.size > 0;
    }

    // ── Messaging ─────────────────────────────────────────────────────────────

    /**
     * Send a message to the appropriate agents.
     * Parses @mentions; broadcasts to all if no mention present.
     * Returns Map of agentId → runId for tracking.
     */
    public async sendGroupMessage(content: string): Promise<Map<string, string>> {
        if (!this._gateway) {
            throw new Error('GroupChatManager not initialized');
        }

        const agentIds = Array.from(this._agents.keys());
        const mentions = parseMentions(content, agentIds);

        // Record user message
        const userMsg: GroupMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content,
            mentions,
            timestamp: Date.now(),
        };
        this._messages.push(userMsg);
        this._notifyMessage(userMsg);

        // Determine targets
        const targetAgents: AgentMember[] = mentions.length > 0
            ? mentions
                .map(id => this._agents.get(id))
                .filter((a): a is AgentMember => a !== undefined)
            : Array.from(this._agents.values());

        if (targetAgents.length === 0) {
            return new Map();
        }

        // Build context prefix
        const contextPrefix = this._buildGroupContext(userMsg.id);
        const fullMessage = contextPrefix
            ? `${contextPrefix}\n\n---\n[Your turn to respond]\n${content}`
            : content;

        // Fan-out to target agents
        const runIds = new Map<string, string>();
        for (const agent of targetAgents) {
            const runId = crypto.randomUUID();
            this._pendingRunIds.set(runId, agent.agentId);
            try {
                await this._gateway.sendChat(agent.sessionKey, fullMessage, runId);
                runIds.set(agent.agentId, runId);
            } catch (err) {
                this._pendingRunIds.delete(runId);
                console.error(`[GroupChat] Failed to send to ${agent.agentId}:`, err);
            }
        }

        return runIds;
    }

    private _buildGroupContext(excludeId: string): string {
        const recent = this._messages
            .filter(m => m.id !== excludeId)
            .slice(-20);

        if (recent.length === 0) {
            return '';
        }

        const lines: string[] = ['[Group Chat Context - Recent Messages]'];
        for (const msg of recent) {
            if (msg.role === 'user') {
                lines.push(`User: ${msg.content}`);
            } else {
                lines.push(`@${msg.agentName || msg.agentId}: ${msg.content}`);
            }
        }
        lines.push('---');
        return lines.join('\n');
    }

    private async _fetchLatestAgentMessage(agent: AgentMember): Promise<void> {
        if (!this._gateway) {
            return;
        }
        try {
            const history = await this._gateway.getHistory(agent.sessionKey, 10);
            const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
            if (!lastAssistant) {
                return;
            }

            let content = lastAssistant.content as any;
            if (Array.isArray(content)) {
                content = content
                    .filter((c: any) => c && (c.type === 'text' || c.type === 'output_text'))
                    .map((c: any) => c.text || '')
                    .join('');
            }
            content = String(content || '')
                .replace(/<think>[\s\S]*?<\/think>/g, '')
                .replace(/<\/?final>/g, '')
                .trim();

            if (!content) {
                return;
            }

            const msg: GroupMessage = {
                id: `agent-${agent.agentId}-${Date.now()}`,
                role: 'agent',
                agentId: agent.agentId,
                agentName: agent.name,
                agentColor: agent.color,
                content,
                mentions: [],
                timestamp: Date.now(),
            };
            this._messages.push(msg);
            this._notifyMessage(msg);
        } catch (err) {
            console.warn(`[GroupChat] Failed to fetch message for ${agent.agentId}:`, err);
        }
    }

    // ── Group History ─────────────────────────────────────────────────────────

    public getMessages(): GroupMessage[] {
        return this._messages;
    }

    public clearMessages(): void {
        this._messages = [];
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    /**
     * Leave group chat: delete all agent sessions and reset state.
     */
    public leaveGroup(): void {
        if (this._gateway) {
            for (const agent of this._agents.values()) {
                this._gateway.deleteSession(agent.sessionKey).catch(() => {});
            }
        }

        this._agents.clear();
        this._messages = [];
        this._pendingRunIds.clear();
        this._colorIndex = 0;

        this._notifyState();
    }

    public dispose(): void {
        if (this._gateway && this._chatEventHandler) {
            this._gateway.offChatEvent(this._chatEventHandler);
            this._chatEventHandler = null;
        }
        this.leaveGroup();
        this._messageCallbacks = [];
        this._stateCallbacks = [];
    }

    // ── Callbacks ─────────────────────────────────────────────────────────────

    public onMessage(cb: GroupMessageCallback): void {
        this._messageCallbacks.push(cb);
    }

    public offMessage(cb: GroupMessageCallback): void {
        this._messageCallbacks = this._messageCallbacks.filter(fn => fn !== cb);
    }

    public onStateChange(cb: GroupStateCallback): void {
        this._stateCallbacks.push(cb);
    }

    public offStateChange(cb: GroupStateCallback): void {
        this._stateCallbacks = this._stateCallbacks.filter(fn => fn !== cb);
    }

    private _notifyMessage(msg: GroupMessage): void {
        for (const cb of this._messageCallbacks) {
            try { cb(msg); } catch { /* ignore */ }
        }
    }

    private _notifyState(): void {
        const agents = this.getAgents();
        for (const cb of this._stateCallbacks) {
            try { cb(agents); } catch { /* ignore */ }
        }
    }
}
