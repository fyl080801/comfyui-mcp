# 工作流执行优化更新说明

## 更新内容

本次更新优化了 ComfyUI 工作流的执行逻辑，结合 `config.json` 中的 `outputs` 配置，提供了更智能和可靠的结束节点检测机制。

---

## 问题背景

之前版本中，工作流执行可能会出现"任务一直显示 running 状态"的问题。主要原因是：

1. **结束节点检测不准确**：系统只查找 `SaveImage` 节点，无法识别 `SaveImageS3` 等自定义节点
2. **多节点执行顺序问题**：当工作流中有多个节点都会触发 `executed` 事件时，可能因为节点执行顺序导致 Promise 无法正确 resolve
3. **缺少显式配置**：没有利用 `outputs` 配置来确定真正的结束节点

---

## 核心改进

### 1. 智能结束节点检测

实现了新的 [findEndNode](../src/comfyui/index.ts#L156-L194) 函数，按以下优先级检测结束节点：

```
优先级 1: outputs 中定义的最后一个节点（推荐）
    ↓
优先级 2: SaveImage 节点
    ↓
优先级 3: 任何 Save* 节点（SaveImageS3, SaveVideo, etc.）
    ↓
优先级 4: 工作流的最后一个节点（fallback）
```

### 2. 结构化输出处理

新增 [buildStructuredOutputs](../src/comfyui/index.ts#L201-L305) 函数，根据 `outputs` 配置构建结构化输出：

- 支持多种输出类型：image, text, json, video, audio, 3d_model
- 自动处理 S3 上传
- 提取节点输出并映射到配置的字段名

### 3. 增强的日志输出

在执行过程中记录关键信息：

```
Job abc-123: End node set to '39'
```

便于调试和验证配置是否正确。

---

## 配置示例

### 之前（问题配置）

```json
{
  "name": "z_image_generation",
  "parameters": [...],
  "outputs": [
    {
      "name": "s3_url",
      "type": "text",
      "source": {
        "node_id": "39",
        "output_type": "text"
      }
    }
  ]
}
```

**问题**：系统会使用节点 39 作为结束节点，但如果实际执行时节点 38（SaveImageS3）先完成，会导致状态不一致。

### 现在（优化后）

同样的配置，但系统会：

1. **优先使用节点 39** 作为结束节点（来自 `outputs` 配置）
2. **等待节点 39 执行完成**后再标记任务为完成
3. **构建结构化输出**，包含 `s3_url` 字段
4. **正确更新任务状态**为 `completed`

---

## 使用建议

### ✅ 推荐做法

1. **始终定义 `outputs`**：
   ```json
   {
     "outputs": [
       {
         "name": "result",
         "type": "text",
         "source": {
           "node_id": "最后一个节点的ID",
           "output_type": "text"
         }
       }
     ]
   }
   ```

2. **确保最后一个输出节点是真正的结束点**：
   - 如果工作流是 A → B → C → D，`outputs` 的最后一个节点应该是 D
   - 不要让中间的节点作为最后一个输出

3. **验证节点 ID**：
   - 打开工作流 JSON 文件，确认节点 ID 正确
   - 使用 ComfyUI 的节点 ID（字符串形式的数字）

### ❌ 避免的做法

1. **不要依赖自动检测**：
   - 虽然系统有 fallback 机制，但显式配置更可靠
   - 不要让系统猜测哪个是结束节点

2. **不要配置不存在的节点**：
   - 确保 `source.node_id` 在工作流文件中存在
   - 否则系统会 fallback 到其他节点

3. **不要忽略日志输出**：
   - 启动服务后查看日志，确认 "End node set to" 信息
   - 如果不符合预期，检查配置

---

## 迁移指南

### 对于现有配置

如果你的现有配置**已经定义了 `outputs`**：

✅ **无需修改**，系统会自动使用新的逻辑，工作流执行会更可靠。

如果你的现有配置**没有定义 `outputs`**：

⚠️ **建议添加**，虽然系统仍然可以工作（使用 fallback 机制），但显式配置更可靠。

### 迁移步骤

1. 打开 ComfyUI 工作流 JSON 文件
2. 找到工作流的最后一个节点（通常是没有输出连接的节点）
3. 记录该节点的 ID（例如 "39"）
4. 在 `config.json` 中添加 `outputs` 配置：

   ```json
   {
     "name": "your_service",
     "outputs": [
       {
         "name": "result",
         "type": "根据节点类型选择",
         "source": {
           "node_id": "步骤3中找到的节点ID",
           "output_type": "images/text/json等"
         }
       }
     ]
   }
   ```

5. 重新启动服务
6. 查看日志确认 "End node set to" 信息正确

---

## 兼容性说明

### 向后兼容

✅ **完全向后兼容**

- 现有配置无需修改即可继续使用
- `processOutputImages` 函数保留，用于处理所有图片输出
- API 响应格式不变，仍然包含 `images` 和 `outputs` 字段

### 新增功能

🆕 **新增功能**

- 结构化输出会自动填充到 `result.outputs` 字段
- 支持更多输出类型（video, audio, 3d_model）
- 更智能的结束节点检测

---

## 测试验证

### 验证步骤

1. **启动服务**：
   ```bash
   npm run dev
   ```

2. **调用工作流工具**：
   ```bash
   # 使用 MCP 客户端或 REST API
   call z_image_generation(prompt="a beautiful sunset")
   ```

3. **查询任务状态**：
   ```bash
   call query_job(job_id="返回的job_id")
   ```

4. **检查日志**：
   ```
   Job abc-123: End node set to '39'
   Job abc-123 completed successfully
   ```

5. **验证输出**：
   - 状态应该是 `completed`
   - `outputs` 字段应该包含配置的输出
   - 对于图片类型，应该有 `url` 和可选的 `s3_url`

---

## 故障排除

### 问题：任务仍然显示 running

**检查清单**：

1. 查看日志中的 "End node set to" 信息
2. 确认该节点 ID 在工作流中存在
3. 确认该节点确实是工作流的最后一步
4. 在 ComfyUI 中测试工作流是否正常执行

### 问题：outputs 为空

**检查清单**：

1. 确认 `outputs` 配置中的节点 ID 正确
2. 确认 `output_type` 与节点实际输出类型匹配
3. 查看节点是否在执行完成时产生了输出
4. 检查工作流 JSON 中该节点的输出结构

### 问题：S3 上传失败

**检查清单**：

1. 确认环境变量 `S3_ENABLE=true`
2. 确认 AWS 凭证配置正确
3. 检查网络连接和 S3 权限
4. 查看详细错误日志

---

## 文档

详细的使用指南和配置示例请参考：

- [WORKFLOW_BEST_PRACTICES.md](./WORKFLOW_BEST_PRACTICES.md) - 完整的最佳实践指南
- [CLAUDE.md](../CLAUDE.md) - 项目架构和开发文档
- [config.json](../config.json) - 配置示例

---

## 反馈

如有问题或建议，请提交 Issue 或 Pull Request。
