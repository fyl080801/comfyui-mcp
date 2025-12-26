# 输出节点验证机制

## 概述

为了避免配置错误导致任务卡在 `running` 状态，系统实现了自动验证机制来检查输出节点配置是否正确。

---

## 问题背景

在 ComfyUI 工作流中，只有特定的输出节点会触发 `executed` WebSocket 事件。如果配置了一个不会触发此事件的节点作为输出节点，会导致：

1. 任务无法完成
2. 状态一直显示 `running`
3. WebSocket 连接超时

### 常见错误配置示例

**❌ 错误：使用 `StringConstantMultiline` 作为输出节点**

```json
{
  "outputs": [
    {
      "name": "s3_url",
      "type": "text",
      "source": {
        "node_id": "39"  // StringConstantMultiline - 不会触发 executed 事件
      }
    }
  ]
}
```

**❌ 错误：使用 `VAEDecode` 作为输出节点**

```json
{
  "outputs": [
    {
      "name": "generated_image",
      "type": "image",
      "source": {
        "node_id": "9"  // VAEDecode - 不会触发 executed 事件
      }
    }
  ]
}
```

---

## 验证机制

### 启动时验证

服务启动时会自动验证所有服务的输出节点配置：

```bash
2025-12-26 20:28:06 [info]: Validating service configurations...
2025-12-26 20:28:06 [warn]: Service 'text_to_image' output node validation warnings:
  - Output node '9' has type 'VAEDecode', which may not trigger executed events.
    Valid output node types: SaveImage, SaveImageWebsocket, SaveImageS3, ...
    This could cause the job to hang in 'running' state.
```

### 执行时验证

每次执行工作流前，系统会再次验证输出节点配置，并记录警告日志。

---

## 有效的输出节点类型

以下节点类型被识别为有效的输出节点（会触发 `executed` 事件）：

- `SaveImage` - 保存图片到本地
- `SaveImageWebsocket` - 通过 WebSocket 发送图片
- `SaveImageS3` - 上传图片到 S3
- `SaveVideo` - 保存视频
- `SaveAudio` - 保存音频
- `SaveMesh` - 保存 3D 网格
- `PreviewImage` - 预览图片
- `VHS_SaveVideo` - VHS 保存视频
- `VHS_SaveVideoUpload` - VHS 上传视频
- **任何以 `Save` 开头的节点**

---

## 如何修复配置警告

### 步骤 1：查看警告信息

启动服务时查看日志输出，找到类似这样的警告：

```
Service 'z_image_generation' output node validation warnings:
  - Output node '39' has type 'StringConstantMultiline', which may not trigger executed events.
```

### 步骤 2：检查工作流文件

打开对应的工作流 JSON 文件，找到真正的输出节点：

```bash
cat workflows/z_image_generation.json | grep '"class_type"'
```

查找 `SaveImage`、`SaveImageS3` 等类型的节点。

### 步骤 3：更新配置

将 `config.json` 中的 `node_id` 更新为正确的输出节点：

**修复前：**
```json
{
  "outputs": [
    {
      "source": {
        "node_id": "39"  // StringConstantMultiline
      }
    }
  ]
}
```

**修复后：**
```json
{
  "outputs": [
    {
      "source": {
        "node_id": "38"  // SaveImageS3
      }
    }
  ]
}
```

### 步骤 4：重启服务

```bash
# 停止服务（Ctrl+C）
# 重新启动
npm run dev
```

### 步骤 5：验证修复

查看日志，确认没有警告：

```
✅ Validating service configurations...
✅ All service configurations validated successfully
```

---

## 验证规则详解

### 规则 1：节点必须存在

验证配置的 `node_id` 在工作流文件中是否存在。

**错误示例：**
```json
{
  "source": {
    "node_id": "999"  // 节点不存在
  }
}
```

**警告：**
```
Output node '999' not found in workflow
```

### 规则 2：节点类型必须有效

验证节点的 `class_type` 是否在有效输出节点列表中。

**无效的节点类型：**
- `StringConstantMultiline` - 仅处理文本，不产生输出
- `VAEDecode` - 解码潜在向量，不产生文件输出
- `KSampler` - 采样过程，不产生文件输出
- `CLIPTextEncode` - 文本编码，不产生文件输出

### 规则 3：通配符匹配

任何以 `Save` 开头的节点类型都会被自动识别为有效输出节点。

例如：
- `SaveImageCustom` ✅
- `SaveToFTP` ✅
- `SaveAndDisplay` ✅

---

## 工作流结构分析

### 典型的图片生成工作流

```
节点 3: CLIPTextEncode (编码提示词)
  ↓
节点 1: KSampler (生成潜在向量)
  ↓
节点 7: VAEDecode (解码潜在向量)
  ↓
节点 38: SaveImageS3 (保存图片到 S3) ← 输出节点
  ↓
节点 39: StringConstantMultiline (处理 URL) ← 后处理节点
```

**正确的配置：**
- 输出节点：38 (SaveImageS3)
- 节点 39 只是后处理，不会触发 `executed` 事件

### 多输出工作流

如果工作流有多个输出，`outputs` 数组的最后一个元素会被用作结束节点：

```json
{
  "outputs": [
    {
      "name": "thumbnail",
      "source": {
        "node_id": "10"  // SaveImage (缩略图)
      }
    },
    {
      "name": "full_image",
      "source": {
        "node_id": "12"  // SaveImage (完整图片) ← 结束节点
      }
    }
  ]
}
```

---

## 调试技巧

### 1. 查看工作流结构

使用 jq 查看所有节点类型：

```bash
cat workflows/your_workflow.json | jq '.[] | .class_type' | sort -u
```

### 2. 查找 Save 节点

```bash
cat workflows/your_workflow.json | jq '.[] | select(.class_type | startswith("Save"))'
```

### 3. 查看节点输出

使用 ComfyUI API 查看哪些节点产生了输出：

```bash
curl http://your-comfyui:8188/history | jq '.[] | .outputs | keys'
```

### 4. 测试配置

创建测试任务并查看日志：

```bash
curl -X POST http://localhost:3000/api/v1/services/your_service \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "test"}'
```

查看日志中的 "End node set to" 信息：

```
Using end node from service config.outputs: 38
Job abc-123: End node set to '38'
```

---

## 常见问题解答

### Q: 为什么 StringConstantMultiline 不能作为输出节点？

**A:** `StringConstantMultiline` 是一个处理节点，用于处理和显示文本，它不会触发 `executed` 事件，也不会被记录到 ComfyUI 的 outputs 中。虽然它在工作流中是最后一步，但系统无法通过它判断工作流何时完成。

### Q: 如何确定哪个是真正的输出节点？

**A:** 在 ComfyUI 的 Web UI 中，输出节点通常是：
- 产生文件输出的节点（图片、视频、音频等）
- 有 `Save` 前缀的节点类型
- 在工作流执行后，在 ComfyUI 界面的 "Output" 标签页中显示的节点

### Q: 如果工作流没有 Save 节点怎么办？

**A:** 这种情况下，工作流不会产生任何文件输出。需要先在 ComfyUI 中添加一个 Save 节点。

### Q: 验证失败会导致任务不执行吗？

**A:** 不会。验证只产生警告日志，不会阻止任务执行。系统会继续使用 fallback 机制（如使用最后一个节点）。但这可能导致任务无法正常完成，所以应该修复警告。

---

## 最佳实践

### 1. 始终定义 outputs 配置

```json
{
  "outputs": [
    {
      "name": "result",
      "type": "image",
      "source": {
        "node_id": "实际的Save节点ID",
        "output_type": "images"
      }
    }
  ]
}
```

### 2. 使用 Save 节点作为输出

优先使用 `SaveImage`、`SaveImageS3` 等以 `Save` 开头的节点。

### 3. 验证配置

- 启动服务后检查验证日志
- 修复所有警告
- 测试工作流执行

### 4. 文档化工作流

在工作流文件的注释中记录哪个是输出节点：

```json
{
  "23": {
    "class_type": "SaveImage",
    "_meta": {
      "title": "保存图像 (输出节点)"
    }
  }
}
```

---

## 相关文档

- [WORKFLOW_BEST_PRACTICES.md](./WORKFLOW_BEST_PRACTICES.md) - 工作流配置最佳实践
- [CHANGELOG_WORKFLOW.md](./CHANGELOG_WORKFLOW.md) - 工作流优化更新说明
- [config.json](../config.json) - 完整配置示例
