# CHANGELOG

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
