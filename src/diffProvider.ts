import * as vscode from 'vscode';
import { FileChange } from './changeParser';

/**
 * Diff 虚拟文档提供者
 * 用于在 VS Code 原生 Diff 视图中显示变更
 */
export class DiffProvider implements vscode.TextDocumentContentProvider {
    private static instance: DiffProvider;
    private changes = new Map<string, FileChange>();
    private onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();

    public readonly onDidChange = this.onDidChangeEmitter.event;

    private constructor() {}

    public static getInstance(): DiffProvider {
        if (!DiffProvider.instance) {
            DiffProvider.instance = new DiffProvider();
        }
        return DiffProvider.instance;
    }

    /**
     * 注册到 VS Code
     */
    public static register(context: vscode.ExtensionContext): DiffProvider {
        const provider = DiffProvider.getInstance();
        
        context.subscriptions.push(
            vscode.workspace.registerTextDocumentContentProvider('openclaw-diff', provider)
        );

        return provider;
    }

    /**
     * 提供虚拟文档内容
     */
    provideTextDocumentContent(uri: vscode.Uri): string {
        const key = this.getKeyFromUri(uri);
        const change = this.changes.get(key);
        
        if (!change) {
            return '';
        }

        return change.content || '';
    }

    /**
     * 注册文件变更
     */
    public registerChange(changeSetId: string, file: FileChange): void {
        const key = this.makeKey(changeSetId, file.path);
        this.changes.set(key, file);
    }

    /**
     * 显示 Diff 视图
     */
    public async showDiff(changeSetId: string, file: FileChange): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const originalUri = vscode.Uri.joinPath(workspaceFolder.uri, file.path);
        const key = this.makeKey(changeSetId, file.path);
        
        // 注册变更
        this.registerChange(changeSetId, file);

        if (file.action === 'create') {
            // 创建：显示空文件 vs 新内容
            const emptyUri = vscode.Uri.parse(`openclaw-diff:empty?${key}`);
            const newUri = vscode.Uri.parse(`openclaw-diff:${file.path}?${key}`);
            
            await vscode.commands.executeCommand(
                'vscode.diff',
                emptyUri,
                newUri,
                `${this.getFileName(file.path)} (New File)`
            );
        } else if (file.action === 'modify') {
            // 修改：显示原文件 vs 新内容
            const newUri = vscode.Uri.parse(`openclaw-diff:${file.path}?${key}`);
            
            try {
                // 检查文件是否存在
                await vscode.workspace.fs.stat(originalUri);
                
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    originalUri,
                    newUri,
                    `${this.getFileName(file.path)} (Modified)`
                );
            } catch {
                // 文件不存在，按创建处理
                vscode.window.showWarningMessage(
                    `File ${file.path} does not exist. Treating as new file.`
                );
                
                const emptyUri = vscode.Uri.parse(`openclaw-diff:empty?${key}`);
                await vscode.commands.executeCommand(
                    'vscode.diff',
                    emptyUri,
                    newUri,
                    `${this.getFileName(file.path)} (New File)`
                );
            }
        } else if (file.action === 'delete') {
            // 删除：显示原文件 vs 空
            const emptyUri = vscode.Uri.parse(`openclaw-diff:empty?${key}`);
            
            await vscode.commands.executeCommand(
                'vscode.diff',
                originalUri,
                emptyUri,
                `${this.getFileName(file.path)} (Deleted)`
            );
        }
    }

    /**
     * 从 URI 中提取 key
     */
    private getKeyFromUri(uri: vscode.Uri): string {
        // URI 格式: openclaw-diff:path/to/file.ts?changeset-xxx-path/to/file.ts
        return uri.query;
    }

    /**
     * 生成唯一 key
     */
    private makeKey(changeSetId: string, filePath: string): string {
        return `${changeSetId}-${filePath}`;
    }

    /**
     * 获取文件名
     */
    private getFileName(path: string): string {
        const parts = path.split('/');
        return parts[parts.length - 1];
    }

    /**
     * 清理变更缓存
     */
    public clearChanges(changeSetId: string): void {
        const keysToDelete: string[] = [];
        
        for (const key of this.changes.keys()) {
            if (key.startsWith(changeSetId + '-')) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => this.changes.delete(key));
    }
}
