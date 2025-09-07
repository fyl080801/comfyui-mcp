import z from "zod"
import { useFastMcp } from "../server.js"
import { randomUUID } from "crypto"
import prompt from "./prompt.js"
import { jsonTryParse } from "../utils.js"
import { WebSocket } from "ws"
import { COMFYUI_HOST } from "../constants.js"
import axios from "axios"
import { uploadToS3 } from "./s3.js"

// Validation for required environment variables
if (!COMFYUI_HOST) {
  throw new Error("COMFYUI_HOST environment variable is required")
}

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
  | "error"

type ComfyuiEventHandler = (event: Event & { data?: any }) => void

interface ComfyuiExecutionResult {
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
}

interface ComfyuiProgressData {
  value: number
  max: number
  node: string
  prompt_id: string
}

class ComfyuiEvent extends Event {
  public data: any

  constructor(type: string, init: EventInit & { data: any }) {
    super(type, init)
    this.data = init.data
  }
}

class ComfyuiWebsocketError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = "ComfyuiWebsocketError"
  }
}

class ComfyuiWebsocket {
  private websocket?: WebSocket | null = null
  private host: string
  private clientId: string
  private timeout: number
  private timer?: NodeJS.Timeout
  private isClosed: boolean = false

  private events: EventTarget = new EventTarget()

  private async executeGen(params: any): Promise<void> {
    try {
      const response = await axios.post(
        `http://${this.host}/prompt`,
        {
          client_id: this.clientId,
          prompt: prompt(params)
        },
        {
          timeout: 30000 // 30 second timeout for API call
        }
      )

      if (response.status !== 200) {
        throw new ComfyuiWebsocketError(
          `ComfyUI API call failed with status ${response.status}`,
          "API_ERROR"
        )
      }

      if (!response.data?.prompt_id) {
        throw new ComfyuiWebsocketError(
          "Invalid response from ComfyUI API",
          "INVALID_RESPONSE"
        )
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new ComfyuiWebsocketError(
          `ComfyUI API call failed: ${error.message}`,
          "API_CALL_FAILED"
        )
      }
      throw error
    }
  }

  constructor(options: ComfyuiWebsocketOptions) {
    const { host, clientId, timeout = 8 * 60 * 1000 } = options

    if (!host)
      throw new ComfyuiWebsocketError("Host is required", "MISSING_HOST")
    if (!clientId)
      throw new ComfyuiWebsocketError(
        "Client ID is required",
        "MISSING_CLIENT_ID"
      )

    this.host = host
    this.timeout = timeout
    this.clientId = clientId
  }

  async open(params: any): Promise<ComfyuiExecutionResult> {
    if (this.isClosed) {
      throw new ComfyuiWebsocketError(
        "WebSocket is already closed",
        "ALREADY_CLOSED"
      )
    }

    const { resolve, reject, promise } =
      Promise.withResolvers<ComfyuiExecutionResult>()

    // Validate parameters
    if (!params?.prompt) {
      reject(new ComfyuiWebsocketError("Prompt is required", "MISSING_PROMPT"))
      return promise
    }

    try {
      this.websocket = new WebSocket(
        `ws://${this.host}/ws?clientId=${this.clientId}`
      )

      this.websocket.addEventListener("open", () => {
        if (this.isClosed) return

        const start = Date.now()
        this.timer = setInterval(() => {
          if (this.isClosed) {
            clearInterval(this.timer)
            return
          }

          if (Date.now() - start >= this.timeout) {
            this.close()
            reject(
              new ComfyuiWebsocketError(
                `ComfyUI timeout after ${this.timeout}ms`,
                "TIMEOUT"
              )
            )
          }
        }, 1000)

        this.executeGen(params).catch(reject)
      })

      this.websocket.addEventListener("message", ({ data }) => {
        if (this.isClosed) return

        const eventData = jsonTryParse(data?.toString())

        if (!eventData?.type) return

        switch (eventData.type) {
          case "status":
          case "execution_start":
          case "execution_cached":
          case "progress":
          case "executing":
            this.events.dispatchEvent(
              new ComfyuiEvent(eventData.type, { data: eventData })
            )
            break

          case "executed":
            this.close()
            if (eventData.data) {
              resolve(eventData.data as ComfyuiExecutionResult)
            } else {
              reject(
                new ComfyuiWebsocketError(
                  "Invalid executed event data",
                  "INVALID_EXECUTED_DATA"
                )
              )
            }
            break

          case "execution_error":
          case "error":
            this.close()
            const errorMessage =
              eventData.data?.error?.message ||
              eventData.message ||
              "Unknown ComfyUI error"
            reject(
              new ComfyuiWebsocketError(
                `ComfyUI error: ${errorMessage}`,
                "EXECUTION_ERROR"
              )
            )
            break
        }
      })

      this.websocket.addEventListener("error", (error) => {
        this.close()
        reject(
          new ComfyuiWebsocketError(
            `WebSocket error: ${error.message}`,
            "WEBSOCKET_ERROR"
          )
        )
      })

      this.websocket.addEventListener("close", () => {
        if (!this.isClosed) {
          this.close()
          reject(
            new ComfyuiWebsocketError(
              "WebSocket connection closed unexpectedly",
              "UNEXPECTED_CLOSE"
            )
          )
        }
      })
    } catch (error) {
      this.close()
      if (error instanceof ComfyuiWebsocketError) {
        reject(error)
      } else {
        reject(
          new ComfyuiWebsocketError(
            `Failed to initialize WebSocket: ${error}`,
            "INIT_FAILED"
          )
        )
      }
    }

    return promise
  }

  close(): void {
    this.isClosed = true
    clearInterval(this.timer)

    if (this.websocket) {
      try {
        if (
          this.websocket.readyState === WebSocket.OPEN ||
          this.websocket.readyState === WebSocket.CONNECTING
        ) {
          this.websocket.close()
        }
      } catch (error) {
        // Ignore errors during close
      }
      this.websocket = null
    }
  }

  on(event: ComfyuiEvents, handler: ComfyuiEventHandler): void {
    this.events.addEventListener(event, handler)
  }

  off(event: ComfyuiEvents, handler: ComfyuiEventHandler): void {
    this.events.removeEventListener(event, handler)
  }
}

useFastMcp((server) => {
  server.addTool({
    name: "comfyui_generate",
    description: "Generate images using ComfyUI",
    parameters: z.object({
      prompt: z
        .string()
        .min(1)
        .describe("Prompt for image generation, must be in English"),
      negative_prompt: z
        .string()
        .optional()
        .describe(
          "Negative prompt to avoid certain elements, must be in English"
        ),
      width: z
        .number()
        .min(1)
        .max(1024)
        .optional()
        .describe("Image width (max 1024)"),
      height: z
        .number()
        .min(1)
        .max(1024)
        .optional()
        .describe("Image height (max 1024)"),
      steps: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of generation steps"),
      cfg_scale: z
        .number()
        .min(1)
        .max(30)
        .optional()
        .describe("CFG scale for generation")
    }),
    execute: async (params, context) => {
      const clientId = randomUUID()

      // Validate and constrain dimensions
      const constrainedParams = {
        ...params,
        width: params.width
          ? Math.min(Math.max(1, params.width), 1024)
          : undefined,
        height: params.height
          ? Math.min(Math.max(1, params.height), 1024)
          : undefined
      }

      context.log.info(`Generating image with prompt: "${params.prompt}"`, {
        width: params.width,
        height: params.height,
        steps: params.steps,
        cfg_scale: params.cfg_scale
      })

      const ws = new ComfyuiWebsocket({
        host: COMFYUI_HOST,
        clientId,
        timeout: 10 * 60 * 1000 // 10 minute timeout
      })

      // Progress tracking
      let lastProgressReport = 0
      const progressHandler = ({ data }: Event & { data?: any }) => {
        try {
          const progressData = data?.data as ComfyuiProgressData
          if (
            progressData?.value !== undefined &&
            progressData?.max !== undefined
          ) {
            const currentProgress = progressData.value
            const totalProgress = progressData.max

            // Throttle progress updates to avoid spam
            if (currentProgress > lastProgressReport) {
              context.reportProgress({
                progress: currentProgress,
                total: totalProgress
              })
              lastProgressReport = currentProgress
            }
          }
        } catch (error) {
          context.log.error(`Progress update error: ${error}`)
        }
      }

      ws.on("progress", progressHandler)

      try {
        const result = await ws.open(constrainedParams)

        if (!result?.output?.images?.length) {
          throw new Error("No images returned from ComfyUI")
        }

        context.log.info(`Generated ${result.output.images.length} image(s)`)

        const resources = []
        for (const [index, image] of result.output.images.entries()) {
          try {
            context.reportProgress({
              progress: index + 1,
              total: result.output.images.length
            })

            const imageUrl = `http://${COMFYUI_HOST}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || "")}&type=${encodeURIComponent(image.type || "output")}`

            const imageResponse = await axios.get(imageUrl, {
              responseType: "arraybuffer",
              timeout: 30000 // 30 second timeout
            })

            if (imageResponse.status !== 200) {
              throw new Error(
                `Failed to download image: ${imageResponse.status}`
              )
            }

            const s3Url = await uploadToS3(image.filename, imageResponse.data)

            resources.push(s3Url)

            await context.streamContent({
              type: "resource",
              resource: {
                uri: s3Url,
                mimeType: "image/png"
              }
            })
          } catch (error) {
            context.log.error(`Error processing image ${index + 1}: ${error}`)
            // Continue with other images if one fails
          }
        }

        if (resources.length === 0) {
          throw new Error("Failed to process any images")
        }

        context.log.info(`Successfully processed ${resources.length} image(s)`)

        return {
          content: resources.map((item) => ({
            type: "resource",
            resource: {
              text: "Generated image",
              uri: item
            }
          }))
        }
      } catch (error) {
        context.log.error(`Generation error: ${error}`)
        throw error
      } finally {
        ws.close()
      }
    }
  })
})
