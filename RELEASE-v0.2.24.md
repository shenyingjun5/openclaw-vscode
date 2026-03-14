# Release v0.2.24

发布日期 / Release Date: 2026-03-14

## 🎯 本次更新 / Highlights

本次版本新增 **图片附件多模态视觉支持** 和 **模型列表 RPC 动态获取**。
This release adds **image attachment multimodal vision support** and **dynamic model list via RPC**.

---

## ✨ 新增 / Added

### 1) 图片附件多模态视觉传输
- 粘贴/拖拽的图片以 base64 附件方式通过 `chat.send` 的 `attachments` 参数传递，Gateway 自动注入 LLM 多模态 image content block
- 通过附件按钮/拖拽引用的图片文件（`.png/.jpg/.jpeg/.gif/.webp/.bmp/.svg`）自动从磁盘读取并转为 base64 附件
- 已转为附件的图片路径从消息文本中移除，避免重复

### 1) Image attachment multimodal vision transport
- Pasted/dropped images are sent as base64 attachments via `chat.send`'s `attachments` parameter; Gateway injects them into the LLM's multimodal image content block
- Image files referenced via attachment button/drag-drop (`.png/.jpg/.jpeg/.gif/.webp/.bmp/.svg`) are auto-read from disk and converted to base64 attachments
- Image paths already converted to attachments are removed from the message text to avoid duplication

### 2) 模型列表 RPC 动态获取
- 模型列表优先通过 Gateway RPC `models.list` + `sessions.list` 获取，反映运行时真实模型目录与当前会话模型
- RPC 失败时回退本地配置文件（根配置 > 按端口匹配 profile 配置）
- 支持模糊匹配确保当前模型始终出现在列表中

### 2) Dynamic model list via RPC
- Model list is now fetched via Gateway RPC `models.list` + `sessions.list`, reflecting runtime model catalog and current session model
- Falls back to local config files if RPC fails (root config > port-matched profile config)
- Fuzzy matching ensures the current model always appears in the list

---

## 📦 安装 / Installation

### VSIX
```bash
code --install-extension openclaw-0.2.24.vsix
```

### Open VSX
https://open-vsx.org/extension/shenyingjun5/openclaw

### GitHub Release
https://github.com/shenyingjun5/openclaw-vscode/releases/tag/v0.2.24
