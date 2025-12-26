# ComfyUI 工作流配置最佳实践

本文档介绍如何正确配置 ComfyUI 工作流，确保任务状态正确更新和结果正确返回。

## 目录

- [结束节点检测](#结束节点检测)
- [输出配置](#输出配置)
- [常见问题](#常见问题)
- [配置示例](#配置示例)

---

## 结束节点检测

ComfyUI-MCP 使用智能结束节点检测机制来确定工作流何时完成执行。系统按照以下优先级顺序查找结束节点：

### 优先级顺序

1. **配置文件中 `outputs` 定义的最后一个节点**（推荐）
2. `SaveImage` 节点
3. 任何以 `Save` 开头的节点（如 `SaveImageS3`）
4. 工作流中的最后一个节点（fallback）

### 推荐做法

**显式定义结束节点**（最佳实践）：

```json
{
  "name": "my_workflow",
  "outputs": [
    {
      "name": "generated_image",
      "type": "image",
      "description": "生成的图片",
      "source": {
        "node_id": "9",
        "output_type": "images",
        "index": 0
      }
    },
    {
      "name": "metadata",
      "type": "text",
      "description": "元数据信息",
      "source": {
        "node_id": "10",
        "output_type": "text",
        "index": 0
      }
    }
  ]
}
```

在上面的例子中，节点 **10** 会被用作结束节点，因为它是 `outputs` 数组中的最后一个。

### 为什么这很重要？

当工作流中有多个节点会触发 `executed` 事件时，如果结束节点配置不正确，可能会导致：

- ❌ 任务状态一直显示 `running`
- ❌ WebSocket 连接无法正常关闭
- ❌ 结果无法正确返回

### 示例：多节点工作流

考虑以下工作流结构：

```
节点 7: VAEDecode (解码图片)
  ↓
节点 8: SaveImage (保存图片到本地)
  ↓
节点 9: SaveImageS3 (保存图片到 S3)
  ↓
节点 10: StringConstant (返回 S3 URL)
```

如果配置中没有定义 `outputs`，系统会：
1. 找不到 `SaveImage` 节点（因为节点 8 不是最后一个）
2. 找到 `SaveImageS3` 节点（节点 9）并使用它作为结束节点
3. 但节点 9 执行完成后，节点 10 还在执行
4. 当节点 10 执行完成时，WebSocket 可能已经关闭

**正确的配置**：

```json
{
  "outputs": [
    {
      "name": "s3_url",
      "type": "text",
      "description": "S3 URL",
      "source": {
        "node_id": "10",
        "output_type": "text"
      }
    }
  ]
}
```

这样系统会使用节点 10 作为结束节点，确保工作流完全执行完成。

---

## 输出配置

`outputs` 配置定义了工作流执行完成后应返回哪些结果。系统会根据这些配置构建结构化的输出。

### 支持的输出类型

| 类型 | 描述 | source.output_type | 示例节点 |
|------|------|-------------------|---------|
| `image` | 图片输出 | `images` | SaveImage, SaveImageS3 |
| `text` | 文本输出 | `text` | StringConstant, Text输出节点 |
| `json` | JSON 数据 | `json` | 自定义 JSON 输出节点 |
| `video` | 视频输出 | `video` | SaveVideo 节点 |
| `audio` | 音频输出 | `audio` | SaveAudio 节点 |
| `3d_model` | 3D 模型 | `mesh` | SaveMesh 节点 |

### 图片输出配置

```json
{
  "name": "generated_image",
  "type": "image",
  "description": "生成的图片",
  "source": {
    "node_id": "9",
    "output_type": "images",
    "index": 0
  }
}
```

- `node_id`: 产生输出的节点 ID
- `output_type`: 固定为 `images`
- `index`: 当节点输出多个图片时，指定返回第几个（从 0 开始）

**处理结果**：
- 如果启用了 S3，图片会自动上传到 S3
- 返回结果中包含 `url`（ComfyUI 地址）和 `s3_url`（S3 地址）

### 文本输出配置

```json
{
  "name": "s3_url",
  "type": "text",
  "description": "S3 上的图片 URL",
  "source": {
    "node_id": "10",
    "output_type": "text",
    "index": 0
  }
}
```

- `output_type`: 固定为 `text`
- 系统会从节点的输出中提取文本内容

### 多输出配置

一个工作流可以定义多个输出：

```json
{
  "outputs": [
    {
      "name": "thumbnail",
      "type": "image",
      "description": "缩略图",
      "source": {
        "node_id": "8",
        "output_type": "images",
        "index": 0
      }
    },
    {
      "name": "full_image",
      "type": "image",
      "description": "完整图片",
      "source": {
        "node_id": "9",
        "output_type": "images",
        "index": 0
      }
    },
    {
      "name": "metadata",
      "type": "text",
      "description": "生成参数",
      "source": {
        "node_id": "10",
        "output_type": "text"
      }
    }
  ]
}
```

---

## 常见问题

### Q1: 任务一直显示 running 状态

**症状**：ComfyUI 中的工作流已经执行完成，但通过 `query_job` 查询时状态仍然是 `running`。

**原因**：
- 结束节点检测不正确
- 工作流中有多个节点触发 `executed` 事件
- WebSocket 连接在所有节点完成前就关闭了

**解决方案**：

1. 在 `config.json` 中显式定义 `outputs`，确保最后一个输出节点是工作流真正的最后一步
2. 检查工作流结构，确保没有遗漏的节点
3. 查看日志中的 "End node set to" 信息，确认使用的结束节点是否正确

### Q2: 输出结果为空

**症状**：任务执行成功，但 `outputs` 字段为空或缺少预期的输出。

**原因**：
- `source.node_id` 配置错误
- `output_type` 不匹配节点实际的输出类型
- 节点输出索引（index）配置错误

**解决方案**：

1. 打开工作流 JSON 文件，确认节点 ID 正确
2. 检查节点的 `class_type` 和输出类型
3. 如果节点输出多个值，检查 `index` 是否正确

### Q3: 图片没有上传到 S3

**症状**：返回结果中只有 `url`，没有 `s3_url`。

**原因**：
- S3 配置未启用
- S3 上传失败（网络问题、权限问题）

**解决方案**：

1. 检查环境变量 `S3_ENABLE=true`
2. 检查 AWS 凭证配置：`AWS_ACCESS_KEY_ID` 和 `AWS_SECRET_ACCESS_KEY`
3. 查看日志中的错误信息

### Q4: 自定义节点输出无法识别

**症状**：使用自定义的 ComfyUI 节点（如 `SaveImageS3`），但系统无法识别。

**原因**：
- 系统的自动检测只能识别以 `Save` 开头的节点
- 对于特殊节点，需要在 `outputs` 中显式配置

**解决方案**：

在 `config.json` 中显式配置该节点为输出节点：

```json
{
  "outputs": [
    {
      "name": "custom_output",
      "type": "image",
      "source": {
        "node_id": "38",
        "output_type": "images"
      }
    }
  ]
}
```

---

## 配置示例

### 示例 1: 简单文本生成图片

**config.json**:

```json
{
  "name": "text_to_image",
  "comfyui_workflow_api": "text_to_image",
  "parameters": [
    {
      "name": "prompt",
      "type": "string",
      "description": "文本提示",
      "required": true,
      "comfyui_node_id": "6",
      "comfyui_widget_name": "text"
    }
  ],
  "outputs": [
    {
      "name": "generated_image",
      "type": "image",
      "description": "生成的图片",
      "source": {
        "node_id": "9",
        "output_type": "images",
        "index": 0
      }
    }
  ]
}
```

**工作流结构**:
```
节点 6: CLIPTextEncode (编码提示词)
  ↓
节点 1: KSampler (生成图片)
  ↓
节点 7: VAEDecode (解码)
  ↓
节点 9: SaveImage (保存图片)
```

### 示例 2: 图片生成并上传 S3

**config.json**:

```json
{
  "name": "z_image_generation",
  "comfyui_workflow_api": "z_image_generation",
  "parameters": [
    {
      "name": "prompt",
      "type": "string",
      "description": "文本提示",
      "required": true,
      "comfyui_node_id": "3",
      "comfyui_widget_name": "text"
    },
    {
      "name": "width",
      "type": "number",
      "description": "图片宽度",
      "required": false,
      "default": 512,
      "comfyui_node_id": "6",
      "comfyui_widget_name": "width"
    }
  ],
  "outputs": [
    {
      "name": "s3_url",
      "type": "text",
      "description": "S3 上的图片 URL",
      "source": {
        "node_id": "39",
        "output_type": "text",
        "index": 0
      }
    }
  ]
}
```

**工作流结构**:
```
节点 3: CLIPTextEncode
  ↓
节点 1: KSampler
  ↓
节点 7: VAEDecode
  ↓
节点 38: SaveImageS3 (上传到 S3)
  ↓
节点 39: StringConstant (返回 S3 URL) ← 结束节点
```

### 示例 3: 多输出工作流

**config.json**:

```json
{
  "name": "image_with_metadata",
  "comfyui_workflow_api": "image_with_metadata",
  "parameters": [
    {
      "name": "prompt",
      "type": "string",
      "required": true,
      "comfyui_node_id": "3",
      "comfyui_widget_name": "text"
    }
  ],
  "outputs": [
    {
      "name": "generated_image",
      "type": "image",
      "description": "生成的图片",
      "source": {
        "node_id": "8",
        "output_type": "images",
        "index": 0
      }
    },
    {
      "name": "generation_params",
      "type": "json",
      "description": "生成参数",
      "source": {
        "node_id": "9",
        "output_type": "json",
        "index": 0
      }
    },
    {
      "name": "execution_time",
      "type": "text",
      "description": "执行时间（毫秒）",
      "source": {
        "node_id": "10",
        "output_type": "text",
        "index": 0
      }
    }
  ]
}
```

---

## 调试技巧

### 1. 查看日志

启动服务时查看日志输出，找到这样的信息：

```
Job abc-123: End node set to '39'
```

确认使用的结束节点是否符合预期。

### 2. 检查工作流 JSON

打开工作流文件，查看节点结构：

```bash
cat workflows/z_image_generation.json | jq '.'
```

确认：
- 节点 ID 是否正确
- 节点的 `class_type` 是什么
- 节点之间的连接关系

### 3. 测试单个节点

如果某个节点的输出无法获取，可以在 ComfyUI 中单独测试该节点，确认它确实产生了预期的输出。

### 4. 使用 list_jobs 工具

```bash
# 查看所有运行中的任务
call list_jobs(status="running")

# 查看特定服务的任务
call list_jobs(service="z_image_generation")
```

---

## 总结

### 关键要点

1. **始终定义 `outputs`**：显式定义输出节点，确保系统知道何时结束
2. **结束节点是最后一个输出**：`outputs` 数组的最后一个元素会被用作结束节点
3. **验证节点 ID**：确保 `source.node_id` 与工作流文件中的节点 ID 一致
4. **检查日志**：通过日志确认结束节点检测是否正确
5. **测试配置**：使用简单的提示词测试工作流是否正常执行

### 配置检查清单

- [ ] 在 `config.json` 中定义了 `outputs` 字段
- [ ] 每个输出的 `source.node_id` 在工作流文件中存在
- [ ] `source.output_type` 与节点实际输出类型匹配
- [ ] 最后一个输出节点是工作流的真正结束点
- [ ] 测试工作流能正常完成并返回结果
- [ ] 查看日志确认 "End node set to" 信息正确

---

## 相关文档

- [CLAUDE.md](../CLAUDE.md) - 项目架构和开发指南
- [config.json](../config.json) - 完整配置示例
- [config.schema.json](../config.schema.json) - 配置 JSON Schema
