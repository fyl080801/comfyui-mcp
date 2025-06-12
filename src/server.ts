import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {
  Notification,
  LoggingMessageNotification,
  JSONRPCNotification,
  JSONRPCError,
  InitializeRequestSchema
} from "@modelcontextprotocol/sdk/types.js"
import { randomUUID } from "crypto"
import { Request, Response } from "express"
import { z } from "zod"
import { downloadImageAsBase64, jsonTryParse } from "./utils"
import prompt from "./prompt"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import WebSocket from "ws"

const SESSION_ID_HEADER_NAME = "mcp-session-id"
const JSON_RPC = "2.0"
const COMFYUI_WS = "ws://localhost:8188"

export const COMFYUI_URL = "http://localhost:8188"

export class StreamableMCPServer {
  server: McpServer

  // to support multiple simultaneous connections
  transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

  private toolInterval: NodeJS.Timeout | undefined
  private getGenerateToolName = "comfyui_generate"

  constructor(server: McpServer) {
    this.server = server
    this.setupTools()
  }

  async handleGetRequest(req: Request, res: Response) {
    // 服务必须是支持流式传输的
    // res.status(405).set('Allow', 'POST').send('Method Not Allowed')
    const sessionId = req.headers["mcp-session-id"] as string | undefined

    if (!sessionId || !this.transports[sessionId]) {
      res
        .status(400)
        .json(
          this.createErrorResponse("Bad Request: invalid session ID or method.")
        )
      return
    }

    console.log(`Establishing SSE stream for session ${sessionId}`)
    const transport = this.transports[sessionId]
    await transport.handleRequest(req, res)
    await this.streamMessages(transport)

    return
  }

  async handlePostRequest(req: Request, res: Response) {
    const sessionId = req.headers[SESSION_ID_HEADER_NAME] as string | undefined
    let transport: StreamableHTTPServerTransport

    try {
      // 如果是同一个session就resume
      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId]
        await transport.handleRequest(req, res, req.body)
        return
      }

      // 创建新的Transport
      if (!sessionId && this.isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID()
        })

        await this.server.connect(transport)
        await transport.handleRequest(req, res, req.body)

        const sessionId = transport.sessionId
        if (sessionId) {
          this.transports[sessionId] = transport
        }

        return
      }

      res
        .status(400)
        .json(
          this.createErrorResponse("Bad Request: invalid session ID or method.")
        )
      return
    } catch (error) {
      console.error("Error handling MCP request:", error)
      res.status(500).json(this.createErrorResponse("Internal server error."))
      return
    }
  }

  async cleanup() {
    this.toolInterval?.close()
    await this.server.close()
  }

  private setupTools() {
    this.server.registerTool(
      this.getGenerateToolName,
      {
        description: "comfyui generate image",
        inputSchema: {
          prompt: z.string().describe("prompt, must in english"),
          negative_prompt: z
            .string()
            .optional()
            .describe("negative prompt, must in english"),
          width: z.number().optional().describe("image width"),
          height: z.number().optional().describe("image height")
        }
      },
      async (params) => {
        const clientId = randomUUID()

        const executeGen = async () => {
          const response = await fetch(`${COMFYUI_URL}/prompt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              client_id: clientId,
              prompt: prompt(params)
            })
          })

          if (!response?.ok) throw new Error("ComfyUI调用失败")
        }

        const executeWs = () => {
          const { resolve, reject, promise } = Promise.withResolvers<any[]>()

          const ws = new WebSocket(`${COMFYUI_WS}/ws?clientId=${clientId}`)

          const start = new Date().valueOf()
          const timer = setInterval(() => {
            if (new Date().valueOf() - start < 5 * 60 * 1000) return

            clearInterval(timer)
            ws.close()

            reject(new Error("comfyui timeout"))
          }, 1000)

          ws.addEventListener("open", () => {
            executeGen()
          })

          ws.addEventListener("message", (ev) => {
            const data: any = jsonTryParse(ev.data?.toString())

            // if (
            //   ![
            //     "status",
            //     "executing",
            //     "execution_start",
            //     "executed",
            //     "progress"
            //   ].includes(data?.type)
            // )
            //   return

            if (data?.type === "executed") {
              clearInterval(timer)
              ws.close()

              resolve(data?.data?.output?.images || [])
            }
            // {"type": "status", "data": {"status": {"exec_info": {"queue_remaining": 0}}, "sid": "3b97fe3c916c4506a700973339641bdd"}}
            // {"type": "execution_start", "data": {"prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d", "timestamp": 1749660341752}}
            // {"type": "execution_cached", "data": {"nodes": [], "prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d", "timestamp": 1749660341766}}
            // {"type": "progress", "data": {"value": 25, "max": 25, "prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d", "node": "31"}}
            // {"type": "executing", "data": {"node": "32", "display_node": "32", "prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d"}}
            // {"type": "executed", "data": {"node": "144", "display_node": "144", "output": {"images": [{"filename": "ComfyUI_Export_00101_.png", "subfolder": "", "type": "output"}]}, "prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d"}}
          })

          ws.addEventListener("error", (e) => {
            clearInterval(timer)
            ws.close()

            reject(new Error(e.message))
          })

          return promise
        }

        const images = await executeWs()

        return {
          content: images.map((image) => {
            return {
              type: "resource",
              resource: {
                text: "image",
                uri: `http://localhost:3000/view?filename=${image.filename}`
              }
            }
          })
        }

        // const results = await Promise.all(
        //   images.map(async (image) => {
        //     const downloaded = await downloadImageAsBase64(
        //       `${COMFYUI_URL}/view?filename=${image.filename}`
        //     ).catch((err) => {
        //       console.log(err)
        //       return null
        //     })

        //     return downloaded
        //   })
        // )

        // return {
        //   content: results
        //     .filter((item) => item !== null)
        //     .map((item) => ({
        //       type: "image",
        //       data: item.base64,
        //       mimeType: item.contentType
        //     }))
        // }
      }
    )

    // // set tools dynamically, changing 5 second
    // this.toolInterval = setInterval(async () => {
    //   // setToolSchema()
    //   // to notify client that the tool changed
    //   Object.values(this.transports).forEach((transport) => {
    //     const notification: ToolListChangedNotification = {
    //       method: "notifications/tools/list_changed"
    //     }
    //     this.sendNotification(transport, notification)
    //   })
    // }, 5000)
  }

  // send message streaming message every second
  private async streamMessages(transport: StreamableHTTPServerTransport) {
    try {
      // based on LoggingMessageNotificationSchema to trigger setNotificationHandler on client
      const message: LoggingMessageNotification = {
        method: "notifications/message",
        params: { level: "info", data: "SSE Connection established" }
      }

      this.sendNotification(transport, message)

      let messageCount = 0

      const interval = setInterval(async () => {
        messageCount++

        const data = `Message ${messageCount} at ${new Date().toISOString()}`

        const message: LoggingMessageNotification = {
          method: "notifications/message",
          params: { level: "info", data: data }
        }

        try {
          this.sendNotification(transport, message)

          if (messageCount === 2) {
            clearInterval(interval)

            const message: LoggingMessageNotification = {
              method: "notifications/message",
              params: { level: "info", data: "Streaming complete!" }
            }

            this.sendNotification(transport, message)
          }
        } catch (error) {
          console.error("Error sending message:", error)
          clearInterval(interval)
        }
      }, 1000)
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  private async sendNotification(
    transport: StreamableHTTPServerTransport,
    notification: Notification
  ) {
    const rpcNotificaiton: JSONRPCNotification = {
      ...notification,
      jsonrpc: JSON_RPC
    }
    await transport.send(rpcNotificaiton)
  }

  private createErrorResponse(message: string): JSONRPCError {
    return {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: message
      },
      id: randomUUID()
    }
  }

  private isInitializeRequest(body: any): boolean {
    const isInitial = (data: any) => {
      const result = InitializeRequestSchema.safeParse(data)
      return result.success
    }
    if (Array.isArray(body)) {
      return body.some((request) => isInitial(request))
    }
    return isInitial(body)
  }
}
