import * as vscode from 'vscode';
import { ChatViewProvider } from './chatProvider';
import { ChatPanel } from './chatPanel';
import { GatewayClient } from './gateway';

let gatewayClient: GatewayClient;
let chatProvider: ChatViewProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenClaw extension is now active!');

    // 初始化 Gateway 客户端
    const config = vscode.workspace.getConfiguration('openclaw');
    const gatewayUrl = config.get<string>('gatewayUrl') || 'http://127.0.0.1:18789';
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
        vscode.commands.registerCommand('openclaw.clearChat', () => chatProvider.clearChat())
    );

    // 连接 Gateway
    gatewayClient.connect().catch(err => {
        vscode.window.showWarningMessage(`OpenClaw: 连接失败 - ${err.message}`);
    });

    // 状态栏
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(comment-discussion) 招财';
    statusBar.tooltip = '点击打开招财对话窗口';
    statusBar.command = 'openclaw.openChatPanel';
    statusBar.show();
    context.subscriptions.push(statusBar);

    // 更新状态栏
    gatewayClient.onConnectionChange((connected) => {
        statusBar.text = connected ? '$(comment-discussion) 招财' : '$(warning) 招财';
        statusBar.tooltip = connected ? '点击打开招财对话窗口' : '未连接';
    });
}

function togglePlanMode() {
    const config = vscode.workspace.getConfiguration('openclaw');
    const current = config.get<boolean>('planMode') || false;
    config.update('planMode', !current, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage(`计划模式: ${!current ? '开启' : '关闭'}`);
    chatProvider.updatePlanMode(!current);
}

export function deactivate() {
    if (gatewayClient) {
        gatewayClient.disconnect();
    }
}
