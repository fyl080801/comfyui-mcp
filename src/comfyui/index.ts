/**
 * ComfyUI MCP Tools - Async job-based execution
 * Registers tools that execute ComfyUI workflows asynchronously and provide status query capabilities
 */
import z from 'zod'
import axios from '../http-client.js'
import { fetchWithConfig } from '../http-client.js'
import { ComfyuiWebsocketEnhanced } from './ws-enhanced.js'
import { uploadToS3 } from './s3.js'
import {
  loadWorkflow,
  type ServiceConfig,
  type ServiceParameter,
  getConfig,
} from '../config/index.js'
import type { FastMCP } from 'fastmcp'
import type { JobManager } from '../job/index.js'
import type { JobStatus } from '../job/types.js'
import logger, { jobLogger, apiLogger } from '../logger/index.js'

// ============================================================================
// Parameter Validation
// ============================================================================

/**
 * Check if a parameter value is empty (null, undefined, empty string, empty array, etc.)
 */
function isEmptyValue(value: any): boolean {
  if (value === null || value === undefined) {
    return true
  }

  if (typeof value === 'string' && value.trim() === '') {
    return true
  }

  if (Array.isArray(value) && value.length === 0) {
    return true
  }

  if (typeof value === 'object' && Object.keys(value).length === 0) {
    return true
  }

  return false
}

/**
 * Validate request parameters against service configuration
 * Throws an error if validation fails
 */
function validateParameters(
  service: ServiceConfig,
  parameters: Record<string, any>
): void {
  const errors: string[] = []

  for (const param of service.parameters) {
    const value = parameters[param.name]

    // Check if required parameter is missing or empty
    if (param.required) {
      if (isEmptyValue(value)) {
        errors.push(`Required parameter '${param.name}' is missing or empty`)
        continue
      }
    }

    // Type validation for non-empty values
    if (!isEmptyValue(value)) {
      switch (param.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push(
              `Parameter '${param.name}' must be a string, received ${typeof value}`
            )
          }
          break
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`Parameter '${param.name}' must be a valid number`)
          }
          break
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`Parameter '${param.name}' must be a boolean`)
          }
          break
        case 'array':
          if (!Array.isArray(value)) {
            errors.push(`Parameter '${param.name}' must be an array`)
          }
          break
        case 'object':
          if (typeof value !== 'object' || Array.isArray(value) || value === null) {
            errors.push(`Parameter '${param.name}' must be an object`)
          }
          break
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Parameter validation failed:\n${errors.join('\n')}`)
  }
}

// ============================================================================
// Type Conversion Helpers
// ============================================================================

const convertParameterType = (param: ServiceParameter): z.ZodTypeAny => {
  let zodType: z.ZodTypeAny

  switch (param.type) {
    case 'string':
      zodType = z.string()
      break
    case 'number':
      zodType = z.number()
      break
    case 'boolean':
      zodType = z.boolean()
      break
    case 'array':
      zodType = z.array(z.any())
      break
    case 'object':
      zodType = z.object({})
      break
    default:
      zodType = z.string()
  }

  if (!param.required && param.default !== undefined) {
    zodType = zodType.optional().default(param.default)
  } else if (!param.required) {
    zodType = zodType.optional()
  }

  return zodType
}

// ============================================================================
// Workflow Helpers
// ============================================================================

function findSaveImageNode(workflow: any): string {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if ((node as any).class_type === 'SaveImage') {
      return nodeId
    }
  }

  const nodeIds = Object.keys(workflow)
  const lastNodeId = nodeIds[nodeIds.length - 1]
  if (!lastNodeId) {
    throw new Error('No nodes found in workflow')
  }
  return lastNodeId
}

// ============================================================================
// Image Processing
// ============================================================================

async function processOutputImages(
  images: Array<{ filename: string; subfolder: string; type: string }>,
  comfyuiConfig: any,
  s3Config: any
): Promise<
  Array<{
    filename: string
    subfolder: string
    type: string
    url?: string
    s3Url?: string
  }>
> {
  const results = await Promise.all(
    images.map(async (image) => {
      const imageUrl = `${comfyuiConfig.httpProtocol}://${
        comfyuiConfig.host
      }/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(
        image.subfolder || ''
      )}&type=${encodeURIComponent(image.type || 'output')}`

      const result: {
        filename: string
        subfolder: string
        type: string
        url: string
        s3Url?: string
      } = {
        filename: image.filename,
        subfolder: image.subfolder || '',
        type: image.type || 'output',
        url: imageUrl,
      }

      if (s3Config.enabled) {
        try {
          const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 300000,
          })
          const s3Url = await uploadToS3(image.filename, Buffer.from(response.data))
          result.s3Url = s3Url
        } catch (error) {
          console.error(`Failed to upload ${image.filename} to S3:`, error)
          // Keep the ComfyUI URL as fallback
        }
      }

      return result
    })
  )

  return results
}

// ============================================================================
// Async Job Executor
// ============================================================================

/**
 * Execute a ComfyUI job asynchronously
 * Exported for use by REST API routes
 */
export async function executeJobAsync(
  jobId: string,
  service: ServiceConfig,
  parameters: Record<string, any>,
  workflow: Record<string, any>,
  jobManager: JobManager
): Promise<void> {
  const job = jobManager.getJob(jobId)
  if (!job) throw new Error(`Job not found: ${jobId}`)

  const config = getConfig()

  // Update status to RUNNING
  jobManager.updateJobStatus(jobId, 'running' as JobStatus, {
    startedAt: new Date(),
  })
  jobLogger.started(jobId, service.name)

  const ws = new ComfyuiWebsocketEnhanced(
    {
      host: config.comfyui.host,
      clientId: job.clientId,
      timeout: 10 * 60 * 1000, // 10 minutes
    },
    jobId,
    jobManager
  )

  try {
    // Find end node
    const endNode = findSaveImageNode(workflow)

    // Execute with job tracking
    const result = await ws.executeWithJobTracking({
      prompt: workflow,
      end: endNode,
    })

    // Process ALL output images
    const images = await processOutputImages(result.output.images, config.comfyui, config.s3)

    // Update result with images and timing
    result.images = images
    result.executionTime = Date.now() - job.startedAt!.getTime()

    // Set job result
    jobManager.setJobResult(jobId, result)

    // Update status to COMPLETED
    jobManager.updateJobStatus(jobId, 'completed' as JobStatus, {
      completedAt: new Date(),
    })

    jobLogger.completed(jobId, service.name, result.executionTime, images.length)
  } catch (error) {
    // Set error and update status to FAILED
    jobManager.setJobError(jobId, error as Error)
    jobManager.updateJobStatus(jobId, 'failed' as JobStatus, {
      completedAt: new Date(),
    })
    jobLogger.failed(jobId, service.name, error as Error)
  } finally {
    ws.close()
  }
}

// ============================================================================
// Tool Registration
// ============================================================================

export function registerComfyUITools(server: FastMCP, jobManager: JobManager) {
  const config = getConfig()
  const tools = config.services

  // Register service tools (async execution)
  tools.forEach((service: ServiceConfig) => {
    const parametersObject: Record<string, z.ZodTypeAny> = {}

    service.parameters.forEach((param) => {
      parametersObject[param.name] = convertParameterType(param)
    })

    const parametersSchema = z.object(parametersObject)

    server.addTool({
      name: service.name,
      description: service.description,
      parameters: parametersSchema,
      execute: async (args: any) => {
        const startTime = Date.now()
        try {
          // Log API request
          apiLogger.request(service.name, 'execute', args)

          // Validate parameters (including empty values)
          validateParameters(service, args)

          // Load workflow
          const workflow = loadWorkflow(service.comfyuiWorkflowApi)

          // Apply parameter mappings
          service.parameters.forEach((param: ServiceParameter) => {
            const value = args[param.name] !== undefined ? args[param.name] : param.default
            if (value !== undefined && workflow[param.comfyuiNodeId]) {
              workflow[param.comfyuiNodeId].inputs[param.comfyuiWidgetName] = value
            }
          })

          // Create job
          const job = jobManager.createJob(service.name, args, workflow)

          // Log job creation
          jobLogger.created(job.jobId, service.name, args)

          // Start background execution (don't await)
          executeJobAsync(job.jobId, service, args, workflow, jobManager).catch((error) => {
            logger.error(`Background execution failed for job ${job.jobId}`, error)
          })

          // Log API response
          const duration = Date.now() - startTime
          apiLogger.response(service.name, 'execute', 200, duration)

          // Return job_id immediately
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    job_id: job.jobId,
                    status: 'pending',
                    message: 'Job created successfully. Use query_job_status to check progress.',
                  },
                  null,
                  2
                ),
              },
            ],
          }
        } catch (error) {
          const duration = Date.now() - startTime
          apiLogger.error(service.name, 'execute', error as Error)
          throw new Error(
            `Error executing ${service.name} tool: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
      },
    })

    logger.info(`Tool registered: ${service.name} - ${service.description}`)
  })

  // ============================================================================
  // Status Query Tools
  // ============================================================================

  // Query Job Status
  server.addTool({
    name: 'query_job_status',
    description: 'Query the status of a ComfyUI job by job ID',
    parameters: z.object({
      job_id: z.string().describe('The job ID to query'),
    }),
    execute: async (args) => {
      const job = jobManager.getJob(args.job_id)

      if (!job) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Job not found',
                  job_id: args.job_id,
                },
                null,
                2
              ),
            },
          ],
        }
      }

      const response = {
        job_id: job.jobId,
        service: job.service,
        status: job.status,
        created_at: job.createdAt.toISOString(),
        started_at: job.startedAt?.toISOString(),
        completed_at: job.completedAt?.toISOString(),
        progress: job.progress
          ? {
              ...job.progress,
              timestamp: job.progress.timestamp.toISOString(),
            }
          : undefined,
        parameters: job.parameters,
        result: job.result
          ? {
              ...job.result,
              nodeHistory: job.result.nodeHistory.map((h) => ({
                ...h,
                executedAt: h.executedAt.toISOString(),
              })),
            }
          : undefined,
        error: job.error,
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      }
    },
  })

  logger.info('Tool registered: query_job_status')

  // List Jobs
  server.addTool({
    name: 'list_jobs',
    description: 'List all ComfyUI jobs with optional filters',
    parameters: z.object({
      service: z.string().optional().describe('Filter by service name'),
      status: z
        .enum(['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'])
        .optional()
        .describe('Filter by status'),
      limit: z.number().optional().default(20).describe('Maximum number of jobs to return'),
      offset: z.number().optional().default(0).describe('Offset for pagination'),
    }),
    execute: async (args) => {
      const filters: {
        service?: string
        status?: JobStatus
        limit?: number
        offset?: number
      } = {}

      if (args.service !== undefined) {
        filters.service = args.service
      }
      if (args.status !== undefined) {
        filters.status = args.status as JobStatus
      }
      filters.limit = args.limit
      filters.offset = args.offset

      const jobs = jobManager.listJobs(filters)

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: jobs.length,
                jobs: jobs.map((job) => ({
                  job_id: job.jobId,
                  service: job.service,
                  status: job.status,
                  created_at: job.createdAt.toISOString(),
                  completed_at: job.completedAt?.toISOString(),
                })),
              },
              null,
              2
            ),
          },
        ],
      }
    },
  })

  logger.info('Tool registered: list_jobs')

  // Get Job Result
  server.addTool({
    name: 'get_job_result',
    description: 'Get the result of a completed job (images, metadata, etc.)',
    parameters: z.object({
      job_id: z.string().describe('The job ID to get results for'),
    }),
    execute: async (args) => {
      const job = jobManager.getJob(args.job_id)

      if (!job) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Job not found', job_id: args.job_id }, null, 2),
            },
          ],
        }
      }

      if (job.status !== 'completed') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Job not completed',
                  job_id: args.job_id,
                  current_status: job.status,
                },
                null,
                2
              ),
            },
          ],
        }
      }

      if (!job.result) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Job completed but no result available',
                  job_id: args.job_id,
                },
                null,
                2
              ),
            },
          ],
        }
      }

      // Build metadata
      const metadata = {
        job_id: job.jobId,
        service: job.service,
        status: job.status,
        execution_time: `${job.result.executionTime}ms`,
        total_images: job.result.images.length,
        prompt_id: job.result.promptId,
        node: job.result.node,
        display_node: job.result.displayNode,
        node_history: job.result.nodeHistory.map((h) => ({
          ...h,
          executedAt: h.executedAt.toISOString(),
        })),
        parameters: job.parameters,
      }

      // Build resources for all images
      const resources = job.result.images.map((image, index) => ({
        type: 'resource' as const,
        resource: {
          text: `Generated image ${index + 1}/${job.result!.images.length}`,
          uri: image.s3Url || image.url!,
        },
      }))

      return {
        content: [
          // Metadata as text
          {
            type: 'text',
            text: JSON.stringify(metadata, null, 2),
          },
          // All image resources
          ...resources,
        ],
      }
    },
  })

  logger.info('Tool registered: get_job_result')

  // ============================================================================
  // Health Check Tool (Enhanced)
  // ============================================================================

  server.addTool({
    name: 'comfyui_health_check',
    description: 'Check if ComfyUI service is available and get job statistics',
    parameters: z.object({}),
    execute: async () => {
      try {
        const comfyuiConfig = config.comfyui

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        try {
          const response = await fetchWithConfig(
            `${comfyuiConfig.httpProtocol}://${comfyuiConfig.host}/system_stats`,
            { signal: controller.signal }
          )

          clearTimeout(timeoutId)

          if (response.ok) {
            // Get job statistics
            const jobStats = jobManager.getStats()

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'healthy',
                      comfyui: 'available',
                      jobs: {
                        total: jobManager.getTotalJobCount(),
                        ...jobStats,
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
            }
          } else {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      status: 'unhealthy',
                      comfyui: 'unavailable',
                      error: response.statusText,
                    },
                    null,
                    2
                  ),
                },
              ],
            }
          }
        } catch (error) {
          clearTimeout(timeoutId)
          throw error
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'unreachable',
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
                null,
                2
              ),
            },
          ],
        }
      }
    },
  })

  logger.info('Tool registered: comfyui_health_check')
}
