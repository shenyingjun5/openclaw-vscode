# Agent 选择功能测试计划

## 测试环境
- 项目：openclaw-vscode
- 测试时间：2026-03-08
- 测试人：大牛

## 测试原则
- ⚠️ 不破坏现有 Agent 数据
- ⚠️ 只创建测试用的 Agent
- ⚠️ 测试完成后清理测试数据

## 测试用例

### 1. Agent 列表获取测试
**目的**：验证能否正确获取现有 Agent 列表

**步骤**：
1. 打开 VSCode
2. 打开 OpenClaw 聊天界面
3. 点击 Agent 选择器
4. 查看是否显示现有 Agent 列表

**预期结果**：
- 显示所有现有 Agent（main, dev1, dev2, tester, writer, daily, zhaocai 等）
- 每个 Agent 显示正确的 emoji 和名称
- 当前选中的 Agent 有勾选标记

**测试数据**：无需创建，使用现有数据

---

### 2. 创建 Agent 测试
**目的**：验证创建新 Agent 的完整流程

**步骤**：
1. 点击 Agent 选择器
2. 点击"创建新 Agent"
3. 输入 Agent ID: `test-agent-001`
4. 输入显示名称: `测试 Agent 001`
5. 输入 Emoji: `🧪`
6. 选择角色: `测试工程师`
7. 跳过自定义描述
8. 确认创建

**预期结果**：
- 创建成功提示
- Agent 列表中出现新 Agent
- 询问是否切换到新 Agent

**清理**：测试完成后删除 `test-agent-001`

---

### 3. Agent 切换测试
**目的**：验证切换 Agent 功能

**步骤**：
1. 当前 Agent: dev2
2. 点击 Agent 选择器
3. 选择 `test-agent-001`
4. 等待切换完成

**预期结果**：
- 显示"已切换到 Agent: 🧪 测试 Agent 001"
- 聊天历史清空（新 Agent 没有历史）
- Agent 选择器显示当前 Agent 为 `test-agent-001`

**清理**：切换回 dev2

---

### 4. 更新 Agent 测试
**目的**：验证更新 Agent 信息

**步骤**：
1. 选择要更新的 Agent: `test-agent-001`
2. 选择更新字段: Name
3. 输入新名称: `测试 Agent 001 (已更新)`
4. 确认更新

**预期结果**：
- 更新成功提示
- Agent 列表中显示新名称

---

### 5. 删除 Agent 测试
**目的**：验证删除 Agent 功能

**步骤**：
1. 确保当前 Agent 不是 `test-agent-001`
2. 选择删除 `test-agent-001`
3. 确认删除
4. 选择"删除 Agent 和所有文件"

**预期结果**：
- 删除成功提示
- Agent 列表中不再显示 `test-agent-001`
- 文件系统中 Agent 目录被删除

---

### 6. Workspace 关联测试
**目的**：验证 Workspace 关联功能

**步骤**：
1. 打开项目 A
2. 切换到 Agent X
3. 关闭 VSCode
4. 重新打开项目 A
5. 查看当前 Agent

**预期结果**：
- 自动恢复到 Agent X

**注意**：此测试需要重启 VSCode，暂不执行

---

### 7. 错误处理测试

#### 7.1 创建重复 Agent
**步骤**：
1. 尝试创建 Agent ID: `main`

**预期结果**：
- 显示错误："Agent 'main' already exists"

#### 7.2 删除当前 Agent
**步骤**：
1. 当前 Agent: dev2
2. 尝试删除 dev2

**预期结果**：
- 显示错误："Cannot delete the currently active agent"

#### 7.3 删除 main Agent
**步骤**：
1. 尝试删除 main

**预期结果**：
- 显示错误："Cannot delete the main agent"

---

## 测试执行记录

### 测试 1: Agent 列表获取
- [ ] 执行时间：
- [ ] 结果：
- [ ] 备注：

### 测试 2: 创建 Agent
- [ ] 执行时间：
- [ ] 结果：
- [ ] 备注：

### 测试 3: Agent 切换
- [ ] 执行时间：
- [ ] 结果：
- [ ] 备注：

### 测试 4: 更新 Agent
- [ ] 执行时间：
- [ ] 结果：
- [ ] 备注：

### 测试 5: 删除 Agent
- [ ] 执行时间：
- [ ] 结果：
- [ ] 备注：

### 测试 7: 错误处理
- [ ] 执行时间：
- [ ] 结果：
- [ ] 备注：

---

## 测试总结

### 通过的测试
- 

### 失败的测试
- 

### 发现的问题
- 

### 需要修复的 Bug
- 

---

## 清理检查清单
- [ ] 删除测试 Agent: test-agent-001
- [ ] 切换回原始 Agent: dev2
- [ ] 验证现有 Agent 数据未被破坏
- [ ] 验证 Workspace 映射文件正常
