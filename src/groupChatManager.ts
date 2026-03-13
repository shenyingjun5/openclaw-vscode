/**
 * groupChatManager.ts
 * Manages agent group chat: members, message routing, context injection.
 * Singleton — shared across ChatController instances.
 */

import * as vscode from 'vscode';
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

// ─── Constants ────────────────────────────────────────────────────────────────
/** Max agent responses allowed per single user message (anti-loop) */
const MAX_RESPONSES_PER_ROUND = 10;

/** Default max agent→agent delegation depth */
const DEFAULT_MAX_DELEGATION_DEPTH = 3;

/** Max times a single agent can respond per user message */
const MAX_AGENT_RESPONSES_PER_ROUND = 2;

/** Max total responses across all agents per user message */
const MAX_TOTAL_RESPONSES = 8;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AgentMember {
    agentId: string;
    sessionKey: string;
    name: string;
    avatar: string;
    color: string;
    modelOverride?: string;   // undefined = use agent's configured default
}

export interface GroupMessage {
    id: string;
    parentMessageId?: string;  // for threading/delegation chain
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
export type GroupWarningCallback = (reason: 'loop_limit') => void;

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

    // Anti-loop: count agent responses since last user message
    private _responseCountThisRound: number = 0;
    // Anti-loop: only fan-out triggered by user send
    private _userMessageInFlight: boolean = false;

    // Delegation tracking
    private _maxDelegationDepth: number = DEFAULT_MAX_DELEGATION_DEPTH;
    private _conversationDepth: number = 0;
    private _agentResponseCount: Map<string, number> = new Map();
    private _responseChain: string[] = [];  // for ping-pong detection
    private _lastUserMessage: string = '';  // for delegation context
    private _lastAgentResponse: Map<string, string> = new Map(); // agentId → last full response

    // Callbacks
    private _messageCallbacks: GroupMessageCallback[] = [];
    private _stateCallbacks: GroupStateCallback[] = [];
    private _warningCallbacks: GroupWarningCallback[] = [];

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

        // Broadcast updated system prompt to all agents (including the new one)
        this._broadcastSystemPrompt();

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

        // Broadcast updated system prompt to remaining agents
        this._broadcastSystemPrompt();
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

    // ── System Prompt Broadcasting ────────────────────────────────────────────

    /**
     * Broadcast updated system prompt to ALL agents so they know the current member list.
     */
    private async _broadcastSystemPrompt(): Promise<void> {
        const members = this.getAgents();
        for (const agent of members) {
            const prompt = this._buildAgentSystemPrompt(agent);
            this._gateway?.sendMessageFireAndForget(agent.sessionKey, prompt);
        }
    }

    /**
     * Build a per-agent system prompt with current group member list.
     */
    private _buildAgentSystemPrompt(forAgent: AgentMember): string {
        const members = this.getAgents();
        const memberLines = members.map(m => {
            const suffix = m.agentId === forAgent.agentId ? ' ← You' : '';
            return `- @${m.name} (${m.agentId})${suffix}`;
        });

        return [
            '[system-setup:no-reply]',
            '[Group Chat Mode]',
            `You are @${forAgent.name} (${forAgent.agentId}).`,
            '',
            'Current group members:',
            ...memberLines,
            '',
            'How to collaborate:',
            '- When the user broadcasts a message (no @mention), decide if you should respond based on context.',
            '- Use @name to delegate tasks: "@Alice please implement this plan"',
            '- When another agent @mentions you, treat it as a task assignment and execute it.',
            '- Keep responses focused. Report results back to the group.',
            '- Do NOT @mention yourself.',
            '- Do NOT start conversations unprompted with other agents.',
        ].join('\n');
    }

    // ── Messaging ─────────────────────────────────────────────────────────────

    /**
     * Send a message to the appropriate agents.
     * Parses @mentions; broadcasts to all if no mention present.
     * Returns Map of agentId → runId for tracking.
     */
    public async sendGroupMessage(content: string, planMode: boolean = false): Promise<Map<string, string>> {
        if (!this._gateway) {
            throw new Error('GroupChatManager not initialized');
        }

        // Save user message context and reset delegation tracking
        this._lastUserMessage = content;
        this._conversationDepth = 0;
        this._agentResponseCount = new Map();
        this._responseChain = [];
        this._lastAgentResponse = new Map();

        // Anti-loop: reset round counter and set in-flight flag
        this._responseCountThisRound = 0;
        this._userMessageInFlight = true;

        const agents = this.getAgents();
        const mentions = parseMentions(content, agents);

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
        let fullMessage = contextPrefix
            ? `${contextPrefix}\n\n---\n[Your turn to respond]\n${content}`
            : content;

        // Append plan mode suffix for user messages (not delegations)
        if (planMode) {
            fullMessage += '\n\n---- Plan Mode ----\n'
                + '⚠️ PLAN MODE\n'
                + 'Allowed: read, search, list\n'
                + 'Forbidden: write, modify, delete, execute\n'
                + 'Steps: 1) Understand the task 2) Break into small sub-tasks 3) Describe goal and impact for each step\n'
                + 'Output: step-by-step plan\n'
                + 'Wait for user "execute" before any write action\n'
                + '---- Plan Mode ----';
        }

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

        this._userMessageInFlight = false;
        return runIds;
    }

    private _buildGroupContext(excludeId: string): string {
        const recent = this._messages
            .filter(m => m.id !== excludeId)
            .slice(-20);

        if (recent.length === 0) {
            return '';
        }

        // Must have at least one user message in context (don't inject agent-only context)
        const hasUserMsg = recent.some(m => m.role === 'user');
        if (!hasUserMsg) {
            return '';
        }

        const lines: string[] = [
            '[Group Chat Context - Recent Messages]',
        ];
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

    /**
     * Build delegation message from one agent to another.
     * Includes the sender's FULL response inline so the recipient never
     * misses content due to group-context truncation.
     */
    private _buildDelegationMessage(
        sender: AgentMember,
        content: string,
        mentionedAgent: AgentMember
    ): string {
        return [
            `[Group Chat — Task Delegation]`,
            `From: @${sender.name || sender.agentId}`,
            `To: @${mentionedAgent.name || mentionedAgent.agentId}`,
            ``,
            `Original user request:`,
            `"${this._lastUserMessage}"`,
            ``,
            `Full message from @${sender.name || sender.agentId}:`,
            `---`,
            content,
            `---`,
            ``,
            `You have been assigned this task. Please execute and report results back to the group.`,
            `Keep your response concise and focused.`,
        ].join('\n');
    }

    private async _fetchLatestAgentMessage(agent: AgentMember): Promise<void> {
        if (!this._gateway) {
            return;
        }

        // Anti-loop: check response limit
        this._responseCountThisRound++;
        if (this._responseCountThisRound > MAX_RESPONSES_PER_ROUND) {
            console.warn(`[GroupChat] Loop guard triggered — ${this._responseCountThisRound} responses this round`);
            this._notifyWarning('loop_limit');
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

            // Track full agent response for future retrieval
            this._lastAgentResponse.set(agent.agentId, content);

            // Update delegation counters
            this._agentResponseCount.set(agent.agentId, (this._agentResponseCount.get(agent.agentId) ?? 0) + 1);
            this._responseChain.push(agent.agentId);

            // Check for @mentions in agent response (agent-to-agent delegation)
            const agents = this.getAgents();
            const mentionedIds = parseMentions(content, agents).filter(id => id !== agent.agentId);

            // Determine if delegation should be routed
            let shouldRoute = mentionedIds.length > 0;
            if (shouldRoute) {
                // Check loop guards
                if (this._conversationDepth >= this._maxDelegationDepth) {
                    console.warn(`[GroupChat] Delegation depth limit reached (${this._conversationDepth}/${this._maxDelegationDepth})`);
                    shouldRoute = false;
                }

                const agentCount = this._agentResponseCount.get(agent.agentId) ?? 0;
                if (agentCount >= MAX_AGENT_RESPONSES_PER_ROUND) {
                    console.warn(`[GroupChat] Agent ${agent.agentId} response limit reached (${agentCount}/${MAX_AGENT_RESPONSES_PER_ROUND})`);
                    shouldRoute = false;
                }

                // Total responses check
                let totalResponses = 0;
                for (const count of this._agentResponseCount.values()) {
                    totalResponses += count;
                }
                if (totalResponses >= MAX_TOTAL_RESPONSES) {
                    console.warn(`[GroupChat] Total response limit reached (${totalResponses}/${MAX_TOTAL_RESPONSES})`);
                    shouldRoute = false;
                }

                // Ping-pong detection: check if last 3 entries form A, B, A pattern
                const chain = this._responseChain;
                if (chain.length >= 3) {
                    const last3 = chain.slice(-3);
                    if (last3[0] === last3[2] && last3[0] !== last3[1]) {
                        console.warn(`[GroupChat] Ping-pong detected: ${last3.join(' → ')}`);
                        shouldRoute = false;
                    }
                }
            }

            // Always notify the message (show in UI regardless of routing)
            const msg: GroupMessage = {
                id: `agent-${agent.agentId}-${Date.now()}`,
                role: 'agent',
                agentId: agent.agentId,
                agentName: agent.name,
                agentColor: agent.color,
                content,
                mentions: mentionedIds,
                timestamp: Date.now(),
            };
            this._messages.push(msg);
            this._notifyMessage(msg);

            // Route to mentioned agents if not blocked
            if (shouldRoute) {
                this._conversationDepth++;

                for (const targetId of mentionedIds) {
                    const targetAgent = this._agents.get(targetId);
                    if (!targetAgent) { continue; }

                    const delegationContent = this._buildDelegationMessage(agent, content, targetAgent);
                    const runId = crypto.randomUUID();
                    this._pendingRunIds.set(runId, targetAgent.agentId);
                    try {
                        await this._gateway!.sendChat(targetAgent.sessionKey, delegationContent, runId);
                    } catch (err) {
                        this._pendingRunIds.delete(runId);
                        console.error(`[GroupChat] Delegation to ${targetId} failed:`, err);
                    }
                }
            }
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

    // ── Per-Agent Model ───────────────────────────────────────────────────────

    /**
     * Override model for a specific agent.
     * Pass undefined to clear override (revert to agent default).
     */
    public async setAgentModel(agentId: string, model: string | undefined): Promise<void> {
        const agent = this._agents.get(agentId);
        if (!agent) {
            return;
        }

        agent.modelOverride = model;

        // Apply to agent's session via /model command
        if (this._gateway) {
            try {
                const cmd = model ? `/model ${model}` : '/model default';
                // Use sendChat fire-and-forget equivalent
                this._gateway.sendMessageFireAndForget(agent.sessionKey, cmd);
            } catch (err) {
                console.warn(`[GroupChat] setAgentModel failed for ${agentId}:`, err);
            }
        }

        this._notifyState();
    }

    // ── Configuration ─────────────────────────────────────────────────────────

    public setMaxDelegationDepth(depth: number): void {
        this._maxDelegationDepth = depth;
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
        this._conversationDepth = 0;
        this._agentResponseCount = new Map();
        this._responseChain = [];
        this._lastUserMessage = '';
        this._lastAgentResponse = new Map();

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
        this._warningCallbacks = [];
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

    public onWarning(cb: GroupWarningCallback): void {
        this._warningCallbacks.push(cb);
    }

    public offWarning(cb: GroupWarningCallback): void {
        this._warningCallbacks = this._warningCallbacks.filter(fn => fn !== cb);
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

    private _notifyWarning(reason: 'loop_limit'): void {
        for (const cb of this._warningCallbacks) {
            try { cb(reason); } catch { /* ignore */ }
        }
    }
}
