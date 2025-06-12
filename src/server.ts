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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

const SESSION_ID_HEADER_NAME = "mcp-session-id"
const JSON_RPC = "2.0"

const setups: ServerSetup[] = []

type ServerSetup = (server: McpServer) => void

export const setupServer = (setup: ServerSetup) => {
  setups.push(setup)
}

export class StreamableMCPServer {
  server: McpServer

  // to support multiple simultaneous connections
  transports: { [sessionId: string]: StreamableHTTPServerTransport } = {}

  // private toolInterval: NodeJS.Timeout | undefined

  constructor(server: McpServer) {
    this.server = server
    this.setup()
    // this.setupTools()
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
    // this.toolInterval?.close()
    await this.server.close()
  }

  private setup() {
    setups.forEach((setup) => setup(this.server))
  }

  // private setupTools() {
  //   // set tools dynamically, changing 5 second
  //   this.toolInterval = setInterval(async () => {
  //     // setToolSchema()
  //     // to notify client that the tool changed
  //     Object.values(this.transports).forEach((transport) => {
  //       const notification: ToolListChangedNotification = {
  //         method: "notifications/tools/list_changed"
  //       }
  //       this.sendNotification(transport, notification)
  //     })
  //   }, 5000)
  // }

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
