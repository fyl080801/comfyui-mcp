/**
 * Enhanced WebSocket client for ComfyUI with job tracking support
 * Extends the base ComfyuiWebsocket to capture all events and update job status
 */
import { ComfyuiWebsocket, type ComfyWsParams } from './ws.js'
import type { JobManager } from '../job/index.js'
import type { JobResult, NodeExecutionHistoryEntry } from '../job/types.js'
import { wsLogger, jobLogger } from '../logger/index.js'

type ComfyuiWebsocketOptions = {
  host: string
  clientId: string
  timeout?: number
}

/**
 * ComfyUI WebSocket event data types
 */
interface ComfyUIProgressData {
  value: number
  max: number
  node: string
}

interface ComfyUIExecutionCachedData {
  nodes: string[]
}

interface ComfyUIExecutingData {
  node: string
}

interface ComfyUIExecutedData {
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

/**
 * Enhanced WebSocket client that tracks job progress and execution history
 */
export class ComfyuiWebsocketEnhanced extends ComfyuiWebsocket {
  private jobId: string
  private jobManager: JobManager
  private nodeExecutionHistory: NodeExecutionHistoryEntry[] = []
  private cachedNodes: string[] = []
  private executingNode: string | null = null

  constructor(options: ComfyuiWebsocketOptions, jobId: string, jobManager: JobManager) {
    super(options)
    this.jobId = jobId
    this.jobManager = jobManager
    this.setupEventHandlers()
    wsLogger.connected(options.clientId, options.host)
  }

  /**
   * Set up event handlers to capture all ComfyUI events
   */
  private setupEventHandlers(): void {
    this.on('progress', this.handleProgressEvent.bind(this))
    this.on('execution_cached', this.handleExecutionCachedEvent.bind(this))
    this.on('executing', this.handleExecutingEvent.bind(this))
  }

  /**
   * Handle progress events from ComfyUI
   */
  private handleProgressEvent(event: any): void {
    const data = event.data as ComfyUIProgressData
    this.jobManager.updateJobProgress(this.jobId, {
      current: data.value,
      maximum: data.max,
      node: data.node,
      cachedNodes: [...this.cachedNodes],
      timestamp: new Date(),
    })
    jobLogger.progress(this.jobId, data.value, data.max, data.node)
  }

  /**
   * Handle execution_cached events (nodes that were cached)
   */
  private handleExecutionCachedEvent(event: any): void {
    const data = event.data as ComfyUIExecutionCachedData
    if (data.nodes && Array.isArray(data.nodes)) {
      this.cachedNodes.push(...data.nodes)

      // Add to execution history as cached
      const timestamp = new Date()
      data.nodes.forEach((nodeId: string) => {
        this.nodeExecutionHistory.push({
          nodeId,
          executedAt: timestamp,
          cached: true,
        })
      })
    }
  }

  /**
   * Handle executing events (node starts execution)
   */
  private handleExecutingEvent(event: any): void {
    const data = event.data as ComfyUIExecutingData
    if (data.node) {
      this.executingNode = data.node
    }
  }

  /**
   * Execute workflow with job tracking
   * Overrides the parent's open method to capture execution details
   */
  async executeWithJobTracking(params: ComfyWsParams): Promise<JobResult & { output: any }> {
    // Update job status to RUNNING
    this.jobManager.updateJobStatus(this.jobId, 'running' as any, {
      startedAt: new Date(),
    })

    try {
      // Call parent's open method to execute the workflow
      const executedResult = await super.open(params)

      // Build JobResult from ComfyUI execution result
      const result: JobResult & { output: any } = {
        output: executedResult.output,
        images: executedResult.output.images.map((img) => ({
          filename: img.filename,
          subfolder: img.subfolder || '',
          type: img.type || 'output',
        })),
        node: executedResult.node,
        displayNode: executedResult.display_node,
        promptId: executedResult.prompt_id,
        executionTime: 0, // Will be set by caller
        nodeHistory: this.nodeExecutionHistory,
      }

      return result
    } catch (error) {
      // Set error and re-throw
      this.jobManager.setJobError(this.jobId, error as Error)
      this.jobManager.updateJobStatus(this.jobId, 'failed' as any, {
        completedAt: new Date(),
      })
      wsLogger.error(this.jobId, error as Error)
      throw error
    }
  }

  /**
   * Close WebSocket connection
   */
  close(): void {
    wsLogger.disconnected(this.jobId)
    super.close()
  }

  /**
   * Get the executing node (for debugging)
   */
  getExecutingNode(): string | null {
    return this.executingNode
  }

  /**
   * Get the node execution history
   */
  getNodeExecutionHistory(): NodeExecutionHistoryEntry[] {
    return [...this.nodeExecutionHistory]
  }

  /**
   * Get cached nodes list
   */
  getCachedNodes(): string[] {
    return [...this.cachedNodes]
  }
}
