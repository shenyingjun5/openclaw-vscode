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
        },
        noActiveEditor: {
            en: 'No active editor',
            zh: '没有活动的编辑器'
        },
        noSelection: {
            en: 'No code selected',
            zh: '没有选中任何代码'
        },
        newSession: {
            en: 'New session',
            zh: '新会话'
        },
        selectedCode: {
            en: 'Selected code',
            zh: '选中代码'
        },
        sentFile: {
            en: 'Sent file',
            zh: '发送文件'
        }
    };
    return messages[key]?.[locale] || messages[key]?.['en'] || key;
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _sessionId: string;
    private _planMode: boolean = false;
    private _isSending: boolean = false;
    private _notifiedWorkspaceDir: string | null = null;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _gateway: GatewayClient
    ) {
        this._sessionId = 'vscode-main';
        
        const config = vscode.workspace.getConfiguration('openclaw');
        this._planMode = config.get<boolean>('planMode') || false;
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

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'ready':
                    // Send locale to webview
                    this._view?.webview.postMessage({
                        type: 'setLocale',
                        locale: vscode.env.language
                    });
                    await this._loadHistory();
                    this._sendModels();
                    this._view?.webview.postMessage({ 
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
                    this._view?.webview.postMessage({ type: 'sendingComplete' });
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
        
        html = html.replace(/\${cspSource}/g, webview.cspSource);
        html = html.replace(/\${stylesUri}/g, stylesUri.toString());
        html = html.replace(/\${scriptUri}/g, scriptUri.toString());
        
        return html;
    }

    private async _sendModels() {
        try {
            const { models } = await this._gateway.getModels();
            this._view?.webview.postMessage({
                type: 'updateModels',
                models
            });
        } catch (err) {
            this._view?.webview.postMessage({
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
                this._view?.webview.postMessage({
                    type: 'addMessage',
                    role: 'assistant',
                    content: replyContent
                });
            }
        } catch (err: any) {
            this._view?.webview.postMessage({
                type: 'error',
                content: `${t('sendFailed')}: ${err.message}`
            });
        } finally {
            this._isSending = false;
            this._view?.webview.postMessage({ type: 'sendingComplete' });
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
            
            this._view?.webview.postMessage({
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
            this._view?.webview.postMessage({ type: 'files', files: [] });
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
        this._view?.webview.postMessage({ type: 'files', files: combined });
    }

    private async _handleSelectFile() {
        const files = await vscode.window.showOpenDialog({
            canSelectMany: true,
            openLabel: t('addAttachment')
        });
        
        if (files) {
            for (const file of files) {
                this._view?.webview.postMessage({
                    type: 'fileSelected',
                    name: path.basename(file.fsPath),
                    path: file.fsPath
                });
            }
        }
    }

    private async _handleFileDrop(files: { name: string; path: string }[]) {
        for (const file of files) {
            this._view?.webview.postMessage({
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
            
            this._view?.webview.postMessage({
                type: 'fileSaved',
                name,
                path: filePath
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`${t('saveImageFailed')}: ${err.message}`);
        }
    }

    public updatePlanMode(enabled: boolean) {
        this._planMode = enabled;
        this._view?.webview.postMessage({ type: 'updatePlanMode', enabled });
    }

    public newSession() {
        this._sessionId = `vscode-${Date.now()}`;
        this._notifiedWorkspaceDir = null;
        this._view?.webview.postMessage({ type: 'clearMessages' });
        vscode.window.showInformationMessage(`${t('newSession')}: ${this._sessionId}`);
    }

    public clearChat() {
        this._view?.webview.postMessage({ type: 'clearMessages' });
    }

    public async sendSelection() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(t('noActiveEditor'));
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);
        
        if (!text) {
            vscode.window.showWarningMessage(t('noSelection'));
            return;
        }

        const fileName = path.basename(editor.document.fileName);
        const lang = editor.document.languageId;
        
        const content = `Please analyze this code:\n\n\`${fileName}\`:\n\`\`\`${lang}\n${text}\n\`\`\``;
        
        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: `[${t('selectedCode')}: ${fileName}]`
        });
        
        await this._sendMessage(content);
    }

    public async sendFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage(t('noActiveEditor'));
            return;
        }

        const text = editor.document.getText();
        const fileName = path.basename(editor.document.fileName);
        const lang = editor.document.languageId;
        
        const content = `Please analyze this file:\n\n\`${fileName}\`:\n\`\`\`${lang}\n${text}\n\`\`\``;
        
        this._view?.webview.postMessage({
            type: 'addMessage',
            role: 'user',
            content: `[${t('sentFile')}: ${fileName}]`
        });
        
        await this._sendMessage(content);
    }
}
