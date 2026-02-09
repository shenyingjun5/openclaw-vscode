# Diff Preview & Apply Feature Design V2

## 概述

基于 V1 设计的改进版本，重点优化：
1. **多语言支持**（UI 和 AI 输出）
2. **紧凑的 UI 设计**（图标按钮、智能布局）
3. **智能交互**（点击文件名自动预览 diff）

---

## 一、多语言支持方案

### 1.1 语言检测层级

```
优先级：用户设置 > 系统语言 > 默认（英文）

┌─────────────────────────────────────────────────┐
│ VS Code Settings                                │
├─────────────────────────────────────────────────┤
│ openclaw.aiOutputLanguage                       │
│   - "auto" (跟随系统) ✓ 默认                    │
│   - "zh-CN" (简体中文)                          │
│   - "en" (English)                              │
│   - "ja" (日本語)                               │
│   - "ko" (한국어)                               │
│   - ...                                         │
└─────────────────────────────────────────────────┘
```

### 1.2 实现逻辑

```typescript
// src/languageManager.ts

export class LanguageManager {
    private static instance: LanguageManager;
    private currentLocale: string;
    private aiOutputLanguage: string;
    
    private constructor() {
        this.currentLocale = this.detectSystemLocale();
        this.aiOutputLanguage = this.loadAiOutputLanguage();
    }
    
    // 检测系统语言
    private detectSystemLocale(): string {
        const vscodeLang = vscode.env.language; // "zh-cn", "en", etc.
        return this.normalizeLocale(vscodeLang);
    }
    
    // 加载 AI 输出语言设置
    private loadAiOutputLanguage(): string {
        const config = vscode.workspace.getConfiguration('openclaw');
        const setting = config.get<string>('aiOutputLanguage', 'auto');
        
        if (setting === 'auto') {
            return this.currentLocale;
        }
        return setting;
    }
    
    // 获取 UI 语言（用于 webview 本地化）
    getUILocale(): string {
        return this.currentLocale;
    }
    
    // 获取 AI 输出语言（添加到 system prompt）
    getAIOutputLanguage(): string {
        return this.aiOutputLanguage;
    }
    
    // 生成 AI 语言指令
    getLanguageInstruction(): string {
        const lang = this.aiOutputLanguage;
        const langNames = {
            'zh-CN': 'Chinese (Simplified)',
            'en': 'English',
            'ja': 'Japanese',
            'ko': 'Korean'
        };
        
        if (lang === 'en') {
            return ''; // 英文是默认，不需要额外指令
        }
        
        return `Please respond in ${langNames[lang] || lang} unless the user explicitly requests a different language.`;
    }
}
```

### 1.3 System Prompt 集成

```typescript
// src/chatSessionManager.ts

buildMessage(userMessage: string, sessionId: string): MessageBuildResult {
    const langManager = LanguageManager.getInstance();
    const languageInstruction = langManager.getLanguageInstruction();
    
    let systemPrompt = this.baseSystemPrompt;
    
    // 添加语言指令（如果需要）
    if (languageInstruction) {
        systemPrompt += `\n\n${languageInstruction}`;
    }
    
    // ... 其他逻辑
}
```

### 1.4 Webview 国际化

```typescript
// webview/i18n.js

const translations = {
    'en': {
        'diff.title': 'File Changes',
        'diff.files': '{count} file(s)',
        'diff.action.create': 'Create',
        'diff.action.modify': 'Modify',
        'diff.action.delete': 'Delete',
        'diff.status.pending': 'Pending',
        'diff.status.applied': 'Applied',
        'diff.status.skipped': 'Skipped',
        'diff.tooltip.preview': 'Click to preview diff',
        'diff.tooltip.apply': 'Apply changes',
        'diff.tooltip.skip': 'Skip changes',
        'diff.applyAll': 'Apply All',
        'diff.skipAll': 'Skip All'
    },
    'zh-CN': {
        'diff.title': '文件变更',
        'diff.files': '{count} 个文件',
        'diff.action.create': '创建',
        'diff.action.modify': '修改',
        'diff.action.delete': '删除',
        'diff.status.pending': '待处理',
        'diff.status.applied': '已应用',
        'diff.status.skipped': '已跳过',
        'diff.tooltip.preview': '点击预览差异',
        'diff.tooltip.apply': '应用变更',
        'diff.tooltip.skip': '跳过变更',
        'diff.applyAll': '全部应用',
        'diff.skipAll': '全部跳过'
    }
};

function t(key, params = {}) {
    const locale = window.currentLocale || 'en';
    let text = translations[locale]?.[key] || translations['en'][key] || key;
    
    // 参数替换
    Object.keys(params).forEach(k => {
        text = text.replace(`{${k}}`, params[k]);
    });
    
    return text;
}
```

---

## 二、UI 设计优化

### 2.1 紧凑型文件变更卡片

#### 设计原则
- **点击文件名 = 预览 diff**（主要操作）
- **图标按钮**（✓ ✗）节省空间
- **智能省略**：文件名过长时自动省略中间部分
- **响应式布局**：自动适应容器宽度

#### 视觉设计

```
┌─────────────────────────────────────────────────┐
│ 📁 文件变更  3 个文件                      [✓全部] │
├─────────────────────────────────────────────────┤
│ 📝 src/components/Header.tsx (修改)      ✓  ✗   │  ← 正常长度
│ 📝 src/utils/helpers.ts (修改)           ✓  ✗   │
│ ➕ src/config/settings.json (创建)       ✓  ✗   │
├─────────────────────────────────────────────────┤
│ 📝 src/ve...eryLongName.tsx (修改)       ✓  ✗   │  ← 超长文件名
│    ^hover 显示完整路径                           │
└─────────────────────────────────────────────────┘

状态图标：
✓ = 应用此文件
✗ = 跳过此文件

操作类型图标：
📝 = modify
➕ = create
🗑️ = delete

状态指示（应用后）：
✅ = 已应用
⏭️ = 已跳过
```

### 2.2 宽度溢出处理方案

#### 方案 A：智能省略（推荐）

```html
<div class="change-file">
    <!-- 文件名区域：占据剩余空间 -->
    <div class="file-info" title="完整路径">
        <span class="file-icon">📝</span>
        <span class="file-name">src/very/long/path/to/file.tsx</span>
        <span class="file-action">(修改)</span>
    </div>
    
    <!-- 按钮区域：固定宽度 -->
    <div class="file-actions">
        <button class="icon-btn apply" title="应用">✓</button>
        <button class="icon-btn skip" title="跳过">✗</button>
    </div>
</div>
```

```css
.change-file {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    min-height: 32px;
}

.file-info {
    flex: 1;              /* 占据剩余空间 */
    min-width: 0;         /* 允许收缩 */
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;      /* 点击预览 */
}

.file-info:hover {
    background: var(--vscode-list-hoverBackground);
    border-radius: 4px;
}

.file-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;  /* 文字省略 */
    white-space: nowrap;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
}

.file-action {
    flex-shrink: 0;      /* 不收缩 */
    opacity: 0.7;
    font-size: 12px;
}

.file-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;      /* 按钮不收缩 */
}

.icon-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1px solid var(--vscode-button-border);
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.icon-btn.apply:hover {
    background: var(--vscode-button-hoverBackground);
    border-color: var(--vscode-charts-green);
    color: var(--vscode-charts-green);
}

.icon-btn.skip:hover {
    background: var(--vscode-button-hoverBackground);
    border-color: var(--vscode-charts-red);
    color: var(--vscode-charts-red);
}
```

#### 方案 B：两行布局（备选）

当文件名 + 按钮总宽度超过容器时，自动换行：

```
┌─────────────────────────────────────────────────┐
│ 📝 src/very/long/path/to/component/Header.tsx  │
│    (修改)                              ✓  ✗     │
└─────────────────────────────────────────────────┘
```

```css
.change-file {
    display: flex;
    flex-wrap: wrap;     /* 允许换行 */
    gap: 4px;
}

.file-info {
    flex: 1 1 200px;     /* 最小宽度 200px */
    min-width: 200px;
}

.file-actions {
    flex: 0 0 auto;
    margin-left: auto;   /* 靠右 */
}
```

### 2.3 交互流程

```
用户操作                    系统响应
─────────────────────────────────────────────────
1. 点击文件名
   "Header.tsx"          → 打开 VS Code Diff 视图
                           （如果文件已打开，直接切换到 diff）
                           
2. 点击 ✓ 按钮
                        → 应用此文件变更
                        → 图标变为 ✅
                        → 关闭 diff 视图（可选）
                        
3. 点击 ✗ 按钮
                        → 跳过此文件
                        → 图标变为 ⏭️
                        → 从列表中淡出
                        
4. 点击 [✓全部]
                        → 批量应用所有变更
                        → 所有文件变为 ✅
                        → 显示成功提示
```

---

## 三、AI 响应格式规范

### 3.1 结构化变更数据

AI 需要返回符合以下格式的 JSON：

```markdown
我建议进行以下修改：

```changes
{
  "description": "重构 Header 组件，提取工具函数",
  "files": [
    {
      "path": "src/components/Header.tsx",
      "action": "modify",
      "description": "简化组件逻辑，移除内联工具函数",
      "hunks": [
        {
          "startLine": 15,
          "endLine": 25,
          "diff": "- const formatDate = (date) => {...}\n+ import { formatDate } from '../utils/helpers';"
        }
      ]
    },
    {
      "path": "src/utils/helpers.ts",
      "action": "create",
      "content": "export const formatDate = (date: Date): string => {\n  return date.toISOString();\n};"
    }
  ]
}
```
```

### 3.2 数据结构

```typescript
interface ChangeSet {
    description: string;           // 变更描述（多语言）
    files: FileChange[];
}

interface FileChange {
    path: string;                  // 文件路径
    action: 'create' | 'modify' | 'delete';
    description?: string;          // 单文件变更说明（多语言）
    content?: string;              // 完整内容（create）
    hunks?: DiffHunk[];           // 差异块（modify）
}

interface DiffHunk {
    startLine: number;
    endLine: number;
    diff: string;                  // unified diff 格式
}
```

### 3.3 System Prompt 添加

```markdown
When suggesting code changes, always output them in the following JSON format:

```changes
{
  "description": "Brief description of changes",
  "files": [
    {
      "path": "relative/path/to/file.ts",
      "action": "modify|create|delete",
      "description": "What changed in this file",
      "content": "full content for create action",
      "hunks": [
        {
          "startLine": 10,
          "endLine": 15,
          "diff": "unified diff format"
        }
      ]
    }
  ]
}
```

Important:
- Use user's language for "description" fields
- Use relative paths from workspace root
- For "modify" action, provide either "content" or "hunks"
- For "create" action, provide "content"
- For "delete" action, no content needed
```

---

## 四、完整实现方案

### 4.1 架构图

```
┌─────────────────────────────────────────────────────────┐
│                   Extension (TypeScript)                 │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  LanguageManager                                         │
│  ├─ detectSystemLocale()                                │
│  ├─ getUILocale() ────────────┐                         │
│  └─ getAIOutputLanguage() ────┼──→ System Prompt        │
│                                │                         │
│  DiffProvider                  │                         │
│  ├─ registerVirtualDocs()      │                         │
│  ├─ showDiff(file)             │                         │
│  └─ applyChange(file)          │                         │
│                                │                         │
│  ChangeManager                 │                         │
│  ├─ parseChanges(json)         │                         │
│  ├─ trackStatus()              │                         │
│  └─ applyAll()                 │                         │
│                                │                         │
└────────────────────────────────┼─────────────────────────┘
                                 │
                                 │ Locale
                                 ↓
┌─────────────────────────────────────────────────────────┐
│                   Webview (HTML/JS)                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  i18n.js                                                 │
│  └─ t(key, params) ──→ 本地化文本                        │
│                                                          │
│  Change Card Component                                   │
│  ├─ <div class="change-file">                           │
│  │   ├─ <div class="file-info" @click="preview">        │
│  │   │   ├─ 图标 (📝/➕/🗑️)                             │
│  │   │   ├─ 文件名（智能省略）                          │
│  │   │   └─ 操作类型（本地化）                          │
│  │   └─ <div class="file-actions">                      │
│  │       ├─ ✓ 按钮                                       │
│  │       └─ ✗ 按钮                                       │
│  └─ 响应式布局                                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 4.2 文件结构

```
src/
├── languageManager.ts          # 新增：语言管理
├── diffProvider.ts             # 新增：Diff 预览提供者
├── changeManager.ts            # 新增：变更管理
├── changeParser.ts             # 新增：解析 AI 响应
├── chatPanel.ts                # 修改：渲染变更卡片
├── chatProvider.ts             # 修改：渲染变更卡片
├── chatSessionManager.ts       # 修改：添加语言指令
└── extension.ts                # 修改：注册服务

webview/
├── i18n.js                     # 新增：国际化
├── changeCard.js               # 新增：变更卡片组件
├── locales/
│   ├── en.json                 # 修改：添加 diff 相关文本
│   └── zh.json                 # 修改：添加 diff 相关文本
├── styles.css                  # 修改：添加变更卡片样式
└── main.js                     # 修改：处理变更卡片交互

package.json                     # 修改：添加配置项
```

### 4.3 新增配置项

```json
{
  "contributes": {
    "configuration": {
      "properties": {
        "openclaw.aiOutputLanguage": {
          "type": "string",
          "enum": ["auto", "zh-CN", "en", "ja", "ko"],
          "enumDescriptions": [
            "Follow system language",
            "简体中文 (Simplified Chinese)",
            "English",
            "日本語 (Japanese)",
            "한국어 (Korean)"
          ],
          "default": "auto",
          "description": "Language for AI responses"
        }
      }
    }
  }
}
```

---

## 五、实施计划

### Phase 1: 基础设施（3-4h）
- [ ] 创建 `LanguageManager`
- [ ] 创建 `DiffProvider`（虚拟文档）
- [ ] 创建 `ChangeManager`（状态管理）
- [ ] 创建 `ChangeParser`（解析 AI JSON）

### Phase 2: UI 组件（3-4h）
- [ ] 创建 `webview/i18n.js`
- [ ] 创建变更卡片 HTML 模板
- [ ] 实现紧凑型 CSS 布局
- [ ] 实现智能省略逻辑
- [ ] 添加本地化文本

### Phase 3: 交互逻辑（2-3h）
- [ ] 点击文件名 → 预览 diff
- [ ] 点击 ✓ → 应用变更
- [ ] 点击 ✗ → 跳过变更
- [ ] 实现批量应用
- [ ] 状态同步和更新

### Phase 4: 集成测试（2h）
- [ ] 测试多语言切换
- [ ] 测试各种文件名长度
- [ ] 测试响应式布局
- [ ] 测试批量操作
- [ ] 边界情况处理

**总计：10-13 小时**

---

## 六、推荐方案总结

### 最终推荐配置

| 方面 | 方案 | 理由 |
|------|------|------|
| **多语言** | 跟随系统 + 可配置 | 自动化 + 灵活性 |
| **UI 布局** | 方案 A（智能省略） | 紧凑、专业 |
| **交互方式** | 点击文件名预览 | 最直观 |
| **按钮设计** | 图标（✓ ✗） | 节省空间 |
| **溢出处理** | text-overflow: ellipsis + title | 标准做法 |

### 关键特性

1. ✅ **零学习成本**：点击文件名就是预览，符合直觉
2. ✅ **紧凑高效**：图标按钮，空间利用率高
3. ✅ **多语言**：UI 和 AI 输出都支持本地化
4. ✅ **响应式**：自动适应容器宽度
5. ✅ **优雅降级**：超长文件名自动省略，hover 显示完整

---

## 七、Mock 示例

### 英文环境
```
┌─────────────────────────────────────────────────┐
│ 📁 File Changes  3 file(s)               [✓ All] │
├─────────────────────────────────────────────────┤
│ 📝 src/Header.tsx (Modify)               ✓  ✗   │
│ ➕ src/utils.ts (Create)                 ✓  ✗   │
│ 🗑️ src/legacy.js (Delete)                ✓  ✗   │
└─────────────────────────────────────────────────┘
```

### 中文环境
```
┌─────────────────────────────────────────────────┐
│ 📁 文件变更  3 个文件                      [✓全部] │
├─────────────────────────────────────────────────┤
│ 📝 src/Header.tsx (修改)                 ✓  ✗   │
│ ➕ src/utils.ts (创建)                   ✓  ✗   │
│ 🗑️ src/legacy.js (删除)                  ✓  ✗   │
└─────────────────────────────────────────────────┘
```

### 超长文件名
```
┌─────────────────────────────────────────────────┐
│ 📝 src/components/...yHeader.tsx (修改)  ✓  ✗   │
│    ↑ Hover: src/components/layout/VeryLongName │
│              WithManyFoldersInThePathHeader.tsx │
└─────────────────────────────────────────────────┘
```

---

## 八、后续增强

- [ ] Diff 视图内编辑（进阶）
- [ ] 撤销已应用的变更
- [ ] 变更历史时间线
- [ ] 局部应用（选择性应用某几行）
- [ ] 冲突检测（未保存的编辑）
- [ ] 快捷键支持（Enter 应用，Escape 跳过）

---

**设计完成时间**：2026-02-07  
**版本**：V2  
**状态**：待评审
