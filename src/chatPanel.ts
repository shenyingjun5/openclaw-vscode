import * as vscode from 'vscode';
import * as fs from 'fs';
import { GatewayClient } from './gateway';
import { ChatSessionManager } from './chatSessionManager';
import { ChatController, WebviewAdapter, t } from './chatController';

/**
 * 独立面板 Webview 适配器
 */
class PanelAdapter implements WebviewAdapter {
    constructor(private _panel: vscode.WebviewPanel) {}
    postMessage(message: any) {
        this._panel.webview.postMessage(message);
    }
}

/**
 * Panel session pool manager
 * Manages up to 5 panel slots
 */
class PanelSessionPool {
    private static instance: PanelSessionPool;
    private activePanels = new Set<number>();
    private static readonly MAX_PANELS = 5;

    private constructor() {}

    public static getInstance(): PanelSessionPool {
        if (!PanelSessionPool.instance) {
            PanelSessionPool.instance = new PanelSessionPool();
        }
        return PanelSessionPool.instance;
    }

    public allocate(): number | null {
        for (let i = 1; i <= PanelSessionPool.MAX_PANELS; i++) {
            if (!this.activePanels.has(i)) {
                this.activePanels.add(i);
                return i;
            }
        }
        return null;
    }

    public release(id: number): void {
        this.activePanels.delete(id);
    }

    public isFull(): boolean {
        return this.activePanels.size >= PanelSessionPool.MAX_PANELS;
    }
}

export class ChatPanel {
    private static panels: Map<number, ChatPanel> = new Map();
    private static readonly viewType = 'openclaw.chatPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _gateway: GatewayClient;
    private readonly _panelId: number;
    private readonly _controller: ChatController;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, gateway: GatewayClient) {
        const column = vscode.ViewColumn.Beside;
        const pool = PanelSessionPool.getInstance();

        if (pool.isFull()) {
            vscode.window.showWarningMessage(t('maxPanels'));
            return;
        }

        const panelId = pool.allocate();
        if (panelId === null) {
            vscode.window.showWarningMessage(t('cannotAllocate'));
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ChatPanel.viewType,
            '🦞',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview'),
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        const chatPanel = new ChatPanel(panel, extensionUri, gateway, panelId);
        ChatPanel.panels.set(panelId, chatPanel);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gateway: GatewayClient,
        panelId: number
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gateway = gateway;
        this._panelId = panelId;

        // 创建 session ID
        const windowId = vscode.env.sessionId.slice(0, 8);
        const sessionKey = `agent:main:vscode-panel-${windowId}-${panelId}`;

        // 初始化 SessionManager 和 Controller
        const sessionManager = new ChatSessionManager(extensionUri);
        this._controller = new ChatController(extensionUri, gateway, sessionManager, sessionKey);

        // 绑定 webview
        this._controller.setWebview(new PanelAdapter(panel));

        // 自动扫描项目
        this._controller.sessionManager.initProjectConfig();

        // 设置 webview HTML
        this._panel.webview.html = this._getHtmlContent();

        // 所有消息统一由 controller 处理
        this._panel.webview.onDidReceiveMessage(
            async (data) => {
                await this._controller.handleMessage(data);
            },
            null,
            this._disposables
        );

        this._panel.onDidDispose(
            () => this.dispose(),
            null,
            this._disposables
        );
    }

    private _getHtmlContent(): string {
        const webview = this._panel.webview;
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

    public dispose() {
        ChatPanel.panels.delete(this._panelId);
        PanelSessionPool.getInstance().release(this._panelId);

        // Reset session
        this._controller.sessionManager.resetSession(this._controller.sessionKey);

        // Delete session asynchronously
        this._gateway.deleteSession(this._controller.sessionKey).catch(() => {});

        // 清理 controller 资源
        this._controller.dispose();

        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }
}
