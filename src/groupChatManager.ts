/**
 * groupChatManager.ts
 * Manages agent group chat: members, message routing, context injection.
 * Singleton — shared across ChatController instances.
 */

import * as vscode from 'vscode';
import { GatewayClient } from './gateway';
import { buildSessionKey } from './agentConfig';
import { parseMentions, parseLoopMentions } from './mentionParser';
import { isSentinelMessage } from './messageBuilder';

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
    agentAvatar?: string;  // agent profile picture (URL/emoji/letter)
    content: string;
    mentions: string[];    // parsed @mentions
    toolCalls?: Array<{ name: string; args: any }>;  // tool calls from agent response
    timestamp: number;     // Date.now()
}

export type GroupMessageCallback = (msg: GroupMessage) => void;
export type GroupStateCallback = (agents: AgentMember[]) => void;
export type GroupWarningCallback = (reason: 'loop_limit') => void;
export type GroupChainProgressCallback = (progress: { current: string; queued: string[] }) => void;
export type GroupLoopModeCallback = (enabled: boolean) => void;
export type GroupAutoMessageCallback = (msg: { type: 'autoLoop'; content: string }) => void;
export type GroupWaitingReplyCallback = (agentIds: string[]) => void;

// ─── Manager ──────────────────────────────────────────────────────────────────
export class GroupChatManager {
    private static _instance: GroupChatManager | null = null;

    private _gateway: GatewayClient | null = null;
    private _windowId: string = '';
    private _agents: Map<string, AgentMember> = new Map();
    private _messages: GroupMessage[] = [];
    private _colorIndex: number = 0;

    // Context setup message (language + working directory)
    private _contextSetupMessage: string = '';

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
    private _lastDisplayedContentHash: Map<string, string> = new Map(); // agentId → content hash last shown

    // Global model (from main dropdown, used when agent has no override)
    private _globalModel: string | undefined = undefined;

    // Chain execution (sequential @-mention routing)
    private _chainQueue: AgentMember[] = [];
    private _chainContext: Array<{ agentName: string; response: string }> = [];
    private _chainOriginalContent: string = '';
    // Track agents mentioned in the user's original message (for delegation scope)
    private _userMentionedAgentIds: string[] = [];
    private _chainPlanMode: boolean = false;

    // Loop Mode (auto-routing based on plain-text agent mentions)
    private _loopModeEnabled: boolean = false;

    // Callbacks
    private _messageCallbacks: GroupMessageCallback[] = [];
    private _stateCallbacks: GroupStateCallback[] = [];
    private _warningCallbacks: GroupWarningCallback[] = [];
    private _chainProgressCallbacks: GroupChainProgressCallback[] = [];
    private _loopModeCallbacks: GroupLoopModeCallback[] = [];
    private _autoMessageCallbacks: GroupAutoMessageCallback[] = [];
    private _waitingReplyCallbacks: GroupWaitingReplyCallback[] = [];

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

            console.log(`[GroupChat] Chat event: sessionKey=${eventSessionKey} runId=${eventRunId} state=${state}`);

            // Find which agent this event belongs to.
            // Match agent by sessionKey.
            // Try exact match first, then try checking if event key contains
            // the agentId-specific portion (e.g. "agent:alice:" prefix).
            // NOTE: All group agents share the same suffix (vscode-group-{windowId}),
            // so suffix-only matching would always hit the first agent in the Map.
            // We must include the agentId in the match.
            let matchedAgent: AgentMember | undefined;
            for (const agent of this._agents.values()) {
                if (eventSessionKey === agent.sessionKey) {
                    // Exact match — fastest path
                    matchedAgent = agent;
                    break;
                }
                // Check if event key contains the agent-specific prefix + suffix
                // e.g. stored: "agent:alice:vscode-group-xxx"
                //       event:  "agent:alice:vscode-group-xxx" (exact) or contains "alice:vscode-group-xxx"
                const agentPrefix = `${agent.agentId}:`;
                const suffix = agent.sessionKey.replace(/^agent:/, '');  // "alice:vscode-group-xxx"
                if (suffix && eventSessionKey.includes(suffix)) {
                    matchedAgent = agent;
                    break;
                }
            }
            if (matchedAgent) {
                console.log(`[GroupChat] Matched agent: ${matchedAgent.agentId} (${matchedAgent.name}) for event sessionKey=${eventSessionKey}`);
            }

            // Debug: log pending runIds
            console.log(`[GroupChat] Pending runIds:`, Array.from(this._pendingRunIds.entries()));

            // DEBUG: Log ALL runId deletions to track where they disappear
            if (eventRunId && this._pendingRunIds.has(eventRunId)) {
                console.log(`[GroupChat] runId ${eventRunId} FOUND in pending, will process event`);
            }

            // Strict runId guard: if the event carries a runId that we never issued
            // for this agent (i.e. a system-prompt fire-and-forget or an unrelated run),
            // skip it entirely. This prevents system-prompt NO_REPLY responses from
            // being treated as user-triggered responses and causing duplicate messages.
            if (matchedAgent && eventRunId && !this._pendingRunIds.has(eventRunId)) {
                console.log(`[GroupChat] Ignoring event with unknown runId ${eventRunId} for agent ${matchedAgent.agentId}`);
                return;
            }

            if (!matchedAgent) {
                console.log(`[GroupChat] No matched agent for sessionKey=${eventSessionKey}`);
                return;
            }

            if (state === 'final') {
                if (eventRunId) {
                    this._pendingRunIds.delete(eventRunId);
                }
                // Small delay to let the Gateway persist the final message before
                // we query chat.history — avoids a race where history is fetched
                // before the assistant turn is written.
                const agentId = matchedAgent.agentId;
                setTimeout(() => {
                    // Guard: agent may have been removed (leaveGroup) during the delay
                    const stillActive = this._agents.get(agentId);
                    if (stillActive && this._gateway) {
                        this._fetchLatestAgentMessage(stillActive);
                    }
                }, 150);
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
                    agentAvatar: matchedAgent.avatar || '',
                    content: '',
                    mentions: [],
                    timestamp: Date.now(),
                });
            }
        };

        this._chatEventHandler = handler;
        this._gateway.onChatEvent(handler);
    }

    // ── Context Setup ─────────────────────────────────────────────────────

    /**
     * Set the context setup message (language + working directory).
     * This will be sent to all agents when they join or when system prompt is broadcast.
     * If broadcastNow is true, immediately sends to all current agents.
     */
    public setContextSetupMessage(message: string, broadcastNow: boolean = false): void {
        this._contextSetupMessage = message;
        if (broadcastNow && message && this._gateway && this._agents.size > 0) {
            for (const agent of this._agents.values()) {
                this._gateway.sendMessageFireAndForget(agent.sessionKey, message);
            }
        }
    }

    // ── Agent Management ──────────────────────────────────────────────────────

    public async addAgent(agentId: string, avatar?: string): Promise<AgentMember> {
        if (this._agents.has(agentId)) {
            return this._agents.get(agentId)!;
        }

        const color = AGENT_COLORS[this._colorIndex % AGENT_COLORS.length];
        this._colorIndex++;

        const sessionKey = buildSessionKey(agentId, `vscode-group-${this._windowId}`);

        // Try to get identity from gateway, fallback to provided avatar
        let name = agentId;
        let agentAvatar = avatar || '';
        if (this._gateway) {
            try {
                const identity = await this._gateway.getAgentIdentity(agentId);
                if (identity) {
                    name = identity.name || agentId;
                    if (identity.avatar) {
                        agentAvatar = identity.avatar;
                    }
                }
            } catch {
                // Use defaults
            }
        }

        const member: AgentMember = { agentId, sessionKey, name, avatar: agentAvatar, color };
        this._agents.set(agentId, member);

        this._notifyState();

        // Initialize NEW agent session by sending system prompt via sendChat (awaited RPC).
        // This ensures the gateway creates the session before /model command arrives.
        // The initKey won't be in _pendingRunIds → group handler will drop the event.
        if (this._gateway) {
            const prompt = this._buildAgentSystemPrompt(member);
            const initKey = `init-${agentId}-${Date.now()}`;
            try {
                await this._gateway.sendChat(member.sessionKey, prompt, initKey);
            } catch {
                // sendChat is fire-and-forget RPC — errors are unlikely but non-fatal
            }

            // Send context setup (language + working directory) to the new agent
            if (this._contextSetupMessage) {
                this._gateway.sendMessageFireAndForget(member.sessionKey, this._contextSetupMessage);
            }

            // Update other existing agents with new member list (fire-and-forget)
            for (const agent of this._agents.values()) {
                if (agent.agentId !== agentId) {
                    const updatePrompt = this._buildAgentSystemPrompt(agent);
                    this._gateway.sendMessageFireAndForget(agent.sessionKey, updatePrompt);
                }
            }
        }

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

    // ── Loop Mode Management ──────────────────────────────────────────────────

    public toggleLoopMode(): boolean {
        this._loopModeEnabled = !this._loopModeEnabled;
        this._notifyLoopMode(this._loopModeEnabled);
        return this._loopModeEnabled;
    }

    public isLoopModeEnabled(): boolean {
        return this._loopModeEnabled;
    }

    public setLoopMode(enabled: boolean): void {
        if (this._loopModeEnabled !== enabled) {
            this._loopModeEnabled = enabled;
            this._notifyLoopMode(this._loopModeEnabled);
        }
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
            // Also re-send context setup (language + working directory)
            if (this._contextSetupMessage) {
                this._gateway?.sendMessageFireAndForget(agent.sessionKey, this._contextSetupMessage);
            }
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
     * Send a message to mentioned agents in sequential chain order.
     * Requires at least one @mention — enforcement is done on the webview side.
     * Returns ordered list of all target agentIds (for UI thinking indicators).
     */
    public async sendGroupMessage(content: string, planMode: boolean = false): Promise<string[]> {
        if (!this._gateway) {
            throw new Error('GroupChatManager not initialized');
        }

        console.log(`[GroupChat] sendGroupMessage called with content: ${content.substring(0, 100)}`);

        // Save user message context and reset delegation tracking
        this._lastUserMessage = content;
        this._conversationDepth = 0;
        this._agentResponseCount = new Map();
        this._responseChain = [];
        this._lastAgentResponse = new Map();

        // Anti-loop: reset round counter
        this._responseCountThisRound = 0;
        this._userMessageInFlight = true;

        const agents = this.getAgents();
        console.log(`[GroupChat] Current agents in group:`, agents.map(a => a.agentId));
        
        const mentions = parseMentions(content, agents);
        console.log(`[GroupChat] Parsed mentions:`, mentions);

        // Record user message in context (no UI notify — webview already shows it)
        const userMsg: GroupMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content,
            mentions,
            timestamp: Date.now(),
        };
        this._messages.push(userMsg);

        // Save user-mentioned agent IDs for delegation scope
        this._userMentionedAgentIds = mentions;

        // Determine targets (in @mention order)
        const targetAgents: AgentMember[] = mentions
            .map(id => this._agents.get(id))
            .filter((a): a is AgentMember => a !== undefined);

        if (targetAgents.length === 0) {
            console.log(`[GroupChat] No target agents found - no @mentions in message?`);
            this._userMessageInFlight = false;
            return [];
        }

        // Set up chain: queue all agents after the first
        this._chainOriginalContent = content;
        this._chainPlanMode = planMode;
        this._chainContext = [];
        this._chainQueue = targetAgents.slice(1);

        // Build message for first agent (with group context from previous messages)
        const firstAgent = targetAgents[0];
        const groupCtx = this._buildGroupContext(firstAgent.agentId);
        let firstMessage = groupCtx ? `${groupCtx}\n\n${content}` : content;
        if (planMode) {
            firstMessage += '\n\n---- Plan Mode ----\n'
                + '⚠️ PLAN MODE\n'
                + 'Allowed: read, search, list\n'
                + 'Forbidden: write, modify, delete, execute\n'
                + 'Steps: 1) Understand the task 2) Break into small sub-tasks 3) Describe goal and impact for each step\n'
                + 'Output: step-by-step plan\n'
                + 'Wait for user "execute" before any write action\n'
                + '---- Plan Mode ----';
        }
        const runId = crypto.randomUUID();
        this._pendingRunIds.set(runId, firstAgent.agentId);
        console.log(`[GroupChat] Created runId ${runId} for firstAgent ${firstAgent.agentId}`);
        try {
            await this._gateway.sendChat(firstAgent.sessionKey, firstMessage, runId);
            console.log(`[GroupChat] Successfully sent message to gateway for agent ${firstAgent.agentId}`);
            // Fallback: if event doesn't arrive within timeout, poll history directly.
            // This handles cases where the chat event is missed/dropped.
            this._startChainFallbackPoll(firstAgent, runId, 5000, 120000);
        } catch (err) {
            this._pendingRunIds.delete(runId);
            console.error(`[GroupChat] Failed to send to ${firstAgent.agentId}:`, err);
        }

        this._userMessageInFlight = false;
        // Return ALL target agentIds so webview can show thinking indicators for all
        return targetAgents.map(a => a.agentId);
    }

    /**
     * Build the chain context message for the next agent in the chain.
     */
    private _buildChainMessage(forAgent: AgentMember): string {
        // Include broader group context (messages outside this chain)
        const groupCtx = this._buildGroupContext(forAgent.agentId);

        const lines: string[] = [];

        if (groupCtx) {
            lines.push(groupCtx);
            lines.push('');
        }

        lines.push('[Chain Context — Group Collaboration]');
        lines.push(`Original user request: "${this._chainOriginalContent}"`);
        lines.push('');
        lines.push('Previous responses in this chain:');

        for (const ctx of this._chainContext) {
            lines.push(`@${ctx.agentName}:`);
            lines.push('---');
            lines.push(ctx.response);
            lines.push('---');
            lines.push('');
        }

        lines.push(`Your turn, @${forAgent.name || forAgent.agentId}.`);
        lines.push('Build on the above context and provide your contribution.');

        if (this._chainPlanMode) {
            lines.push('');
            lines.push('---- Plan Mode ----');
            lines.push('⚠️ PLAN MODE');
            lines.push('Allowed: read, search, list');
            lines.push('Forbidden: write, modify, delete, execute');
            lines.push('Steps: 1) Understand the task 2) Break into small sub-tasks 3) Describe goal and impact for each step');
            lines.push('Output: step-by-step plan');
            lines.push('Wait for user "execute" before any write action');
            lines.push('---- Plan Mode ----');
        }

        return lines.join('\n');
    }

    /**
     * Build group context from recent messages so each agent knows what others said.
     * Used as a prefix when sending messages to agents.
     * @param excludeAgentId - optional agent to exclude (don't show their own messages back)
     */
    private _buildGroupContext(excludeAgentId?: string): string {
        const recent = this._messages.slice(-20);

        if (recent.length === 0) {
            return '';
        }

        const lines: string[] = [
            '[Group Chat Context - Recent Messages]',
        ];
        for (const msg of recent) {
            // Skip excluded agent's own messages
            if (excludeAgentId && msg.agentId === excludeAgentId) { continue; }

            if (msg.role === 'user') {
                lines.push(`User: ${msg.content}`);
            } else {
                // Truncate long responses to keep context manageable
                const truncated = msg.content.length > 500
                    ? msg.content.substring(0, 500) + '...(truncated)'
                    : msg.content;
                lines.push(`@${msg.agentName || msg.agentId}: ${truncated}`);
            }
        }

        // Only return if there's actual content beyond the header
        if (lines.length <= 1) { return ''; }

        lines.push('---');
        return lines.join('\n');
    }

    /**
     * Build delegation message from one agent to another.
     * Includes the sender's FULL response inline so the recipient never
     * misses content due to group-context truncation.
     * Also includes broader group context.
     */
    private _buildDelegationMessage(
        sender: AgentMember,
        content: string,
        mentionedAgent: AgentMember
    ): string {
        // Include broader group context (messages outside this delegation)
        const groupCtx = this._buildGroupContext(mentionedAgent.agentId);

        const lines: string[] = [];

        if (groupCtx) {
            lines.push(groupCtx);
            lines.push('');
        }

        lines.push(`[Group Chat — Task Delegation]`);
        lines.push(`From: @${sender.name || sender.agentId}`);
        lines.push(`To: @${mentionedAgent.name || mentionedAgent.agentId}`);
        lines.push(``);
        lines.push(`Original user request:`);
        lines.push(`"${this._lastUserMessage}"`);
        lines.push(``);
        lines.push(`Full message from @${sender.name || sender.agentId}:`);
        lines.push(`---`);
        lines.push(content);
        lines.push(`---`);
        lines.push(``);
        lines.push(`You have been assigned this task. Please execute and report results back to the group.`);
        lines.push(`Keep your response concise and focused.`);

        return lines.join('\n');
    }

    /**
     * Extract and normalise the text content from a raw history message.
     * Returns empty string if no renderable text is found.
     */
    private _extractContent(raw: any): string {
        let content = raw?.content as any;
        if (Array.isArray(content)) {
            content = content
                .filter((c: any) => c && (c.type === 'text' || c.type === 'output_text'))
                .map((c: any) => c.text || '')
                .join('');
        }
        return String(content || '')
            .replace(/<think>[\s\S]*?<\/think>/g, '')
            .replace(/<\/?final>/g, '')
            .trim();
    }

    /**
     * Extract tool calls from a raw history message.
     * Handles content array format: [{type: 'toolcall', name, arguments/args/input}]
     * Returns empty array if no tool calls found.
     */
    private _extractToolCalls(raw: any): Array<{ name: string; args: any }> {
        const toolCalls: Array<{ name: string; args: any }> = [];
        let content = raw?.content as any;

        if (!Array.isArray(content)) {
            return toolCalls;
        }

        for (const c of content) {
            if (!c || typeof c !== 'object') continue;

            const type = (c.type || '').toLowerCase();
            if (type === 'toolcall' || type === 'tool_call' || type === 'tool_use') {
                toolCalls.push({
                    name: c.name || 'tool',
                    args: c.arguments || c.args || c.input
                });
            }
        }

        return toolCalls;
    }

    /**
     * Create a simple hash from content and tool calls for deduplication.
     */
    private _contentHash(content: string, toolCalls: Array<{ name: string; args: any }>): string {
        const tcStr = JSON.stringify(toolCalls.map(tc => ({ name: tc.name, args: tc.args })));
        return content.length + '|' + tcStr.length + '|' + content.slice(0, 100) + '|' + tcStr.slice(0, 50);
    }

    private async _fetchLatestAgentMessage(agent: AgentMember, retryCount = 0): Promise<void> {
        if (!this._gateway) {
            return;
        }

        // Anti-loop: check response limit
        // Only count real responses (not retries from the same message)
        if (retryCount === 0) {
            this._responseCountThisRound++;
        }
        if (this._responseCountThisRound > MAX_RESPONSES_PER_ROUND) {
            console.warn(`[GroupChat] Loop guard triggered — ${this._responseCountThisRound} responses this round`);
            this._notifyWarning('loop_limit');
            return;
        }

        try {
            const history = await this._gateway.getHistory(agent.sessionKey, 20);
            
            // Get ALL assistant messages (not just the last one) — handles multi-response cases
            const allAssistants = [...history].reverse().filter(m => m.role === 'assistant');

            // If history hasn't caught up yet, retry once after a short delay.
            // This handles the Gateway race where the "final" chat event fires
            // slightly before the assistant turn is persisted to chat.history.
            if (allAssistants.length === 0) {
                if (retryCount === 0) {
                    this._responseCountThisRound--; // undo increment — not a real response yet
                    setTimeout(() => this._fetchLatestAgentMessage(agent, 1), 300);
                }
                return;
            }

            // Find the last shown content hash for this agent
            const lastDisplayedHash = this._lastDisplayedContentHash.get(agent.agentId);
            
            // Filter to only new messages (those after the last displayed one by content)
            let newAssistants = allAssistants;
            if (lastDisplayedHash) {
                const lastIdx = allAssistants.findIndex(m => {
                    const c = this._extractContent(m);
                    const tc = this._extractToolCalls(m);
                    const hash = this._contentHash(c, tc);
                    return hash === lastDisplayedHash;
                });
                if (lastIdx >= 0) {
                    newAssistants = allAssistants.slice(lastIdx + 1);
                }
            }

            // If no new messages, skip
            if (newAssistants.length === 0) {
                return;
            }

            // Process each new assistant message
            for (const assistant of newAssistants) {
                let content = this._extractContent(assistant);
                let toolCalls = this._extractToolCalls(assistant);

                // If we have toolCalls but no content, check if there's a next message with content
                // (tool result is often in the next message in history)
                if (!content && toolCalls.length > 0) {
                    const allAssistantMessages = [...history].reverse();
                    const currentIndex = allAssistantMessages.indexOf(assistant);
                    
                    // Look ahead for messages with content (after this one in history)
                    for (let i = currentIndex + 1; i < allAssistantMessages.length; i++) {
                        const nextMsg = allAssistantMessages[i];
                        const nextContent = this._extractContent(nextMsg);
                        const nextToolCalls = this._extractToolCalls(nextMsg);
                        
                        // If we find a message with actual text content, use it
                        if (nextContent && nextContent.trim().length > 0) {
                            // Merge: keep current toolCalls + new content
                            if (nextToolCalls.length > 0) {
                                // Append any additional tool calls
                                toolCalls = [...toolCalls, ...nextToolCalls];
                            }
                            content = nextContent;
                            break;
                        }
                    }
                }

                // If still no content and no toolCalls, skip this message
                if (!content && toolCalls.length === 0) {
                    continue;
                }

                // Filter sentinel messages — do not render or route
                if (isSentinelMessage(content)) {
                    continue;
                }

                // Track full agent response for future retrieval
                if (content) {
                    this._lastAgentResponse.set(agent.agentId, content);
                }

                // Update delegation counters (only for first new message to avoid over-counting)
                if (assistant === newAssistants[0]) {
                    this._agentResponseCount.set(agent.agentId, (this._agentResponseCount.get(agent.agentId) ?? 0) + 1);
                    this._responseChain.push(agent.agentId);
                }

                // Always show agent message in UI
                const msg: GroupMessage = {
                    id: `agent-${agent.agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    role: 'agent',
                    agentId: agent.agentId,
                    agentName: agent.name,
                    agentColor: agent.color,
                    agentAvatar: agent.avatar || '',
                    content,
                    mentions: [],
                    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                    timestamp: Date.now(),
                };
                this._messages.push(msg);
                
                // Update last displayed content hash for this agent
                this._lastDisplayedContentHash.set(agent.agentId, this._contentHash(content, toolCalls));

                // Notify UI
                console.log(`[GroupChat] Notifying message for agent ${agent.agentId}: ${content?.substring(0, 50) || '(no content)'}...`);
                this._notifyMessage(msg);
            }

            // Trim message history to prevent unbounded memory growth
            if (this._messages.length > 200) {
                this._messages = this._messages.slice(-200);
            }

            // Get the last processed message for chain/delegation logic
            const lastAssistant = newAssistants[newAssistants.length - 1];
            const content = this._extractContent(lastAssistant);
            const toolCalls = this._extractToolCalls(lastAssistant);

            // ── Chain mode: continue to next queued agent ─────────────────────
            if (this._chainQueue.length > 0) {
                this._chainContext.push({ agentName: agent.name || agent.agentId, response: content });
                const nextAgent = this._chainQueue.shift()!;

                // Notify chain progress: next agent is now active, rest are queued
                this._notifyChainProgress(
                    nextAgent.agentId,
                    this._chainQueue.map(a => a.agentId)
                );

                const chainMsg = this._buildChainMessage(nextAgent);
                const nextRunId = crypto.randomUUID();
                this._pendingRunIds.set(nextRunId, nextAgent.agentId);
                console.log(`[GroupChat] Created chain runId ${nextRunId} for nextAgent ${nextAgent.agentId}`);
                try {
                    await this._gateway!.sendChat(nextAgent.sessionKey, chainMsg, nextRunId);

                    // Fallback: if event doesn't arrive within timeout, poll history directly.
                    // This handles cases where the chat event is missed/dropped.
                    this._startChainFallbackPoll(nextAgent, nextRunId, 5000, 120000);
                } catch (err) {
                    this._pendingRunIds.delete(nextRunId);
                    console.error(`[GroupChat] Chain send to ${nextAgent.agentId} failed:`, err);
                }
                return; // Skip delegation routing when chaining
            }

            // ── Delegation mode (only when chain is complete) ─────────────────
            // Check for @mentions in agent response (agent-to-agent delegation)
            const agents = this.getAgents();
            console.log(`[GroupChat] Parsing mentions from agent response: "${content.substring(0, 100)}..."`);
            const mentionedIds = parseMentions(content, agents).filter(id => id !== agent.agentId);
            console.log(`[GroupChat] Found @mentions in response:`, mentionedIds);

            // Check if this agent was originally tagged by user
            const wasUserTagged = this._userMentionedAgentIds.includes(agent.agentId);
            
            // Delegation rules:
            // 1. If agent was tagged by user → can delegate to anyone in group (both @mentions and others)
            // 2. If loop mode is ON → can auto-route from plain-text mentions in response
            let shouldRoute = false;
            let routeTargetIds: string[] = [];

            if (wasUserTagged) {
                // Agent was tagged by user - can delegate to anyone in the group
                // Include all mentioned agents in response
                routeTargetIds = [...mentionedIds];
                // Also check for plain-text mentions (like loop mode)
                const plainTextMentions = parseLoopMentions(content, agents, agent.agentId);
                for (const id of plainTextMentions) {
                    if (!routeTargetIds.includes(id)) {
                        routeTargetIds.push(id);
                    }
                }
                shouldRoute = routeTargetIds.length > 0;
                console.log(`[GroupChat] Agent ${agent.agentId} was user-tagged, can delegate to:`, routeTargetIds);
            } else if (this._loopModeEnabled) {
                // Loop mode is ON - can auto-route from plain-text mentions
                const autoMentionIds = parseLoopMentions(content, agents, agent.agentId);
                if (autoMentionIds.length > 0) {
                    routeTargetIds = autoMentionIds;
                    shouldRoute = true;
                    console.log(`[GroupChat] Loop mode enabled, auto-routing to:`, autoMentionIds);
                }
            }

            console.log(`[GroupChat] Checking delegation: shouldRoute=${shouldRoute}, wasUserTagged=${wasUserTagged}, loopMode=${this._loopModeEnabled}`);

            // Re-attach mentions to the LAST message (most recent one)
            const lastMsg = this._messages[this._messages.length - 1];
            if (lastMsg && lastMsg.role === 'agent' && lastMsg.agentId === agent.agentId) {
                lastMsg.mentions = routeTargetIds;
            }

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

            // Route to mentioned agents if not blocked
            if (shouldRoute) {
                this._conversationDepth++;

                for (const targetId of routeTargetIds) {
                    const targetAgent = this._agents.get(targetId);
                    if (!targetAgent) { continue; }

                    const delegationContent = this._buildDelegationMessage(agent, content, targetAgent);
                    const runId = crypto.randomUUID();
                    this._pendingRunIds.set(runId, targetAgent.agentId);
                    console.log(`[GroupChat] Created delegation runId ${runId} for target ${targetAgent.agentId}`);
                    try {
                        await this._gateway!.sendChat(targetAgent.sessionKey, delegationContent, runId);
                    } catch (err) {
                        this._pendingRunIds.delete(runId);
                        console.error(`[GroupChat] Delegation to ${targetId} failed:`, err);
                    }
                }
            }

            // ── Loop Mode: auto-route via plain-text name mentions ────────────
            // Only fires when:
            //   1. Loop Mode is enabled
            //   2. Chain queue is empty (not mid-chain)
            //   3. Delegation didn't already route (avoid double-fire)
            //   4. There are agents mentioned by name (without @)
            // Note: This is now covered by the new delegation logic above, 
            // but kept for backward compatibility with loop mode auto-routing
            if (this._loopModeEnabled && this._chainQueue.length === 0 && !shouldRoute) {
                const loopTargetIds = parseLoopMentions(content, agents, agent.agentId);

                if (loopTargetIds.length > 0) {
                    // Build auto user message with full @name mentions
                    const autoMentions = loopTargetIds
                        .map(id => {
                            const a = this._agents.get(id);
                            return a ? `@${a.name}` : `@${id}`;
                        })
                        .join(' ');

                    const autoContent = autoMentions;

                    console.log(`[GroupChat] Loop Mode auto-routing: "${autoContent}" (triggered by ${agent.agentId})`);

                    // Notify UI about the auto-generated message
                    this._notifyAutoMessage({ type: 'autoLoop', content: autoContent });

                    // Fire as a new group message (reuses the existing sendGroupMessage chain logic)
                    // Small delay to allow UI to update with the agent's response first
                    setTimeout(() => {
                        this.sendGroupMessage(autoContent, this._chainPlanMode).then(resultAgentIds => {
                            // Notify UI about waiting reply (for thinking indicators)
                            this._notifyWaitingReply(resultAgentIds);
                        }).catch(err => {
                            console.error(`[GroupChat] Loop Mode auto-send failed:`, err);
                        });
                    }, 300);
                }
            }
        } catch (err) {
            console.warn(`[GroupChat] Failed to fetch message for ${agent.agentId}:`, err);
        }
    }

    // ── Chain Fallback Polling ────────────────────────────────────────────────

    /**
     * Start a fallback polling timer for chain agents.
     * If the chat event doesn't arrive within the timeout, poll history directly.
     * This handles cases where events are missed/dropped due to race conditions.
     */
    private _startChainFallbackPoll(
        agent: AgentMember,
        runId: string,
        intervalMs: number,
        maxWaitMs: number
    ): void {
        const startTime = Date.now();

        const poll = () => {
            // Stop if runId was already processed (event arrived normally)
            if (!this._pendingRunIds.has(runId)) {
                return;
            }
            // Stop if agent was removed
            if (!this._agents.has(agent.agentId)) {
                this._pendingRunIds.delete(runId);
                return;
            }
            // Stop if exceeded max wait time
            if (Date.now() - startTime > maxWaitMs) {
                console.warn(`[GroupChat] Chain fallback timeout for ${agent.agentId} after ${maxWaitMs}ms`);
                this._pendingRunIds.delete(runId);
                return;
            }

            // Poll history to check if agent has responded
            this._gateway?.getHistory(agent.sessionKey, 20).then(history => {
                // If runId was consumed while we were fetching, stop
                if (!this._pendingRunIds.has(runId)) { return; }

                // Get ALL assistant messages (not just the last one)
                const allAssistants = [...history].reverse().filter(m => m.role === 'assistant');
                if (allAssistants.length === 0) {
                    // No response yet, continue polling
                    setTimeout(poll, intervalMs);
                    return;
                }

                // Check if there are any NEW messages using _lastDisplayedContentHash
                const lastDisplayedHash = this._lastDisplayedContentHash.get(agent.agentId);
                let hasNewMessages = false;
                
                if (lastDisplayedHash) {
                    const lastIdx = allAssistants.findIndex(m => {
                        const c = this._extractContent(m);
                        const tc = this._extractToolCalls(m);
                        const hash = this._contentHash(c, tc);
                        return hash === lastDisplayedHash;
                    });
                    hasNewMessages = lastIdx >= 0 && lastIdx < allAssistants.length - 1;
                } else {
                    hasNewMessages = allAssistants.length > 0;
                }

                if (!hasNewMessages) {
                    // No new messages, continue polling
                    setTimeout(poll, intervalMs);
                    return;
                }

                // Check if the latest message has content/toolCalls
                const latestAssistant = allAssistants[allAssistants.length - 1];
                let content = this._extractContent(latestAssistant);
                let toolCalls = this._extractToolCalls(latestAssistant);

                // If still no content AND no tool calls, continue polling
                // (handles case where agent is still thinking or only sent tool results)
                if (!content && toolCalls.length === 0) {
                    setTimeout(poll, intervalMs);
                    return;
                }

                // Filter sentinel messages
                if (isSentinelMessage(content)) {
                    setTimeout(poll, intervalMs);
                    return;
                }

                // Found new response — delegate to _fetchLatestAgentMessage which now handles multiple messages
                // NOTE: Do NOT delete runId here — let the event handler handle it.
                // This fallback is only for when events are missed/dropped.
                // If the event arrives later, the event handler will process normally.
                // Stop polling after found response (don't continue calling setTimeout)
                console.log(`[GroupChat] Fallback poll found new response from ${agent.agentId}, stopping poll`);
                this._fetchLatestAgentMessage(agent);
                // Do NOT continue polling - let event handler manage runId
                return;
            }).catch(() => {
                // Retry on error
                setTimeout(poll, intervalMs);
            });
        };

        // Start polling after initial delay
        setTimeout(poll, intervalMs);
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
     * Set the global model (from the main dropdown).
     * Used when an agent has no per-agent modelOverride.
     */
    public setGlobalModel(model: string | undefined): void {
        this._globalModel = model;
    }

    /**
     * Override model for a specific agent.
     * Pass undefined to clear override (falls back to globalModel or agent default).
     */
    public async setAgentModel(agentId: string, model: string | undefined): Promise<void> {
        const agent = this._agents.get(agentId);
        if (!agent) {
            return;
        }

        agent.modelOverride = model;

        // Apply to agent's session via /model command.
        // Use fire-and-forget with a unique idempotency key to avoid consuming
        // events for actual user messages.
        if (this._gateway) {
            try {
                const effectiveModel = model ?? this._globalModel ?? 'default';
                const modelCmd = effectiveModel && effectiveModel !== 'default'
                    ? `/model ${effectiveModel}`
                    : '/model default';
                // Use sendMessageFireAndForget to avoid blocking and event conflicts.
                // Model command will be processed by gateway on the agent session.
                this._gateway.sendMessageFireAndForget(agent.sessionKey, modelCmd);
                console.log(`[GroupChat] Set model for ${agentId}: ${modelCmd}`);
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
        this._lastDisplayedContentHash = new Map();
        // Reset chain state
        this._chainQueue = [];
        this._chainContext = [];
        this._chainOriginalContent = '';
        this._chainPlanMode = false;
        this._userMentionedAgentIds = [];

        // Reset loop mode
        this._loopModeEnabled = false;

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
        this._chainProgressCallbacks = [];
        this._loopModeCallbacks = [];
        this._autoMessageCallbacks = [];
        this._waitingReplyCallbacks = [];
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

    private _notifyChainProgress(current: string, queued: string[]): void {
        for (const cb of this._chainProgressCallbacks) {
            try { cb({ current, queued }); } catch { /* ignore */ }
        }
    }

    public onChainProgress(cb: GroupChainProgressCallback): void {
        this._chainProgressCallbacks.push(cb);
    }

    public offChainProgress(cb: GroupChainProgressCallback): void {
        this._chainProgressCallbacks = this._chainProgressCallbacks.filter(fn => fn !== cb);
    }

    // ── Loop Mode callbacks ───────────────────────────────────────────────────

    private _notifyLoopMode(enabled: boolean): void {
        for (const cb of this._loopModeCallbacks) {
            try { cb(enabled); } catch { /* ignore */ }
        }
    }

    public onLoopModeChange(cb: GroupLoopModeCallback): void {
        this._loopModeCallbacks.push(cb);
    }

    public offLoopModeChange(cb: GroupLoopModeCallback): void {
        this._loopModeCallbacks = this._loopModeCallbacks.filter(fn => fn !== cb);
    }

    private _notifyAutoMessage(msg: { type: 'autoLoop'; content: string }): void {
        for (const cb of this._autoMessageCallbacks) {
            try { cb(msg); } catch { /* ignore */ }
        }
    }

    public onAutoMessage(cb: GroupAutoMessageCallback): void {
        this._autoMessageCallbacks.push(cb);
    }

    public offAutoMessage(cb: GroupAutoMessageCallback): void {
        this._autoMessageCallbacks = this._autoMessageCallbacks.filter(fn => fn !== cb);
    }

    // ── Waiting reply callbacks (for thinking indicators) ─────────────────────

    private _notifyWaitingReply(agentIds: string[]): void {
        for (const cb of this._waitingReplyCallbacks) {
            try { cb(agentIds); } catch { /* ignore */ }
        }
    }

    public onWaitingReply(cb: GroupWaitingReplyCallback): void {
        this._waitingReplyCallbacks.push(cb);
    }

    public offWaitingReply(cb: GroupWaitingReplyCallback): void {
        this._waitingReplyCallbacks = this._waitingReplyCallbacks.filter(fn => fn !== cb);
    }
}
