# CHANGELOG

## [0.2.2] - 2026-02-07

### Added - 会话级模型切换 🎯

#### 核心功能
- **会话级切换** - 使用 WebSocket `sessions.patch` RPC，不再修改全局配置
- **独立工作** - 多个 VS Code 窗口可使用不同模型，互不干扰
- **即时生效** - 切换后立即使用新模型，无需重启
- **持久化存储** - 模型选择保存在会话存储中，重启后保持

#### API 改进
- `GatewayWSClient.patchSession()` - 新增会话修改方法
- `Gateway.setSessionModel()` - 优先使用 WebSocket，CLI 作为回退
- 支持 `model: null` 清除覆盖，恢复默认模型

#### 配置增强
- **默认模型设置** - 在设置界面配置新会话的默认模型
- **Markdown 说明** - 详细的配置项说明和使用示例

### Added - 设置界面多语言支持 🌐

#### 完整国际化
- **双语支持** - 所有设置项、命令、描述支持中英文
- **自动切换** - 根据 VS Code 显示语言自动选择翻译
- **中文界面** - 扩展名称显示为"招财"，所有配置项中文描述
- **标准实现** - 使用 VS Code 官方 `package.nls.json` 机制

#### 翻译覆盖
- 7 个配置项（Gateway URL、路径、会话、计划模式、默认模型、语言、刷新间隔）
- 6 个命令（打开面板、发送选中、发送文件、切换模式、新建会话、清空对话）
- 扩展基本信息（名称、描述）

### Added - 用户体验全面升级 🎉

#### 1. 消息队列系统 ✨
- **智能排队** - AI 回复时可继续发送消息，自动排队处理
- **可视化队列** - 队列显示在输入框上方，清晰展示待处理消息
- **队列管理** - 每个队列项可单独删除，支持拖拽排序（计划中）
- **自动处理** - AI 完成后自动处理下一条，无需手动操作
- **交互优化** - 输入框有内容 + 回车 = 发送/排队，空消息不触发

#### 2. 连接状态指示器 🔌
- **实时状态** - 顶栏显示 Gateway 连接状态（🟢 已连接 / 🔴 未连接 / 🟡 连接中）
- **WebSocket 驱动** - 事件驱动检测，无轮询，零延迟
- **智能提示** - Hover 显示详细状态和操作建议
- **脉冲动画** - 断线时红色脉冲提醒，连接中黄色闪烁

#### 3. 自动刷新功能 🔄
- **手动刷新** - 点击刷新按钮，带旋转动画反馈
- **自动刷新** - 可配置间隔（默认 1000ms），支持禁用（0ms）
- **智能重连** - 刷新时自动尝试重连 WebSocket
- **配置项** - `openclaw.autoRefreshInterval` 配置项

#### 4. 错误信息友好化 💡
- **对话流展示** - 错误作为普通消息出现，融入聊天体验
- **分级提示** - 信息（蓝）/警告（黄）/错误（红）/停止（灰）
- **智能识别** - 11 种错误类型智能识别（连接/Token/模型/权限等）
- **操作建议** - 文字说明解决方法，无需操作按钮
- **特殊处理** - 停止按钮显示友好提示（2秒后自动消失）

**错误类型支持**：
- 用户停止 → "⏹️ 已停止生成"（2秒消失）
- 连接错误 → 提供启动命令
- Token 不足 → 提示切换模型
- 模型不可用 → 建议其他模型
- 超时/权限/网络等 → 清晰的解决方案

#### 5. 工具调用流式显示 🔧
- **实时显示** - AI 调用工具时实时出现（exec/read/write 等）
- **流式展示** - 工具调用过程中即时反馈
- **历史记录** - 历史消息中也显示工具调用
- **详情展开** - 点击展开查看完整参数
- **智能摘要** - 显示命令/路径等关键信息

### Changed

#### UI/UX 优化
- 队列位置从消息区域下方移到输入框上方（更合理的层次）
- 状态点紧贴 🦞 图标（视觉统一）
- 系统消息样式统一（图标 + 颜色 + 边框）
- 动画效果增强（淡入/淡出/旋转/脉冲）

#### 技术架构
- WebSocket 事件监听（替代轮询）
- 错误处理统一化（parseErrorToMessage）
- 消息类型标准化（systemMessage）
- 状态管理优化（连接/刷新/队列）

### Fixed
- 停止按钮显示吓人的 "exited with code 1" 错误
- 网络错误显示原始堆栈，用户看不懂
- Token 用完时提示不明确
- 模型不可用时无引导

### Configuration
- `openclaw.autoRefreshInterval` - 自动刷新间隔（毫秒，0 表示禁用）

### Documentation
- 新增 `docs/QUEUE_UI_DESIGN.md` - 队列设计方案
- 新增 `docs/CONNECTION_STATUS_AND_AUTO_REFRESH_DESIGN.md` - 连接状态设计
- 新增 `docs/ERROR_HANDLING_SIMPLE_DESIGN.md` - 错误友好化设计

### Statistics
- 新增代码：~800 行
- 新增功能：5 个
- 修复 Bug：3 个
- 包大小：298.48 KB (105 files)

---

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
