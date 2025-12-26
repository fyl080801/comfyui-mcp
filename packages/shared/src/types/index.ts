/**
 * Job status enumeration representing the lifecycle of a ComfyUI workflow execution
 */
export enum JobStatus {
  /** Job created, waiting to start execution */
  PENDING = 'pending',
  /** WebSocket connected, execution in progress */
  RUNNING = 'running',
  /** Execution finished successfully with results */
  COMPLETED = 'completed',
  /** Execution failed with an error */
  FAILED = 'failed',
  /** Execution exceeded the timeout limit */
  TIMEOUT = 'timeout',
  /** Job was cancelled by user or system */
  CANCELLED = 'cancelled',
}

/**
 * Progress information for a running job
 */
export interface JobProgress {
  /** Current progress value (e.g., step number) */
  current: number
  /** Maximum progress value (e.g., total steps) */
  maximum: number
  /** Optional human-readable progress message */
  message?: string
  /** Currently executing node ID */
  node?: string
  /** List of node IDs that were cached and skipped */
  cachedNodes: string[]
  /** Timestamp of when this progress was recorded */
  timestamp: Date
}

/**
 * Image output from a completed job
 */
export interface JobImage {
  /** Original filename from ComfyUI */
  filename: string
  /** Subfolder path within ComfyUI output */
  subfolder: string
  /** Image type (usually "output") */
  type: string
  /** Direct ComfyUI URL */
  url?: string
  /** S3 URL if S3 upload is enabled */
  s3Url?: string
}

/**
 * Generic output resource from a completed job
 */
export interface JobOutput {
  /** Output name as defined in service config */
  name: string
  /** Output data type */
  type: 'image' | 'video' | '3d_model' | 'audio' | 'text' | 'json'
  /** Optional description */
  description?: string
  /** Original filename from ComfyUI (for file-based outputs) */
  filename?: string
  /** Subfolder path within ComfyUI output */
  subfolder?: string
  /** Direct ComfyUI URL (for file-based outputs) */
  url?: string
  /** S3 URL if S3 upload is enabled (for file-based outputs) */
  s3Url?: string
  /** Text content (for text/json outputs) */
  content?: string
  /** Source node ID that produced this output */
  sourceNodeId?: string
}

/**
 * Node execution history entry
 */
export interface NodeExecutionHistoryEntry {
  /** Node ID that was executed */
  nodeId: string
  /** Timestamp of when the node was executed */
  executedAt: Date
  /** Whether the result was cached (true) or freshly computed (false) */
  cached: boolean
}

/**
 * Result data for a completed job
 */
export interface JobResult {
  /** All images output by the workflow */
  images: JobImage[]
  /** Structured outputs based on service output mapping */
  outputs?: JobOutput[]
  /** The node that produced this result */
  node: string
  /** Display node ID from ComfyUI */
  displayNode: string
  /** ComfyUI prompt ID for this execution */
  promptId: string
  /** Total execution time in milliseconds */
  executionTime: number
  /** History of all node executions with timing */
  nodeHistory: NodeExecutionHistoryEntry[]
}

/**
 * Error information for a failed job
 */
export interface JobError {
  /** Human-readable error message */
  message: string
  /** Optional error code for categorization */
  code?: string
}

/**
 * Complete metadata for a job
 */
export interface JobMetadata {
  /** Unique job identifier (UUID) */
  jobId: string
  /** Service name (e.g., "text_to_image") */
  service: string
  /** Timestamp when the job was created */
  createdAt: Date
  /** Timestamp when execution started (undefined if not started) */
  startedAt?: Date
  /** Timestamp when job finished/failed (undefined if not finished) */
  completedAt?: Date
  /** Current job status */
  status: JobStatus
  /** Progress information (available during/after execution) */
  progress?: JobProgress
  /** ComfyUI client ID used for this execution */
  clientId: string
  /** ComfyUI prompt ID (available after execution starts) */
  promptId?: string
  /** Original workflow JSON with parameters applied */
  workflow: Record<string, any>
  /** Input parameters provided by the user */
  parameters: Record<string, any>
  /** Result data (available when status is COMPLETED) */
  result?: JobResult
  /** Error details (available when status is FAILED) */
  error?: JobError
}

/**
 * Filters for listing jobs
 */
export interface JobFilters {
  /** Filter by service name */
  service?: string
  /** Filter by job status */
  status?: JobStatus
  /** Maximum number of jobs to return */
  limit?: number
  /** Number of jobs to skip (for pagination) */
  offset?: number
}
