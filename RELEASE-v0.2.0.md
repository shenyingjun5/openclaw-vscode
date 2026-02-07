# OpenClaw VSCode Extension - v0.2.0 发布说明

## 📅 发布日期
2026-02-07

## 🎉 重磅功能：Diff Preview & Apply

本次更新带来了**变更预览与应用**功能，让 AI 可以结构化地返回文件变更，并通过可视化界面进行预览和应用。

---

## ✨ 主要新功能

### 1. 🔄 变更预览与应用

AI 现在可以返回结构化的文件变更数据，用户可以：
- **预览差异** - 点击文件名查看 VS Code 原生 Diff 视图
- **单文件操作** - 单独应用或跳过每个文件
- **批量操作** - 一键接受/拒绝所有变更
- **状态跟踪** - 实时显示待处理/已应用/已跳过状态

#### 变更卡片 UI

```
┌─────────────────────────────────────────────────────────┐
│ 📁 文件变更                           3 个文件          │
├─────────────────────────────────────────────────────────┤
│ 📝 src/components/Header.tsx (修改)        ✓    ✗      │
│ ➕ src/utils/helpers.ts (创建)              ✓    ✗      │
│ 🗑️ src/legacy/oldUtils.js (删除)           ✓    ✗      │
├─────────────────────────────────────────────────────────┤
│                  [ 全部接受 ]  [ 全部拒绝 ]             │
└─────────────────────────────────────────────────────────┘
```

**交互方式：**
- 点击文件名 → 预览 Diff
- 点击 ✓ → 应用此文件
- 点击 ✗ → 跳过此文件
- [全部接受] → 批量应用所有变更
- [全部拒绝] → 批量跳过所有变更

**自动接受机制：**
- 发送新消息时，自动接受所有待处理的变更
- 队列中的指令不会触发自动接受（未来功能）

### 2. 🌍 多语言支持

#### AI 输出语言配置

新增配置项：`openclaw.aiOutputLanguage`

**选项：**
- `auto` - 跟随系统语言 ✓ 默认
- `zh-CN` - 简体中文
- `en` - English
- `ja` - 日本語
- `ko` - 한국어

**工作原理：**
1. 检测系统语言（VS Code `env.language`）
2. 根据配置生成语言指令
3. 自动添加到 System Prompt
4. AI 以指定语言输出

**示例：**
```typescript
// 系统语言：zh-CN
// 配置：auto
// 生成的指令：
"Please respond in Chinese (Simplified) unless the user explicitly requests a different language."
```

#### UI 本地化

- 变更卡片所有文本自动适配语言
- 支持中文/英文（可扩展到日语/韩语）
- 图标提示文本本地化

### 3. 🎨 紧凑型 UI 设计

#### 智能文件名省略

```
正常：📝 src/components/Header.tsx (修改)  ✓ ✗
超长：📝 src/ve...LongName.tsx (修改)      ✓ ✗
     ↑ Hover 显示完整路径
```

**算法：**
- 优先保留文件名
- 路径中间部分智能省略
- 悬停显示完整路径

#### 图标按钮

- **✓** - 应用（绿色 hover）
- **✗** - 跳过（红色 hover）
- **✅** - 已应用
- **⏭️** - 已跳过

节省空间，视觉清晰。

### 4. 🔧 技术架构

#### 新增组件

| 组件 | 职责 | 代码量 |
|------|------|--------|
| `LanguageManager` | 语言管理 | 3.1 KB |
| `ChangeParser` | 解析变更数据 | 3.6 KB |
| `ChangeManager` | 状态管理 | 8.0 KB |
| `DiffProvider` | Diff 视图 | 4.9 KB |
| `ChangeCard` (webview) | UI 组件 | 10.5 KB |

#### AI 响应格式

AI 需要返回以下 JSON 格式：

````markdown
```changes
{
  "description": "重构 Header 组件，提取工具函数",
  "files": [
    {
      "path": "src/components/Header.tsx",
      "action": "modify",
      "description": "简化组件逻辑",
      "content": "... 新内容 ..."
    },
    {
      "path": "src/utils/helpers.ts",
      "action": "create",
      "content": "export const formatDate = ..."
    }
  ]
}
```
````

**支持的操作：**
- `create` - 创建新文件
- `modify` - 修改现有文件
- `delete` - 删除文件

---

## 📊 性能与指标

| 指标 | v0.1.9 | v0.2.0 | 提升 |
|------|--------|--------|------|
| 组件数 | 9 | 14 | +5 |
| 插件大小 | 248 KB | 260 KB | +12 KB |
| 支持语言 | 2 | 4+ | +100% |
| 文件操作 | 手动 | 可视化 | 新增 |

---

## 🎯 使用场景

### 场景 1：重构代码

**用户：** "帮我重构 Header 组件，把工具函数提取到独立文件"

**AI 返回：** 变更卡片（3 个文件）
1. Header.tsx (修改)
2. utils/helpers.ts (创建)
3. oldUtils.js (删除)

**用户操作：**
- 点击文件名预览每个变更
- 满意后点击 [全部接受]
- 或单独应用/跳过某些文件

### 场景 2：批量文件创建

**用户：** "创建一个新的 Feature 模块，包含组件、样式和测试"

**AI 返回：** 变更卡片（5 个文件）
- FeatureA.tsx (创建)
- FeatureA.css (创建)
- FeatureA.test.ts (创建)
- index.ts (修改 - 添加导出)
- README.md (修改 - 添加文档)

---

## 🔧 配置示例

### 设置 AI 输出语言

**方法 1：VS Code 设置 UI**
1. 打开设置 (`Ctrl+,`)
2. 搜索 "OpenClaw: AI Output Language"
3. 选择语言

**方法 2：settings.json**
```json
{
  "openclaw.aiOutputLanguage": "zh-CN"
}
```

---

## 🐛 已知问题

无

---

## 🔮 下一步计划

- [ ] 队列指令支持（排队的消息不触发自动接受）
- [ ] 撤销已应用的变更
- [ ] 局部应用（选择性应用某几行）
- [ ] 变更历史时间线
- [ ] Diff 视图内编辑

---

## 📦 安装

### 方法 1：VSCode 命令行
```bash
code --install-extension openclaw-0.2.0.vsix --force
```

### 方法 2：VSCode UI
1. 打开 VSCode
2. 按 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (macOS)
3. 输入 "Extensions: Install from VSIX"
4. 选择 `openclaw-0.2.0.vsix`

---

## 🙏 致谢

感谢所有测试用户的反馈！

---

## 📄 License

MIT © 2026 OpenClaw VSCode Extension

---

**完整更新日志**: [CHANGELOG.md](./CHANGELOG.md)

**设计文档**: 
- [docs/DIFF_PREVIEW_DESIGN_V2.md](./docs/DIFF_PREVIEW_DESIGN_V2.md)
- [docs/DIFF_PREVIEW_UI_DESIGN.md](./docs/DIFF_PREVIEW_UI_DESIGN.md)
