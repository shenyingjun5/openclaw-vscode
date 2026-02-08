import * as vscode from 'vscode';
import * as fs from 'fs';
import { GatewayClient } from './gateway';
import { ChatSessionManager } from './chatSessionManager';
import { ChatController, WebviewAdapter } from './chatController';

/**
 * 侧边栏 Webview 适配器
 */
class SidebarAdapter implements WebviewAdapter {
    constructor(private _view: vscode.WebviewView) {}
    postMessage(message: any) {
        this._view.webview.postMessage(message);
    }
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _controller: ChatController;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gateway: GatewayClient
    ) {
        const windowId = vscode.env.sessionId.slice(0, 8);
        const sessionKey = `agent:main:vscode-main-${windowId}`;

        const sessionManager = new ChatSessionManager(_extensionUri);
        this._controller = new ChatController(_extensionUri, _gateway, sessionManager, sessionKey);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview'),
                vscode.Uri.joinPath(this._extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // 绑定 webview 到 controller
        this._controller.setWebview(new SidebarAdapter(webviewView));

        // 自动扫描项目
        this._controller.sessionManager.initProjectConfig();

        // 所有消息统一由 controller 处理
        webviewView.webview.onDidReceiveMessage(async (data) => {
            await this._controller.handleMessage(data);
        });
    }

    private _getHtmlContent(webview: vscode.Webview): string {
        const htmlPath = vscode.Uri.joinPath(this._extensionUri, 'webview', 'index.html');
        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

        const stylesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'styles.css')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'main.js')
        );
        const changeCardScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'webview', 'changeCard.js')
        );

        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        html = html.replace(/\${changeCardScriptUri}/g, changeCardScriptUri.toString());

        return html;
    }

    // ========== 公共方法（供 extension.ts 命令调用） ==========

    public updatePlanMode(enabled: boolean) {
        this._controller.updatePlanMode(enabled);
    }

    public newSession() {
        this._controller.newSession();
    }

    public clearChat() {
        this._controller.clearChat();
    }

    public async sendSelection() {
        await this._controller.sendSelection();
    }

    public async sendFile() {
        await this._controller.sendFile();
    }
}
