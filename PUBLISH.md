# Open VSX 发布指南

## 发布步骤

### 1. 获取 Access Token（需要主人操作）

1. 打开 https://open-vsx.org
2. 点击右上角 **Login with GitHub**
3. 登录后，点击右上角头像 → **Access Tokens**
4. 点击 **Generate New Token**
5. 输入描述（如 `publish`），点击 **Generate**
6. **复制 Token**（只显示一次！）

### 2. 发布插件

把 Token 告诉我，或者自己运行：

```bash
cd ~/Desktop/openclaw-vscode

# 安装 ovsx 工具
npm install -g ovsx

# 重新打包（确保最新代码）
npm run compile
npx vsce package

# 发布到 Open VSX
ovsx publish openclaw-0.1.0.vsix -p <YOUR_TOKEN>
```

### 3. 验证发布

访问 https://open-vsx.org/extension/openclaw/openclaw

---

## 或者：把 Token 给我

如果你把 Token 发给我，我可以直接帮你执行发布命令。

Token 格式类似：`abc123def456...`（一串随机字符）
