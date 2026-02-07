# CHANGELOG

## [0.2.1] - 2026-02-07

### Changed
- 更新扩展图标

## [0.2.0] - 2026-02-07

### Added - Diff Preview & Apply Feature 🎉
- **变更预览与应用功能** - AI 可以返回结构化的文件变更，支持预览和应用
- **多语言支持** - 新增 `openclaw.aiOutputLanguage` 配置项（auto/zh-CN/en/ja/ko）
- **自动语言检测** - UI 和 AI 输出自动跟随系统语言
- **变更卡片 UI** - 紧凑型卡片设计，支持单文件/批量操作
- **VS Code 原生 Diff 视图** - 点击文件名预览差异
- **智能文件名省略** - 超长路径自动省略，hover 显示完整路径
- **自动接受机制** - 发送新消息时自动接受待处理的变更
- **状态管理** - 待处理/已应用/已跳过状态跟踪

### New Components
- `LanguageManager` - 语言管理（系统语言 + AI 输出语言）
- `ChangeParser` - 解析 AI 返回的 JSON 变更数据
- `ChangeManager` - 变更集状态管理和生命周期
- `DiffProvider` - 虚拟文档提供者（VS Code Diff 视图）
- `ChangeCard` - 变更卡片 UI 组件

### UI/UX Improvements
- 图标按钮（✓ 应用 / ✗ 跳过）节省空间
- 支持 create/modify/delete 三种文件操作
- 成功/失败动画反馈
- 多语言文本自动适配

### Technical
- 添加 System Prompt 语言指令
- WebSocket 消息类型扩展（previewDiff, applyFile, etc.）
- 虚拟文档 scheme: `openclaw-diff:`
- 变更数据格式：```changes ... ```

### Configuration
- `openclaw.aiOutputLanguage` - AI 输出语言（默认：auto）

## [0.1.9] - 2026-02-07

### Added
- Windows 平台 npm prefix 动态检测
- 支持 14 种 OpenClaw 安装路径（之前仅 4 种）
- ChatSessionManager 共享逻辑层
- 文件选择、图片保存、模型/历史获取等共享方法

### Fixed
- 深色模式下图标颜色问题（刷新/设置/附件图标）
- Windows .cmd 文件执行问题
- Workflow 显示 HTML 转义问题
- Skills 递归扫描问题
- ChatPanel 功能缺失问题
- @ 文件搜索匹配路径问题（现在只匹配文件名）

### Changed
- 重构 ChatProvider 和 ChatPanel 使用统一的 SessionManager
- 减少代码重复 ~188 行（-68%）
- 图标透明度统一为 85%（hover 100%）
- 文件搜索只匹配文件名，不再匹配路径

### Performance
- Windows 用户安装路径覆盖率从 30% 提升到 95%
- 代码可维护性显著提升（单点维护）

## [0.1.8] - 之前的版本
...
