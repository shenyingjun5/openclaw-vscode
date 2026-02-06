import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GatewayClient } from './gateway';

export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private static readonly viewType = 'openclaw.chatPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _gateway: GatewayClient;
    private _sessionId: string;
    private _planMode: boolean = false;
    private _isSending: boolean = false;
    private _notifiedWorkspaceDir: string | null = null;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri, gateway: GatewayClient) {
        const column = vscode.ViewColumn.Beside;

        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ChatPanel.viewType,
            '🐱 招财',
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

        ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, gateway);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        gateway: GatewayClient
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._gateway = gateway;
        this._sessionId = 'vscode-panel';

        const config = vscode.workspace.getConfiguration('openclaw');
        this._planMode = config.get<boolean>('planMode') || false;

        this._panel.webview.html = this._getHtmlContent();

        this._panel.webview.onDidReceiveMessage(
            async (data) => {
                switch (data.type) {
                    case 'ready':
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
                        // TODO: 实现模型切换
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
            return `[当前工作目录: ${currentDir}]\n\n${content}`;
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
                models: [{ id: 'default', name: '默认模型', selected: true }]
            });
        }
    }

    private async _sendMessage(content: string) {
        if (this._isSending) return;

        this._isSending = true;

        let finalMessage = this._buildMessageWithWorkspace(content);
        
        if (this._planMode) {
            const confirmCommands = ['执行', '继续', '确认', '开始', 'go', 'yes', 'ok', 'y'];
            const isConfirm = confirmCommands.some(cmd =>
                content.toLowerCase().trim() === cmd.toLowerCase()
            );

            if (!isConfirm) {
                finalMessage += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ 【计划模式 - 禁止直接执行】

你必须：
1. 只输出计划，不调用任何工具
2. 列出每个步骤的操作和影响
3. 等用户说"执行"后才能调用工具

违反此规则 = 任务失败
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
                content: `发送失败: ${err.message}`
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
            // 忽略
        }
    }

    private async _handleGetFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            this._panel.webview.postMessage({ type: 'files', files: [] });
            return;
        }

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
                relativePath
            };
        });

        this._panel.webview.postMessage({ type: 'files', files: fileList });
    }

    private async _handleSelectFile() {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: '添加附件'
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
            vscode.window.showErrorMessage(`保存图片失败: ${err.message}`);
        }
    }

    public dispose() {
        ChatPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }
}
