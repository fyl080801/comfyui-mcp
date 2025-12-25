import { randomUUID } from 'crypto'
import { ComfyuiWebsocket } from './comfyui/ws.js'
import { getComfyUIConfig } from './config/index.js'
import axios from './http-client.js'

/**
 * 执行ComfyUI工作流并返回生成的图像
 * @param workflow - ComfyUI工作流定义
 * @returns Promise<Buffer> - 返回第一张生成图像的Buffer
 */
export async function executeWorkflow(workflow: any): Promise<Buffer> {
  const comfyuiConfig = getComfyUIConfig()

  const clientId = randomUUID()
  const ws = new ComfyuiWebsocket({
    host: comfyuiConfig.host,
    clientId,
    timeout: 10 * 60 * 1000, // 10分钟超时
  })

  try {
    // 找到保存图像的节点作为结束节点
    const endNode = findSaveImageNode(workflow)

    const result = await ws.open({
      prompt: workflow,
      end: endNode,
    })

    if (!result?.output?.images?.length) {
      throw new Error('No images returned from ComfyUI')
    }

    // 获取第一张图像
    const image = result.output.images[0]
    if (!image) {
      throw new Error('No valid image found in ComfyUI response')
    }

    const imageUrl = `${comfyuiConfig.httpProtocol}://${
      comfyuiConfig.host
    }/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(
      image.subfolder || ''
    )}&type=${encodeURIComponent(image.type || 'output')}`

    // 下载图像
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30秒超时
    })

    if (imageResponse.status !== 200) {
      throw new Error(`Failed to download image: ${imageResponse.status}`)
    }

    return Buffer.from(imageResponse.data)
  } catch (error) {
    throw new Error(`执行工作流时出错: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    ws.close()
  }
}

/**
 * 查找工作流中的保存图像节点
 * @param workflow - ComfyUI工作流定义
 * @returns string - 保存图像节点的ID
 */
function findSaveImageNode(workflow: any): string {
  // 查找SaveImage类型的节点
  for (const [nodeId, node] of Object.entries(workflow)) {
    if ((node as any).class_type === 'SaveImage') {
      return nodeId
    }
  }

  // 如果没找到SaveImage节点，返回最后一个节点
  const nodeIds = Object.keys(workflow)
  const lastNodeId = nodeIds[nodeIds.length - 1]
  if (!lastNodeId) {
    throw new Error('No nodes found in workflow')
  }
  return lastNodeId
}
