import { WebSocket } from 'ws'
import { axiosInstance } from '../http-client.js'
import type { AxiosError } from 'axios'
import { getComfyUIConfig } from '../config/index.js'
import { jsonTryParse } from '../utils/helpers.js'

// ComfyUI WebSocket implementation (simplified version of the one in generate.ts)
type ComfyuiWebsocketOptions = {
  host: string
  clientId: string
  timeout?: number
}

type ComfyuiEvents =
  | 'status'
  | 'execution_start'
  | 'execution_cached'
  | 'progress'
  | 'executing'
  | 'executed'
  | 'error'

type ComfyuiEventHandler = (event: Event & { data?: any }) => void

export interface ComfyWsParams {
  prompt: { [key: string]: any }
  end: string
}

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

class ComfyuiEvent extends Event {
  public data: any

  constructor(type: string, init: EventInit & { data: any }) {
    super(type, init)
    this.data = init.data
  }
}

class ComfyuiWebsocketError extends Error {
  constructor(message: string, public code?: string) {
    super(message)
    this.name = 'ComfyuiWebsocketError'
  }
}

export class ComfyuiWebsocket {
  private websocket?: WebSocket | null = null
  private host: string
  private clientId: string
  private timeout: number
  private timer?: NodeJS.Timeout
  private isClosed: boolean = false

  private events: EventTarget = new EventTarget()

  private async executeGen(prompt: any): Promise<void> {
    try {
      const comfyuiConfig = getComfyUIConfig()
      const response = await axiosInstance.post(
        `${comfyuiConfig.httpProtocol}://${this.host}/prompt`,
        {
          client_id: this.clientId,
          prompt: prompt,
        },
        {
          timeout: 30000,
        }
      )

      if (response.status !== 200) {
        throw new ComfyuiWebsocketError(
          `ComfyUI API call failed with status ${response.status}`,
          'API_ERROR'
        )
      }

      if (!response.data?.prompt_id) {
        throw new ComfyuiWebsocketError('Invalid response from ComfyUI API', 'INVALID_RESPONSE')
      }
    } catch (error) {
      const isAxiosError = (err: unknown): err is AxiosError => {
        return typeof err === 'object' && err !== null && 'response' in err
      }
      if (isAxiosError(error)) {
        throw new ComfyuiWebsocketError(
          `ComfyUI API call failed: ${(error as AxiosError).message}`,
          'API_CALL_FAILED'
        )
      }
      throw error
    }
  }

  constructor(options: ComfyuiWebsocketOptions) {
    const { host, clientId, timeout = 8 * 60 * 1000 } = options

    if (!host) throw new ComfyuiWebsocketError('Host is required', 'MISSING_HOST')
    if (!clientId) throw new ComfyuiWebsocketError('Client ID is required', 'MISSING_CLIENT_ID')

    this.host = host
    this.timeout = timeout
    this.clientId = clientId
  }

  async open(params: ComfyWsParams): Promise<ComfyuiExecutionResult> {
    if (this.isClosed) {
      throw new ComfyuiWebsocketError('WebSocket is already closed', 'ALREADY_CLOSED')
    }

    const { resolve, reject, promise } = Promise.withResolvers<ComfyuiExecutionResult>()

    // Validate parameters
    if (!params?.prompt) {
      reject(new ComfyuiWebsocketError('Prompt is required', 'MISSING_PROMPT'))
      return promise
    }

    try {
      const comfyuiConfig = getComfyUIConfig()
      this.websocket = new WebSocket(
        `${comfyuiConfig.wsProtocol}://${this.host}/ws?clientId=${this.clientId}`
      )

      this.websocket.addEventListener('open', () => {
        if (this.isClosed) return

        const start = Date.now()
        this.timer = setInterval(() => {
          if (this.isClosed) {
            clearInterval(this.timer)
            return
          }

          if (Date.now() - start >= this.timeout) {
            this.close()
            reject(new ComfyuiWebsocketError(`ComfyUI timeout after ${this.timeout}ms`, 'TIMEOUT'))
          }
        }, 1000)

        this.executeGen(params?.prompt).catch(reject)
      })

      this.websocket.addEventListener('message', ({ data }) => {
        if (this.isClosed) return

        const eventData = jsonTryParse<{
          type: ComfyuiEvents
          data: any
          message: string
        }>(data?.toString())

        if (!eventData?.type) return

        const handles: { [key: string]: Function } = {
          executing: () => {
            this.events.dispatchEvent(new ComfyuiEvent(eventData.type, { data: eventData }))
          },
          executed: () => {
            const currentNode = eventData.data?.node
            const endNode = params.end

            // 对于某些工作流，存在多个执行结束的节点，这时候需要指定一个结束节点用来判断
            if (endNode && currentNode !== endNode) {
              this.events.dispatchEvent(new ComfyuiEvent(eventData.type, { data: eventData }))
              return
            }

            this.close()

            // 这里先考虑结束的节点就是输出图片的节点，实际上如果生成多种类型的资源，应该在生成资源的时候有个事件通知出去
            if (eventData.data) {
              resolve(eventData.data as ComfyuiExecutionResult)
            } else {
              reject(
                new ComfyuiWebsocketError('Invalid executed event data', 'INVALID_EXECUTED_DATA')
              )
            }
          },
          error: () => {
            this.close()
            const errorMessage =
              eventData.data?.error?.message || eventData.message || 'Unknown ComfyUI error'
            reject(new ComfyuiWebsocketError(`ComfyUI error: ${errorMessage}`, 'EXECUTION_ERROR'))
          },
        }

        handles[eventData.type]?.()
      })

      this.websocket.addEventListener('error', (error) => {
        this.close()
        reject(new ComfyuiWebsocketError(`WebSocket error: ${error.message}`, 'WEBSOCKET_ERROR'))
      })

      this.websocket.addEventListener('close', () => {
        if (!this.isClosed) {
          this.close()
          reject(
            new ComfyuiWebsocketError(
              'WebSocket connection closed unexpectedly',
              'UNEXPECTED_CLOSE'
            )
          )
        }
      })
    } catch (error) {
      this.close()
      if (error instanceof ComfyuiWebsocketError) {
        reject(error)
      } else {
        reject(new ComfyuiWebsocketError(`Failed to initialize WebSocket: ${error}`, 'INIT_FAILED'))
      }
    }

    return promise
  }

  close(): void {
    this.isClosed = true
    clearInterval(this.timer)

    // Reset EventTarget to remove all listeners and prevent memory leaks
    this.events = new EventTarget()

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
