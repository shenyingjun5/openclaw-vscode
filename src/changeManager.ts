import * as vscode from 'vscode';
import { ChangeSet, FileChange } from './changeParser';

/**
 * 文件变更状态
 */
export interface FileChangeStatus {
    path: string;
    status: 'pending' | 'applied' | 'skipped';
}

/**
 * 变更管理器 - 管理变更集的状态和生命周期
 */
export class ChangeManager {
    private static instance: ChangeManager;
    private changeSets: Map<string, ChangeSet> = new Map();
    private fileStatuses: Map<string, Map<string, FileChangeStatus>> = new Map();
    private onDidChangeEmitter = new vscode.EventEmitter<ChangeSet>();

    public readonly onDidChange = this.onDidChangeEmitter.event;

    private constructor() {}

    public static getInstance(): ChangeManager {
        if (!ChangeManager.instance) {
            ChangeManager.instance = new ChangeManager();
        }
        return ChangeManager.instance;
    }

    /**
     * 注册新的变更集
     */
    public registerChangeSet(changeSet: ChangeSet): void {
        this.changeSets.set(changeSet.id, changeSet);

        // 初始化文件状态
        const statusMap = new Map<string, FileChangeStatus>();
        changeSet.files.forEach(file => {
            statusMap.set(file.path, {
                path: file.path,
                status: 'pending'
            });
        });
        this.fileStatuses.set(changeSet.id, statusMap);

        this.onDidChangeEmitter.fire(changeSet);
    }

    /**
     * 获取变更集
     */
    public getChangeSet(id: string): ChangeSet | undefined {
        return this.changeSets.get(id);
    }

    /**
     * 获取所有待处理的变更集
     */
    public getPendingChangeSets(): ChangeSet[] {
        return Array.from(this.changeSets.values())
            .filter(cs => cs.status === 'pending' || cs.status === 'partial');
    }

    /**
     * 获取文件状态
     */
    public getFileStatus(changeSetId: string, filePath: string): FileChangeStatus | undefined {
        return this.fileStatuses.get(changeSetId)?.get(filePath);
    }

    /**
     * 更新文件状态
     */
    public updateFileStatus(changeSetId: string, filePath: string, status: 'applied' | 'skipped'): void {
        const statusMap = this.fileStatuses.get(changeSetId);
        if (!statusMap) {
            return;
        }

        const fileStatus = statusMap.get(filePath);
        if (fileStatus) {
            fileStatus.status = status;
        }

        // 更新变更集整体状态
        this.updateChangeSetStatus(changeSetId);
        
        const changeSet = this.changeSets.get(changeSetId);
        if (changeSet) {
            this.onDidChangeEmitter.fire(changeSet);
        }
    }

    /**
     * 更新变更集状态
     */
    private updateChangeSetStatus(changeSetId: string): void {
        const changeSet = this.changeSets.get(changeSetId);
        const statusMap = this.fileStatuses.get(changeSetId);

        if (!changeSet || !statusMap) {
            return;
        }

        const statuses = Array.from(statusMap.values());
        const allApplied = statuses.every(s => s.status === 'applied');
        const allSkipped = statuses.every(s => s.status === 'skipped');
        const hasApplied = statuses.some(s => s.status === 'applied');

        if (allApplied) {
            changeSet.status = 'applied';
        } else if (allSkipped) {
            changeSet.status = 'rejected';
        } else if (hasApplied) {
            changeSet.status = 'partial';
        } else {
            changeSet.status = 'pending';
        }
    }

    /**
     * 应用单个文件变更
     */
    public async applyFileChange(changeSetId: string, filePath: string): Promise<boolean> {
        const changeSet = this.changeSets.get(changeSetId);
        if (!changeSet) {
            return false;
        }

        const file = changeSet.files.find(f => f.path === filePath);
        if (!file) {
            return false;
        }

        try {
            await this.executeFileChange(file);
            this.updateFileStatus(changeSetId, filePath, 'applied');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply changes to ${filePath}: ${error}`);
            return false;
        }
    }

    /**
     * 跳过单个文件变更
     */
    public skipFileChange(changeSetId: string, filePath: string): void {
        this.updateFileStatus(changeSetId, filePath, 'skipped');
    }

    /**
     * 应用所有变更
     */
    public async applyAllChanges(changeSetId: string): Promise<void> {
        const changeSet = this.changeSets.get(changeSetId);
        if (!changeSet) {
            return;
        }

        const results = await Promise.allSettled(
            changeSet.files.map(file => this.applyFileChange(changeSetId, file.path))
        );

        const failedCount = results.filter(r => r.status === 'rejected').length;
        if (failedCount > 0) {
            vscode.window.showWarningMessage(
                `Applied ${changeSet.files.length - failedCount}/${changeSet.files.length} changes`
            );
        } else {
            vscode.window.showInformationMessage('All changes applied successfully');
        }
    }

    /**
     * 拒绝所有变更
     */
    public rejectAllChanges(changeSetId: string): void {
        const changeSet = this.changeSets.get(changeSetId);
        if (!changeSet) {
            return;
        }

        changeSet.files.forEach(file => {
            this.updateFileStatus(changeSetId, file.path, 'skipped');
        });
    }

    /**
     * 执行单个文件变更
     */
    private async executeFileChange(file: FileChange): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const uri = vscode.Uri.joinPath(workspaceFolder.uri, file.path);

        switch (file.action) {
            case 'create':
                await this.createFile(uri, file.content || '');
                break;

            case 'modify':
                await this.modifyFile(uri, file.content || '');
                break;

            case 'delete':
                await this.deleteFile(uri);
                break;
        }
    }

    /**
     * 创建文件
     */
    private async createFile(uri: vscode.Uri, content: string): Promise<void> {
        // 确保目录存在
        const dirUri = vscode.Uri.joinPath(uri, '..');
        try {
            await vscode.workspace.fs.createDirectory(dirUri);
        } catch {
            // 目录可能已存在
        }

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
    }

    /**
     * 修改文件
     */
    private async modifyFile(uri: vscode.Uri, content: string): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const fullRange = new vscode.Range(
                doc.positionAt(0),
                doc.positionAt(doc.getText().length)
            );
            edit.replace(uri, fullRange, content);
        } catch {
            // 文件不存在，创建新文件
            await this.createFile(uri, content);
            return;
        }

        await vscode.workspace.applyEdit(edit);
    }

    /**
     * 删除文件
     */
    private async deleteFile(uri: vscode.Uri): Promise<void> {
        await vscode.workspace.fs.delete(uri);
    }

    /**
     * 自动接受待处理的变更集
     * 当用户发送新消息时调用
     */
    public async autoAcceptPending(): Promise<void> {
        const pending = this.getPendingChangeSets();
        
        for (const changeSet of pending) {
            await this.applyAllChanges(changeSet.id);
        }
    }

    /**
     * 清理已完成的变更集
     */
    public cleanup(olderThanMs: number = 3600000): void {
        const now = Date.now();
        
        for (const [id, changeSet] of this.changeSets.entries()) {
            if (changeSet.status === 'applied' || changeSet.status === 'rejected') {
                if (now - changeSet.timestamp > olderThanMs) {
                    this.changeSets.delete(id);
                    this.fileStatuses.delete(id);
                }
            }
        }
    }
}
