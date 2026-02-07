# Project Skills & Workflow Auto-Trigger Design

## Overview

Automatically detect and trigger project-defined skills and workflows when user sends messages, similar to other IDE AI agents.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Plugin                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Project      │    │ Skill        │    │ Message      │   │
│  │ Scanner      │───▶│ Matcher      │───▶│ Builder      │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                   │                   │            │
│         ▼                   ▼                   ▼            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   Project Cache                       │   │
│  │  - skills: [{name, triggers, content}]               │   │
│  │  - workflow: string                                   │   │
│  │  - initialized: boolean                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Scanned Directories & Files

### Priority Order (highest to lowest)

```typescript
const PROJECT_CONFIG_PATHS = [
  // Project-specific AI config directories
  '.ai/skills/*.md',
  '.ai/workflow.md',
  '.ai/config.md',
  
  '.agent/skills/*.md',
  '.agent/workflow.md',
  '.agent/config.md',
  
  // Claude Code
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/commands/*.md',
  
  // Cursor
  '.cursorrules',
  '.cursor/rules',
  
  // GitHub Copilot
  '.github/copilot-instructions.md',
  
  // Generic AI config
  'AGENTS.md',
  'WORKFLOW.md',
  'SKILL.md',
  'AI.md',
];
```

### Directory Structure Examples

```
project/
├── .ai/                       # Option A
│   ├── skills/
│   │   ├── test.md
│   │   ├── review.md
│   │   └── refactor.md
│   └── workflow.md
│
├── .agent/                    # Option B
│   ├── skills/
│   │   ├── test.md
│   │   └── deploy.md
│   └── workflow.md
│
├── CLAUDE.md                  # Claude Code compat
├── .cursorrules               # Cursor compat
└── AGENTS.md                  # Generic compat
```

---

## User Flows

### Flow A: Auto-Initialize (Recommended)

```
Open project
    ↓
Plugin auto-scans config files (silent)
    ↓
Parse skills and workflow
    ↓
Cache in memory (don't send to AI yet)
    ↓
User sends message: "帮我写单元测试"
    ↓
Match skill: "test" (triggers: 测试, test, 单元测试)
    ↓
Build message:
  [Project Skill: test]
  <skill content>
  
  [User Message]
  帮我写单元测试
    ↓
Send to Gateway
```

### Flow B: Manual Initialize

```
User sends /init
    ↓
Scan project config
    ↓
Show discovered skills:
  ┌────────────────────────────┐
  │ 📦 Project Initialized     │
  │                            │
  │ Found 3 skills:            │
  │ • test (测试, test)        │
  │ • review (审查, review)    │
  │ • refactor (重构)          │
  │                            │
  │ Workflow: WORKFLOW.md ✓    │
  └────────────────────────────┘
    ↓
Subsequent messages auto-match skills
```

---

## Skill File Format

### Standard Format (Recommended)

```markdown
---
name: test
triggers:
  - 测试
  - test
  - 单元测试
  - unit test
  - 写测试
  - write test
---

# Test Skill

## Rules
1. Use project's existing test framework
2. Follow AAA pattern (Arrange, Act, Assert)
3. Place test files in __tests__ directory

## Steps
1. Analyze the code to test
2. Determine test cases
3. Write test code
4. Run and verify
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | No | Skill name (defaults to filename) |
| `triggers` | No | List of trigger keywords |
| `priority` | No | Match priority (higher = first) |
| `autoTrigger` | No | Enable auto-trigger (default: true) |

---

## Compatibility with Existing Formats

| File | Handling |
|------|----------|
| `.cursorrules` | Inject as global workflow |
| `CLAUDE.md` | Parse rules section as workflow |
| `AGENTS.md` | Parse skill definitions |
| `.github/copilot-instructions.md` | Inject as workflow |
| `.ai/skills/*.md` | Standard skill format |
| `.agent/skills/*.md` | Standard skill format |

---

## Data Structures

```typescript
interface ProjectSkill {
  name: string;           // Skill name
  triggers: string[];     // Trigger keywords
  content: string;        // Skill content (prompt)
  filePath: string;       // Source file path
  priority: number;       // Match priority
  autoTrigger: boolean;   // Auto-trigger enabled
}

interface ProjectConfig {
  workspaceDir: string;
  skills: ProjectSkill[];
  workflow: string | null;      // Global workflow
  initialized: boolean;
  lastScan: number;             // Timestamp
  configSource: string[];       // Which files were loaded
}

// Cache: one per workspace
const projectCache = new Map<string, ProjectConfig>();
```

---

## Core Modules

### 1. Project Scanner

```typescript
class ProjectScanner {
  private static SKILL_DIRS = [
    '.ai/skills',
    '.agent/skills',
    '.claude/commands',
  ];
  
  private static WORKFLOW_FILES = [
    '.ai/workflow.md',
    '.agent/workflow.md',
    'WORKFLOW.md',
    '.cursorrules',
    'CLAUDE.md',
    'AGENTS.md',
    '.github/copilot-instructions.md',
  ];

  async scan(workspaceDir: string): Promise<ProjectConfig> {
    const skills: ProjectSkill[] = [];
    let workflow: string | null = null;
    const configSource: string[] = [];

    // Scan skill directories
    for (const dir of ProjectScanner.SKILL_DIRS) {
      const skillDir = path.join(workspaceDir, dir);
      if (await this.exists(skillDir)) {
        const files = await glob('*.md', { cwd: skillDir });
        for (const file of files) {
          const skill = await this.parseSkillFile(path.join(skillDir, file));
          if (skill) {
            skills.push(skill);
            configSource.push(path.join(dir, file));
          }
        }
      }
    }

    // Find workflow
    for (const file of ProjectScanner.WORKFLOW_FILES) {
      const filePath = path.join(workspaceDir, file);
      if (await this.exists(filePath)) {
        workflow = await this.parseWorkflowFile(filePath);
        configSource.push(file);
        break; // Use first found
      }
    }

    return {
      workspaceDir,
      skills,
      workflow,
      initialized: true,
      lastScan: Date.now(),
      configSource,
    };
  }

  private async parseSkillFile(filePath: string): Promise<ProjectSkill | null> {
    const content = await fs.readFile(filePath, 'utf8');
    const { data: frontmatter, content: body } = matter(content);
    
    return {
      name: frontmatter.name || path.basename(filePath, '.md'),
      triggers: frontmatter.triggers || [frontmatter.name || path.basename(filePath, '.md')],
      content: body.trim(),
      filePath,
      priority: frontmatter.priority || 0,
      autoTrigger: frontmatter.autoTrigger !== false,
    };
  }

  private async parseWorkflowFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf8');
    // For .cursorrules, use as-is
    // For CLAUDE.md, might need to extract specific sections
    return content.trim();
  }
}
```

### 2. Skill Matcher

```typescript
class SkillMatcher {
  match(message: string, skills: ProjectSkill[]): ProjectSkill | null {
    const lowerMessage = message.toLowerCase();
    
    // Sort by priority (higher first)
    const sorted = [...skills]
      .filter(s => s.autoTrigger)
      .sort((a, b) => b.priority - a.priority);
    
    for (const skill of sorted) {
      for (const trigger of skill.triggers) {
        if (lowerMessage.includes(trigger.toLowerCase())) {
          return skill;
        }
      }
    }
    
    return null;
  }
  
  // Find by exact name (for /skill command)
  findByName(name: string, skills: ProjectSkill[]): ProjectSkill | null {
    return skills.find(s => 
      s.name.toLowerCase() === name.toLowerCase()
    ) || null;
  }
}
```

### 3. Message Builder

```typescript
class MessageBuilder {
  private workflowSent = new Set<string>(); // Track per session

  build(
    userMessage: string,
    config: ProjectConfig,
    matchedSkill: ProjectSkill | null,
    sessionId: string
  ): string {
    const parts: string[] = [];

    // 1. Global workflow (first message only)
    if (config.workflow && !this.workflowSent.has(sessionId)) {
      parts.push(`[Project Workflow]\n${config.workflow}`);
      this.workflowSent.add(sessionId);
    }

    // 2. Matched skill
    if (matchedSkill) {
      parts.push(`[Skill: ${matchedSkill.name}]\n${matchedSkill.content}`);
    }

    // 3. Workspace directory
    parts.push(`[Current workspace: ${config.workspaceDir}]`);

    // 4. User message
    parts.push(userMessage);

    return parts.join('\n\n');
  }
  
  resetSession(sessionId: string) {
    this.workflowSent.delete(sessionId);
  }
}
```

---

## User Interface

### Status Bar Indicator

```
┌─────────────────────────────────────────┐
│ 🦞 3 skills │ workflow ✓ │ test →      │
└─────────────────────────────────────────┘
      ↑              ↑           ↑
   Skill count   Has workflow  Last triggered
```

### Commands

| Command | Description |
|---------|-------------|
| `/init` | Manual init / rescan project |
| `/skills` | List all available skills |
| `/skill <name>` | Manually trigger specific skill |
| `/workflow` | Show current workflow |

### Trigger Notification

When a skill is matched, show hint above message:

```
┌────────────────────────────────────────┐
│ 🎯 Triggered skill: test               │
│    Keyword: "单元测试"                  │
└────────────────────────────────────────┘
```

---

## Implementation Phases

| Phase | Task | Effort |
|-------|------|--------|
| 1 | ProjectScanner basic implementation | 2h |
| 2 | Skill file parsing (frontmatter) | 1h |
| 3 | SkillMatcher keyword matching | 1h |
| 4 | MessageBuilder message construction | 1h |
| 5 | Compat: .cursorrules / CLAUDE.md / .agent | 2h |
| 6 | /init, /skills commands | 2h |
| 7 | Status bar UI | 1h |
| 8 | Skill trigger hint UI | 1h |

**Estimated total: ~11 hours**

---

## Configuration Options

```json
// .vscode/settings.json
{
  "openclaw.skills.autoScan": true,
  "openclaw.skills.scanPaths": [
    ".ai/skills/*.md",
    ".agent/skills/*.md"
  ],
  "openclaw.workflow.injectMode": "first-message",
  "openclaw.skills.showTriggerHint": true,
  "openclaw.skills.caseSensitive": false
}
```

### Inject Modes

| Mode | Behavior |
|------|----------|
| `first-message` | Send workflow on first message only |
| `every-message` | Send workflow with every message |
| `manual` | Only send when user runs /init |
| `never` | Don't inject workflow |

---

## Files to Create/Modify

```
src/
├── projectScanner.ts     # Scan project config
├── skillMatcher.ts       # Match skills by keywords
├── messageBuilder.ts     # Build messages with context
├── projectCache.ts       # Cache management
├── chatPanel.ts          # Add skill trigger UI
├── chatProvider.ts       # Integration
└── extension.ts          # Register commands

webview/
├── styles.css            # Skill hint styles
└── main.js               # Skill hint rendering
```

---

## Example: Complete Flow

```
1. User opens project with .agent/skills/test.md

2. Plugin silently scans:
   - Found: .agent/skills/test.md (triggers: 测试, test)
   - Found: .cursorrules (workflow)

3. User types: "帮我给 utils.ts 写单元测试"

4. SkillMatcher detects: "单元测试" → test skill

5. MessageBuilder constructs:
   
   [Project Workflow]
   You are a senior developer...
   (content from .cursorrules)
   
   [Skill: test]
   # Test Skill
   ## Rules
   1. Use project's existing test framework...
   (content from .agent/skills/test.md)
   
   [Current workspace: /Users/dev/myproject]
   
   帮我给 utils.ts 写单元测试

6. UI shows: "🎯 Triggered skill: test"

7. Send to Gateway
```

---

## Future Enhancements

- [ ] Skill chaining (trigger multiple skills)
- [ ] Conditional skills (only trigger in certain contexts)
- [ ] Skill inheritance (base skills + project overrides)
- [ ] Skill analytics (which skills are used most)
- [ ] AI-suggested skills based on conversation
- [ ] Remote skill repositories
