import * as vscode from 'vscode';
import { ChatViewProvider } from './chatProvider';
import { ChatPanel } from './chatPanel';
import { GatewayClient } from './gateway';
import { DiffProvider } from './diffProvider';
import { LanguageManager } from './languageManager';
import { ChangeManager } from './changeManager';
import { getAgentId, setAgentId } from './agentConfig';

let gatewayClient: GatewayClient;
let chatProvider: ChatViewProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenClaw extension is now active!');
    console.log(`[OpenClaw DEBUG] vscode.env.language = "${vscode.env.language}"`);

    // 初始化服务
    const languageManager = LanguageManager.getInstance();
    const changeManager = ChangeManager.getInstance();
    const diffProvider = DiffProvider.register(context);

    // 初始化 Gateway 客户端
    const config = vscode.workspace.getConfiguration('openclaw');
    const gatewayUrl = config.get<string>('gatewayUrl') || 'http://localhost:18789';
    const openclawPath = config.get<string>('openclawPath') || '';

    gatewayClient = new GatewayClient(gatewayUrl, openclawPath || undefined);

    // 注册 Chat View Provider（侧边栏）
    chatProvider = new ChatViewProvider(context.extensionUri, gatewayClient);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('openclaw.chatView', chatProvider)
    );

    // 注册命令
    context.subscriptions.push(
        vscode.commands.registerCommand('openclaw.openChatPanel', () => {
            ChatPanel.createOrShow(context.extensionUri, gatewayClient);
        }),
        vscode.commands.registerCommand('openclaw.sendSelection', () => chatProvider.sendSelection()),
        vscode.commands.registerCommand('openclaw.sendFile', () => chatProvider.sendFile()),
        vscode.commands.registerCommand('openclaw.togglePlanMode', togglePlanMode),
        vscode.commands.registerCommand('openclaw.newSession', () => chatProvider.newSession()),
        vscode.commands.registerCommand('openclaw.clearChat', () => chatProvider.clearChat()),
        vscode.commands.registerCommand('openclaw.showConnectionStatus', () => showConnectionStatus()),
        vscode.commands.registerCommand('openclaw.closeChat', async () => {
            await chatProvider.closeChat();
            // 折叠侧边栏
            vscode.commands.executeCommand('workbench.action.closeSidebar');
        }),
        vscode.commands.registerCommand('openclaw.selectAgent', () =>
            selectAgent(gatewayClient, chatProvider, agentStatusBar)
        ),

        // Group chat commands
        vscode.commands.registerCommand('openclaw.toggleGroupMode', async () => {
            const { GroupChatManager } = await import('./groupChatManager');
            if (GroupChatManager.getInstance().isGroupMode()) {
                leaveGroupChat(chatProvider);
            } else {
                addAgentToGroup(gatewayClient, chatProvider);
            }
        }),
        vscode.commands.registerCommand('openclaw.addAgentToGroup', () =>
            addAgentToGroup(gatewayClient, chatProvider)
        ),
        vscode.commands.registerCommand('openclaw.removeAgentFromGroup', () =>
            removeAgentFromGroup(chatProvider)
        ),
        vscode.commands.registerCommand('openclaw.leaveGroupChat', () =>
            leaveGroupChat(chatProvider)
        )
    );

    // 连接 Gateway
    gatewayClient.connect().catch(err => {
        vscode.window.showWarningMessage(`OpenClaw: 连接失败 - ${err.message}`);
    });

    // 状态栏 — main status (connection)
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(comment-discussion) OpenClaw';
    statusBar.tooltip = 'Click to open OpenClaw chat';
    statusBar.command = 'openclaw.openChatPanel';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // 状态栏 — agent selector
    const agentStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    agentStatusBar.command = 'openclaw.selectAgent';
    updateAgentStatusBar(agentStatusBar);
    agentStatusBar.show();
    context.subscriptions.push(agentStatusBar);

    // 更新状态栏
    gatewayClient.onConnectionChange((connected) => {
        if (connected) {
            statusBar.text = '$(comment-discussion) OpenClaw';
            const mode = gatewayClient.getMode();
            if (mode === 'ws') {
                statusBar.tooltip = `Connected (WebSocket): ${gatewayClient.getConnectedUrl()}`;
            } else {
                statusBar.tooltip = 'Connected (CLI)';
            }
            statusBar.command = 'openclaw.showConnectionStatus';
            statusBar.backgroundColor = undefined;
        } else {
            const lastError = gatewayClient.getLastError();
            statusBar.text = '$(warning) OpenClaw';
            statusBar.tooltip = lastError ? `Connection failed: ${lastError}` : 'Disconnected';
            statusBar.command = 'openclaw.showConnectionStatus';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
    });

    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('openclaw.gatewayToken') || e.affectsConfiguration('openclaw.gatewayUrl')) {
                const newConfig = vscode.workspace.getConfiguration('openclaw');
                const newUrl = newConfig.get<string>('gatewayUrl') || 'http://localhost:18789';

                gatewayClient.reloadTokenAndReconnect(newUrl).catch(err => {
                    console.warn('[OpenClaw] 配置变更后重连失败:', err);
                });
            }
            if (e.affectsConfiguration('openclaw.agentId')) {
                updateAgentStatusBar(agentStatusBar);
            }
        })
    );
}

/**
 * 显示连接状态（绿灯/红灯都可点击）
 */
async function showConnectionStatus() {
    const connected = gatewayClient.isConnected();

    if (connected) {
        // 绿灯：显示当前连接信息
        const mode = gatewayClient.getMode();
        const url = gatewayClient.getConnectedUrl();
        const connLabel = mode === 'ws' ? `WebSocket: ${url}` : 'CLI';
        const items: vscode.QuickPickItem[] = [
            { label: '$(check) Connected', description: connLabel, kind: vscode.QuickPickItemKind.Default },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(comment-discussion) Open Chat Panel' },
            { label: '$(refresh) Reconnect' },
            { label: '$(gear) Open Settings' }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'OpenClaw - Connection Status',
            placeHolder: `Connected (${connLabel})`
        });

        if (!selected) { return; }

        if (selected.label.includes('Open Chat Panel')) {
            vscode.commands.executeCommand('openclaw.openChatPanel');
        } else if (selected.label.includes('Reconnect')) {
            try {
                await gatewayClient.reloadTokenAndReconnect();
                vscode.window.showInformationMessage('OpenClaw: Reconnected successfully');
            } catch (err) {
                vscode.window.showWarningMessage(`OpenClaw: Reconnect failed - ${err instanceof Error ? err.message : err}`);
            }
        } else if (selected.label.includes('Open Settings')) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'openclaw');
        }
    } else {
        // 红灯：显示错误原因 + 操作选项
        const lastError = gatewayClient.getLastError() || 'Unknown error';
        const items: vscode.QuickPickItem[] = [
            { label: '$(error) Connection Failed', description: lastError, kind: vscode.QuickPickItemKind.Default },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(refresh) Reconnect' },
            { label: '$(gear) Open Settings', description: 'Check Gateway URL and Token' }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            title: 'OpenClaw - Connection Failed',
            placeHolder: lastError
        });

        if (!selected) { return; }

        if (selected.label.includes('Reconnect')) {
            try {
                await gatewayClient.reloadTokenAndReconnect();
                vscode.window.showInformationMessage('OpenClaw: Reconnected successfully');
            } catch (err) {
                vscode.window.showWarningMessage(`OpenClaw: Reconnect failed - ${err instanceof Error ? err.message : err}`);
            }
        } else if (selected.label.includes('Open Settings')) {
            vscode.commands.executeCommand('workbench.action.openSettings', 'openclaw');
        }
    }
}

/** Updates the agent status bar label to show the current agent ID. */
function updateAgentStatusBar(statusBar: vscode.StatusBarItem) {
    const agentId = getAgentId();
    statusBar.text = `$(person) ${agentId}`;
    statusBar.tooltip = `OpenClaw Agent: ${agentId} — Click to switch agent`;
}

/**
 * Shows a QuickPick to let the user select an agent.
 * Fetches agent list from Gateway; falls back to 'main' if disconnected.
 */
async function selectAgent(
    gatewayClient: GatewayClient,
    chatProvider: ChatViewProvider,
    statusBar: vscode.StatusBarItem
) {
    const currentAgentId = getAgentId();

    // Fetch agent list from Gateway
    let agents: Array<{ id: string; name?: string }> = [];
    try {
        agents = await gatewayClient.getAgentList();
    } catch {
        agents = [{ id: 'main' }];
    }

    // Ensure current agent is in the list
    if (!agents.find(a => a.id === currentAgentId)) {
        agents.unshift({ id: currentAgentId });
    }

    // Build QuickPick items
    const items: vscode.QuickPickItem[] = agents.map(agent => {
        const label = agent.name ? `${agent.name} (${agent.id})` : agent.id;
        return {
            label: agent.id === currentAgentId ? `$(check) ${label}` : `$(person) ${label}`,
            description: agent.id === currentAgentId ? 'current' : undefined,
            detail: `agent:${agent.id}:...`
        };
    });

    const selected = await vscode.window.showQuickPick(items, {
        title: 'OpenClaw — Select Agent',
        placeHolder: `Current: ${currentAgentId}. Pick an agent to switch to.`
    });

    if (!selected) { return; }

    // Extract agent id from the selected label (strip icon prefix and name)
    const rawLabel = selected.label.replace(/^\$\([^)]+\)\s*/, ''); // strip icon
    // rawLabel is either "agentId" or "Name (agentId)"
    const matchParen = rawLabel.match(/\(([^)]+)\)$/);
    const newAgentId = matchParen ? matchParen[1] : rawLabel.trim();

    if (newAgentId === currentAgentId) { return; }

    // Save the new agent ID
    await setAgentId(newAgentId);

    // Switch the sidebar session to the new agent
    await chatProvider.changeAgent(newAgentId);

    // Update status bar
    updateAgentStatusBar(statusBar);
}

/**
 * Add an agent to the group chat.
 * Shows QuickPick of available agents, filtered to exclude already-in-group agents.
 */
async function addAgentToGroup(
    gatewayClient: GatewayClient,
    chatProvider: ChatViewProvider
) {
    const { GroupChatManager } = await import('./groupChatManager');
    const groupManager = GroupChatManager.getInstance();

    // Fetch all available agents
    let agents: Array<{ id: string; name?: string }> = [];
    try {
        agents = await gatewayClient.getAgentList();
    } catch {
        agents = [{ id: 'main' }];
    }

    // Filter out agents already in the group
    const currentAgents = groupManager.getAgents().map(a => a.agentId);
    const available = agents.filter(a => !currentAgents.includes(a.id));

    if (available.length === 0) {
        vscode.window.showInformationMessage('All available agents are already in the group.');
        return;
    }

    const items: vscode.QuickPickItem[] = available.map(agent => ({
        label: agent.name ? `$(person) ${agent.name} (${agent.id})` : `$(person) ${agent.id}`,
        description: `agent:${agent.id}`,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        title: 'OpenClaw — Add Agent to Group Chat',
        placeHolder: 'Select an agent to add...',
    });

    if (!selected) {
        return;
    }

    // Extract agent id from description
    const agentId = (selected.description || '').replace('agent:', '').trim();
    if (!agentId) {
        return;
    }

    // Add agent with default model — user can change model later via badge context menu
    await chatProvider.addAgentToGroup(agentId);
}

/**
 * Remove an agent from the group chat.
 */
async function removeAgentFromGroup(chatProvider: ChatViewProvider) {
    const { GroupChatManager } = await import('./groupChatManager');
    const groupManager = GroupChatManager.getInstance();
    const current = groupManager.getAgents();

    if (current.length === 0) {
        vscode.window.showInformationMessage('No agents in the group chat.');
        return;
    }

    const items: vscode.QuickPickItem[] = current.map(agent => ({
        label: `$(person) ${agent.name || agent.agentId}`,
        description: agent.agentId,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        title: 'OpenClaw — Remove Agent from Group Chat',
        placeHolder: 'Select an agent to remove...',
    });

    if (!selected) {
        return;
    }

    const agentId = selected.description || '';
    if (!agentId) {
        return;
    }

    chatProvider.removeAgentFromGroup(agentId);
    vscode.window.showInformationMessage(`OpenClaw Group: Removed agent "${selected.label.replace(/^\$\([^)]+\)\s*/, '')}"`);
}

/**
 * Leave the group chat (clear all agents and messages).
 */
async function leaveGroupChat(chatProvider: ChatViewProvider) {
    const confirm = await vscode.window.showWarningMessage(
        'Leave group chat? All group messages will be cleared.',
        { modal: false },
        'Leave'
    );
    if (confirm === 'Leave') {
        chatProvider.leaveGroupChat();
        vscode.window.showInformationMessage('OpenClaw: Left group chat.');
    }
}

function togglePlanMode() {
    const config = vscode.workspace.getConfiguration('openclaw');
    const current = config.get<boolean>('planMode') || false;
    config.update('planMode', !current, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage(`Plan Mode: ${!current ? 'ON' : 'OFF'}`);
    chatProvider.updatePlanMode(!current);
}

export function deactivate() {
    if (gatewayClient) {
        gatewayClient.disconnect();
    }
}
