// VSCode API
const vscode = acquireVsCodeApi();

// 状态
let roles = [
    // 默认角色列表（兜底）
    {
        id: 'fullstack',
        name: '全栈开发',
        description: '前后端通吃，代码质量与架构设计并重',
        icon: '🌐',
        template: '我是一名全栈开发专家，精通前端（React/Vue/Angular）和后端（Node.js/Python/Java）技术栈。我注重代码质量、系统架构设计，能够独立完成从需求分析到部署上线的全流程开发。'
    },
    {
        id: 'frontend',
        name: '前端专家',
        description: 'React/Vue/Angular，性能优化，用户体验',
        icon: '⚛️',
        template: '我是一名前端开发专家，精通现代前端框架（React/Vue/Angular），擅长性能优化、响应式设计和用户体验提升。我关注代码可维护性和最佳实践。'
    },
    {
        id: 'backend',
        name: '后端专家',
        description: 'API 设计，数据库优化，微服务架构',
        icon: '🔧',
        template: '我是一名后端开发专家，精通服务端开发、API 设计、数据库优化和微服务架构。我注重系统性能、安全性和可扩展性。'
    },
    {
        id: 'devops',
        name: 'DevOps 工程师',
        description: 'CI/CD，容器化，云原生',
        icon: '🚀',
        template: '我是一名 DevOps 工程师，精通 CI/CD、容器化（Docker/Kubernetes）、云原生技术和基础设施即代码。我致力于提升开发效率和系统稳定性。'
    },
    {
        id: 'tester',
        name: '测试工程师',
        description: '单元测试，集成测试，自动化测试',
        icon: '🧪',
        template: '我是一名测试工程师，精通单元测试、集成测试、端到端测试和自动化测试。我注重代码质量和测试覆盖率，确保软件的可靠性。'
    },
    {
        id: 'architect',
        name: '架构师',
        description: '系统设计，技术选型，可扩展性',
        icon: '🏗️',
        template: '我是一名系统架构师，精通系统设计、技术选型、性能优化和可扩展性设计。我从全局视角把控技术方向，确保系统的长期演进能力。'
    },
    {
        id: 'custom',
        name: '自定义角色',
        description: '自己定义角色和描述',
        icon: '✏️',
        template: ''
    }
];
let existingAgents = [];
let selectedRole = null;
let idCheckTimeout = null;
let isIdValid = false;
let isCreating = false;

// DOM 元素
const agentIdInput = document.getElementById('agentId');
const agentNameInput = document.getElementById('agentName');
const agentEmojiInput = document.getElementById('agentEmoji');
const agentDescriptionInput = document.getElementById('agentDescription');
const customRoleGroup = document.getElementById('customRoleGroup');
const customRoleNameInput = document.getElementById('customRoleName');
const idValidation = document.getElementById('idValidation');
const rolesGrid = document.getElementById('rolesGrid');
const createBtn = document.getElementById('createBtn');
const cancelBtn = document.getElementById('cancelBtn');

// 预览元素
const previewEmoji = document.getElementById('previewEmoji');
const previewName = document.getElementById('previewName');
const previewId = document.getElementById('previewId');
const previewRole = document.getElementById('previewRole');

// 初始化
function init() {
    console.log('[CreateAgent] Initializing...');
    
    // 请求初始化数据
    vscode.postMessage({ type: 'requestInitData' });
    console.log('[CreateAgent] Sent requestInitData message');

    // 绑定事件
    agentIdInput.addEventListener('input', handleIdInput);
    agentNameInput.addEventListener('input', updatePreview);
    agentEmojiInput.addEventListener('input', updatePreview);
    customRoleNameInput.addEventListener('input', updatePreview);
    createBtn.addEventListener('click', handleCreate);
    cancelBtn.addEventListener('click', handleCancel);

    // 初始化预览
    updatePreview();
    
    // 显示加载提示
    renderRoles();
}

// 处理 ID 输入
function handleIdInput() {
    const id = agentIdInput.value.trim();

    // 清除之前的定时器
    if (idCheckTimeout) {
        clearTimeout(idCheckTimeout);
    }

    // 如果 ID 为空
    if (!id) {
        idValidation.style.display = 'none';
        isIdValid = false;
        updateCreateButton();
        updatePreview();
        return;
    }

    // 验证 ID 格式（小写字母、数字、连字符）
    const idPattern = /^[a-z0-9-]+$/;
    if (!idPattern.test(id)) {
        showIdValidation('error', '❌ ID 只能包含小写字母、数字和连字符');
        isIdValid = false;
        updateCreateButton();
        updatePreview();
        return;
    }

    // 显示检查中状态
    showIdValidation('checking', '⏳ 检查中...');
    isIdValid = false;
    updateCreateButton();

    // 防抖：300ms 后检查 ID 是否存在
    idCheckTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'checkAgentId',
            id: id
        });
    }, 300);

    updatePreview();
}

// 显示 ID 验证消息
function showIdValidation(type, message) {
    idValidation.className = `validation-message ${type}`;
    idValidation.textContent = message;
    idValidation.style.display = 'flex';
}

// 渲染角色卡片
function renderRoles() {
    console.log('[CreateAgent] renderRoles called, roles count:', roles.length);
    rolesGrid.innerHTML = '';

    roles.forEach(role => {
        const card = document.createElement('div');
        card.className = 'role-card';
        card.dataset.roleId = role.id;

        card.innerHTML = `
            <div class="icon">${role.icon}</div>
            <div class="name">${role.name}</div>
            <div class="description">${role.description}</div>
        `;

        card.addEventListener('click', () => {
            selectRole(role);
        });

        rolesGrid.appendChild(card);
    });
    
    console.log('[CreateAgent] Rendered', roles.length, 'role cards');
}

// 选择角色
function selectRole(role) {
    selectedRole = role;

    // 更新卡片选中状态
    document.querySelectorAll('.role-card').forEach(card => {
        if (card.dataset.roleId === role.id) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    });

    // 如果选择了"自定义角色"，显示自定义角色名称输入框
    if (role.id === 'custom') {
        customRoleGroup.style.display = 'block';
        customRoleNameInput.focus();
    } else {
        customRoleGroup.style.display = 'none';
        customRoleNameInput.value = '';
    }

    // 填充角色描述模板
    if (role.template) {
        agentDescriptionInput.value = role.template;
    } else {
        agentDescriptionInput.value = '';
    }

    // 更新预览和按钮状态
    updatePreview();
    updateCreateButton();
}

// 更新预览
function updatePreview() {
    const id = agentIdInput.value.trim() || 'agent-id';
    const name = agentNameInput.value.trim() || 'Agent 名称';
    const emoji = agentEmojiInput.value.trim() || '🤖';
    
    let roleName = '未选择';
    if (selectedRole) {
        if (selectedRole.id === 'custom') {
            const customName = customRoleNameInput.value.trim();
            roleName = customName || '自定义角色';
        } else {
            roleName = selectedRole.name;
        }
    }

    previewEmoji.textContent = emoji;
    previewName.textContent = name;
    previewId.textContent = `ID: ${id}`;
    previewRole.textContent = `角色: ${roleName}`;
}

// 更新创建按钮状态
function updateCreateButton() {
    const id = agentIdInput.value.trim();
    const name = agentNameInput.value.trim();
    const emoji = agentEmojiInput.value.trim();
    const description = agentDescriptionInput.value.trim();

    // 检查所有必填字段（emoji 可选，默认使用 🤖）
    let allFieldsFilled = id && name && selectedRole && description;
    
    // 如果选择了自定义角色，还需要检查自定义角色名称
    if (selectedRole && selectedRole.id === 'custom') {
        const customName = customRoleNameInput.value.trim();
        allFieldsFilled = allFieldsFilled && customName;
    }

    const canCreate = allFieldsFilled && isIdValid && !isCreating;

    createBtn.disabled = !canCreate;
}

// 处理创建
function handleCreate() {
    if (createBtn.disabled || isCreating) {
        return;
    }

    // 确定最终的角色值
    let finalRole = selectedRole.id;
    let finalDescription = agentDescriptionInput.value.trim();
    
    // 如果是自定义角色，使用 fullstack 作为基础模板，但在描述中添加自定义角色信息
    if (selectedRole.id === 'custom') {
        const customRoleName = customRoleNameInput.value.trim();
        finalRole = 'fullstack'; // 使用 fullstack 作为基础
        finalDescription = `角色：${customRoleName}\n\n${finalDescription}`;
    }

    // Emoji 如果为空，使用默认值 🤖
    const emoji = agentEmojiInput.value.trim() || '🤖';

    const config = {
        id: agentIdInput.value.trim(),
        name: agentNameInput.value.trim(),
        emoji: emoji,
        role: finalRole,
        description: finalDescription
    };

    // 设置创建中状态
    isCreating = true;
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="loading"></span> 创建中...';

    // 发送创建消息
    vscode.postMessage({
        type: 'createAgent',
        config: config
    });
}

// 处理取消
function handleCancel() {
    vscode.postMessage({ type: 'cancelCreateAgent' });
}

// 处理来自扩展的消息
window.addEventListener('message', event => {
    const message = event.data;

    switch (message.type) {
        case 'initData':
            // 接收初始化数据（如果后端返回了数据，就用后端的，否则用默认的）
            console.log('[CreateAgent] Received initData:', message);
            if (message.roles && message.roles.length > 0) {
                roles = message.roles;
                console.log('[CreateAgent] Using roles from backend, count:', roles.length);
            } else {
                console.log('[CreateAgent] Using default roles, count:', roles.length);
            }
            existingAgents = message.existingAgents || [];
            renderRoles();
            break;

        case 'agentIdCheckResult':
            // 接收 ID 检查结果
            if (message.id === agentIdInput.value.trim()) {
                if (message.exists) {
                    showIdValidation('error', '❌ 该 ID 已存在');
                    isIdValid = false;
                } else {
                    showIdValidation('success', '✓ 可用');
                    isIdValid = true;
                }
                updateCreateButton();
            }
            break;

        case 'createAgentResult':
            // 接收创建结果
            if (message.success) {
                // 创建成功
                createBtn.innerHTML = '✓ 创建成功';
                // 面板会自动关闭
            } else {
                // 创建失败
                isCreating = false;
                createBtn.disabled = false;
                createBtn.textContent = '创建 Agent';
                
                // 显示错误信息
                if (message.error) {
                    showIdValidation('error', `❌ ${message.error}`);
                }
            }
            break;
    }
});

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    // Esc 取消
    if (e.key === 'Escape') {
        handleCancel();
    }
    
    // Enter 创建（当焦点不在 textarea 上时）
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement !== agentDescriptionInput) {
        if (!createBtn.disabled) {
            e.preventDefault();
            handleCreate();
        }
    }
});

// 监听描述输入，更新按钮状态
agentDescriptionInput.addEventListener('input', updateCreateButton);

// 启动
init();
