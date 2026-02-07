# Slash Command Picker Design

## Overview

A command picker triggered by `/` in the input box, similar to the `@` file picker. Shows commands, skills, and workflows in a searchable list.

---

## Interaction Flow

```
User types /
    ↓
Show command picker (similar to @ file picker)
    ↓
┌────────────────────────────────────┐
│ 🔍 Search commands or skills...    │
├────────────────────────────────────┤
│ ⚡ Commands                        │
│   /init      Rescan project        │
│   /skills    List all skills       │
│   /workflow  Show current workflow │
│   /clear     Clear chat            │
├────────────────────────────────────┤
│ 🎯 Skills                          │
│   test       测试, unit test       │
│   review     代码审查, review      │
│   refactor   重构                  │
├────────────────────────────────────┤
│ 📋 Workflow                        │
│   .cursorrules                     │
└────────────────────────────────────┘
    ↓
User selects
    ↓
┌─────────────────────────────────────┐
│ Command → Execute immediately       │
│ Skill → Insert "/test " in input    │
│ Workflow → Insert "/.cursorrules "  │
└─────────────────────────────────────┘
```

---

## Selection Behavior

| Selection Type | Behavior | Input Box Display | On Send |
|----------------|----------|-------------------|---------|
| **Command** | Execute immediately | Clear | - |
| **Skill** | Insert into input | `/test ` | Force use this skill |
| **Workflow** | Insert into input | `/.cursorrules ` | Force inject this workflow |

---

## Message Processing on Send

### Skill Prefix

```
User sends: "/test 帮我写测试"
    ↓
Parse: 
  - Prefix: /test
  - Content: 帮我写测试
    ↓
Find skill "test"
    ↓
Build message:
  [Skill: test]
  <skill content>
  
  [Current workspace: ...]
  
  帮我写测试
```

### Workflow Prefix

```
User sends: "/.cursorrules 开始工作"
    ↓
Parse: 
  - Prefix: /.cursorrules
  - Content: 开始工作
    ↓
Read .cursorrules content
    ↓
Build message:
  [Project Workflow]
  <.cursorrules content>
  
  [Current workspace: ...]
  
  开始工作
```

---

## Data Structures

```typescript
interface CommandItem {
    type: 'command';
    name: string;        // init, skills, workflow, clear
    label: string;       // Display name
    description: string; // Description
    icon: string;        // ⚡
}

interface SkillItem {
    type: 'skill';
    name: string;        // test
    triggers: string[];  // ['测试', 'test']
    icon: string;        // 🎯
}

interface WorkflowItem {
    type: 'workflow';
    name: string;        // .cursorrules
    source: string;      // Source file path
    icon: string;        // 📋
}

type SlashMenuItem = CommandItem | SkillItem | WorkflowItem;
```

---

## UI Components

### HTML Structure

```html
<div class="slash-picker-overlay" id="slashPickerOverlay">
    <div class="slash-picker">
        <input type="text" class="slash-picker-search" 
               id="slashPickerSearch" placeholder="Search commands or skills...">
        <div class="slash-picker-list" id="slashPickerList">
            <!-- Dynamically generated -->
        </div>
    </div>
</div>
```

### List Item Rendering

```html
<!-- Group header -->
<div class="slash-picker-group">⚡ Commands</div>

<!-- Command item -->
<div class="slash-picker-item command" data-type="command" data-name="init">
    <span class="slash-item-name">/init</span>
    <span class="slash-item-desc">Rescan project</span>
</div>

<!-- Separator -->
<div class="slash-picker-group">🎯 Skills</div>

<!-- Skill item -->
<div class="slash-picker-item skill" data-type="skill" data-name="test">
    <span class="slash-item-name">test</span>
    <span class="slash-item-triggers">测试, unit test</span>
</div>

<!-- Workflow -->
<div class="slash-picker-group">📋 Workflow</div>

<div class="slash-picker-item workflow" data-type="workflow" data-name=".cursorrules">
    <span class="slash-item-name">.cursorrules</span>
</div>
```

---

## Command List

| Command | Description (en) | Description (zh) |
|---------|------------------|------------------|
| `/init` | Rescan project | 重新扫描项目 |
| `/skills` | List all skills | 列出所有技能 |
| `/workflow` | Show current workflow | 显示当前工作流 |
| `/clear` | Clear chat | 清空对话 |
| `/help` | Show help | 显示帮助 |

---

## Input Box Display Format

After selecting skill or workflow, display as simple text:

```
┌────────────────────────────────────────────────┐
│ /test 帮我写单元测试                            │
└────────────────────────────────────────────────┘
```

Simple text format `/skillname ` is easier to implement and edit.

---

## Implementation Phases

| Phase | Task | Effort |
|-------|------|--------|
| 1 | HTML: Add slash-picker popup | 0.5h |
| 2 | CSS: Popup styles (reuse file-picker mostly) | 0.5h |
| 3 | JS: Listen for `/` input, show popup | 0.5h |
| 4 | JS: Render commands/skills/workflow list | 1h |
| 5 | JS: Search filtering | 0.5h |
| 6 | JS: Selection handling (execute vs insert) | 1h |
| 7 | TS: Parse `/skillname` prefix on send | 1h |
| 8 | TS: Force apply specified skill/workflow | 1h |

**Estimated total: ~6 hours**

---

## Keyboard Interaction

| Key | Behavior |
|-----|----------|
| `↑` / `↓` | Move selection up/down |
| `Enter` | Confirm selection |
| `Escape` | Close popup |
| Continue typing | Filter list |
| `Backspace` to delete `/` | Close popup |

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Project has no skills/workflow | Show only commands |
| Continue typing after `/` | Filter list in real-time |
| `/xxx` doesn't match anything | Send as normal message |
| Input has content when pressing `/` | Insert at cursor position |

---

## Files to Modify

```
webview/
├── index.html       # Add slash-picker HTML
├── styles.css       # Add slash-picker styles
└── main.js          # Add slash-picker logic

src/
├── chatPanel.ts     # Parse /skill prefix, send project status
└── chatProvider.ts  # Parse /skill prefix, send project status
```

---

## Message Format for Extension → Webview

```typescript
// Send available commands/skills/workflows to webview
webview.postMessage({
    type: 'projectStatus',
    initialized: true,
    skills: [
        { name: 'test', triggers: ['测试', 'test'] },
        { name: 'review', triggers: ['审查', 'review'] }
    ],
    hasWorkflow: true,
    workflowSource: '.cursorrules',
    configSource: ['.cursorrules', '.agent/skills/test.md']
});
```
