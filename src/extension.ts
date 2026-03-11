import * as vscode from 'vscode';
import { ChatViewProvider } from './chatProvider';
import { ChatPanel } from './chatPanel';
import { GatewayClient } from './gateway';
import { DiffProvider } from './diffProvider';
import { LanguageManager } from './languageManager';
import { ChangeManager } from './changeManager';

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
        })
    );

    // 连接 Gateway
    gatewayClient.connect().catch(err => {
        vscode.window.showWarningMessage(`OpenClaw: 连接失败 - ${err.message}`);
    });

    // 状态栏
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(comment-discussion) OpenClaw';
    statusBar.tooltip = 'Click to open OpenClaw chat';
    statusBar.command = 'openclaw.openChatPanel';
    statusBar.show();
    context.subscriptions.push(statusBar);

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
