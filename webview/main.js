// @ts-check
// OpenClaw VSCode Extension - Webview Script

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    // i18n - default to English
    let locale = 'en';
    let i18n = {
        thinking: 'Thinking...',
        sendPlaceholder: 'Ask a question...',
        planMode: 'Plan',
        executeMode: 'Execute',
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
        triggeredSkill: 'Triggered skill',
        'dropdown.mode': 'Mode',
        'dropdown.model': 'Model',
        'dropdown.think': 'Thinking',
        'think.off': 'Off',
        'think.minimal': 'Minimal',
        'think.low': 'Low',
        'think.medium': 'Medium',
        'think.high': 'High',
        'think.xhigh': 'Extra High',
        addAgent: 'Add agent to group',
        removeAgent: 'Remove from group',
        groupChat: 'Group Chat',
        groupModeHint: 'Use @name to mention a specific agent',
        leaveGroup: 'Leave group',
        'ctx.setModel': 'Set Model',
        'ctx.remove': 'Remove from group',
        'ctx.modelDefault': 'Use Agent Default',
        groupLoopWarning: '⚠️ Group loop guard triggered — agents stopped responding. Send a new message to continue.',
        groupToggle: 'Add agent to group',
        groupCostWarning: 'Group mode sends your message to all agents — token usage is multiplied',
        delegation: 'delegation',
        groupMentionRequired: '⚠️ Please @mention at least one agent to send a message (e.g. @AgentName your request).',
        loopMode: 'Loop Mode',
        loopModeOn: '🔴 Loop Mode ON — agents auto-route via name mentions',
        loopModeOff: '🟢 Loop Mode OFF',
        autoLoop: '🤖 Auto'
    };

    // Load locale
    function setLocale(lang) {
        locale = lang.startsWith('zh') ? 'zh' : 'en';
        if (locale === 'zh') {
            i18n = {
                thinking: '招财正在思考...',
                sendPlaceholder: '输入问题...',
                planMode: '计划',
                executeMode: '执行',
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
                triggeredSkill: '已触发技能',
                'dropdown.mode': '执行模式',
                'dropdown.model': '选择模型',
                'dropdown.think': '思考深度',
                'think.off': '关闭',
                'think.minimal': '最小',
                'think.low': '低',
                'think.medium': '中',
                'think.high': '高',
                'think.xhigh': '超高',
                addAgent: '添加助手到群组',
                removeAgent: '从群组移除',
                groupChat: '群组对话',
                groupModeHint: '使用 @名称 提及特定助手',
                leaveGroup: '离开群组',
                'ctx.setModel': '切换模型',
                'ctx.remove': '从群组移除',
                'ctx.modelDefault': '使用助手默认模型',
                groupLoopWarning: '⚠️ 检测到群组循环 — 已停止自动响应。发送新消息继续对话。',
                groupToggle: '添加助手到群组',
                groupCostWarning: '群组模式会将消息发送给所有助手，Token 用量成倍增加',
                delegation: '任务委派',
                groupMentionRequired: '⚠️ Please @mention at least one agent to send a message (e.g. @AgentName your request).',
                loopMode: '循环模式',
                loopModeOn: '🔴 循环模式开启 — 助手通过名称提及自动路由',
                loopModeOff: '🟢 循环模式关闭',
                autoLoop: '🤖 自动'
            };
        }
        applyI18n();
        // 语言切换后刷新下拉框
        renderDropdowns();
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
    }

    // State
    let isSending = false;     // chat.send RPC 正在发送
    let planMode = false;

    // Group chat state
    let groupMode = false;
    let groupAgents = [];        // Array of { agentId, name, avatar, color }
    let groupWaitingIds = new Set(); // agentIds currently generating reply
    let groupQueuedIds = [];         // agentIds queued in chain (ordered, not yet started)
    let loopModeEnabled = false; // Loop Mode state (auto-route via plain-text name mentions)
    let respondedAgentHistory = []; // ordered stack of agentIds that have replied (newest first), for auto-@mention fallback
    let mentionPickerIndex = 0;  // selected index in mention picker
    let mentionJustSelected = false; // หลังเลือกจาก picker แล้ว กด Enter จะส่งเลย
    let renderedGroupMessages = new Map(); // agentId → Set of content hashes (for dedup)
    let attachments = []; // { type: 'file'|'image'|'reference', name, path?, data? }
    let messageQueue = []; // 消息队列: { id, text, attachments, createdAt }
    let queueIdCounter = 0; // 队列 ID 计数器
    let connectionStatus = 'disconnected'; // 连接状态: connected/disconnected/connecting
    let connectionMode = 'ws';              // 连接方式: ws/cli
    let connectionUrl = '';                 // Gateway 连接地址
    let connectionLastError = '';           // 最后一次连接错误
    let isRefreshing = false; // 是否正在刷新
    let chatLoading = false; // 是否正在加载历史（对齐 webchat）
    let lastHistoryHash = ''; // 上次 loadHistory 的内容指纹，跳过无变化的重建
    let autoRefreshInterval = 2000; // 自动刷新间隔（ms）- 等待回复时
    let idleRefreshInterval = 5000; // 空闲刷新间隔（ms）- 后台任务轮询
    let autoRefreshTimer = null; // 自动刷新定时器
    let chatRunId = null;      // 当前运行的 runId，非 null = 等待 AI 回复
    let currentSessionModel = null; // 当前会话的模型（会话级状态）
    let currentThinkLevel = 'minimal'; // 当前思考深度（会话级状态）
    let assistantName = '';   // AI 名称（从 agent.identity.get 获取）
    let assistantAvatar = ''; // AI 头像（emoji/字母/URL）

    /**
     * Lighten a hex color for better readability on dark backgrounds.
     * Blends the color towards white by the given amount (0–1).
     */
    function lightenColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, Math.round(((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * amount));
        const g = Math.min(255, Math.round(((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * amount));
        const b = Math.min(255, Math.round((num & 0xff) + (255 - (num & 0xff)) * amount));
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }

    /**
     * Returns the most-recent agent that is still a member of the current group.
     * Falls back through respondedAgentHistory until an active member is found.
     * Returns null if no active agent has responded yet.
     */
    function getLastActiveAgent() {
        for (const agentId of respondedAgentHistory) {
            const agent = groupAgents.find(a => a.agentId === agentId);
            if (agent) { return agent; }
        }
        return null;
    }

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
    // Custom dropdowns
    const modeDropdown = document.getElementById('modeDropdown');
    const modeTrigger = document.getElementById('modeTrigger');
    const modeLabel = document.getElementById('modeLabel');
    const modeTitle = document.getElementById('modeTitle');
    const modePopup = document.getElementById('modePopup');
    const modeOptionsEl = document.getElementById('modeOptions');
    const modelDropdown = document.getElementById('modelDropdown');
    const modelTrigger = document.getElementById('modelTrigger');
    const modelLabel = document.getElementById('modelLabel');
    const modelTitle = document.getElementById('modelTitle');
    const modelPopup = document.getElementById('modelPopup');
    const modelOptionsEl = document.getElementById('modelOptions');
    const thinkDropdown = document.getElementById('thinkDropdown');
    const thinkTrigger = document.getElementById('thinkTrigger');
    const thinkLabel = document.getElementById('thinkLabel');
    const thinkTitle = document.getElementById('thinkTitle');
    const thinkPopup = document.getElementById('thinkPopup');
    const thinkOptionsEl = document.getElementById('thinkOptions');
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
    const statusPopupOverlay = document.getElementById('statusPopupOverlay');
    const statusPopupHeader = document.getElementById('statusPopupHeader');
    const statusPopupDesc = document.getElementById('statusPopupDesc');
    const statusPopupActions = document.getElementById('statusPopupActions');

    // Group chat DOM
    const groupMemberBar = document.getElementById('groupMemberBar');
    const groupMembersEl = document.getElementById('groupMembers');
    const groupToggleBtn = document.getElementById('groupToggleBtn');
    const loopModeBtn = document.getElementById('loopModeBtn');
    const mentionPickerEl = document.getElementById('mentionPicker');
    const mentionPickerList = document.getElementById('mentionPickerList');

    // Escape HTML for XSS prevention (text nodes)
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Escape for use inside HTML attribute values (also escapes double quotes)
    function escapeAttr(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Simple Markdown renderer
    function renderMarkdown(text) {
        if (!text) return '';

        let html = text;

        // ① 先处理 Markdown 自动链接 <https://...> （在 escapeHtml 之前！）
        html = html.replace(/<(https?:\/\/[^>]+)>/g, '[$1]($1)');

        // ② Escape HTML（把 < > & 转义，防止 XSS）
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // ③ Code blocks — 用占位符保护（内部不应有链接等处理）
        const codeBlocks = [];
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const placeholder = `\x00CB${codeBlocks.length}\x00`;
            codeBlocks.push(`<pre><code class="language-${lang}">${code.trim()}</code></pre>`);
            return placeholder;
        });

        // ④ Inline code — 同样用占位符保护
        const inlineCodes = [];
        html = html.replace(/`([^`]+)`/g, (match, code) => {
            const placeholder = `\x00IC${inlineCodes.length}\x00`;
            inlineCodes.push(`<code>${code}</code>`);
            return placeholder;
        });

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

        // ⑤ Markdown 链接 [text](url)
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // ⑥ 自动检测纯文本 URL（排除已在 <a href="..."> 内的）
        html = html.replace(/(^|[^"'>])(https?:\/\/[^\s<)\]"']+)/g, '$1<a href="$2" target="_blank">$2</a>');

        // Blockquotes
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

        // Unordered lists
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

        // Horizontal rule
        html = html.replace(/^---+$/gm, '<hr>');

        // Paragraphs
        html = html.replace(/^(?!<[hupob]|<li|<hr|<code|<pre|\x00)(.+)$/gm, '<p>$1</p>');

        // ⑦ 恢复 inline code 占位符
        for (let i = 0; i < inlineCodes.length; i++) {
            html = html.replace(`\x00IC${i}\x00`, inlineCodes[i]);
        }

        // ⑧ 恢复 code block 占位符
        for (let i = 0; i < codeBlocks.length; i++) {
            html = html.replace(`\x00CB${i}\x00`, codeBlocks[i]);
        }

        return html;
    }

    // ========== Tool Call Cards ==========

    // 工具名称 → 图标 & 显示名映射
    const TOOL_META = {
        read: { icon: '📄', label: 'Read' },
        write: { icon: '✏️', label: 'Write' },
        edit: { icon: '✏️', label: 'Edit' },
        exec: { icon: '⚡', label: 'Exec' },
        process: { icon: '⚡', label: 'Process' },
        web_search: { icon: '🔍', label: 'Search' },
        web_fetch: { icon: '🌐', label: 'Fetch' },
        browser: { icon: '🌐', label: 'Browser' },
        image: { icon: '🖼️', label: 'Image' },
        memory_search: { icon: '🧠', label: 'Memory' },
        memory_get: { icon: '🧠', label: 'Memory' },
        message: { icon: '💬', label: 'Message' },
        cron: { icon: '⏰', label: 'Cron' },
        tts: { icon: '🔊', label: 'TTS' },
        canvas: { icon: '🎨', label: 'Canvas' },
        nodes: { icon: '📱', label: 'Nodes' },
        gateway: { icon: '🔌', label: 'Gateway' },
        session_status: { icon: '📊', label: 'Status' },
    };

    function getToolMeta(name) {
        const n = (name || 'tool').toLowerCase().trim();
        return TOOL_META[n] || { icon: '🔧', label: name || 'Tool' };
    }

    function getToolDetail(name, args) {
        if (!args || typeof args !== 'object') return '';
        const n = (name || '').toLowerCase();
        if (n === 'exec' && args.command) {
            const cmd = args.command.length > 80 ? args.command.substring(0, 80) + '…' : args.command;
            return cmd;
        }
        if ((n === 'read' || n === 'write' || n === 'edit') && (args.path || args.file_path)) {
            const p = args.path || args.file_path;
            // 缩短用户目录
            return p.replace(/\/Users\/[^/]+/g, '~').replace(/\/home\/[^/]+/g, '~');
        }
        if (n === 'web_search' && args.query) return args.query;
        if (n === 'web_fetch' && args.url) return args.url;
        if (n === 'browser' && args.action) return args.action;
        if (n === 'message' && args.action) return args.action;
        if (n === 'image' && args.prompt) {
            return args.prompt.length > 60 ? args.prompt.substring(0, 60) + '…' : args.prompt;
        }
        // 通用：取第一个有意义的 key
        for (const key of ['path', 'file_path', 'command', 'query', 'url', 'action', 'name', 'text']) {
            if (typeof args[key] === 'string' && args[key]) {
                const v = args[key];
                return v.length > 80 ? v.substring(0, 80) + '…' : v;
            }
        }
        return '';
    }

    function renderToolCard(name, args) {
        const meta = getToolMeta(name);
        const detail = getToolDetail(name, args);
        const hasArgs = args && Object.keys(args).length > 0;
        const argsJson = hasArgs ? escapeAttr(JSON.stringify(args)) : '';
        return `<div class="tool-card">
            <div class="tool-card-header">
                <span class="tool-card-icon">${meta.icon}</span>
                <span class="tool-card-label">${escapeHtml(meta.label)}</span>
                <span class="tool-card-check">✓</span>
            </div>
            ${detail ? `<div class="tool-card-detail">${escapeHtml(detail)}</div>` : ''}
            ${hasArgs ? `<button class="tool-card-expand" data-name="${escapeAttr(meta.label)}" data-args="${argsJson}">{...}</button>` : ''}
        </div>`;
    }

    /**
     * 检查是否已滚动到底部（允许 30px 误差）
     */
    function isScrolledToBottom() {
        const threshold = 30;
        return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight <= threshold;
    }

    /**
     * 向聊天区追加工具卡片（卡片横向滚动容器）
     * @param {Array} toolCalls - 工具调用数据
     * @param {boolean} [skipScroll=false] - 是否跳过自动滚动（批量加载时使用）
     */
    function addToolCards(toolCalls, skipScroll) {
        if (!toolCalls || toolCalls.length === 0) return;

        // 记录添加前是否在底部
        const wasAtBottom = isScrolledToBottom();

        // 查找或创建当前末尾的 tool-cards-row
        let lastRow = messages.lastElementChild;
        let row;
        if (lastRow && lastRow.classList.contains('tool-cards-row')) {
            row = lastRow;
        } else {
            row = document.createElement('div');
            row.className = 'tool-cards-row';
            messages.appendChild(row);
        }

        for (const tc of toolCalls) {
            const card = document.createElement('div');
            card.innerHTML = renderToolCard(tc.name, tc.args);
            // 新卡片添加到开头（最新的在最前）
            row.prepend(card.firstElementChild);
        }

        // 只有之前就在底部时才自动滚动（避免用户正在看历史时被拉走）
        if (!skipScroll && wasAtBottom) {
            scrollToBottom();
        }
    }

    /**
     * 渲染 AI 头像元素
     * avatar 可能是：URL (http/https)、emoji、字母
     */
    function renderAvatarElement() {
        const av = assistantAvatar || '';
        if (av.startsWith('http://') || av.startsWith('https://')) {
            return `<img class="assistant-avatar" src="${escapeHtml(av)}" alt="">`;
        }
        // emoji 或字母 — 用圆形背景
        const display = av || (assistantName ? assistantName.charAt(0) : '🤖');
        return `<span class="assistant-avatar assistant-avatar-text">${escapeHtml(display)}</span>`;
    }

    /**
     * Add message with optional attachments and thinking
     * @param {string} role
     * @param {string} content
     * @param {Array|null} messageAttachments
     * @param {boolean} [skipScroll=false] - 是否跳过自动滚动（批量加载时使用）
     * @param {string} [thinking] - AI 思考过程内容
     */
    function addMessage(role, content, messageAttachments, skipScroll, thinking, showAvatar) {
        // 记录添加前是否在底部
        const wasAtBottom = isScrolledToBottom();

        // Deduplicate: skip if last message is identical
        // (prevents double-render from loadHistory + sendMessageNow flow)
        const lastMsgEl = messages.lastElementChild;
        if (lastMsgEl && lastMsgEl.className.includes(`message ${role}`)) {
            let lastContent = '';
            if (role === 'assistant') {
                // Extract text content only (skip avatar/thinking)
                const contentDiv = lastMsgEl.querySelector('.message-text') || lastMsgEl;
                lastContent = (contentDiv.textContent || '').trim();
            } else if (role === 'user') {
                const textDiv = lastMsgEl.querySelector('.message-text');
                lastContent = (textDiv?.textContent || lastMsgEl.textContent || '').trim();
            } else {
                lastContent = (lastMsgEl.textContent || '').trim();
            }
            const newContent = (content || '').trim();
            if (lastContent && newContent && lastContent === newContent) {
                console.log(`[Deduplicate] Skipping duplicate ${role} message`);
                return; // Skip rendering duplicate
            }
        }

        const div = document.createElement('div');
        div.className = `message ${role}`;

        if (role === 'assistant') {
            let html = '';
            // 头像行（仅在分组首条显示）
            if (showAvatar && (assistantName || assistantAvatar)) {
                html += `<div class="assistant-header">`;
                html += renderAvatarElement();
                if (assistantName) {
                    html += `<span class="assistant-name">${escapeHtml(assistantName)}</span>`;
                }
                html += `</div>`;
            }
            // 渲染 thinking 折叠区域
            if (thinking) {
                const thinkingId = 'thinking-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
                html += `<details class="thinking-block"><summary class="thinking-summary">🧠 ${locale === 'zh' ? '思考过程' : 'Thinking process'}</summary><div class="thinking-content">${renderMarkdown(thinking)}</div></details>`;
            }
            html += renderMarkdown(content);
            div.innerHTML = html;
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

        // 只有之前就在底部时才自动滚动
        if (!skipScroll && wasAtBottom) {
            scrollToBottom();
        }
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

    // ══════════════════════════════════════════════════════════════════════════
    //  GROUP CHAT
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Render a group agent message bubble.
     * User messages are already shown by sendMessageNow — skip them here.
     */
    function renderGroupMessage(msg) {
        console.log(`[Group] renderGroupMessage called with:`, msg);
        
        if (!msg || msg.role === 'user') {
            console.log(`[Group] Skipping user message or null`);
            // User messages already rendered in sendMessageNow — do not duplicate
            return;
        }

        // Empty content = error/aborted, remove thinking indicator for that agent
        if (!msg.content && (!msg.toolCalls || msg.toolCalls.length === 0)) {
            console.log(`[Group] Empty content and no toolCalls for agent ${msg.agentId}, removing thinking indicator`);
            removeAgentThinking(msg.agentId);
            return;
        }

        // Deduplicate: skip if this exact message was already rendered
        const contentHash = `${(msg.content || '').substring(0, 100)}:${(msg.toolCalls || []).length}`;
        if (!renderedGroupMessages.has(msg.agentId)) {
            renderedGroupMessages.set(msg.agentId, new Set());
        }
        const agentHashes = renderedGroupMessages.get(msg.agentId);
        if (agentHashes.has(contentHash)) {
            console.log(`[Group] Skipping duplicate message from ${msg.agentId}`);
            removeAgentThinking(msg.agentId);
            return;
        }
        agentHashes.add(contentHash);
        console.log(`[Group] Rendering message from ${msg.agentId}:`, msg.content?.substring(0, 100) || '(no text, tools only)');

        removeAgentThinking(msg.agentId);

        const wasAtBottom = isScrolledToBottom();
        const div = document.createElement('div');
        div.className = 'message group-agent';
        div.dataset.agentId = msg.agentId || '';

        const initial = (msg.agentName || msg.agentId || '?').charAt(0).toUpperCase();
        const color = escapeHtml(msg.agentColor || '#888');
        const name = escapeHtml(msg.agentName || msg.agentId || 'Agent');

        let html = '';
        if (msg.parentMessageId) {
            html += `<div class="group-delegation-indicator">↳ ${i18n.delegation || 'delegation'}</div>`;
        }
        html += `<div class="group-agent-header">`;
        html += `<div class="group-agent-avatar" style="background:${color}">${escapeHtml(initial)}</div>`;
        html += `<span class="group-agent-name" style="color:${color}">${name}</span>`;
        html += `</div>`;
        
        // Render tool calls first (if any) — reuse renderToolCard() for consistent display
        if (msg.toolCalls && msg.toolCalls.length > 0) {
            html += '<div class="tool-cards-row">';
            for (const tc of msg.toolCalls) {
                html += renderToolCard(tc.name, tc.args);
            }
            html += '</div>';
        }

        // Render content text (if any)
        if (msg.content) {
            html += renderMarkdown(msg.content);
        }

        div.innerHTML = html;
        messages.appendChild(div);

        if (wasAtBottom) { scrollToBottom(); }
    }

    /**
     * Show a per-agent thinking indicator.
     */
    function showAgentThinking(agentId) {
        const agent = groupAgents.find(a => a.agentId === agentId);
        if (!agent) { return; }

        const existingId = `agent-thinking-${agentId}`;
        if (document.getElementById(existingId)) { return; }

        const wasAtBottom = isScrolledToBottom();
        const div = document.createElement('div');
        div.className = 'agent-thinking';
        div.id = existingId;

        const initial = (agent.name || agentId).charAt(0).toUpperCase();
        const color = escapeHtml(agent.color || '#888');
        const name = escapeHtml(agent.name || agentId);

        div.innerHTML = `
            <div class="agent-thinking-avatar" style="background:${color}">${escapeHtml(initial)}</div>
            <span style="color:${color}">${name}</span>
            <div class="thinking-dots"><span></span><span></span><span></span></div>
        `;
        messages.appendChild(div);
        if (wasAtBottom) { scrollToBottom(); }
    }

    /**
     * Remove per-agent thinking indicator.
     */
    function removeAgentThinking(agentId) {
        const el = document.getElementById(`agent-thinking-${agentId}`);
        if (el) { el.remove(); }
    }

    /**
     * Show per-agent queued indicator (waiting in chain).
     */
    function showAgentQueued(agentId) {
        const agent = groupAgents.find(a => a.agentId === agentId);
        if (!agent) { return; }

        const existingId = `agent-queued-${agentId}`;
        if (document.getElementById(existingId)) { return; }

        const wasAtBottom = isScrolledToBottom();
        const div = document.createElement('div');
        div.className = 'agent-queued';
        div.id = existingId;

        const initial = (agent.name || agentId).charAt(0).toUpperCase();
        const color = escapeHtml(agent.color || '#888');
        const name = escapeHtml(agent.name || agentId);

        div.innerHTML = `
            <div class="agent-queued-avatar" style="background:${color}; opacity: 0.5;">${escapeHtml(initial)}</div>
            <span style="color:${color}; opacity: 0.6;">${name}</span>
            <span style="opacity: 0.5; font-size: 0.85em; margin-left: 4px;">⏳ queued</span>
        `;
        messages.appendChild(div);
        if (wasAtBottom) { scrollToBottom(); }
    }

    /**
     * Remove per-agent queued indicator.
     */
    function removeAgentQueued(agentId) {
        const el = document.getElementById(`agent-queued-${agentId}`);
        if (el) { el.remove(); }
    }

    /**
     * Show a transient warning toast in the chat area.
     */
    function showGroupWarningToast(text) {
        const existing = document.getElementById('groupWarningToast');
        if (existing) { existing.remove(); }

        const toast = document.createElement('div');
        toast.id = 'groupWarningToast';
        toast.className = 'group-warning-toast';
        toast.textContent = text;
        messages.appendChild(toast);
        scrollToBottom();

        // Auto-dismiss after 8 seconds
        setTimeout(() => { toast.remove(); }, 8000);
    }

    /**
     * Update the group member bar based on current agent list.
     */
    function updateGroupMemberBar(agents) {
        groupAgents = agents || [];
        groupMode = groupAgents.length > 0;

        if (!groupMode) {
            groupMemberBar.style.display = 'none';
            messageInput.placeholder = i18n.sendPlaceholder || 'Ask a question...';
            respondedAgentHistory = []; // reset when leaving group
            renderedGroupMessages.clear(); // clear dedup cache
            modelDropdown.style.display = '';  // show model dropdown in normal mode
            refreshBtn.style.display = '';     // show refresh button in normal mode
            updateGroupToggleBtn();
            return;
        }

        // Hide main model dropdown and refresh button in group mode
        modelDropdown.style.display = 'none';
        refreshBtn.style.display = 'none';
        groupMemberBar.style.display = 'flex';
        groupMembersEl.innerHTML = '';

        for (const agent of groupAgents) {
            const badge = document.createElement('div');
            badge.className = 'group-member-badge';
            badge.title = `${agent.name || agent.agentId} — right-click for options`;
            badge.dataset.agentId = agent.agentId;

            const color = agent.color || '#888';
            const colorEscaped = escapeHtml(color);
            const colorLightened = lightenColor(color, 0.35); // Brighten for better readability on dark bg
            const name = escapeHtml(agent.name || agent.agentId);

            badge.innerHTML = `
                <span class="group-member-dot" style="background:${colorEscaped}"></span>
                <span class="group-member-name" style="color:${escapeHtml(colorLightened)}">${name}</span>
                <span class="group-member-remove" data-agent-id="${escapeAttr(agent.agentId)}" title="Remove">×</span>
            `;
            groupMembersEl.appendChild(badge);
        }

        // update input placeholder hint
        messageInput.placeholder = i18n.groupModeHint || 'Use @name to mention a specific agent...';

        // Show/hide Loop Mode button: only when > 1 agent in group
        if (loopModeBtn) {
            loopModeBtn.style.display = groupAgents.length > 1 ? 'inline-flex' : 'none';
            updateLoopModeBtn();
        }

        updateGroupToggleBtn();
    }

    // ── Loop Mode Button ──────────────────────────────────────────────────────

    function updateLoopModeBtn() {
        if (!loopModeBtn) { return; }
        if (loopModeEnabled) {
            loopModeBtn.classList.add('active');
            loopModeBtn.title = i18n.loopModeOn || '🔴 Loop Mode ON — agents auto-route via name mentions';
        } else {
            loopModeBtn.classList.remove('active');
            loopModeBtn.title = i18n.loopModeOff || '🟢 Loop Mode OFF';
        }
    }

    if (loopModeBtn) {
        loopModeBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'toggleLoopMode' });
        });
    }

    /** Shorten model name: strip provider prefix, keep last segment */
    function shortModelName(model) {
        if (!model || model === 'default') { return 'default'; }
        const parts = model.split('/');
        return parts[parts.length - 1];
    }

    // Click on remove × in member badge
    groupMembersEl.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.group-member-remove');
        if (!removeBtn) { return; }
        const agentId = removeBtn.dataset.agentId;
        if (agentId) {
            vscode.postMessage({ type: 'removeAgentFromGroup', agentId });
        }
    });

    // ── Agent Badge Context Menu ──────────────────────────────────────────────

    let agentContextMenu = null; // currently open context menu element

    function closeAgentContextMenu() {
        if (agentContextMenu) {
            agentContextMenu.remove();
            agentContextMenu = null;
        }
        // Also remove any open model sub-menu (it's a separate body element)
        const subMenu = document.querySelector('.agent-model-submenu');
        if (subMenu) { subMenu.remove(); }
    }

    groupMembersEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const badge = e.target.closest('.group-member-badge');
        if (!badge) { return; }
        const agentId = badge.dataset.agentId;
        if (!agentId) { return; }

        closeAgentContextMenu();
        openAgentContextMenu(agentId, badge);
    });

    // Close context menu on outside click
    document.addEventListener('click', (e) => {
        if (agentContextMenu && !agentContextMenu.contains(e.target)) {
            closeAgentContextMenu();
        }
    });

    function openAgentContextMenu(agentId, badgeEl) {
        const agent = groupAgents.find(a => a.agentId === agentId);
        if (!agent) { return; }

        const menu = document.createElement('div');
        menu.className = 'agent-context-menu';

        // "Set Model" item with sub-menu trigger
        const setModelItem = document.createElement('div');
        setModelItem.className = 'agent-ctx-item';
        setModelItem.innerHTML = `<span>⚡ ${escapeHtml(i18n['ctx.setModel'] || 'Set Model')}</span><span class="agent-ctx-arrow">▶</span>`;
        setModelItem.addEventListener('click', (e) => {
            e.stopPropagation();
            openModelSubMenu(agentId, agent.modelOverride, setModelItem);
        });
        menu.appendChild(setModelItem);

        // Separator
        const sep = document.createElement('div');
        sep.className = 'agent-ctx-sep';
        menu.appendChild(sep);

        // "Remove" item
        const removeItem = document.createElement('div');
        removeItem.className = 'agent-ctx-item agent-ctx-danger';
        removeItem.textContent = `✕ ${i18n['ctx.remove'] || 'Remove from group'}`;
        removeItem.addEventListener('click', () => {
            vscode.postMessage({ type: 'removeAgentFromGroup', agentId });
            closeAgentContextMenu();
        });
        menu.appendChild(removeItem);

        // Position below badge (with bounds checking)
        document.body.appendChild(menu);
        const rect = badgeEl.getBoundingClientRect();
        const padding = 4;

        // Initial position: below badge
        let left = rect.left;
        let top = rect.bottom + padding;

        // Ensure menu doesn't go off-screen horizontally (right edge)
        requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.right > window.innerWidth) {
                left = Math.max(0, window.innerWidth - menuRect.width - padding);
            }
            // Ensure menu doesn't go off-screen vertically (bottom edge)
            if (menuRect.bottom > window.innerHeight) {
                top = Math.max(0, rect.top - menuRect.height - padding);
            }
            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        });

        agentContextMenu = menu;
    }

    function openModelSubMenu(agentId, currentModel, parentItem) {
        // Remove existing sub-menu
        const existing = document.querySelector('.agent-model-submenu');
        if (existing) { existing.remove(); }

        // Build model list: "Default" + available models from current modelOptions
        const modelItems = [];
        // Collect from existing model dropdown options
        const optEls = modelOptionsEl.querySelectorAll('.dropdown-option');
        optEls.forEach(el => {
            const val = el.dataset.value;
            if (val) { modelItems.push(val); }
        });

        const sub = document.createElement('div');
        sub.className = 'agent-context-menu agent-model-submenu';

        // "Use Default" option first
        const defaultItem = document.createElement('div');
        defaultItem.className = 'agent-ctx-item' + (!currentModel ? ' agent-ctx-active' : '');
        defaultItem.textContent = `○ ${i18n['ctx.modelDefault'] || 'Use Agent Default'}`;
        defaultItem.addEventListener('click', () => {
            vscode.postMessage({ type: 'setAgentModel', agentId, model: null });
            closeAgentContextMenu();
        });
        sub.appendChild(defaultItem);

        // Separator
        if (modelItems.length > 0) {
            const sep = document.createElement('div');
            sep.className = 'agent-ctx-sep';
            sub.appendChild(sep);
        }

        for (const model of modelItems) {
            const item = document.createElement('div');
            item.className = 'agent-ctx-item' + (currentModel === model ? ' agent-ctx-active' : '');
            item.textContent = `${currentModel === model ? '●' : '○'} ${shortModelName(model)}`;
            item.title = model;
            item.addEventListener('click', () => {
                vscode.postMessage({ type: 'setAgentModel', agentId, model });
                closeAgentContextMenu();
            });
            sub.appendChild(item);
        }

        document.body.appendChild(sub);

        // Position submenu (try right first, then left if no space)
        const parentRect = parentItem.getBoundingClientRect();
        const padding = 4;
        const tryRight = parentRect.right + padding;

        // Initial position: to the right of parent item, aligned top
        let subLeft = tryRight;
        let subTop = parentRect.top;

        // Ensure sub-menu doesn't go off-screen
        requestAnimationFrame(() => {
            const subRect = sub.getBoundingClientRect();

            // Check right edge: if it goes off-screen, try left side
            if (subRect.right > window.innerWidth) {
                subLeft = Math.max(0, parentRect.left - subRect.width - padding);
            }

            // Check bottom edge: shift up if necessary
            if (subRect.bottom > window.innerHeight) {
                subTop = Math.max(0, window.innerHeight - subRect.height - padding);
            }

            // Check top edge: shift down if necessary
            if (subTop < 0) {
                subTop = padding;
            }

            sub.style.left = subLeft + 'px';
            sub.style.top = subTop + 'px';
        });
    }

    // Group toggle button in header — always means "add agent to group"
    function updateGroupToggleBtn() {
        if (!groupToggleBtn) return;
        const use = groupToggleBtn.querySelector('use');
        use.setAttribute('href', '#icon-group-add');
        groupToggleBtn.title = i18n.groupToggle || 'Add agent to group';
        // Visual active state when group is active (informational only)
        groupToggleBtn.classList.toggle('active', groupMode);
    }

    if (groupToggleBtn) {
        groupToggleBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'addAgentToGroup' });
        });
    }

    // ── @ Mention Autocomplete ────────────────────────────────────────────────

    function getMentionQueryFromInput() {
        const text = messageInput.value;
        const pos = messageInput.selectionStart || 0;
        const before = text.substring(0, pos);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) { return null; }
        const query = before.substring(atIdx + 1);
        if (/\s/.test(query)) { return null; }
        return { query, atIdx };
    }

    function showMentionPicker(query) {
        if (!groupMode || groupAgents.length === 0) {
            hideMentionPicker();
            return;
        }

        const filtered = groupAgents.filter(a => {
            const name = (a.name || a.agentId).toLowerCase();
            return name.startsWith(query.toLowerCase());
        });

        if (filtered.length === 0) {
            hideMentionPicker();
            return;
        }

        mentionPickerIndex = 0;
        mentionPickerList.innerHTML = '';

        filtered.forEach((agent, idx) => {
            const item = document.createElement('div');
            item.className = 'mention-picker-item' + (idx === 0 ? ' active' : '');
            item.dataset.agentId = agent.agentId;
            item.dataset.agentName = agent.name || agent.agentId;

            const color = escapeHtml(agent.color || '#888');
            const name = escapeHtml(agent.name || agent.agentId);
            const id = escapeHtml(agent.agentId);

            item.innerHTML = `
                <span class="mention-picker-dot" style="background:${color}"></span>
                <span class="mention-picker-name">${name}</span>
                ${name !== id ? `<span class="mention-picker-id">(${id})</span>` : ''}
            `;

            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                insertMentionFromPicker(agent.name || agent.agentId);
            });

            mentionPickerList.appendChild(item);
        });

        mentionPickerEl.style.display = 'block';
        updateSendButtonState(); // ปิดปุ่มส่งเมื่อ picker เปิด
    }

    function hideMentionPicker() {
        mentionPickerEl.style.display = 'none';
        mentionPickerList.innerHTML = '';
        mentionPickerIndex = 0;
        updateSendButtonState(); // เปิดปุ่มส่งเมื่อ picker ปิด
    }

    function insertMentionFromPicker(agentName) {
        const text = messageInput.value;
        const pos = messageInput.selectionStart || 0;
        const before = text.substring(0, pos);
        const after = text.substring(pos);
        const atIdx = before.lastIndexOf('@');
        if (atIdx === -1) { hideMentionPicker(); return; }

        const prefix = before.substring(0, atIdx);
        const inserted = `@${agentName} `;
        messageInput.value = prefix + inserted + after;
        const newPos = atIdx + inserted.length;
        messageInput.setSelectionRange(newPos, newPos);
        hideMentionPicker();
        mentionJustSelected = true; // ทำเครื่องหมายว่าเพิ่งเลือกแล้ว
        messageInput.focus();
        autoResize();
    }

    // Update mention picker on input
    messageInput.addEventListener('input', () => {
        autoResize();
        mentionJustSelected = false; // reset เมื่อพิมพ์ใหม่
        
        // บังคับใช้ dropdown: ถ้ามี @ ที่พิมพ์เอง (ไม่ได้มาจากการเลือก) → ลบออก
        const text = messageInput.value;
        const pos = messageInput.selectionStart || 0;
        const before = text.substring(0, pos);
        
        // ตรวจสอบว่ามี @ ที่ cursor หรือไม่
        const atIdx = before.lastIndexOf('@');
        if (atIdx !== -1 && !before.substring(atIdx).includes(' ')) {
            // ตรวจว่า @ นี้มาจากไหน - ถ้าเป็นการพิมพ์เอง (ไม่มี mentionJustSelected) 
            // ให้ลบ @ ออกและแสดง picker ให้เลือก
        }
        
        const result = getMentionQueryFromInput();
        if (result !== null && groupMode) {
            // ถ้ามี @ ให้แสดง picker (ถ้า picker ซ่อนอยู่แสดงว่าพิมพ์เอง → block การพิมพ์)
            showMentionPicker(result.query);
        } else {
            hideMentionPicker();
        }
    });

    // Navigate picker with keyboard
    messageInput.addEventListener('keydown', (e) => {
        // ถ้า picker ปิด และไม่ได้เพิ่งเลือก → ไม่ต้องทำอะไร
        if (mentionPickerEl.style.display === 'none' && !mentionJustSelected) { return; }

        const items = mentionPickerList.querySelectorAll('.mention-picker-item');

        // ถ้า picker เปิดอยู่ → block Enter ทั้งหมด (บังคับให้คลิกหรือกด space)
        if (mentionPickerEl.style.display !== 'none') {
            if (e.key === 'Enter') {
                e.preventDefault();
                return; // ไม่ให้ส่งข้อความ
            }
            
            // Space = เลือก agent ปัจจุบัน
            if (e.key === ' ' && items.length > 0) {
                e.preventDefault();
                const active = items[mentionPickerIndex];
                if (active) {
                    insertMentionFromPicker(active.dataset.agentName || active.dataset.agentId || '');
                }
                return;
            }
        }

        // ถ้าเพิ่งเลือก agent แล้ว และกด Enter อีกครั้ง → ส่งข้อความ
        if (mentionJustSelected && e.key === 'Enter') {
            mentionJustSelected = false;
            return; // ให้ไปที่ keydown handler หลักเพื่อส่งข้อความ
        }

        if (e.key === 'Tab') {
            // Tab = เลือก agent
            const active = items[mentionPickerIndex];
            if (active) {
                e.preventDefault();
                insertMentionFromPicker(active.dataset.agentName || active.dataset.agentId || '');
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            mentionPickerIndex = (mentionPickerIndex + 1) % items.length;
            items.forEach((el, i) => el.classList.toggle('active', i === mentionPickerIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            mentionPickerIndex = (mentionPickerIndex - 1 + items.length) % items.length;
            items.forEach((el, i) => el.classList.toggle('active', i === mentionPickerIndex));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            const active = items[mentionPickerIndex];
            if (active) {
                e.preventDefault();
                insertMentionFromPicker(active.dataset.agentName || active.dataset.agentId || '');
            }
        } else if (e.key === 'Escape') {
            hideMentionPicker();
        }
    });

    // ══════════════════════════════════════════════════════════════════════════

    // Update send button state
    /**
     * Whether the chat is busy (sending or waiting for AI reply)
     */
    function isBusy() {
        return isSending || !!chatRunId;
    }

    function updateSendButtonState() {
        const hasInput = messageInput.value.trim().length > 0 || attachments.length > 0;
        const pickerOpen = mentionPickerEl.style.display !== 'none'; // ปิดปุ่มส่งเมื่อ picker เปิด

        if (isBusy()) {
            sendBtn.classList.remove('active');
            sendBtn.classList.add('sending');
            sendBtn.title = i18n.stop;
        } else {
            sendBtn.classList.remove('sending');
            // ปิดปุ่มส่งเมื่อ picker เปิด หรือ ไม่มีข้อความ
            sendBtn.classList.toggle('active', hasInput && !pickerOpen);
            sendBtn.title = pickerOpen ? i18n.selectAgent : i18n.send;
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
    window.removeAttachment = function (index) {
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
            const displayText = item.text || (hasAttachments ? `📎 ${item.attachments.length} attachment(s)` : '');

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
        if (isBusy()) return;

        const next = messageQueue.shift();
        renderQueue();

        // 发送队列中的消息
        sendMessageNow(next.text, next.attachments);
    }

    // 暴露到 window 供按钮调用
    window.removeQueueItem = removeQueueItem;

    // ========== 连接状态管理 ==========

    // 绿灯/红灯点击 → 在 webview 内显示状态弹窗
    statusIndicator.addEventListener('click', () => {
        showStatusPopup();
    });

    function showStatusPopup() {
        const isConnected = connectionStatus === 'connected';

        if (isConnected) {
            statusPopupHeader.innerHTML = '✅ ' + (locale === 'zh' ? '已连接' : 'Connected');
            // 根据连接方式显示不同描述
            if (connectionMode === 'cli') {
                statusPopupDesc.textContent = 'CLI';
            } else {
                // WebSocket 模式：显示 Gateway 地址+端口
                const displayUrl = connectionUrl || 'WebSocket';
                statusPopupDesc.textContent = 'WebSocket — ' + displayUrl;
            }
            statusPopupActions.innerHTML = `
                <button class="status-popup-action" data-action="reconnect">🔄 ${locale === 'zh' ? '重新连接' : 'Reconnect'}</button>
                <button class="status-popup-action" data-action="settings">⚙️ ${locale === 'zh' ? '打开设置' : 'Settings'}</button>
            `;
        } else {
            statusPopupHeader.innerHTML = '❌ ' + (locale === 'zh' ? '连接失败' : 'Disconnected');
            // 红灯：展示最后出错原因
            if (connectionLastError) {
                statusPopupDesc.textContent = connectionLastError;
            } else {
                statusPopupDesc.textContent = locale === 'zh' ? '请检查 Gateway 状态' : 'Check Gateway status';
            }
            statusPopupActions.innerHTML = `
                <button class="status-popup-action" data-action="reconnect">🔄 ${locale === 'zh' ? '重新连接' : 'Reconnect'}</button>
                <button class="status-popup-action" data-action="settings">⚙️ ${locale === 'zh' ? '打开设置' : 'Settings'}</button>
            `;
        }

        statusPopupOverlay.classList.add('show');
    }

    function hideStatusPopup() {
        statusPopupOverlay.classList.remove('show');
    }

    statusPopupOverlay.addEventListener('click', (e) => {
        if (e.target === statusPopupOverlay) {
            hideStatusPopup();
        }
    });

    // ========== Tool detail modal ==========
    const toolDetailOverlay = document.getElementById('toolDetailOverlay');
    const toolDetailTitle   = document.getElementById('toolDetailTitle');
    const toolDetailBody    = document.getElementById('toolDetailBody');
    const toolDetailClose   = document.getElementById('toolDetailClose');

    messages.addEventListener('click', (e) => {
        const btn = e.target.closest('.tool-card-expand');
        if (!btn) return;
        const name = btn.dataset.name || 'Tool';
        let argsObj;
        try { argsObj = JSON.parse(btn.dataset.args || '{}'); } catch (err) { argsObj = {}; }
        toolDetailTitle.textContent = name;
        toolDetailBody.textContent = JSON.stringify(argsObj, null, 2);
        toolDetailOverlay.classList.add('show');
    });

    toolDetailClose.addEventListener('click', () => toolDetailOverlay.classList.remove('show'));
    toolDetailOverlay.addEventListener('click', (e) => {
        if (e.target === toolDetailOverlay) toolDetailOverlay.classList.remove('show');
    });

    statusPopupActions.addEventListener('click', (e) => {
        const btn = e.target.closest('.status-popup-action');
        if (!btn) return;
        const action = btn.dataset.action;
        hideStatusPopup();

        if (action === 'reconnect') {
            vscode.postMessage({ type: 'reconnect' });
        } else if (action === 'settings') {
            vscode.postMessage({ type: 'openSettings' });
        }
    });

    function updateConnectionStatus(status, mode, url, lastError) {
        connectionStatus = status;
        if (mode !== undefined) connectionMode = mode;
        if (url !== undefined) connectionUrl = url;
        if (lastError !== undefined) connectionLastError = lastError;
        statusIndicator.classList.remove('connected', 'disconnected', 'connecting');

        if (status === 'connected') {
            statusIndicator.classList.add('connected');
            const modeLabel = connectionMode === 'cli' ? 'CLI' : 'WebSocket';
            statusIndicator.title = 'Gateway connected (' + modeLabel + ')';
        } else if (status === 'connecting') {
            statusIndicator.classList.add('connecting');
            statusIndicator.title = 'Connecting to Gateway...';
        } else {
            statusIndicator.classList.add('disconnected');
            statusIndicator.title = 'Gateway disconnected - click for details';
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
     * 是否可以执行刷新
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
        isRefreshing = true;
        updateRefreshButtonDisabled();
        setRefreshButtonState(true);

        try {
            // 记录刷新前的滚动位置（自动刷新时保持位置）
            window._refreshScrollState = {
                wasAtBottom: isScrolledToBottom(),
                scrollTop: messagesContainer.scrollTop
            };
            // 请求后端刷新
            vscode.postMessage({ type: 'refresh' });
        } catch (err) {
            console.error('Refresh failed:', err);
            chatLoading = false;
            isRefreshing = false;
            updateRefreshButtonDisabled();
        }
    }

    /**
     * 自动刷新：setInterval 固定间隔
     * 等待 AI 回复时用 autoRefreshInterval（2s）
     * 空闲时用 idleRefreshInterval（5s）捕获后台任务回复
     */
    function startAutoRefresh(interval) {
        stopAutoRefresh();
        autoRefreshInterval = interval;
        if (interval <= 0) return;

        autoRefreshTimer = setInterval(() => {
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

        // 1. User stopped
        if (context === 'user_stop' ||
            (errorStr.includes('exited with code 1') && context === 'stop')) {
            return {
                type: 'system',
                icon: '⏹️',
                color: 'gray',
                text: 'Generation stopped',
                autoHide: true
            };
        }

        // 2. Connection refused
        if (errorStr.includes('ECONNREFUSED') || errorStr.includes('connect ECONNREFUSED')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `Cannot connect to Gateway

Possible causes:
• Gateway is not running
• Port 18789 is in use

Run:
openclaw gateway start`
            };
        }

        // 3. Timeout
        if (errorStr.includes('ETIMEDOUT') || errorStr.includes('timeout') ||
            errorStr.includes('timed out')) {
            return {
                type: 'warning',
                icon: '⚠️',
                color: 'yellow',
                text: `Request timed out

The network is too slow. Please:
• Check your network connection
• Try again later`
            };
        }

        // 3.5 Auth failure (401 Unauthorized, etc.)
        if (errorStr.includes('401') ||
            errorStr.includes('Unauthorized') ||
            errorStr.includes('invalid_api_key') ||
            errorStr.includes('authentication')) {
            return {
                type: 'error',
                icon: '🔑',
                color: 'red',
                text: `API authentication failed

Please check:
• API key is correctly configured
• API key has not expired
• Provider settings in openclaw.yaml`
            };
        }

        // 3.6 Insufficient quota / balance
        if (errorStr.includes('insufficient_quota') ||
            errorStr.includes('billing') ||
            errorStr.includes('balance') ||
            (errorStr.includes('quota') && !errorStr.includes('context'))) {
            return {
                type: 'warning',
                icon: '💰',
                color: 'yellow',
                text: `Insufficient API balance

Please:
• Top up your API account balance
• Or switch to a different model/provider`
            };
        }

        // 4. WebSocket connection error
        if (errorStr.includes('WebSocket') && errorStr.includes('connect')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `WebSocket connection failed

Possible causes:
• Gateway version is too old
• Firewall is blocking the connection

Try:
• Upgrade OpenClaw: npm update -g openclaw
• Check firewall settings`
            };
        }

        // 5. Token / context length exceeded
        if (errorStr.includes('context_length') ||
            errorStr.includes('context length') ||
            errorStr.includes('maximum context') ||
            errorStr.includes('token limit') ||
            errorStr.includes('max_tokens') ||
            errorStr.includes('quota exceeded') ||
            errorStr.includes('insufficient tokens') ||
            (errorStr.includes('too long') && errorStr.includes('context'))) {
            return {
                type: 'tip',
                icon: '💡',
                color: 'yellow',
                text: `Context is too long — model limit exceeded

Try:
1. Start a new session
2. Or switch to a model with a larger context window`
            };
        }

        // 6. Model unavailable
        if (errorStr.includes('model not available') ||
            errorStr.includes('model unavailable') ||
            errorStr.includes('model_not_found') ||
            errorStr.includes('model not found') ||
            errorStr.includes('does not exist')) {
            const modelMatch = errorStr.match(/model[:\s]+([a-z0-9-]+)/i);
            const modelName = modelMatch ? modelMatch[1] : 'The selected model';

            return {
                type: 'tip',
                icon: '💡',
                color: 'yellow',
                text: `${modelName} is temporarily unavailable

Possible causes:
• Server is under high load
• Model is under maintenance

Suggestion: switch to another model (e.g. gpt-4o-mini)`
            };
        }

        // 7. Rate limit (429)
        if (errorStr.includes('rate limit') ||
            errorStr.includes('rate_limit') ||
            errorStr.includes('too many requests') ||
            errorStr.match(/\b429\b/)) {
            return {
                type: 'warning',
                icon: '⚠️',
                color: 'yellow',
                text: `Too many requests

Rate limit reached. Please:
• Wait 30 seconds and try again
• Or switch to a different model`
            };
        }

        // 8. Command not found
        if (errorStr.includes('command not found') ||
            errorStr.includes('not recognized')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `OpenClaw CLI not found

Install it with:
npm install -g openclaw

Or configure the openclaw path in VSCode settings:
Settings → OpenClaw → OpenClaw Path`
            };
        }

        // 9. Permission error
        if (errorStr.includes('EACCES') ||
            errorStr.includes('permission denied')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `Permission denied

Cannot access file or execute command. Please:
• Check file permissions
• On macOS/Linux: sudo npm install -g openclaw
• On Windows: run as Administrator`
            };
        }

        // 10. DNS / network error
        if (errorStr.includes('ENOTFOUND')) {
            return {
                type: 'error',
                icon: '❌',
                color: 'red',
                text: `Network error

Cannot resolve server address. Please:
• Check your network connection
• Check Gateway URL (Settings → OpenClaw → Gateway URL)`
            };
        }

        // 11. Unknown error
        const shortError = errorStr.length > 100 ?
            errorStr.substring(0, 100) + '...' : errorStr;

        return {
            type: 'error',
            icon: '❌',
            color: 'red',
            text: `An error occurred

${shortError}

Try:
• Refresh and retry
• View OpenClaw logs: openclaw logs`
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

        if (isBusy()) {
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
            fullMessage = `[Referenced files - please read with the read tool before processing]\n${allRefs.join('\n')}\n\n${fullMessage}`;
        }

        for (const img of images) {
            if (img.path) {
                fullMessage += `\n\n[Image: ${img.path}]`;
            }
        }

        // ── Group mode: validate @mention BEFORE showing message ────────────
        if (groupMode && groupAgents.length > 0) {
            // Deduplicate @mentions: remove duplicate @AgentName occurrences (keep first)
            const seenMentions = new Set();
            for (const agent of groupAgents) {
                const mentionName = '@' + (agent.name || agent.agentId);
                // Match all occurrences, keep the first, remove subsequent duplicates
                let firstFound = false;
                const mentionRegex = new RegExp(
                    mentionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    'gi'
                );
                fullMessage = fullMessage.replace(mentionRegex, (match) => {
                    if (!firstFound) {
                        firstFound = true;
                        return match; // keep first occurrence
                    }
                    return ''; // remove duplicate
                });
                // Also update display text
                let firstFoundText = false;
                text = text.replace(mentionRegex, (match) => {
                    if (!firstFoundText) {
                        firstFoundText = true;
                        return match;
                    }
                    return '';
                });
            }
            // Clean up any double spaces from removal
            fullMessage = fullMessage.replace(/  +/g, ' ').trim();
            text = text.replace(/  +/g, ' ').trim();

            const hasMention = groupAgents.some(a =>
                fullMessage.includes('@' + (a.name || a.agentId))
            );

            // Auto-prepend @lastAgent for confirm/execute commands in plan mode.
            // Uses getLastActiveAgent() so if the last responder left the group,
            // it automatically falls back to the next most-recent active member.
            if (!hasMention && planMode) {
                const confirmCommands = ['execute', 'go', 'yes', 'ok', 'y', 'run',
                    'ดำเนินการ', 'ยืนยัน', 'เริ่ม', '执行', '继续', '确认', '开始'];
                const trimmedInput = text.trim().toLowerCase();
                const isConfirm = confirmCommands.some(cmd => trimmedInput === cmd);
                if (isConfirm) {
                    const lastAgent = getLastActiveAgent();
                    if (lastAgent) {
                        const mention = '@' + (lastAgent.name || lastAgent.agentId);
                        fullMessage = mention + ' ' + fullMessage;
                        // Update display text too
                        text = mention + ' ' + text;
                    }
                }
            }

            const hasMentionFinal = groupAgents.some(a =>
                fullMessage.includes('@' + (a.name || a.agentId))
            );
            if (!hasMentionFinal) {
                showGroupWarningToast(i18n.groupMentionRequired ||
                    '⚠️ Please @mention at least one agent (e.g. @AgentName your request).');
                // Do NOT clear the input — let user add a mention and retry
                return;
            }

            // Valid mention — show user message then send
            addMessage('user', text || '[attachment]', atts.length > 0 ? [...atts] : null);

            if (atts === attachments) {
                messageInput.value = '';
                messageInput.style.height = 'auto';
                attachments = [];
                updateAttachments();
            }
            hideMentionPicker();

            isSending = true;
            updateSendButtonState();

            // Show thinking indicator immediately for mentioned agents (don't wait for round-trip)
            {
                const mentionedAgents = groupAgents.filter(a =>
                    fullMessage.includes('@' + (a.name || a.agentId)) ||
                    fullMessage.includes('@' + a.agentId)
                );
                if (mentionedAgents.length > 0) {
                    // First agent → thinking dots, rest → queued
                    showAgentThinking(mentionedAgents[0].agentId);
                    groupWaitingIds = new Set(mentionedAgents.map(a => a.agentId));
                    groupQueuedIds = mentionedAgents.slice(1).map(a => a.agentId);
                    for (const qId of groupQueuedIds) {
                        showAgentQueued(qId);
                    }
                }
            }

            vscode.postMessage({ type: 'sendGroupMessage', content: fullMessage, planMode: planMode });
            return;
        }

        // ── Normal single-agent mode ──────────────────────────────────────────
        // Show user message with attachments
        addMessage('user', text || '[attachment]', atts.length > 0 ? [...atts] : null);

        // Clear input if called from sendMessage (not from queue)
        if (atts === attachments) {
            messageInput.value = '';
            messageInput.style.height = 'auto';
            attachments = [];
            updateAttachments();
        }
        hideMentionPicker();

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

    // Track the cursor position where / was typed
    let slashTriggerPos = -1;

    function selectSlashItem(type, name) {
        hideSlashPicker();

        // Replace the / at trigger position, keep surrounding text
        const val = messageInput.value;
        const before = slashTriggerPos >= 0 ? val.substring(0, slashTriggerPos) : '';
        const after = slashTriggerPos >= 0 ? val.substring(slashTriggerPos + 1) : '';

        if (type === 'command') {
            // Execute command immediately, remove the /
            messageInput.value = (before + after).trim();
            vscode.postMessage({ type: 'executeCommand', command: name });
        } else if (type === 'skill') {
            // Insert /skillname at trigger position
            messageInput.value = before + `/${name} ` + after;
            messageInput.focus();
            // Set cursor after inserted text
            const cursorPos = before.length + name.length + 2;
            messageInput.setSelectionRange(cursorPos, cursorPos);
        } else if (type === 'workflow') {
            // Insert /.workflowname at trigger position
            messageInput.value = before + `/.${name} ` + after;
            messageInput.focus();
            const cursorPos = before.length + name.length + 3;
            messageInput.setSelectionRange(cursorPos, cursorPos);
        }
        autoResize();
        updateSendButtonState();
        slashTriggerPos = -1;
    }

    // Slash picker event listeners
    slashPickerOverlay.addEventListener('click', (e) => {
        if (e.target === slashPickerOverlay) {
            hideSlashPicker();
            messageInput.focus();
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
            messageInput.focus();
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
        // @ and / detection disabled - send as plain text
        // if (e.data === '@') {
        //     vscode.postMessage({ type: 'getFiles' });
        // }
        // // Show slash picker when typing /
        // if (e.data === '/') {
        //     // Record the position of / (cursor is now after /)
        //     slashTriggerPos = (messageInput.selectionStart || 1) - 1;
        //     showSlashPicker();
        // }
    });

    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            // ลด IME check: เฉพาะ isComposing=true จริง ๆ (keyCode 229 ถูกลบออก เพราะอาจ block Thai input)
            if (e.isComposing) {
                return;
            }

            // ถ้า dropdown/picker เปิดอยู่ ให้ปิดก่อนแล้วไม่ส่งข้อความ
            if (openDropdownId) {
                e.preventDefault();
                closeAllDropdowns();
                return;
            }
            // ถ้า mention picker เปิดอยู่ → block Enter ไม่ให้ส่ง (บังคับเลือกจาก dropdown)
            if (mentionPickerEl.style.display !== 'none') {
                e.preventDefault();
                // ไม่ hide picker เพื่อให้ user ยังเห็นและเลือกได้
                return;
            }
            // ถ้า slash picker เปิดอยู่ ให้ปิดก่อนแล้วไม่ส่ง
            if (slashPickerOverlay.classList.contains('show')) {
                e.preventDefault();
                hideSlashPicker();
                return;
            }

            e.preventDefault();

            const text = messageInput.value.trim();

            // 输入框为空
            if (!text && attachments.length === 0) {
                // Plan mode: ถ้ามีประวัติข้อความแล้ว กด enter = ส่ง "execute"
                if (planMode && messages && messages.children && messages.children.length > 0) {
                    // Group mode: auto-tag last active responding agent (with fallback)
                    if (groupMode) {
                        const lastAgent = getLastActiveAgent();
                        const mention = lastAgent ? '@' + (lastAgent.name || lastAgent.agentId) : null;
                        messageInput.value = mention ? mention + ' execute' : 'execute';
                    } else {
                        messageInput.value = 'execute';
                    }
                    sendMessage();
                    return;
                }
                // ถ้าไม่ใช่กรณี above ไม่ทำอะไร
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

    // Send/stop button
    sendBtn.addEventListener('click', () => {
        if (isBusy()) {
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

    // ========== Custom Dropdowns ==========

    let openDropdownId = null; // 当前打开的 dropdown id

    function closeAllDropdowns() {
        document.querySelectorAll('.dropdown-popup.open').forEach(p => p.classList.remove('open'));
        openDropdownId = null;
    }

    function toggleDropdown(id) {
        const popup = document.getElementById(id + 'Popup');
        if (!popup) return;
        if (openDropdownId === id) {
            closeAllDropdowns();
        } else {
            closeAllDropdowns();
            popup.classList.add('open');
            openDropdownId = id;
        }
    }

    // 点击外部关闭
    document.addEventListener('click', (e) => {
        if (openDropdownId && !e.target.closest('.toolbar-dropdown')) {
            closeAllDropdowns();
        }
    });

    // --- Mode dropdown ---
    modeTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('mode');
    });

    function renderModeDropdown() {
        modeTitle.textContent = i18n['dropdown.mode'];
        modeLabel.textContent = planMode ? i18n.planMode : i18n.executeMode;
        const options = [
            { value: 'execute', label: i18n.executeMode },
            { value: 'plan', label: i18n.planMode }
        ];
        const currentValue = planMode ? 'plan' : 'execute';
        modeOptionsEl.innerHTML = options.map(opt =>
            `<div class="dropdown-option${opt.value === currentValue ? ' active' : ''}" data-value="${opt.value}">
                <span>${escapeHtml(opt.label)}</span>
                <span class="check">✓</span>
            </div>`
        ).join('');
    }

    modeOptionsEl.addEventListener('click', (e) => {
        const option = e.target.closest('.dropdown-option');
        if (!option) return;
        const value = option.dataset.value;
        planMode = value === 'plan';
        vscode.postMessage({ type: 'setPlanMode', enabled: planMode });
        renderModeDropdown();
        closeAllDropdowns();
    });

    // --- Model dropdown ---
    modelTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('model');
    });

    function renderModelDropdown() {
        modelTitle.textContent = i18n['dropdown.model'];
        if (!window._modelData || window._modelData.length === 0) {
            modelLabel.textContent = i18n.defaultModel;
            modelOptionsEl.innerHTML = '';
            return;
        }
        const current = currentSessionModel || window._modelData.find(m => m.selected)?.id || '';
        const currentModel = window._modelData.find(m => m.id === current);
        modelLabel.textContent = currentModel ? currentModel.shortName : i18n.defaultModel;
        modelLabel.title = currentModel ? currentModel.fullName : '';

        modelOptionsEl.innerHTML = window._modelData.map(m =>
            `<div class="dropdown-option${m.id === current ? ' active' : ''}" data-value="${escapeHtml(m.id)}" title="${escapeHtml(m.fullName)}">
                <span>${escapeHtml(m.fullName)}</span>
                <span class="check">✓</span>
            </div>`
        ).join('');
    }

    modelOptionsEl.addEventListener('click', (e) => {
        const option = e.target.closest('.dropdown-option');
        if (!option) return;
        const newModel = option.dataset.value;

        currentSessionModel = newModel;
        if (window._modelData) {
            window._modelData.forEach(m => m.selected = m.id === newModel);
        }

        vscode.postMessage({ type: 'setModel', model: newModel });

        // 模型切换后，thinking 重置为 minimal
        currentThinkLevel = 'minimal';
        vscode.postMessage({ type: 'setThinking', level: 'minimal' });

        renderDropdowns();
        closeAllDropdowns();
    });

    // --- Think dropdown ---
    thinkTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('think');
    });

    function getThinkLevels() {
        const levels = ['off', 'minimal', 'low', 'medium', 'high'];
        const model = (currentSessionModel || '').toLowerCase();
        if (XHIGH_MODELS.some(m => m.toLowerCase() === model)) {
            levels.push('xhigh');
        }
        return levels;
    }

    function renderThinkDropdown() {
        thinkTitle.textContent = i18n['dropdown.think'];
        thinkLabel.textContent = i18n[`think.${currentThinkLevel}`] || currentThinkLevel;

        const levels = getThinkLevels();
        thinkOptionsEl.innerHTML = levels.map(level => {
            const label = i18n[`think.${level}`] || level;
            return `<div class="dropdown-option${level === currentThinkLevel ? ' active' : ''}" data-value="${level}">
                <span>${escapeHtml(label)}</span>
                <span class="check">✓</span>
            </div>`;
        }).join('');
    }

    thinkOptionsEl.addEventListener('click', (e) => {
        const option = e.target.closest('.dropdown-option');
        if (!option) return;
        const newLevel = option.dataset.value;
        currentThinkLevel = newLevel;
        vscode.postMessage({ type: 'setThinking', level: newLevel });
        renderThinkDropdown();
        closeAllDropdowns();
    });

    // --- Render all dropdowns ---
    function renderDropdowns() {
        renderModeDropdown();
        renderModelDropdown();
        renderThinkDropdown();
    }

    // 初始化
    renderDropdowns();

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

    // Global interceptor: open external links in default browser
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a[href]');
        if (anchor) {
            const href = anchor.getAttribute('href');
            if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
                e.preventDefault();
                e.stopPropagation();
                vscode.postMessage({ type: 'openUrl', url: href });
            }
        }
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
                addMessage(message.role, message.content, null, false, null, message.role === 'assistant');
                break;

            case 'addToolCall':
                addToolCards([{ name: message.name, args: message.args }]);
                break;

            case 'addToolCalls':
                if (message.toolCalls && message.toolCalls.length > 0) {
                    addToolCards(message.toolCalls);
                }
                break;

            case 'showThinking':
                showThinking();
                break;

            case 'hideThinking':
                hideThinking();
                break;

            case 'sendingStarted':
                // 正在发送 RPC
                isSending = true;
                updateSendButtonState();
                break;

            case 'waitingReply':
                // RPC 已发送，等待 AI 回复（chatRunId 追踪状态）
                isSending = false;
                chatRunId = message.runId || true;
                updateSendButtonState();
                startAutoRefresh(autoRefreshInterval);
                break;

            case 'sendingComplete':
                // AI 回复完成（收到 chat final 事件）
                isSending = false;
                chatRunId = null;
                // 切换到空闲刷新（5s），捕获后台任务回复
                startAutoRefresh(idleRefreshInterval);
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
                    // 计算内容指纹，跳过无变化的重建（避免自动刷新闪烁）
                    // Use content substring (first 100 chars) for more reliable change detection
                    const hash = message.messages.map(m =>
                        `${m.role}:${(m.content || '').substring(0, 100)}:${(m.toolCalls || []).length}:${(m.thinking || '').length}`
                    ).join('|');
                    if (hash === lastHistoryHash) {
                        // 内容没变，跳过重建
                        break;
                    }
                    lastHistoryHash = hash;

                    // 获取刷新前的滚动状态
                    const scrollState = window._refreshScrollState || { wasAtBottom: true };
                    window._refreshScrollState = null;

                    messages.innerHTML = '';
                    let prevRole = '';
                    message.messages.forEach(msg => {
                        // 先渲染工具调用卡片（在文本之前），跳过自动滚动
                        if (msg.toolCalls && msg.toolCalls.length > 0) {
                            addToolCards(msg.toolCalls, true);
                        }
                        // 再渲染文本内容，跳过自动滚动，传入 thinking
                        if (msg.content) {
                            // 分组头像：assistant 消息组的第一条显示头像
                            const isNewGroup = msg.role !== prevRole;
                            const showAvatar = msg.role === 'assistant' && isNewGroup;
                            addMessage(msg.role, msg.content, null, true, msg.thinking, showAvatar);
                            prevRole = msg.role;
                        }
                    });

                    // 如果仍处于忙碌状态，重新显示 thinking indicator
                    if (isBusy()) {
                        showThinking();
                    }

                    // 批量渲染完成后，只有之前在底部才滚动
                    requestAnimationFrame(() => {
                        if (scrollState.wasAtBottom) {
                            scrollToBottom();
                        }
                    });
                }
                break;

            case 'updateModels':
                window._modelData = message.models.map(m => ({
                    id: m.id,
                    fullName: m.name,
                    shortName: m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id,
                    selected: currentSessionModel ? (m.id === currentSessionModel) : m.selected
                }));

                if (!currentSessionModel) {
                    const defaultModel = window._modelData.find(m => m.selected);
                    if (defaultModel) {
                        currentSessionModel = defaultModel.id;
                    }
                }

                renderDropdowns();
                break;

            case 'updateThinking':
                currentThinkLevel = message.level || 'minimal';
                renderThinkDropdown();
                break;

            case 'updatePlanMode':
                planMode = message.enabled;
                renderModeDropdown();
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
                // 连接状态更新（附带 mode/url/lastError）
                updateConnectionStatus(message.status, message.mode, message.url, message.lastError);
                break;

            case 'autoRefreshInterval':
                // 保存配置的刷新间隔（等待回复时使用）
                autoRefreshInterval = message.interval;
                // 当前空闲则用空闲间隔启动
                if (!chatRunId) {
                    startAutoRefresh(idleRefreshInterval);
                } else {
                    startAutoRefresh(autoRefreshInterval);
                }
                break;

            case 'assistantIdentity':
                // AI 头像和名称
                assistantName = message.name || '';
                assistantAvatar = message.avatar || '';
                break;

            case 'systemNotification':
                showSystemNotification(message.message, message.timeout);
                break;

            case 'refreshComplete':
                // 刷新完成
                chatLoading = false;
                isRefreshing = false;
                setRefreshButtonState(false);
                updateRefreshButtonDisabled();
                break;

            // ── Group Chat Messages ───────────────────────────────────────────
            case 'groupMessage':
                renderGroupMessage(message);
                // Track reply completion for any agent message (including empty/error cases).
                // Always delete the agentId so the waiting set doesn't get stuck.
                if (message.role === 'agent') {
                    // Track last responding agent for auto-@mention on plan-mode execute.
                    // Push to front of history (newest first); avoid duplicates.
                    if (message.content && message.agentId) {
                        respondedAgentHistory = [
                            message.agentId,
                            ...respondedAgentHistory.filter(id => id !== message.agentId)
                        ].slice(0, 20); // cap at 20 entries
                    }
                    groupWaitingIds.delete(message.agentId);
                    if (groupWaitingIds.size === 0) {
                        isSending = false;
                        updateSendButtonState();
                    }
                }
                break;

            case 'groupStateUpdate':
                updateGroupMemberBar(message.agents || []);
                if (!groupMode) {
                    // Restore normal placeholder
                    messageInput.placeholder = i18n.sendPlaceholder || 'Ask a question...';
                    isSending = false;
                    updateSendButtonState();
                    // Clear group dedup cache when leaving group mode
                    renderedGroupMessages.clear();
                }
                break;

            case 'waitingGroupReply':
                // Chain mode: first agent = thinking, rest = queued status
                {
                    const agentIds = message.agentIds || [];
                    groupWaitingIds = new Set(agentIds);
                    if (agentIds.length > 0) {
                        // First agent: active thinking indicator
                        showAgentThinking(agentIds[0]);
                        // Remaining agents: queued indicators (ordered)
                        groupQueuedIds = agentIds.slice(1);
                        for (const agentId of groupQueuedIds) {
                            showAgentQueued(agentId);
                        }
                    }
                }
                isSending = true;
                updateSendButtonState();
                break;

            case 'chainProgress':
                // Chain advanced: new current agent + updated queue
                {
                    const { current, queued } = message;
                    // Remove queued indicator for the agent that just became active
                    removeAgentQueued(current);
                    // Show thinking for the now-active agent
                    showAgentThinking(current);
                    // Update queued list (remove any that are no longer queued)
                    const newQueuedSet = new Set(queued || []);
                    for (const oldId of groupQueuedIds) {
                        if (!newQueuedSet.has(oldId)) {
                            removeAgentQueued(oldId);
                        }
                    }
                    groupQueuedIds = queued || [];
                }
                break;

            case 'groupLoopWarning':
                // Clear all agent thinking + queued indicators
                for (const agentId of groupWaitingIds) {
                    removeAgentThinking(agentId);
                }
                for (const agentId of groupQueuedIds) {
                    removeAgentQueued(agentId);
                }
                groupWaitingIds.clear();
                groupQueuedIds = [];
                isSending = false;
                updateSendButtonState();
                showGroupWarningToast(i18n.groupLoopWarning || '⚠️ Loop guard triggered.');
                break;

            case 'loopModeToggled':
                loopModeEnabled = !!message.enabled;
                updateLoopModeBtn();
                break;

            case 'autoLoopMessage':
                // Auto-loop triggered — do NOT display user bubble (system already routing).
                // Just update UI state for thinking indicators.
                {
                    const autoContent = message.content || '';
                    if (autoContent) {
                        // Show thinking indicator immediately for mentioned agents
                        const mentionedAgents = groupAgents.filter(a =>
                            autoContent.includes('@' + (a.name || a.agentId)) ||
                            autoContent.includes('@' + a.agentId)
                        );
                        if (mentionedAgents.length > 0) {
                            showAgentThinking(mentionedAgents[0].agentId);
                            groupWaitingIds = new Set(mentionedAgents.map(a => a.agentId));
                            groupQueuedIds = mentionedAgents.slice(1).map(a => a.agentId);
                            for (const qId of groupQueuedIds) {
                                showAgentQueued(qId);
                            }
                            isSending = true;
                            updateSendButtonState();
                        }
                    }
                }
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

function showSystemNotification(text, timeout) {
    const notif = document.createElement('div');
    notif.className = 'system-notification';
    notif.textContent = text;
    document.body.appendChild(notif);

    // Trigger reflow
    void notif.offsetHeight;
    notif.classList.add('show');

    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, timeout || 2000);
}

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
