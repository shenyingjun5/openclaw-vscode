/**
 * 文件变更数据结构
 */
export interface FileChange {
    path: string;                    // 文件路径
    action: 'create' | 'modify' | 'delete';
    description?: string;            // 变更描述
    content?: string;                // 完整内容（create/modify）
    hunks?: DiffHunk[];             // 差异块（modify）
}

export interface DiffHunk {
    startLine: number;
    endLine: number;
    diff: string;                    // unified diff 格式
}

export interface ChangeSet {
    id: string;                      // 变更集 ID
    description: string;             // 变更描述
    files: FileChange[];             // 文件列表
    status: 'pending' | 'partial' | 'applied' | 'rejected';
    timestamp: number;               // 创建时间
}

/**
 * 解析 AI 响应中的变更数据
 */
export class ChangeParser {
    /**
     * 从 AI 响应中提取变更数据
     * 查找 ```changes ... ``` 代码块
     */
    public static parseFromResponse(response: string): ChangeSet | null {
        // 匹配 ```changes ... ``` 代码块
        const changesBlockRegex = /```changes\s*\n([\s\S]*?)\n```/i;
        const match = response.match(changesBlockRegex);

        if (!match) {
            return null;
        }

        const jsonStr = match[1].trim();

        try {
            const data = JSON.parse(jsonStr);
            return this.validateAndNormalize(data);
        } catch (error) {
            console.error('Failed to parse changes JSON:', error);
            return null;
        }
    }

    /**
     * 验证并规范化变更数据
     */
    private static validateAndNormalize(data: any): ChangeSet | null {
        if (!data || typeof data !== 'object') {
            return null;
        }

        // 支持两种格式：
        // 1. 直接是 ChangeSet: { description, files }
        // 2. 只有 files 数组
        const files = Array.isArray(data.files) ? data.files : 
                     Array.isArray(data) ? data : null;

        if (!files || files.length === 0) {
            return null;
        }

        // 验证每个文件变更
        const validatedFiles: FileChange[] = files
            .map((file: any) => this.validateFileChange(file))
            .filter((file: FileChange | null): file is FileChange => file !== null);

        if (validatedFiles.length === 0) {
            return null;
        }

        const changeSet: ChangeSet = {
            id: this.generateId(),
            description: data.description || 'Code changes',
            files: validatedFiles,
            status: 'pending',
            timestamp: Date.now()
        };

        return changeSet;
    }

    /**
     * 验证单个文件变更
     */
    private static validateFileChange(file: any): FileChange | null {
        if (!file || typeof file !== 'object') {
            return null;
        }

        // 必需字段
        if (!file.path || typeof file.path !== 'string') {
            return null;
        }

        const action = file.action;
        if (action !== 'create' && action !== 'modify' && action !== 'delete') {
            return null;
        }

        // create 和 modify 需要内容
        if ((action === 'create' || action === 'modify') && !file.content && !file.hunks) {
            return null;
        }

        const fileChange: FileChange = {
            path: file.path,
            action: action,
            description: file.description,
            content: file.content,
            hunks: file.hunks
        };

        return fileChange;
    }

    /**
     * 生成唯一 ID
     */
    private static generateId(): string {
        return `changeset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 检查响应中是否包含变更数据
     */
    public static hasChanges(response: string): boolean {
        return /```changes/i.test(response);
    }
}
