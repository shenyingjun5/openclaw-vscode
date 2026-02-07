# 发布流程检查清单

## 📋 发布前准备

### 1. 代码开发
- [ ] 完成所有功能开发
- [ ] 修复所有已知 Bug
- [ ] 代码编译通过
- [ ] 本地测试通过

### 2. 版本号更新
- [ ] 更新 `package.json` 中的 `version`
- [ ] 确定版本号类型（major.minor.patch）

### 3. 文档更新 ⚠️ **必须同步**
- [ ] **README.md** - 添加新功能说明、使用方法、配置项
- [ ] **CHANGELOG.md** - 添加本版本的更新日志
- [ ] **RELEASE-vX.X.X.md** - 创建详细的发布说明
- [ ] **package.json** - 更新 description（如有必要）
- [ ] 其他相关文档（如 API 文档、配置示例等）

---

## 📦 发布流程

### 4. 编译打包
```bash
cd ~/Desktop/openclaw-vscode
npm run compile
npx @vscode/vsce package --out openclaw-X.X.X.vsix
```

### 5. Git 提交
```bash
# 添加所有更改
git add .

# 提交代码
git commit -m "Release vX.X.X

🎉 主要更新：
- 功能1
- 功能2
- Bug修复

详见 CHANGELOG.md"

# 创建标签
git tag -a vX.X.X -m "Release vX.X.X

✨ 主要特性：
- 功能1
- 功能2

📦 安装包：openclaw-X.X.X.vsix (XXX KB)"
```

### 6. 推送到 GitHub
```bash
# 推送代码
git push origin main

# 推送标签
git push origin vX.X.X
```

### 7. 创建 GitHub Release
```bash
# 使用 gh CLI
gh release create vX.X.X \
  --title "OpenClaw VSCode Extension vX.X.X" \
  --notes-file RELEASE-vX.X.X.md \
  openclaw-X.X.X.vsix
```

### 8. 验证发布
```bash
# 查看 Release
gh release view vX.X.X

# 检查文件是否上传
# 访问 Release 页面确认
```

---

## ✅ 发布后检查

### 9. 文档验证
- [ ] GitHub README 显示正常
- [ ] Release 页面内容完整
- [ ] VSIX 文件可下载
- [ ] 安装测试通过

### 10. 公告（可选）
- [ ] 发布博客文章
- [ ] 社交媒体通知
- [ ] 社区论坛公告

---

## 📝 常见错误提醒

### ❌ 容易遗漏的更新
1. **README.md** - 最容易忘记更新
   - 新功能说明
   - 配置项更新
   - 使用示例
   - 故障排查

2. **CHANGELOG.md** - 必须记录
   - Added（新增）
   - Changed（修改）
   - Fixed（修复）
   - Removed（移除）

3. **版本号不一致**
   - package.json
   - Git tag
   - Release 标题

4. **发布说明文件名**
   - 格式：`RELEASE-vX.X.X.md`
   - 确保版本号一致

---

## 🎯 文档更新重点

### README.md 必须包含：
- [ ] 新功能的使用说明
- [ ] 新增配置项说明
- [ ] 安装要求更新（如有）
- [ ] 故障排查更新（如有）
- [ ] 示例代码更新（如有）
- [ ] 版本历史链接更新

### CHANGELOG.md 格式：
```markdown
## [X.X.X] - YYYY-MM-DD

### Added
- 新增功能1
- 新增功能2

### Changed
- 修改1
- 修改2

### Fixed
- Bug修复1
- Bug修复2

### Removed
- 移除的功能
```

### RELEASE-vX.X.X.md 必须包含：
- [ ] 发布日期
- [ ] 主要更新列表
- [ ] 性能改进数据
- [ ] 安装说明
- [ ] 配置说明
- [ ] 已知问题
- [ ] 下一步计划

---

## 🔄 自动化建议

### 发布脚本示例
```bash
#!/bin/bash
# release.sh

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Usage: ./release.sh <version>"
  exit 1
fi

# 1. 检查文档
echo "请确认以下文件已更新："
echo "  - README.md"
echo "  - CHANGELOG.md"
echo "  - RELEASE-v$VERSION.md"
read -p "按回车继续..."

# 2. 编译打包
npm run compile
npx @vscode/vsce package --out openclaw-$VERSION.vsix

# 3. Git 提交
git add .
git commit -m "Release v$VERSION"
git tag -a v$VERSION -m "Release v$VERSION"

# 4. 推送
git push origin main
git push origin v$VERSION

# 5. 创建 Release
gh release create v$VERSION \
  --title "OpenClaw VSCode Extension v$VERSION" \
  --notes-file RELEASE-v$VERSION.md \
  openclaw-$VERSION.vsix

echo "✅ Release v$VERSION 完成！"
```

---

## 📊 版本规划

### 版本号规则
- **Major (X.0.0)**: 重大架构变更、不兼容更新
- **Minor (0.X.0)**: 新功能、重要改进
- **Patch (0.0.X)**: Bug 修复、小优化

### 示例
- `0.1.9` → `0.2.0`: 新增 WebSocket API 支持（重要功能）
- `0.1.9` → `0.1.10`: 修复图标颜色 Bug（小修复）
- `0.1.9` → `1.0.0`: 发布到 VSCode Marketplace（里程碑）

---

## 💾 记录到 Memory

每次发布后更新：
- `memory/YYYY-MM-DD.md` - 当天工作日志
- `MEMORY.md` - 重要决策和经验

关键记录内容：
- 遇到的问题和解决方案
- 技术要点和坑
- 性能指标对比
- 用户反馈

---

**最重要的提醒**：

⚠️ **发布前必须确认所有文档已同步更新！**

文档是用户了解新功能的第一入口，文档不全 = 功能白做。
