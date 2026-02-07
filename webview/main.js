// OpenClaw VSCode Extension - Webview Script

(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // i18n - default to English
    let locale = 'en';
    let i18n = {
        thinking: 'Thinking...',
        sendPlaceholder: 'Ask a question...',
        planMode: 'Plan Mode',
        executeMode: 'Execute Mode',
        defaultModel: 'Default Model',
        settings: 'Settings',
        refresh: 'Refresh',
        attach: 'Attach file',
        maxPanels: 'Maximum parallel sessions reached (5)',
        cannotAllocate: 'Cannot allocate new session window',
        sendFailed: 'Send failed',
        saveImageFailed: 'Failed to save image',
        pasteImage: 'Paste image',
        dragDropHint: 'Drop files here',
        searchFiles: 'Search files...',
        searchCommands: 'Search commands or skills...',
        close: 'Close',
        stop: 'Stop',
        send: 'Send',
        commands: 'Commands',
        skills: 'Skills',
        workflow: 'Workflow',
        cmdInit: 'Rescan project',
        cmdSkills: 'List all skills',
        cmdWorkflow: 'Show workflow',
        cmdClear: 'Clear chat',
        cmdHelp: 'Show help',
        triggeredSkill: 'Triggered skill'
    };

    // Load locale
    function setLocale(lang) {
        locale = lang.startsWith('zh') ? 'zh' : 'en';
        if (locale === 'zh') {
            i18n = {
                thinking: '招财正在思考...',
                sendPlaceholder: '输入问题...',
                planMode: '计划模式',
                executeMode: '执行模式',
                defaultModel: '默认模型',
                settings: '设置',
                refresh: '刷新',
                attach: '添加附件',
                maxPanels: '已达最大并行会话数 (5)',
                cannotAllocate: '无法分配新的会话窗口',
                sendFailed: '发送失败',
                saveImageFailed: '保存图片失败',
                pasteImage: '粘贴图片',
                dragDropHint: '拖放文件到这里',
                searchFiles: '搜索文件...',
                searchCommands: '搜索命令或技能...',
                close: '关闭',
                stop: '停止',
                send: '发送',
                commands: '命令',
                skills: '技能',
                workflow: '工作流',
                cmdInit: '重新扫描项目',
                cmdSkills: '列出所有技能',
                cmdWorkflow: '显示工作流',
                cmdClear: '清空对话',
                cmdHelp: '显示帮助',
                triggeredSkill: '已触发技能'
            };
        }
        applyI18n();
    }

    // Apply i18n to DOM
    function applyI18n() {
        // Placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (i18n[key]) el.placeholder = i18n[key];
        });
        // Titles
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (i18n[key]) el.title = i18n[key];
        });
        // Text content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (i18n[key]) el.textContent = i18n[key];
        });
        // Mode select options
        const modeSelect = document.getElementById('modeSelect');
        if (modeSelect) {
            modeSelect.options[0].textContent = i18n.executeMode;
            modeSelect.options[1].textContent = i18n.planMode;
        }
    }

    // State
    let isSending = false;
    let planMode = false;
    let attachments = []; // { type: 'file'|'image'|'reference', name, path?, data? }
    let messageQueue = []; // 消息队列: { id, text, attachments, createdAt }
    let queueIdCounter = 0; // 队列 ID 计数器
    let connectionStatus = 'disconnected'; // 连接状态: connected/disconnected/connecting
    let isRefreshing = false; // 是否正在刷新
    let chatLoading = false; // 是否正在加载历史（对齐 webchat）
    let autoRefreshTimer = null; // 自动刷新定时器
    let currentSessionModel = null; // 当前会话的模型（会话级状态）
    let currentThinkLevel = 'medium'; // 当前思考深度（会话级状态）

    // xhigh 支持的模型列表
    const XHIGH_MODELS = [
        'openai/gpt-5.2',
        'openai-codex/gpt-5.3-codex',
        'openai-codex/gpt-5.2-codex',
        'openai-codex/gpt-5.1-codex'
    ];

    // DOM elements
    const messagesContainer = document.getElementById('messagesContainer');
    const messages = document.getElementById('messages');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const attachBtn = document.getElementById('attachBtn');
    const attachmentsPreview = document.getElementById('attachmentsPreview');
    const inputBox = document.getElementById('inputBox');
    const modeSelect = document.getElementById('modeSelect');
    const modelSelect = document.getElementById('modelSelect');
    const thinkSelect = document.getElementById('thinkSelect');
    const filePickerOverlay = document.getElementById('filePickerOverlay');
    const queueContainer = document.getElementById('queueContainer');
    const queueList = document.getElementById('queueList');
    const queueCount = document.getElementById('queueCount');
    const statusIndicator = document.getElementById('statusIndicator');
    const filePickerSearch = document.getElementById('filePickerSearch');
    const filePickerList = document.getElementById('filePickerList');
    const closeFilePicker = document.getElementById('closeFilePicker');
    const slashPickerOverlay = document.getElementById('slashPickerOverlay');
    const slashPickerSearch = document.getElementById('slashPickerSearch');
    const slashPickerList = document.getElementById('slashPickerList');

    // Escape HTML for XSS prevention
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Simple Markdown renderer
    function renderMarkdown(text) {
        if (!text) return '';
        
        let html = text;
        
        // Escape HTML
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // Code blocks
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
        });
        
        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // Headers
        html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
        html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        // Bold and italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // Blockquotes
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
        
        // Unordered lists
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        
        // Horizontal rule
        html = html.replace(/^---+$/gm, '<hr>');
        
        // Paragraphs
        html = html.replace(/^(?!<[hupob]|<li|<hr|<code|<pre)(.+)$/gm, '<p>$1</p>');
        
        return html;
    }

    // Render tool call
    function renderToolCall(name, args) {
        let summary = `🔧 ${name}`;
        if (args) {
            if (args.command) {
                const cmd = args.command.length > 50 ? args.command.substring(0, 50) + '...' : args.command;
                summary += `: ${cmd}`;
            } else if (args.path) {
                summary += `: ${args.path}`;
            }
        }
        
        return `<div class="tool-call" onclick="this.classList.toggle('expanded')">
            <div class="tool-call-header">
                <span>▸</span>
                <span>${summary}</span>
            </div>
            <div class="tool-call-content">${JSON.stringify(args, null, 2)}</div>
        </div>`;
    }

    // Add message with optional attachments
    function addMessage(role, content, messageAttachments = null, isToolCall = false, toolArgs = null) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        
        if (isToolCall) {
            div.innerHTML = renderToolCall(content, toolArgs);
        } else if (role === 'assistant') {
            div.innerHTML = renderMarkdown(content);
        } else if (role === 'user') {
            // User message: show attachments + text with line breaks
            let html = '';
            
            // Render attachments
            if (messageAttachments && messageAttachments.length > 0) {
                html += '<div class="message-attachments">';
                for (const att of messageAttachments) {
                    if (att.type === 'image' && att.data) {
                        html += `<div class="message-attachment"><img src="${att.data}" alt="${escapeHtml(att.name)}"></div>`;
                    } else {
                        html += `<div class="message-attachment file">${escapeHtml(att.name)}</div>`;
                    }
                }
                html += '</div>';
            }
            
            // Render text with line breaks preserved
            if (content) {
                const escaped = escapeHtml(content);
                html += `<div class="message-text">${escaped.replace(/\n/g, '<br>')}</div>`;
            }
            
            div.innerHTML = html;
        } else {
            div.textContent = content;
        }
        
        messages.appendChild(div);
        scrollToBottom();
    }

    // Show thinking indicator
    function showThinking() {
        const existing = document.getElementById('thinkingIndicator');
        if (existing) return;
        
        const div = document.createElement('div');
        div.className = 'thinking';
        div.id = 'thinkingIndicator';
        div.innerHTML = `
            <div class="thinking-dots">
                <span></span><span></span><span></span>
            </div>
            <span>${i18n.thinking}</span>
        `;
        messages.appendChild(div);
        scrollToBottom();
    }

    // Hide thinking indicator
    function hideThinking() {
        const indicator = document.getElementById('thinkingIndicator');
        if (indicator) indicator.remove();
    }

    // Scroll to bottom
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Update send button state
    function updateSendButtonState() {
        const hasInput = messageInput.value.trim().length > 0 || attachments.length > 0;
        
        if (isSending) {
            sendBtn.classList.remove('active');
            sendBtn.classList.add('sending');
            sendBtn.title = i18n.stop;
        } else {
            sendBtn.classList.remove('sending');
            sendBtn.classList.toggle('active', hasInput);
            sendBtn.title = i18n.send;
        }
    }

    // Update attachments preview
    function updateAttachments() {
        if (attachments.length === 0) {
            attachmentsPreview.innerHTML = '';
            updateSendButtonState();
            return;
        }
        
        attachmentsPreview.innerHTML = attachments.map((att, idx) => {
            let icon = '📎';
            let preview = '';
            
            if (att.type === 'image') {
                icon = '📷';
                if (att.data) {
                    preview = `<img src="${att.data}" alt="${escapeHtml(att.name)}">`;
                }
            } else if (att.type === 'reference') {
                icon = '📄';
            }
            
            return `
                <div class="attachment-item" data-index="${idx}">
                    ${preview || `<span>${icon}</span>`}
                    <span class="name">${escapeHtml(att.name)}</span>
                    <span class="remove" onclick="window.removeAttachment(${idx})">✕</span>
                </div>
            `;
        }).join('');
        
        updateSendButtonState();
    }

    // Remove attachment
    window.removeAttachment = function(index) {
        attachments.splice(index, 1);
        updateAttachments();
    };

    // Auto resize input
    function autoResize() {
        messageInput.style.height = 'auto';
        const maxHeight = 120;
        messageInput.style.height = Math.min(messageInput.scrollHeight, maxHeight) + 'px';
    }

    // ========== 队列管理 ==========

    function generateQueueId() {
        return `queue-${++queueIdCounter}`;
    }

    function enqueueMessage(text, atts) {
        const item = {
            id: generateQueueId(),
            text: text,
            attachments: atts ? [...atts] : [],
            createdAt: Date.now()
        };
        
        messageQueue.push(item);
        renderQueue();
    }

    function removeQueueItem(id) {
        const index = messageQueue.findIndex(item => item.id === id);
        if (index !== -1) {
            // 添加删除动画
            const itemEl = document.querySelector(`[data-queue-id="${id}"]`);
            if (itemEl) {
                itemEl.classList.add('removing');
                setTimeout(() => {
                    messageQueue.splice(index, 1);
                    renderQueue();
                }, 200);
            } else {
                messageQueue.splice(index, 1);
                renderQueue();
            }
        }
    }

    function renderQueue() {
        const count = messageQueue.length;
        queueCount.textContent = count;
        
        if (count === 0) {
            queueContainer.style.display = 'none';
            queueList.innerHTML = '';
            return;
        }
        
        queueContainer.style.display = 'block';
        
        queueList.innerHTML = messageQueue.map(item => {
            const hasAttachments = item.attachments && item.attachments.length > 0;
            const displayText = item.text || (hasAttachments ? `📎 ${item.attachments.length} 个附件` : '');
            
            return `
                <div class="chat-queue__item" data-queue-id="${item.id}">
                    <div class="chat-queue__text">${escapeHtml(displayText)}</div>
                    <button class="chat-queue__remove" 
                            onclick="window.removeQueueItem('${item.id}')" 
                            title="${i18n.removeFromQueue || 'Remove from queue'}">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');
    }

    function processNextQueue() {
        if (messageQueue.length === 0) return;
        if (isSending) return;
        
        const next = messageQueue.shift();
        renderQueue();
        
        // 发送队列中的消息
        sendMessageNow(next.text, next.attachments);
    }

    // 暴露到 window 供按钮调用
    window.removeQueueItem = removeQueueItem;

    // ========== 连接状态管理 ==========

    function updateConnectionStatus(status) {
        connectionStatus = status;
        statusIndicator.classList.remove('connected', 'disconnected', 'connecting');
        
        if (status === 'connected') {
            statusIndicator.classList.add('connected');
            statusIndicator.title = 'Gateway 已连接 (WebSocket)';
        } else if (status === 'connecting') {
            statusIndicator.classList.add('connecting');
            statusIndicator.title = '正在连接到 Gateway...';
        } else {
            statusIndicator.classList.add('disconnected');
            statusIndicator.title = 'Gateway 未连接 - 点击刷新重连';
        }
        // 连接状态变化时更新刷新按钮
        updateRefreshButtonDisabled();
    }

    function setRefreshButtonState(refreshing) {
        isRefreshing = refreshing;
        if (refreshing) {
            refreshBtn.classList.add('refreshing');
        } else {
            refreshBtn.classList.remove('refreshing');
        }
    }

    // ========== 自动刷新 ==========

    /**
     * 是否可以执行刷新（手动 & 自动共用条件，对齐 webchat）
     */
    function canRefresh() {
        return !chatLoading && connectionStatus === 'connected';
    }

    /**
     * 更新刷新按钮的 disabled 状态
     */
    function updateRefreshButtonDisabled() {
        if (refreshBtn) {
            refreshBtn.disabled = !canRefresh();
        }
    }

    async function refreshSession() {
        if (isRefreshing) return;
        if (!canRefresh()) return;
        
        chatLoading = true;
        updateRefreshButtonDisabled();
        setRefreshButtonState(true);
        
        try {
            // 请求后端刷新
            vscode.postMessage({ type: 'refresh' });
        } catch (err) {
            console.error('Refresh failed:', err);
            chatLoading = false;
            updateRefreshButtonDisabled();
        }
    }

    function startAutoRefresh(interval) {
        stopAutoRefresh();
        
        if (interval <= 0) return;
        
        autoRefreshTimer = setInterval(() => {
            // 自动刷新使用和手动刷新相同的条件
            if (canRefresh() && !isRefreshing) {
                refreshSession();
            }
        }, interval);
    }

    function stopAutoRefresh() {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = null;
        }
    }

    // ========== 错误处理 ==========

    function parseErrorToMessage(error, context) {
        const errorStr = String(error.message || error);
        
        // 1. 用户停止
        if (context === 'user_stop' || 
            (errorStr.includes('exited with code 1') && context === 'stop')) {
            return {
                type: 'system',
                icon: '⏹️',
                color: 'gray',
                text: '已停止生成',
                autoHide: true
            };
        }
        
        // 2. 连接错误
        if (errorStr.includes('ECONNREFUSED') || errorStr.includes('connect ECONNREFUSED')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `无法连接到 Gateway

可能原因：
• Gateway 未启动
• 端口 18789 被占用

请执行：
openclaw gateway start`
            };
        }
        
        // 3. 超时
        if (errorStr.includes('ETIMEDOUT') || errorStr.includes('timeout')) {
            return {
                type: 'warning',
                icon: '⚠️',
                color: 'yellow',
                text: `请求超时

网络响应过慢，请：
• 检查网络连接
• 稍后重试`
            };
        }
        
        // 4. WebSocket 连接错误（排除发送层面的错误）
        if (errorStr.includes('WebSocket') && errorStr.includes('连接')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `WebSocket 连接失败

可能原因：
• Gateway 版本过低
• 防火墙拦截

请尝试：
• 升级 OpenClaw: npm update -g openclaw
• 检查防火墙设置`
            };
        }
        
        // 5. Token 不足
        if (errorStr.includes('token limit') || 
            errorStr.includes('quota exceeded') ||
            errorStr.includes('insufficient tokens')) {
            return {
                type: 'tip',
                icon: '💡',
                color: 'yellow',
                text: `当前模型 Token 已用完

请切换模型：
1. 点击右下角模型选择器
2. 选择其他可用模型`
            };
        }
        
        // 6. 模型不可用
        if (errorStr.includes('model not available') || 
            errorStr.includes('model unavailable')) {
            const modelMatch = errorStr.match(/model[:\s]+([a-z0-9-]+)/i);
            const modelName = modelMatch ? modelMatch[1] : '当前模型';
            
            return {
                type: 'tip',
                icon: '💡',
                color: 'yellow',
                text: `${modelName} 暂时不可用

可能原因：
• 服务器负载过高
• 模型维护中

建议：切换到其他模型（如 gpt-4o-mini）`
            };
        }
        
        // 7. 频率限制
        if (errorStr.includes('rate limit') || 
            errorStr.includes('too many requests')) {
            return {
                type: 'warning',
                icon: '⚠️',
                color: 'yellow',
                text: `请求过于频繁

已达到速率限制，请：
• 等待 30 秒后重试
• 或切换到其他模型`
            };
        }
        
        // 8. 命令未找到
        if (errorStr.includes('command not found') || 
            errorStr.includes('not recognized')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `OpenClaw CLI 未找到

请安装：
npm install -g openclaw

或在 VSCode 设置中配置 openclaw 路径：
设置 → OpenClaw → Openclaw Path`
            };
        }
        
        // 9. 权限错误
        if (errorStr.includes('EACCES') || 
            errorStr.includes('permission denied')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `权限不足

无法访问文件或执行命令，请：
• 检查文件权限
• 在 macOS/Linux 使用: sudo npm install -g openclaw
• 在 Windows 使用管理员权限`
            };
        }
        
        // 10. 网络错误
        if (errorStr.includes('ENOTFOUND')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `网络错误

无法解析服务器地址，请：
• 检查网络连接
• 检查 Gateway URL 配置（设置 → OpenClaw → Gateway URL）`
            };
        }
        
        // 11. 未知错误
        const shortError = errorStr.length > 100 ? 
            errorStr.substring(0, 100) + '...' : errorStr;
        
        return {
            type: 'error',
            icon: '❌',
            color: 'red',
            text: `发生错误

${shortError}

请尝试：
• 刷新页面重试
• 查看 OpenClaw 日志: openclaw logs`
        };
    }

    function showSystemMessage(icon, text, color, autoHide = false) {
        const msg = document.createElement('div');
        msg.className = `message system ${color}`;
        if (autoHide) {
            msg.classList.add('auto-hide');
        }
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';
        iconSpan.textContent = icon;
        
        const content = document.createElement('div');
        content.className = 'content';
        content.textContent = text;
        
        msg.appendChild(iconSpan);
        msg.appendChild(content);
        
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
        
        // 自动移除
        if (autoHide) {
            setTimeout(() => msg.remove(), 2500);
        }
    }

    function handleError(error, context) {
        const errorMsg = parseErrorToMessage(error, context);
        
        showSystemMessage(
            errorMsg.icon,
            errorMsg.text,
            errorMsg.color,
            errorMsg.autoHide || false
        );
    }

    // Send message
    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text && attachments.length === 0) return;

        if (isSending) {
            // 正在发送中 → 加入队列
            enqueueMessage(text, attachments);
            
            // 清空输入框
            messageInput.value = '';
            messageInput.style.height = 'auto';
            attachments = [];
            updateAttachments();
            return;
        }

        // 空闲状态 → 立即发送
        sendMessageNow(text, attachments);
    }

    // 实际发送消息（立即）
    function sendMessageNow(text, atts) {
        // Build message content
        let fullMessage = text;
        
        // Add file references
        const fileRefs = atts.filter(a => a.type === 'file').map(a => `- ${a.path}`);
        const references = atts.filter(a => a.type === 'reference').map(a => `- ${a.path}`);
        const images = atts.filter(a => a.type === 'image');
        
        if (fileRefs.length > 0 || references.length > 0) {
            const allRefs = [...fileRefs, ...references];
            fullMessage = `[引用文件 - 请用 read 工具读取后处理]\n${allRefs.join('\n')}\n\n${fullMessage}`;
        }
        
        for (const img of images) {
            if (img.path) {
                fullMessage += `\n\n[附件图片: ${img.path}]`;
            }
        }

        // Show user message with attachments
        addMessage('user', text || '[附件]', atts.length > 0 ? [...atts] : null);
        
        // Clear input if called from sendMessage (not from queue)
        if (atts === attachments) {
            messageInput.value = '';
            messageInput.style.height = 'auto';
            attachments = [];
            updateAttachments();
        }

        // Send
        isSending = true;
        updateSendButtonState();
        showThinking();
        
        vscode.postMessage({
            type: 'sendMessage',
            content: fullMessage,
            planMode: planMode
        });
    }

    // Stop generation
    function stopGeneration() {
        vscode.postMessage({ type: 'stop' });
    }

    // File picker
    let currentFiles = [];

    function showFilePicker(files) {
        currentFiles = files;
        renderFileList('');
        filePickerOverlay.classList.add('show');
        filePickerSearch.value = '';
        filePickerSearch.focus();
    }

    function renderFileList(query) {
        const q = query.toLowerCase();
        let filtered = currentFiles;
        
        if (q) {
            // 前缀匹配（优先级高）
            const prefixMatches = currentFiles.filter(f => 
                f.name.toLowerCase().startsWith(q)
            );
            
            // 包含匹配（优先级低）- 只匹配文件名，不匹配路径
            const containsMatches = currentFiles.filter(f => 
                !f.name.toLowerCase().startsWith(q) &&
                f.name.toLowerCase().includes(q)
            );
            
            filtered = [...prefixMatches, ...containsMatches];
        }
        
        // Sort: directories first, then files
        filtered.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return 0;
        });
        
        filtered = filtered.slice(0, 50);
        
        filePickerList.innerHTML = filtered.map(f => {
            const icon = f.isDirectory ? '📁' : '📄';
            const itemClass = f.isDirectory ? 'file-picker-item directory' : 'file-picker-item';
            return `
            <div class="${itemClass}" data-path="${escapeHtml(f.path)}" data-name="${escapeHtml(f.name)}" data-is-dir="${f.isDirectory ? 'true' : 'false'}">
                <span>${icon}</span>
                <span>${escapeHtml(f.name)}</span>
                <span class="file-picker-item-path">${escapeHtml(f.relativePath || '')}</span>
            </div>
        `}).join('');
        
        if (filtered.length === 0) {
            filePickerList.innerHTML = '<div class="file-picker-empty">No matching files</div>';
        }
    }

    function hideFilePicker() {
        filePickerOverlay.classList.remove('show');
    }

    function selectFileReference(path, name, isDirectory) {
        const type = isDirectory ? 'directory' : 'reference';
        const displayName = isDirectory ? `📁 ${name}` : `@${name}`;
        attachments.push({ type, name: displayName, path });
        updateAttachments();
        hideFilePicker();
        
        const text = messageInput.value;
        if (text.endsWith('@')) {
            messageInput.value = text.slice(0, -1);
        }
        messageInput.focus();
    }

    // Slash command picker
    let slashPickerSelectedIndex = 0;
    let slashPickerItems = [];

    function getSlashPickerItems() {
        const items = [];
        
        // Commands
        items.push({ type: 'group', label: `⚡ ${i18n.commands}` });
        items.push({ type: 'command', name: 'init', label: '/init', desc: i18n.cmdInit });
        items.push({ type: 'command', name: 'skills', label: '/skills', desc: i18n.cmdSkills });
        items.push({ type: 'command', name: 'workflow', label: '/workflow', desc: i18n.cmdWorkflow });
        items.push({ type: 'command', name: 'clear', label: '/clear', desc: i18n.cmdClear });
        
        // Skills from project status
        if (projectStatus && projectStatus.skills && projectStatus.skills.length > 0) {
            items.push({ type: 'group', label: `🎯 ${i18n.skills}` });
            for (const skill of projectStatus.skills) {
                items.push({
                    type: 'skill',
                    name: skill.name,
                    triggers: skill.triggers || []
                });
            }
        }
        
        // Workflows (multiple)
        if (projectStatus && projectStatus.workflows && projectStatus.workflows.length > 0) {
            items.push({ type: 'group', label: `📋 ${i18n.workflow}` });
            for (const workflow of projectStatus.workflows) {
                items.push({
                    type: 'workflow',
                    name: workflow.name,
                    relativePath: workflow.relativePath
                });
            }
        }
        
        return items;
    }

    function showSlashPicker() {
        slashPickerItems = getSlashPickerItems();
        slashPickerSelectedIndex = 1; // First non-group item
        renderSlashPickerList('');
        slashPickerOverlay.classList.add('show');
        slashPickerSearch.value = '';
        slashPickerSearch.focus();
    }

    function hideSlashPicker() {
        slashPickerOverlay.classList.remove('show');
        messageInput.focus();
    }

    function renderSlashPickerList(query) {
        const q = query.toLowerCase();
        let html = '';
        let visibleIndex = 0;
        
        for (const item of slashPickerItems) {
            if (item.type === 'group') {
                // Check if any items in this group match
                const groupItems = getGroupItems(item);
                const hasMatch = !q || groupItems.some(gi => matchesQuery(gi, q));
                if (hasMatch) {
                    html += `<div class="slash-picker-group">${item.label}</div>`;
                }
                continue;
            }
            
            if (q && !matchesQuery(item, q)) {
                continue;
            }
            
            const selected = visibleIndex === slashPickerSelectedIndex ? ' selected' : '';
            
            if (item.type === 'command') {
                html += `
                    <div class="slash-picker-item command${selected}" data-type="command" data-name="${escapeHtml(item.name)}" data-index="${visibleIndex}">
                        <span class="slash-item-name">${escapeHtml(item.label)}</span>
                        <span class="slash-item-desc">${escapeHtml(item.desc)}</span>
                    </div>`;
            } else if (item.type === 'skill') {
                const triggers = item.triggers.slice(0, 3).join(', ');
                html += `
                    <div class="slash-picker-item skill${selected}" data-type="skill" data-name="${escapeHtml(item.name)}" data-index="${visibleIndex}">
                        <span class="slash-item-name">${escapeHtml(item.name)}</span>
                        <span class="slash-item-triggers">${escapeHtml(triggers)}</span>
                    </div>`;
            } else if (item.type === 'workflow') {
                html += `
                    <div class="slash-picker-item workflow${selected}" data-type="workflow" data-name="${escapeHtml(item.relativePath)}" data-index="${visibleIndex}">
                        <span class="slash-item-name">${escapeHtml(item.name)} <span style="opacity:0.6; font-size:0.9em">(${escapeHtml(item.relativePath)})</span></span>
                    </div>`;
            }
            
            visibleIndex++;
        }
        
        if (!html) {
            html = '<div class="slash-picker-empty">No matching commands</div>';
        }
        
        slashPickerList.innerHTML = html;
    }

    function getGroupItems(groupItem) {
        const idx = slashPickerItems.indexOf(groupItem);
        const items = [];
        for (let i = idx + 1; i < slashPickerItems.length; i++) {
            if (slashPickerItems[i].type === 'group') break;
            items.push(slashPickerItems[i]);
        }
        return items;
    }

    function matchesQuery(item, q) {
        if (item.name && item.name.toLowerCase().includes(q)) return true;
        if (item.label && item.label.toLowerCase().includes(q)) return true;
        if (item.desc && item.desc.toLowerCase().includes(q)) return true;
        if (item.triggers) {
            for (const t of item.triggers) {
                if (t.toLowerCase().includes(q)) return true;
            }
        }
        return false;
    }

    function selectSlashItem(type, name) {
        hideSlashPicker();
        
        // Clear the / from input
        messageInput.value = '';
        
        if (type === 'command') {
            // Execute command immediately
            vscode.postMessage({ type: 'executeCommand', command: name });
        } else if (type === 'skill') {
            // Insert /skillname into input
            messageInput.value = `/${name} `;
            messageInput.focus();
            autoResize();
            updateSendButtonState();
        } else if (type === 'workflow') {
            // Insert /.workflowname into input
            messageInput.value = `/.${name} `;
            messageInput.focus();
            autoResize();
            updateSendButtonState();
        }
    }

    // Slash picker event listeners
    slashPickerOverlay.addEventListener('click', (e) => {
        if (e.target === slashPickerOverlay) {
            hideSlashPicker();
            messageInput.value = '';
        }
    });

    slashPickerSearch.addEventListener('input', (e) => {
        slashPickerSelectedIndex = 0;
        renderSlashPickerList(e.target.value);
    });

    slashPickerSearch.addEventListener('keydown', (e) => {
        const items = slashPickerList.querySelectorAll('.slash-picker-item');
        const count = items.length;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            slashPickerSelectedIndex = (slashPickerSelectedIndex + 1) % count;
            renderSlashPickerList(slashPickerSearch.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            slashPickerSelectedIndex = (slashPickerSelectedIndex - 1 + count) % count;
            renderSlashPickerList(slashPickerSearch.value);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = slashPickerList.querySelector('.slash-picker-item.selected');
            if (selected) {
                selectSlashItem(selected.dataset.type, selected.dataset.name);
            }
        } else if (e.key === 'Escape') {
            hideSlashPicker();
            messageInput.value = '';
        }
    });

    slashPickerList.addEventListener('click', (e) => {
        const item = e.target.closest('.slash-picker-item');
        if (item) {
            selectSlashItem(item.dataset.type, item.dataset.name);
        }
    });

    // Handle image paste
    function handleImagePaste(item) {
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            const name = `paste_${Date.now()}.png`;
            attachments.push({
                type: 'image',
                name: name,
                data: base64
            });
            updateAttachments();
            
            vscode.postMessage({
                type: 'saveImage',
                data: base64,
                name: name
            });
        };
        reader.readAsDataURL(file);
    }

    // Event listeners

    messageInput.addEventListener('input', (e) => {
        autoResize();
        updateSendButtonState();
        if (e.data === '@') {
            vscode.postMessage({ type: 'getFiles' });
        }
        // Show slash picker when typing /
        if (e.data === '/' && messageInput.value === '/') {
            showSlashPicker();
        }
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // 输入法正在组字时（如中文拼音），不响应回车
            if (e.isComposing || e.keyCode === 229) {
                return;
            }
            e.preventDefault();
            
            const text = messageInput.value.trim();
            
            // 输入框为空 → 不做任何动作
            if (!text && attachments.length === 0) {
                return;
            }
            
            // 有内容 → 发送（可能排队）
            sendMessage();
        }
    });

    messageInput.addEventListener('paste', (e) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                handleImagePaste(item);
                break;
            }
        }
    });

    // Drag and drop
    inputBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        inputBox.classList.add('drag-over');
    });

    inputBox.addEventListener('dragleave', () => {
        inputBox.classList.remove('drag-over');
    });

    inputBox.addEventListener('drop', (e) => {
        e.preventDefault();
        inputBox.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            vscode.postMessage({
                type: 'handleDrop',
                files: files.map(f => ({ name: f.name, path: f.path }))
            });
        }
    });

    // Send/stop button
    sendBtn.addEventListener('click', () => {
        if (isSending) {
            stopGeneration();
        } else {
            sendMessage();
        }
    });

    // Attach button
    attachBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'selectFile' });
    });

    // Refresh button
    refreshBtn.addEventListener('click', () => {
        refreshSession();
    });

    // Settings button
    settingsBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
    });

    // Mode select
    modeSelect.addEventListener('change', (e) => {
        planMode = e.target.value === 'plan';
        vscode.postMessage({ type: 'setPlanMode', enabled: planMode });
    });

    // Model select
    modelSelect.addEventListener('change', (e) => {
        const newModel = e.target.value;
        
        // 记住会话级的模型选择
        currentSessionModel = newModel;
        
        // 立即更新 UI
        if (window._modelData) {
            window._modelData.forEach(m => m.selected = m.id === newModel);
            renderModelOptions(false);
        }
        
        // 发送到 Backend
        vscode.postMessage({ type: 'setModel', model: newModel });

        // 模型切换后，thinking 重置为 medium
        currentThinkLevel = 'medium';
        renderThinkOptions(false);
        vscode.postMessage({ type: 'setThinking', level: 'medium' });
    });

    modelSelect.addEventListener('focus', () => renderModelOptions(true));
    modelSelect.addEventListener('blur', () => renderModelOptions(false));
    modelSelect.addEventListener('mousedown', () => renderModelOptions(true));

    function renderModelOptions(showFull) {
        if (!window._modelData) return;
        const currentValue = modelSelect.value;
        modelSelect.innerHTML = window._modelData.map(m => {
            const displayName = showFull ? m.fullName : m.shortName;
            return `<option value="${m.id}" title="${escapeHtml(m.fullName)}" ${m.id === currentValue ? 'selected' : ''}>${escapeHtml(displayName)}</option>`;
        }).join('');
        modelSelect.title = window._modelData.find(m => m.id === currentValue)?.fullName || '';
    }

    // Think select
    thinkSelect.addEventListener('change', (e) => {
        const newLevel = e.target.value;
        currentThinkLevel = newLevel;
        renderThinkOptions(false);
        vscode.postMessage({ type: 'setThinking', level: newLevel });
    });

    thinkSelect.addEventListener('focus', () => renderThinkOptions(true));
    thinkSelect.addEventListener('blur', () => renderThinkOptions(false));
    thinkSelect.addEventListener('mousedown', () => renderThinkOptions(true));

    function getThinkLevels() {
        const levels = ['off', 'minimal', 'low', 'medium', 'high'];
        // 当前模型支持 xhigh 时才显示
        const model = (currentSessionModel || '').toLowerCase();
        if (XHIGH_MODELS.some(m => m.toLowerCase() === model)) {
            levels.push('xhigh');
        }
        return levels;
    }

    function renderThinkOptions(showFull) {
        const levels = getThinkLevels();
        thinkSelect.innerHTML = levels.map(level => {
            const shortLabel = t(`think.${level}`) || level;
            const fullLabel = t(`think.${level}.full`) || level;
            const displayLabel = showFull ? fullLabel : shortLabel;
            return `<option value="${level}" ${level === currentThinkLevel ? 'selected' : ''}>${escapeHtml(displayLabel)}</option>`;
        }).join('');
    }

    // 初始化 think 选项
    renderThinkOptions(false);

    // File picker
    closeFilePicker.addEventListener('click', hideFilePicker);
    
    filePickerOverlay.addEventListener('click', (e) => {
        if (e.target === filePickerOverlay) {
            hideFilePicker();
        }
    });

    filePickerSearch.addEventListener('input', (e) => {
        renderFileList(e.target.value);
    });

    filePickerList.addEventListener('click', (e) => {
        const item = e.target.closest('.file-picker-item');
        if (item) {
            const isDir = item.dataset.isDir === 'true';
            selectFileReference(item.dataset.path, item.dataset.name, isDir);
        }
    });

    // Receive messages from extension
    window.addEventListener('message', (event) => {
        const message = event.data;
        
        switch (message.type) {
            case 'setLocale':
                setLocale(message.locale || 'en');
                break;
                
            case 'addMessage':
                hideThinking();
                addMessage(message.role, message.content);
                break;
                
            case 'addToolCall':
                addMessage('assistant', message.name, null, true, message.args);
                break;
                
            case 'showThinking':
                showThinking();
                break;
                
            case 'hideThinking':
                hideThinking();
                break;
                
            case 'sendingComplete':
                isSending = false;
                updateSendButtonState();
                hideThinking();
                
                // 自动处理下一个队列项
                setTimeout(() => {
                    processNextQueue();
                }, 500);
                break;
                
            case 'error':
                hideThinking();
                isSending = false;
                updateSendButtonState();
                
                // 使用友好的错误提示
                handleError(message.content, message.context || 'send');
                
                // 出错时也尝试处理下一个队列项
                setTimeout(() => {
                    processNextQueue();
                }, 1000);
                break;
                
            case 'systemMessage':
                // 系统消息（停止、提示等）
                handleError(message.error.message, message.error.context);
                break;
                
            case 'files':
                showFilePicker(message.files);
                break;
                
            case 'fileSaved':
                const att = attachments.find(a => a.name === message.name);
                if (att) att.path = message.path;
                break;
                
            case 'fileDropped':
                attachments.push({
                    type: 'file',
                    name: message.name,
                    path: message.path
                });
                updateAttachments();
                break;
                
            case 'fileSelected':
                attachments.push({
                    type: 'file',
                    name: message.name,
                    path: message.path
                });
                updateAttachments();
                break;
                
            case 'clearMessages':
                messages.innerHTML = '';
                break;
                
            case 'loadHistory':
                if (message.messages && message.messages.length > 0) {
                    messages.innerHTML = '';
                    message.messages.forEach(msg => {
                        if (msg.toolCall) {
                            addMessage('assistant', msg.toolCall.name, null, true, msg.toolCall.args);
                        } else {
                            addMessage(msg.role, msg.content);
                        }
                    });
                    
                    // 刷新后滚动到底部
                    setTimeout(() => {
                        messages.scrollTop = messages.scrollHeight;
                    }, 100);
                }
                break;
                
            case 'updateModels':
                window._modelData = message.models.map(m => ({
                    id: m.id,
                    fullName: m.name,
                    shortName: m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id,
                    // 如果会话有自己的模型状态，使用会话状态；否则使用全局默认
                    selected: currentSessionModel ? (m.id === currentSessionModel) : m.selected
                }));
                
                // 如果会话还没有设置模型，使用全局默认
                if (!currentSessionModel) {
                    const defaultModel = window._modelData.find(m => m.selected);
                    if (defaultModel) {
                        currentSessionModel = defaultModel.id;
                    }
                }
                
                renderModelOptions(false);
                // 模型列表更新后，重新渲染 think 选项（xhigh 可能变化）
                renderThinkOptions(false);
                break;

            case 'updateThinking':
                currentThinkLevel = message.level || 'medium';
                renderThinkOptions(false);
                break;
                
            case 'updatePlanMode':
                planMode = message.enabled;
                modeSelect.value = planMode ? 'plan' : 'execute';
                break;
                
            case 'projectStatus':
                updateProjectStatus(message);
                break;
                
            case 'skillTriggered':
                showSkillHint(message.skill);
                break;
                
            case 'commandExecuted':
                // Command was executed, nothing to show
                break;

            case 'addChange':
                // 渲染变更卡片
                hideThinking();
                renderChangeCard(message.changeSet);
                break;
                
            case 'connectionStatus':
                // 连接状态更新
                updateConnectionStatus(message.status);
                break;
                
            case 'autoRefreshInterval':
                // 自动刷新间隔配置
                startAutoRefresh(message.interval);
                break;
                
            case 'refreshComplete':
                // 刷新完成
                chatLoading = false;
                setRefreshButtonState(false);
                updateRefreshButtonDisabled();
                break;
        }
    });
    let projectStatus = {
        initialized: false,
        skills: [],
        workflows: []
    };

    function updateProjectStatus(status) {
        if (status) {
            projectStatus = {
                initialized: status.initialized || false,
                skills: status.skills || [],
                workflows: status.workflows || []
            };
        }
    }
    
    function showSkillHint(skill) {
        // Remove existing hint
        const existing = document.querySelector('.skill-hint');
        if (existing) existing.remove();
        
        const hint = document.createElement('div');
        hint.className = 'skill-hint';
        hint.innerHTML = `
            <span class="skill-hint-icon">🎯</span>
            <span class="skill-hint-text">${locale === 'zh' ? '已触发技能' : 'Triggered skill'}: <strong>${escapeHtml(skill.name)}</strong></span>
            <span class="skill-hint-trigger">"${escapeHtml(skill.trigger)}"</span>
        `;
        
        // Insert before messages
        messagesContainer.insertBefore(hint, messagesContainer.firstChild);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            hint.classList.add('fade-out');
            setTimeout(() => hint.remove(), 300);
        }, 5000);
    }

    // Initialize
    applyI18n();
    updateSendButtonState();
    vscode.postMessage({ type: 'ready' });
})();

    // ========== 变更卡片渲染 ==========

    function renderChangeCard(changeSet) {
        if (!changeSet || !changeSet.files || changeSet.files.length === 0) {
            return;
        }

        // 创建变更卡片实例
        const card = new ChangeCard(changeSet, vscode);
        const cardElement = card.render();

        // 添加到消息容器
        messages.appendChild(cardElement);

        // 滚动到底部
        setTimeout(() => {
            messages.scrollTop = messages.scrollHeight;
        }, 100);
    }

    // ========== 初始化 ==========
    
    // 页面加载完成后初始化
    setTimeout(() => {
        // 请求自动刷新配置（连接状态会在 ready 时自动建立）
        vscode.postMessage({ type: 'getAutoRefreshInterval' });
    }, 100);
