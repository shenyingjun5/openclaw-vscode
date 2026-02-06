# Diff Preview & Apply Feature Design

## Overview

A feature to preview code changes as diffs before applying them, similar to Cursor/Claude Code.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Window                          │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│    OpenClaw Chat     │         Editor Area                  │
│    (Webview)         │                                      │
│                      │   ┌────────────────────────────┐     │
│  ┌────────────────┐  │   │  Diff View (VS Code native)│     │
│  │ AI Response    │  │   │  app.ts (modified)         │     │
│  │ I suggest      │  │   │  - old line                │     │
│  │ modifying 3    │  │   │  + new line                │     │
│  │ files...       │  │   └────────────────────────────┘     │
│  └────────────────┘  │                                      │
│                      │                                      │
│  ┌────────────────┐  │                                      │
│  │ 📁 Changes     │  │                                      │
│  │ ├ app.ts    ✓  │  │                                      │
│  │ ├ utils.ts  ✓  │  │                                      │
│  │ └ test.ts   ○  │  │                                      │
│  │                │  │                                      │
│  │ [Apply All]    │  │                                      │
│  └────────────────┘  │                                      │
│                      │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

---

## User Flow

```
1. User sends request
   └─> "Help me refactor this function into multiple files"

2. AI analyzes and generates changes
   └─> Returns structured change data (multi-file diffs)

3. Chat panel shows change summary
   ├─> 📁 Change Preview Card
   │   ├─ src/app.ts (modify)     [Preview] [Apply] [Skip]
   │   ├─ src/utils.ts (create)   [Preview] [Apply] [Skip]
   │   └─ src/old.ts (delete)     [Preview] [Apply] [Skip]
   └─> [Apply All] [Skip All]

4. User clicks [Preview]
   └─> Opens VS Code native Diff view in editor area

5. User clicks [Apply]
   └─> Writes changes to file (single or batch)

6. Status updates after apply
   └─> ✅ Applied / ❌ Skipped
```

---

## Data Structures

```typescript
// Change data structure returned by AI
interface FileChange {
  path: string;              // File path
  action: 'create' | 'modify' | 'delete';
  originalContent?: string;  // Original content (for modify/delete)
  newContent?: string;       // New content (for create/modify)
  hunks?: DiffHunk[];        // Optional: precise diff hunks
}

interface DiffHunk {
  startLine: number;
  endLine: number;
  oldLines: string[];
  newLines: string[];
}

interface ChangeSet {
  id: string;              // Change set ID
  description: string;     // AI's explanation
  files: FileChange[];     // File list
  status: 'pending' | 'partial' | 'applied' | 'rejected';
}
```

---

## Implementation Modules

### 1. AI Response Parser

AI returns changes in a specific format:

```markdown
I suggest the following changes:

```changes
[
  {
    "path": "src/app.ts",
    "action": "modify",
    "newContent": "..."
  },
  {
    "path": "src/utils.ts", 
    "action": "create",
    "newContent": "..."
  }
]
```
```

Plugin parses ```` ```changes ```` code blocks to extract structured data.

### 2. Diff Preview (Using VS Code Native)

```typescript
// Use VS Code's diff command
async function showDiff(change: FileChange) {
  const originalUri = vscode.Uri.file(change.path);
  
  // Create virtual document for new content
  const newUri = vscode.Uri.parse(
    `openclaw-diff:${change.path}?changeId=${changeSet.id}`
  );
  
  // Open diff view
  await vscode.commands.executeCommand(
    'vscode.diff',
    originalUri,
    newUri,
    `${path.basename(change.path)} (OpenClaw Changes)`
  );
}
```

### 3. Virtual Document Provider

```typescript
// Register virtual document scheme
class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private changes = new Map<string, FileChange>();
  
  provideTextDocumentContent(uri: vscode.Uri): string {
    const change = this.changes.get(uri.path);
    return change?.newContent || '';
  }
  
  registerChange(change: FileChange) {
    this.changes.set(change.path, change);
  }
}
```

### 4. Change Summary Card (Webview)

```html
<div class="change-set">
  <div class="change-header">
    <span>📁 Change Preview</span>
    <span class="change-count">3 files</span>
  </div>
  
  <div class="change-files">
    <div class="change-file" data-path="src/app.ts">
      <span class="file-icon">📝</span>
      <span class="file-name">app.ts</span>
      <span class="file-action modify">modify</span>
      <div class="file-actions">
        <button class="preview-btn">Preview</button>
        <button class="apply-btn">Apply</button>
        <button class="skip-btn">Skip</button>
      </div>
    </div>
    <!-- More files... -->
  </div>
  
  <div class="change-actions">
    <button class="apply-all-btn">Apply All</button>
    <button class="skip-all-btn">Skip All</button>
  </div>
</div>
```

### 5. Apply Changes

```typescript
async function applyChange(change: FileChange) {
  const uri = vscode.Uri.file(change.path);
  
  switch (change.action) {
    case 'create':
      await vscode.workspace.fs.writeFile(
        uri, 
        Buffer.from(change.newContent!, 'utf8')
      );
      break;
      
    case 'modify':
      const edit = new vscode.WorkspaceEdit();
      const doc = await vscode.workspace.openTextDocument(uri);
      const fullRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
      );
      edit.replace(uri, fullRange, change.newContent!);
      await vscode.workspace.applyEdit(edit);
      break;
      
    case 'delete':
      await vscode.workspace.fs.delete(uri);
      break;
  }
}

async function applyAllChanges(changes: FileChange[]) {
  const edit = new vscode.WorkspaceEdit();
  
  for (const change of changes) {
    // Build batch edit...
  }
  
  // Apply all changes at once
  await vscode.workspace.applyEdit(edit);
}
```

---

## Multi-File Handling Strategy

| Scenario | Behavior |
|----------|----------|
| Click [Preview] on single file | Open Diff view for that file in editor |
| Click [Apply All] | Batch apply all changes silently |
| Click [Apply] on single file | Apply that file, update status to ✅ |
| View after apply | Click filename to open in editor |

**Does NOT open all files simultaneously**:
- Change summary shown in chat panel
- User clicks [Preview] on-demand to see individual file diffs
- [Apply All] processes batch silently

---

## Implementation Phases

| Phase | Task | Effort |
|-------|------|--------|
| 1 | AI response format + parser | 2h |
| 2 | Virtual document provider (DiffContentProvider) | 2h |
| 3 | Webview change summary card UI | 3h |
| 4 | [Preview] button → open Diff view | 1h |
| 5 | [Apply] single/batch apply logic | 2h |
| 6 | State management (pending/applied/skipped) | 1h |
| 7 | Testing + edge cases | 2h |

**Estimated total: ~13 hours**

---

## Alternative Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **A. Show diff in Webview** | Unified experience | Need to implement diff rendering |
| **B. VS Code native Diff (recommended)** | Native UX, full features | Focus switch required |
| **C. Direct editor open** | Simplest | No diff comparison |

---

## Files to Create/Modify

```
src/
├── diffProvider.ts      # Virtual document provider
├── changeParser.ts      # Parse AI response for changes
├── changeManager.ts     # State management for change sets
├── chatPanel.ts         # Add change card rendering
└── extension.ts         # Register diff provider

webview/
├── styles.css           # Add change card styles
└── main.js              # Add change card interactions
```

---

## Future Enhancements

- [ ] Inline diff editing before apply
- [ ] Undo applied changes
- [ ] Change history / timeline
- [ ] Partial hunk apply (apply specific lines only)
- [ ] Conflict detection with unsaved changes
