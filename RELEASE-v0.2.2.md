# v0.2.2 (2026-02-07)

## 🌐 设置界面多语言支持

### 新增功能

- **完整的国际化支持**
  - 所有设置项描述支持中英文
  - 所有命令标题支持中英文
  - 扩展名称和描述支持中英文
  - 自动根据 VS Code 显示语言切换

### 翻译文件

- `package.nls.json` - 英文（默认）
- `package.nls.zh-cn.json` - 简体中文

### 中文界面显示

在中文界面下，插件将显示为：
- **扩展名称**: 招财（而非 OpenClaw）
- **所有配置项**: 完整中文描述
- **所有命令**: 中文标题

### 英文界面显示

在英文界面下，所有内容保持英文显示。

### 影响范围

以下内容现在支持多语言：

**配置项 (6 个):**
- Gateway URL
- OpenClaw Path
- Default Session
- Plan Mode
- AI Output Language
- Auto Refresh Interval

**命令 (6 个):**
- Open Chat Panel
- Send Selection to OpenClaw
- Send File to OpenClaw
- Toggle Plan Mode
- New Session
- Clear Chat

### 使用方法

插件会自动检测 VS Code 的显示语言并使用对应翻译。

**手动切换语言：**
1. `Cmd+Shift+P` → `Configure Display Language`
2. 选择 `简体中文` 或 `English`
3. 重启 VS Code

---

## 🐛 Bug 修复

- 修复了配置项描述中英文混杂的问题

---

## 📝 文档

- 新增：[国际化设计方案](./docs/I18N_SETTINGS_DESIGN.md)
- 新增：[国际化测试指南](./docs/I18N_TESTING_GUIDE.md)
- 新增：[实现总结](./docs/I18N_IMPLEMENTATION_SUMMARY.md)

---

## 🙏 致谢

感谢所有提供翻译反馈的用户！
