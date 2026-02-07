# Release v0.2.3

## 🧠 思考深度切换

### 新功能
- **Think 选择器** - 底部工具栏新增思考深度下拉框
- 支持 off / minimal / low / medium / high / xhigh 六个级别
- 会话级独立控制，多窗口互不干扰
- 切换模型后 thinking 自动重置为 medium
- xhigh 仅在支持的模型上显示（openai/gpt-5.2 等）
- 下拉框根据 VS Code 语言自动显示中文/英文

### 技术实现
- 通过 WebSocket 发送 `/think` 指令设置
- 通过 `sessions.list` 获取当前 thinking level
- CLI 兜底机制（enableCliFallback 默认已开启）

### 改进
- `enableCliFallback` 默认值改为 `true`
