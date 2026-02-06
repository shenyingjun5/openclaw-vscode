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
        close: 'Close',
        stop: 'Stop',
        send: 'Send'
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
                close: '关闭',
                stop: '停止',
                send: '发送'
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
        // Model select default option
        const modelSelect = document.getElementById('modelSelect');
        if (modelSelect && modelSelect.options[0]) {
            modelSelect.options[0].textContent = i18n.defaultModel;
        }
    }

    // State
    let isSending = false;
    let planMode = false;
    let attachments = []; // { type: 'file'|'image'|'reference', name, path?, data? }

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
    const filePickerOverlay = document.getElementById('filePickerOverlay');
    const filePickerSearch = document.getElementById('filePickerSearch');
    const filePickerList = document.getElementById('filePickerList');
    const closeFilePicker = document.getElementById('closeFilePicker');

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

    // Send message
    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text && attachments.length === 0) return;
        if (isSending) return;

        // Build message content
        let fullMessage = text;
        
        // Add file references
        const fileRefs = attachments.filter(a => a.type === 'file').map(a => `- ${a.path}`);
        const references = attachments.filter(a => a.type === 'reference').map(a => `- ${a.path}`);
        const images = attachments.filter(a => a.type === 'image');
        
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
        addMessage('user', text || '[附件]', attachments.length > 0 ? [...attachments] : null);
        
        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        attachments = [];
        updateAttachments();

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
            const prefixMatches = currentFiles.filter(f => 
                f.name.toLowerCase().startsWith(q)
            );
            const containsMatches = currentFiles.filter(f => 
                !f.name.toLowerCase().startsWith(q) &&
                (f.name.toLowerCase().includes(q) || 
                 (f.relativePath && f.relativePath.toLowerCase().includes(q)))
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
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (isSending) {
                stopGeneration();
            } else {
                sendMessage();
            }
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
        vscode.postMessage({ type: 'refresh' });
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
        vscode.postMessage({ type: 'setModel', model: e.target.value });
        if (window._modelData) {
            window._modelData.forEach(m => m.selected = m.id === e.target.value);
        }
        renderModelOptions(false);
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
                break;
                
            case 'error':
                hideThinking();
                isSending = false;
                updateSendButtonState();
                addMessage('error', message.content);
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
                }
                break;
                
            case 'updateModels':
                window._modelData = message.models.map(m => ({
                    id: m.id,
                    fullName: m.name,
                    shortName: m.id === 'default' ? i18n.defaultModel : (m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id),
                    selected: m.selected
                }));
                renderModelOptions(false);
                break;
                
            case 'updatePlanMode':
                planMode = message.enabled;
                modeSelect.value = planMode ? 'plan' : 'execute';
                break;
        }
    });

    // Initialize
    applyI18n();
    updateSendButtonState();
    vscode.postMessage({ type: 'ready' });
})();
