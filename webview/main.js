// OpenClaw VSCode 插件 - Webview 交互逻辑

(function() {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // 状态
    let isSending = false;
    let planMode = false;
    let attachments = []; // { type: 'file'|'image'|'reference', name, path?, data? }

    // DOM 元素
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

    // 简易 Markdown 渲染
    function renderMarkdown(text) {
        if (!text) return '';
        
        let html = text;
        
        // 转义 HTML
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        // 代码块
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
        });
        
        // 行内代码
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        
        // 标题
        html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
        html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
        html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        
        // 粗体和斜体
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // 链接
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        
        // 引用块
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
        
        // 无序列表
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        
        // 分隔线
        html = html.replace(/^---+$/gm, '<hr>');
        
        // 段落
        html = html.replace(/^(?!<[hupob]|<li|<hr|<code|<pre)(.+)$/gm, '<p>$1</p>');
        
        return html;
    }

    // 渲染工具调用
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

    // 添加消息
    function addMessage(role, content, isToolCall = false, toolArgs = null) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        
        if (isToolCall) {
            div.innerHTML = renderToolCall(content, toolArgs);
        } else if (role === 'assistant') {
            div.innerHTML = renderMarkdown(content);
        } else {
            div.textContent = content;
        }
        
        messages.appendChild(div);
        scrollToBottom();
    }

    // 显示思考中
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
            <span>招财正在思考...</span>
        `;
        messages.appendChild(div);
        scrollToBottom();
    }

    // 隐藏思考中
    function hideThinking() {
        const indicator = document.getElementById('thinkingIndicator');
        if (indicator) indicator.remove();
    }

    // 滚动到底部
    function scrollToBottom() {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 更新发送按钮状态
    function updateSendButton(sending) {
        isSending = sending;
        if (sending) {
            sendBtn.classList.add('sending');
            sendBtn.title = '停止';
        } else {
            sendBtn.classList.remove('sending');
            sendBtn.title = '发送';
        }
    }

    // 更新附件预览
    function updateAttachments() {
        if (attachments.length === 0) {
            attachmentsPreview.innerHTML = '';
            return;
        }
        
        attachmentsPreview.innerHTML = attachments.map((att, idx) => {
            let icon = '📎';
            let preview = '';
            
            if (att.type === 'image') {
                icon = '📷';
                if (att.data) {
                    preview = `<img src="${att.data}" alt="${att.name}">`;
                }
            } else if (att.type === 'reference') {
                icon = '📄';
            }
            
            return `
                <div class="attachment-item" data-index="${idx}">
                    ${preview || `<span>${icon}</span>`}
                    <span class="name">${att.name}</span>
                    <span class="remove" onclick="window.removeAttachment(${idx})">✕</span>
                </div>
            `;
        }).join('');
    }

    // 移除附件
    window.removeAttachment = function(index) {
        attachments.splice(index, 1);
        updateAttachments();
    };

    // 自动调整输入框高度
    function autoResize() {
        messageInput.style.height = 'auto';
        const maxHeight = 120; // 约5行
        messageInput.style.height = Math.min(messageInput.scrollHeight, maxHeight) + 'px';
    }

    // 发送消息
    function sendMessage() {
        const text = messageInput.value.trim();
        if (!text && attachments.length === 0) return;
        if (isSending) return;

        // 构建消息内容
        let fullMessage = text;
        
        // 添加附件信息
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

        // 显示用户消息
        addMessage('user', text || '[附件]');
        
        // 清空输入
        messageInput.value = '';
        messageInput.style.height = 'auto';
        attachments = [];
        updateAttachments();

        // 发送
        updateSendButton(true);
        showThinking();
        
        vscode.postMessage({
            type: 'sendMessage',
            content: fullMessage,
            planMode: planMode
        });
    }

    // 停止生成
    function stopGeneration() {
        vscode.postMessage({ type: 'stop' });
    }

    // 当前文件列表（用于过滤）
    let currentFiles = [];

    // 显示文件选择器
    function showFilePicker(files) {
        currentFiles = files;
        renderFileList('');
        filePickerOverlay.classList.add('show');
        filePickerSearch.value = '';
        filePickerSearch.focus();
    }

    // 渲染文件列表（前缀匹配优先，包含匹配补充）
    function renderFileList(query) {
        const q = query.toLowerCase();
        let filtered = currentFiles;
        
        if (q) {
            // 前缀匹配的文件（优先显示）
            const prefixMatches = currentFiles.filter(f => 
                f.name.toLowerCase().startsWith(q)
            );
            
            // 包含匹配的文件（补充显示）
            const containsMatches = currentFiles.filter(f => 
                !f.name.toLowerCase().startsWith(q) &&
                (f.name.toLowerCase().includes(q) || 
                 (f.relativePath && f.relativePath.toLowerCase().includes(q)))
            );
            
            filtered = [...prefixMatches, ...containsMatches];
        }
        
        // 最多显示 50 条
        filtered = filtered.slice(0, 50);
        
        filePickerList.innerHTML = filtered.map(f => `
            <div class="file-picker-item" data-path="${f.path}" data-name="${f.name}">
                <span>📄</span>
                <span>${f.name}</span>
                <span class="file-picker-item-path">${f.relativePath || ''}</span>
            </div>
        `).join('');
        
        if (filtered.length === 0) {
            filePickerList.innerHTML = '<div class="file-picker-empty">未找到匹配文件</div>';
        }
    }

    // 隐藏文件选择器
    function hideFilePicker() {
        filePickerOverlay.classList.remove('show');
    }

    // 过滤文件列表
    function filterFiles(query) {
        renderFileList(query);
    }

    // 选择文件作为引用
    function selectFileReference(path, name) {
        attachments.push({ type: 'reference', name: `@${name}`, path });
        updateAttachments();
        hideFilePicker();
        
        // 移除输入框中的 @
        const text = messageInput.value;
        if (text.endsWith('@')) {
            messageInput.value = text.slice(0, -1);
        }
        messageInput.focus();
    }

    // 处理图片粘贴
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
            
            // 通知扩展保存图片
            vscode.postMessage({
                type: 'saveImage',
                data: base64,
                name: name
            });
        };
        reader.readAsDataURL(file);
    }

    // 事件监听

    // 输入框
    messageInput.addEventListener('input', (e) => {
        autoResize();
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

    // 拖拽
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

    // 发送/停止按钮
    sendBtn.addEventListener('click', () => {
        if (isSending) {
            stopGeneration();
        } else {
            sendMessage();
        }
    });

    // 附件按钮
    attachBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'selectFile' });
    });

    // 刷新按钮
    refreshBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'refresh' });
    });

    // 设置按钮
    settingsBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
    });

    // 模式选择
    modeSelect.addEventListener('change', (e) => {
        planMode = e.target.value === 'plan';
        vscode.postMessage({ type: 'setPlanMode', enabled: planMode });
    });

    // 模型选择
    modelSelect.addEventListener('change', (e) => {
        vscode.postMessage({ type: 'setModel', model: e.target.value });
        // 更新选中状态
        if (window._modelData) {
            window._modelData.forEach(m => m.selected = m.id === e.target.value);
        }
        // 收起后显示短名称
        renderModelOptions(false);
    });

    // 展开时显示完整名称，收起时显示短名称
    modelSelect.addEventListener('focus', () => renderModelOptions(true));
    modelSelect.addEventListener('blur', () => renderModelOptions(false));
    modelSelect.addEventListener('mousedown', () => renderModelOptions(true));

    // 渲染模型选项
    function renderModelOptions(showFull) {
        if (!window._modelData) return;
        const currentValue = modelSelect.value;
        modelSelect.innerHTML = window._modelData.map(m => {
            const displayName = showFull ? m.fullName : m.shortName;
            return `<option value="${m.id}" title="${m.fullName}" ${m.id === currentValue ? 'selected' : ''}>${displayName}</option>`;
        }).join('');
        modelSelect.title = window._modelData.find(m => m.id === currentValue)?.fullName || '';
    }

    // 文件选择器
    closeFilePicker.addEventListener('click', hideFilePicker);
    
    filePickerOverlay.addEventListener('click', (e) => {
        if (e.target === filePickerOverlay) {
            hideFilePicker();
        }
    });

    filePickerSearch.addEventListener('input', (e) => {
        filterFiles(e.target.value);
    });

    filePickerList.addEventListener('click', (e) => {
        const item = e.target.closest('.file-picker-item');
        if (item) {
            selectFileReference(item.dataset.path, item.dataset.name);
        }
    });

    // 接收扩展消息
    window.addEventListener('message', (event) => {
        const message = event.data;
        
        switch (message.type) {
            case 'addMessage':
                hideThinking();
                addMessage(message.role, message.content);
                break;
                
            case 'addToolCall':
                addMessage('assistant', message.name, true, message.args);
                break;
                
            case 'showThinking':
                showThinking();
                break;
                
            case 'hideThinking':
                hideThinking();
                break;
                
            case 'sendingComplete':
                updateSendButton(false);
                hideThinking();
                break;
                
            case 'error':
                hideThinking();
                updateSendButton(false);
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
                            addMessage('assistant', msg.toolCall.name, true, msg.toolCall.args);
                        } else {
                            addMessage(msg.role, msg.content);
                        }
                    });
                }
                break;
                
            case 'updateModels':
                // 存储模型数据，用于动态切换显示
                window._modelData = message.models.map(m => ({
                    id: m.id,
                    fullName: m.name,
                    shortName: m.id === 'default' ? '默认模型' : (m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id),
                    selected: m.selected
                }));
                // 初始显示短名称
                renderModelOptions(false);
                break;
                
            case 'updatePlanMode':
                planMode = message.enabled;
                modeSelect.value = planMode ? 'plan' : 'execute';
                break;
        }
    });

    // 初始化
    vscode.postMessage({ type: 'ready' });
})();
