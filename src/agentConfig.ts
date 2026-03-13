import * as vscode from 'vscode';

/**
 * agentConfig.ts
 * Centralized helper for agent ID and session key management.
 * All agent-related session key logic should go through here.
 */

/** Returns the currently configured agent ID (defaults to 'main'). */
export function getAgentId(): string {
    const config = vscode.workspace.getConfiguration('openclaw');
    const agentId = config.get<string>('agentId') || 'main';
    return agentId.trim() || 'main';
}

/** Sets the agent ID in VSCode global config. */
export async function setAgentId(agentId: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('openclaw');
    await config.update('agentId', agentId, vscode.ConfigurationTarget.Global);
}

/**
 * Builds a session key in the format: agent:{agentId}:{suffix}
 * e.g. agent:main:vscode-main-abc12345
 */
export function buildSessionKey(agentId: string, suffix: string): string {
    return `agent:${agentId}:${suffix}`;
}

/**
 * Extracts the suffix from a session key (strips the "agent:{agentId}:" prefix).
 * Used for event matching in chatController.
 * e.g. "agent:main:vscode-main-abc12345" → "vscode-main-abc12345"
 */
export function extractSessionSuffix(sessionKey: string): string {
    return sessionKey.replace(/^agent:[^:]+:/, '');
}
