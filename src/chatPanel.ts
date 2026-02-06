import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GatewayClient } from './gateway';

// i18n helper
function getLocale(): string {
    const lang = vscode.env.language;
    return lang.startsWith('zh') ? 'zh' : 'en';
}

function t(key: string): string {
    const locale = getLocale() as 'en' | 'zh';
    const messages: { [key: string]: { en: string; zh: string } } = {
        maxPanels: {
            en: 'Maximum parallel sessions reached (5). Please close a window first.',
            zh: '已达最大并行会话数 (5)，请关闭一个窗口后再试'
        },
        cannotAllocate: {
            en: 'Cannot allocate new session window',
            zh: '无法分配新的会话窗口'
        },
        sendFailed: {
            en: 'Send failed',
            zh: '发送失败'
        },
        saveImageFailed: {
            en: 'Failed to save image',
            zh: '保存图片失败'
        },
        defaultModel: {
            en: 'Default Model',
            zh: '默认模型'
        },
        addAttachment: {
            en: 'Add attachment',
            zh: '添加附件'
        }
    };
    return messages[key]?.[locale] || messages[key]?.['en'] || key;
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
    private _sessionId: string;
    private _planMode: boolean = false;
    private _isSending: boolean = false;
    private _notifiedWorkspaceDir: string | null = null;
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
            '🐱',
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
        this._sessionId = `vscode-panel${panelId}`;

        const config = vscode.workspace.getConfiguration('openclaw');
        this._planMode = config.get<boolean>('planMode') || false;

        this._panel.webview.html = this._getHtmlContent();

        this._panel.webview.onDidReceiveMessage(
            async (data) => {
                switch (data.type) {
                    case 'ready':
                        // Send locale to webview
                        this._panel.webview.postMessage({
                            type: 'setLocale',
                            locale: vscode.env.language
                        });
                        await this._loadHistory();
                        this._sendModels();
                        this._panel.webview.postMessage({ 
                            type: 'updatePlanMode', 
                            enabled: this._planMode 
                        });
                        break;
                        
                    case 'sendMessage':
                        if (data.planMode !== undefined) {
                            this._planMode = data.planMode;
                        }
                        await this._sendMessage(data.content);
                        break;
                        
                    case 'stop':
                        this._gateway.stop();
                        this._isSending = false;
                        this._panel.webview.postMessage({ type: 'sendingComplete' });
                        break;
                        
                    case 'refresh':
                        await this._loadHistory();
                        break;
                        
                    case 'openSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'openclaw');
                        break;
                        
                    case 'getFiles':
                        await this._handleGetFiles();
                        break;
                        
                    case 'selectFile':
                        await this._handleSelectFile();
                        break;
                        
                    case 'handleDrop':
                        await this._handleFileDrop(data.files);
                        break;
                        
                    case 'saveImage':
                        await this._saveImage(data.data, data.name);
                        break;
                        
                    case 'setPlanMode':
                        this._planMode = data.enabled;
                        break;
                        
                    case 'setModel':
                        break;
                }
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

    private _getWorkspaceDir(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return null;
    }

    private _buildMessageWithWorkspace(content: string): string {
        const currentDir = this._getWorkspaceDir();
        
        if (currentDir && currentDir !== this._notifiedWorkspaceDir) {
            this._notifiedWorkspaceDir = currentDir;
            return `[Current workspace: ${currentDir}]\n\n${content}`;
        }
        
        return content;
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

        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());

        return html;
    }

    private async _sendModels() {
        try {
            const { models } = await this._gateway.getModels();
            this._panel.webview.postMessage({
                type: 'updateModels',
                models
            });
        } catch (err) {
            this._panel.webview.postMessage({
                type: 'updateModels',
                models: [{ id: 'default', name: t('defaultModel'), selected: true }]
            });
        }
    }

    private async _sendMessage(content: string) {
        if (this._isSending) return;

        this._isSending = true;

        let finalMessage = this._buildMessageWithWorkspace(content);
        
        if (this._planMode) {
            const confirmCommands = ['执行', '继续', '确认', '开始', 'go', 'yes', 'ok', 'y', 'execute', 'run'];
            const isConfirm = confirmCommands.some(cmd =>
                content.toLowerCase().trim() === cmd.toLowerCase()
            );

            if (!isConfirm) {
                finalMessage += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ [Plan Mode - Do Not Execute]

You must:
1. Output plan only, do not call any tools
2. List each step and its impact
3. Wait for user to say "execute" before calling tools

Violation = Task failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            }
        }

        try {
            const reply = await this._gateway.sendMessage(this._sessionId, finalMessage);

            let replyContent = reply.content;
            replyContent = replyContent.replace(/<think>[\s\S]*?<\/think>/g, '');
            replyContent = replyContent.replace(/<\/?final>/g, '');
            replyContent = replyContent.trim();

            if (replyContent) {
                this._panel.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: replyContent
                });
            }
        } catch (err: any) {
            this._panel.webview.postMessage({
                type: 'error',
                content: `${t('sendFailed')}: ${err.message}`
            });
        } finally {
            this._isSending = false;
            this._panel.webview.postMessage({ type: 'sendingComplete' });
        }
    }

    private async _loadHistory() {
        try {
            const history = await this._gateway.getHistory(this._sessionId);
            const messages = history.map(msg => {
                let content = msg.content;
                content = content.replace(/<think>[\s\S]*?<\/think>/g, '');
                content = content.replace(/<\/?final>/g, '');
                content = content.trim();
                return { role: msg.role, content };
            }).filter(m => m.content);

            this._panel.webview.postMessage({
                type: 'loadHistory',
                messages
            });
        } catch (err) {
            // Ignore
        }
    }

    private async _handleGetFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            this._panel.webview.postMessage({ type: 'files', files: [] });
            return;
        }

        // Get files
        const files = await vscode.workspace.findFiles(
            '**/*.{ts,tsx,js,jsx,py,go,rs,java,c,cpp,h,hpp,md,json,yaml,yml,toml,css,scss,html,vue,svelte,swift}',
            '**/node_modules/**',
            100
        );

        const fileList = files.map(f => {
            const relativePath = vscode.workspace.asRelativePath(f);
            return {
                name: path.basename(f.fsPath),
                path: f.fsPath,
                relativePath,
                isDirectory: false
            };
        });

        // Get directories
        const dirs = await vscode.workspace.findFiles(
            '**/',
            '{**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**}',
            50
        );

        // Extract unique directory paths from files
        const dirSet = new Set<string>();
        for (const f of files) {
            const rel = vscode.workspace.asRelativePath(f);
            const parts = rel.split('/');
            let current = '';
            for (let i = 0; i < parts.length - 1; i++) {
                current = current ? `${current}/${parts[i]}` : parts[i];
                dirSet.add(current);
            }
        }

        const dirList = Array.from(dirSet).slice(0, 30).map(d => ({
            name: d.split('/').pop() || d,
            path: path.join(workspaceFolders[0].uri.fsPath, d),
            relativePath: d,
            isDirectory: true
        }));

        // Combine: directories first, then files
        const combined = [...dirList, ...fileList];
        this._panel.webview.postMessage({ type: 'files', files: combined });
    }

    private async _handleSelectFile() {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: t('addAttachment')
        });
        
        if (files) {
            for (const file of files) {
                this._panel.webview.postMessage({
                    type: 'fileSelected',
                    name: path.basename(file.fsPath),
                    path: file.fsPath
                });
            }
        }
    }

    private async _handleFileDrop(files: { name: string; path: string }[]) {
        for (const file of files) {
            this._panel.webview.postMessage({
                type: 'fileDropped',
                name: file.name,
                path: file.path
            });
        }
    }

    private async _saveImage(base64Data: string, name: string) {
        try {
            const tmpDir = require('os').tmpdir();
            const filePath = path.join(tmpDir, name);
            const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64, 'base64');
            fs.writeFileSync(filePath, buffer);

            this._panel.webview.postMessage({
                type: 'fileSaved',
                name,
                path: filePath
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`${t('saveImageFailed')}: ${err.message}`);
        }
    }

    public dispose() {
        ChatPanel.panels.delete(this._panelId);
        PanelSessionPool.getInstance().release(this._panelId);
        
        // Delete session asynchronously
        this._gateway.deleteSession(this._sessionId).catch(() => {});
        
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }
}
