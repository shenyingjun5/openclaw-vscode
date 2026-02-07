/**
 * 变更卡片组件
 * 处理文件变更的 UI 渲染和交互
 */

class ChangeCard {
    constructor(changeSet, vscode) {
        this.changeSet = changeSet;
        this.vscode = vscode;
        this.fileStatuses = new Map();
        
        // 初始化文件状态
        changeSet.files.forEach(file => {
            this.fileStatuses.set(file.path, 'pending');
        });
    }

    /**
     * 渲染变更卡片
     */
    render() {
        const card = document.createElement('div');
        card.className = 'change-card';
        card.dataset.changesetId = this.changeSet.id;

        // 标题栏
        const header = this.renderHeader();
        card.appendChild(header);

        // 文件列表
        const filesList = this.renderFiles();
        card.appendChild(filesList);

        // 底部按钮
        const footer = this.renderFooter();
        card.appendChild(footer);

        // 绑定事件
        this.bindEvents(card);

        return card;
    }

    /**
     * 渲染标题栏
     */
    renderHeader() {
        const header = document.createElement('div');
        header.className = 'change-header';

        const title = document.createElement('span');
        title.className = 'change-title';
        title.innerHTML = `
            <span class="change-icon">📁</span>
            <span class="change-title-text">${t('diff.title')}</span>
        `;

        const count = document.createElement('span');
        count.className = 'change-count';
        count.setAttribute('aria-live', 'polite');
        count.innerHTML = `
            <span class="applied-count">0</span>/<span class="total-count">${this.changeSet.files.length}</span>
            ${t('diff.files')}
        `;

        header.appendChild(title);
        header.appendChild(count);

        return header;
    }

    /**
     * 渲染文件列表
     */
    renderFiles() {
        const container = document.createElement('div');
        container.className = 'change-files';

        this.changeSet.files.forEach(file => {
            const fileEl = this.renderFile(file);
            container.appendChild(fileEl);
        });

        return container;
    }

    /**
     * 渲染单个文件
     */
    renderFile(file) {
        const fileEl = document.createElement('div');
        fileEl.className = 'change-file';
        fileEl.dataset.path = file.path;
        fileEl.dataset.status = 'pending';

        // 文件信息（可点击预览）
        const info = document.createElement('div');
        info.className = 'file-info';
        info.setAttribute('role', 'button');
        info.setAttribute('tabindex', '0');
        info.setAttribute('title', t('diff.tooltip.preview'));

        const icon = this.getFileIcon(file.action);
        const actionText = t(`diff.action.${file.action}`);

        info.innerHTML = `
            <span class="file-icon">${icon}</span>
            <span class="file-name">${this.truncatePath(file.path)}</span>
            <span class="file-action">(${actionText})</span>
        `;

        // 操作按钮
        const actions = document.createElement('div');
        actions.className = 'file-actions';
        actions.innerHTML = `
            <button class="icon-btn apply" 
                    aria-label="${t('diff.tooltip.apply')}"
                    title="${t('diff.tooltip.apply')}">✓</button>
            <button class="icon-btn skip"
                    aria-label="${t('diff.tooltip.skip')}"
                    title="${t('diff.tooltip.skip')}">✗</button>
        `;

        fileEl.appendChild(info);
        fileEl.appendChild(actions);

        return fileEl;
    }

    /**
     * 渲染底部按钮
     */
    renderFooter() {
        const footer = document.createElement('div');
        footer.className = 'change-footer';

        footer.innerHTML = `
            <button class="batch-btn accept">${t('diff.acceptAll')}</button>
            <button class="batch-btn reject">${t('diff.rejectAll')}</button>
        `;

        return footer;
    }

    /**
     * 绑定事件
     */
    bindEvents(card) {
        // 点击文件名预览 diff
        card.querySelectorAll('.file-info').forEach(info => {
            const fileEl = info.closest('.change-file');
            const filePath = fileEl.dataset.path;
            const file = this.changeSet.files.find(f => f.path === filePath);

            info.addEventListener('click', () => {
                const status = this.fileStatuses.get(filePath);
                
                // 如果已应用，打开文件而不是 diff
                if (status === 'applied') {
                    this.openFile(file);
                } else if (status === 'pending') {
                    this.previewDiff(file);
                }
            });

            // 键盘支持
            info.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    info.click();
                }
            });
        });

        // 应用单个文件
        card.querySelectorAll('.icon-btn.apply').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileEl = btn.closest('.change-file');
                const filePath = fileEl.dataset.path;
                this.applyFile(filePath);
            });
        });

        // 跳过单个文件
        card.querySelectorAll('.icon-btn.skip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileEl = btn.closest('.change-file');
                const filePath = fileEl.dataset.path;
                this.skipFile(filePath);
            });
        });

        // 全部接受
        const acceptAllBtn = card.querySelector('.batch-btn.accept');
        acceptAllBtn.addEventListener('click', () => {
            this.acceptAll();
        });

        // 全部拒绝
        const rejectAllBtn = card.querySelector('.batch-btn.reject');
        rejectAllBtn.addEventListener('click', () => {
            this.rejectAll();
        });
    }

    /**
     * 预览 diff
     */
    previewDiff(file) {
        this.vscode.postMessage({
            type: 'previewDiff',
            changeSetId: this.changeSet.id,
            filePath: file.path
        });
    }

    /**
     * 打开文件
     */
    openFile(file) {
        this.vscode.postMessage({
            type: 'openFile',
            filePath: file.path
        });
    }

    /**
     * 应用单个文件
     */
    applyFile(filePath) {
        this.vscode.postMessage({
            type: 'applyFile',
            changeSetId: this.changeSet.id,
            filePath: filePath
        });

        // 更新 UI
        this.updateFileStatus(filePath, 'applied');
    }

    /**
     * 跳过单个文件
     */
    skipFile(filePath) {
        this.vscode.postMessage({
            type: 'skipFile',
            changeSetId: this.changeSet.id,
            filePath: filePath
        });

        // 更新 UI
        this.updateFileStatus(filePath, 'skipped');
    }

    /**
     * 全部接受
     */
    acceptAll() {
        this.vscode.postMessage({
            type: 'acceptAll',
            changeSetId: this.changeSet.id
        });

        // 更新所有文件状态
        this.changeSet.files.forEach(file => {
            if (this.fileStatuses.get(file.path) === 'pending') {
                this.updateFileStatus(file.path, 'applied');
            }
        });

        // 显示成功消息
        this.showSuccessMessage();
    }

    /**
     * 全部拒绝
     */
    rejectAll() {
        this.vscode.postMessage({
            type: 'rejectAll',
            changeSetId: this.changeSet.id
        });

        // 更新所有文件状态
        this.changeSet.files.forEach(file => {
            if (this.fileStatuses.get(file.path) === 'pending') {
                this.updateFileStatus(file.path, 'skipped');
            }
        });
    }

    /**
     * 更新文件状态
     */
    updateFileStatus(filePath, status) {
        this.fileStatuses.set(filePath, status);

        const card = document.querySelector(`[data-changeset-id="${this.changeSet.id}"]`);
        if (!card) return;

        const fileEl = card.querySelector(`[data-path="${filePath}"]`);
        if (!fileEl) return;

        fileEl.dataset.status = status;
        fileEl.classList.remove('applied', 'skipped');
        fileEl.classList.add(status);

        const actions = fileEl.querySelector('.file-actions');

        if (status === 'applied') {
            actions.innerHTML = `<span class="status-icon applied">✅</span>`;
        } else if (status === 'skipped') {
            actions.innerHTML = `<span class="status-icon skipped">⏭️</span>`;
        }

        // 更新计数
        this.updateCount(card);
    }

    /**
     * 更新应用计数
     */
    updateCount(card) {
        const appliedCount = Array.from(this.fileStatuses.values())
            .filter(s => s === 'applied').length;
        
        const countEl = card.querySelector('.applied-count');
        if (countEl) {
            countEl.textContent = appliedCount;
        }
    }

    /**
     * 显示成功消息
     */
    showSuccessMessage() {
        const card = document.querySelector(`[data-changeset-id="${this.changeSet.id}"]`);
        if (!card) return;

        // 移除底部按钮
        const footer = card.querySelector('.change-footer');
        if (footer) {
            footer.remove();
        }

        // 添加成功消息
        const success = document.createElement('div');
        success.className = 'change-success';
        success.innerHTML = `
            <span class="change-success-icon">✅</span>
            <span>${t('diff.allApplied')}</span>
        `;

        card.appendChild(success);
    }

    /**
     * 获取文件图标
     */
    getFileIcon(action) {
        const icons = {
            create: '➕',
            modify: '📝',
            delete: '🗑️'
        };
        return icons[action] || '📄';
    }

    /**
     * 截断路径
     */
    truncatePath(path, maxLength = 50) {
        if (path.length <= maxLength) {
            return path;
        }

        const parts = path.split('/');
        const filename = parts[parts.length - 1];

        if (filename.length > maxLength - 5) {
            return `.../${filename}`;
        }

        const availableLength = maxLength - filename.length - 5; // ".../"
        const dirPath = parts.slice(0, -1).join('/');

        if (dirPath.length <= availableLength) {
            return path;
        }

        const prefix = dirPath.substring(0, availableLength);
        return `${prefix}.../${filename}`;
    }
}

// 导出供 main.js 使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChangeCard;
}
