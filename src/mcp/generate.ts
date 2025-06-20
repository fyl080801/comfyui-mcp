import z from "zod"
import { useFastMcp } from "../server.js"
import { randomUUID } from "crypto"
import prompt from "./prompt.js"
import { jsonTryParse } from "../utils.js"
import { WebSocket } from "ws"
import { COMFYUI_HOST } from "../constants.js"
import axios from "axios"
import { imageContent } from "fastmcp"
import { uploadToS3 } from "./s3.js"

type ComfyuiWebsocketOptions = {
  host: string
  clientId: string
  timeout?: number
}

type ComfyuiEvents =
  | "status"
  | "execution_start"
  | "execution_cached"
  | "progress"
  | "executing"
  | "executed"

type ComfyuiEventHandler = (event: Event & { data?: any }) => void

class ComfyuiEvent extends Event {
  public data: any

  constructor(type: string, init: EventInit & { data: any }) {
    super(type, init)

    this.data = init.data
  }
}

class ComfyuiWebsocket {
  private websocket?: WebSocket | null
  private host: string
  private clientId: string
  private timeout: number
  private timer?: NodeJS.Timeout

  private events: EventTarget = new EventTarget()

  private async executeGen(params: any) {
    const response = await axios.post(`http://${this.host}/prompt`, {
      client_id: this.clientId,
      prompt: prompt(params)
    })

    if (response.status !== 200) throw new Error("ComfyUI调用失败")
  }

  constructor(options: ComfyuiWebsocketOptions) {
    const { host, clientId, timeout = 8 * 60 * 1000 } = options

    this.host = host
    this.timeout = timeout
    this.clientId = clientId
  }

  async open(params: any) {
    const { resolve, reject, promise } = Promise.withResolvers<{
      node: string
      display_node: string
      output: {
        images: Array<{
          filename: string
          subfolder: string
          type: string
        }>
      }
      prompt_id: string
    }>()

    this.websocket = new WebSocket(
      `ws://${this.host}/ws?clientId=${this.clientId}`
    )

    this.websocket.addEventListener("open", () => {
      const start = new Date().valueOf()
      this.timer = setInterval(() => {
        if (new Date().valueOf() - start < this.timeout) return

        this.close()

        reject(new Error("comfyui timeout"))
      }, 1000)

      this.executeGen(params)
    })

    this.websocket.addEventListener("message", ({ data }) => {
      const eventData = jsonTryParse(data?.toString())

      if (
        [
          "status",
          "execution_start",
          "execution_cached",
          "progress",
          "executing"
        ].includes(eventData?.type)
      ) {
        this.events.dispatchEvent(
          new ComfyuiEvent(eventData?.type, {
            data: eventData
          })
        )
      }

      if (eventData?.type === "executed") {
        this.close()
        resolve(eventData?.data)
      }
    })

    return promise
  }

  close() {
    clearInterval(this.timer)
    this.websocket?.close()
    this.websocket = null
  }

  on(event: ComfyuiEvents, handler: ComfyuiEventHandler) {
    this.events.addEventListener(event, handler)
  }

  off(event: ComfyuiEvents, handler: ComfyuiEventHandler) {
    this.events.removeEventListener(event, handler)
  }
}

useFastMcp((server) => {
  server.addTool({
    name: "comfyui_generate",
    description: "comfyui generate image",
    parameters: z.object({
      prompt: z.string().describe("prompt, must in english"),
      negative_prompt: z
        .string()
        .optional()
        .describe("negative prompt, must in english"),
      width: z.number().optional().describe("image width"),
      height: z.number().optional().describe("image height")
    }),
    execute: async (params, context) => {
      const clientId = randomUUID()

      const ws = new ComfyuiWebsocket({
        host: COMFYUI_HOST,
        clientId
      })

      ws.on("progress", ({ data }) => {
        const { data: progress } = data

        context.reportProgress({
          progress: +progress.value,
          total: +progress.max
        })
      })

      const result = await ws.open(params)

      const resources = []
      for (const image of result?.output?.images || []) {
        const imageUrl = `http://${COMFYUI_HOST}/view?filename=${image.filename}`

        const imageBuffer = await axios.get(imageUrl, {
          responseType: "arraybuffer"
        })

        const s3Url = await uploadToS3(image.filename, imageBuffer.data)

        resources.push(s3Url)

        await context.streamContent({
          type: "resource",
          resource: {
            uri: s3Url,
            mimeType: "image/png"
          }
        })
      }

      return {
        content: resources.map((item) => ({
          type: "resource",
          resource: {
            text: "image",
            uri: item
          }
        }))
      }
    }
  })
})
