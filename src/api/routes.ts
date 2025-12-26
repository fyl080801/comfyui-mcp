/**
 * RESTful API Routes for ComfyUI MCP Server
 *
 * This module defines RESTful API endpoints with proper HTTP methods:
 *
 * Service Routes (auto-generated if not specified in config):
 * - GET /api/v1/services - List all available services
 * - GET /api/v1/services/:service_name - Get details of a specific service
 * - POST /api/v1/services/:service_name - Execute a workflow
 *
 * Job Management:
 * - GET /api/v1/jobs - List jobs with filters
 * - GET /api/v1/jobs/:job_id - Query job status
 * - GET /api/v1/jobs/:job_id/result - Get job result
 * - DELETE /api/v1/jobs/:job_id - Cancel/delete a job
 *
 * System:
 * - GET /api/v1/health - Health check
 *
 * Route Configuration:
 * - API routes follow the pattern: /api/v1/services/:service_name
 * - MCP routes follow the pattern: /mcp/:service_name (if explicitly defined in config)
 * - The "route" field in config.json is optional and can be omitted
 */

import type { Router, Request, Response, NextFunction } from 'express'
import express from 'express'
import type { JobManager } from '../job/index.js'
import type { ServiceConfig } from '../config/index.js'
import { loadWorkflow } from '../config/index.js'
import { fetchWithConfig } from '../http-client.js'
import logger from '../logger/index.js'
import type { JobStatus } from '../job/types.js'

export interface CreateRouterOptions {
  jobManager: JobManager
  services: ServiceConfig[]
}

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
 * Returns an object with validation result and any missing/empty parameters
 */
function validateParameters(
  service: ServiceConfig,
  requestBody: Record<string, any>
): { valid: boolean; errors: Array<{ parameter: string; message: string }> } {
  const errors: Array<{ parameter: string; message: string }> = []

  for (const param of service.parameters) {
    const value = requestBody[param.name]

    // Check if required parameter is missing or empty
    if (param.required) {
      if (isEmptyValue(value)) {
        errors.push({
          parameter: param.name,
          message: `Required parameter '${param.name}' is missing or empty`,
        })
        continue
      }
    }

    // Type validation for non-empty values
    if (!isEmptyValue(value)) {
      switch (param.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push({
              parameter: param.name,
              message: `Parameter '${param.name}' must be a string, received ${typeof value}`,
            })
          }
          break
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push({
              parameter: param.name,
              message: `Parameter '${param.name}' must be a valid number`,
            })
          }
          break
        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push({
              parameter: param.name,
              message: `Parameter '${param.name}' must be a boolean`,
            })
          }
          break
        case 'array':
          if (!Array.isArray(value)) {
            errors.push({
              parameter: param.name,
              message: `Parameter '${param.name}' must be an array`,
            })
          }
          break
        case 'object':
          if (typeof value !== 'object' || Array.isArray(value) || value === null) {
            errors.push({
              parameter: param.name,
              message: `Parameter '${param.name}' must be an object`,
            })
          }
          break
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Create RESTful API router with proper HTTP methods
 */
export function createApiRouter(options: CreateRouterOptions): Router {
  const { jobManager, services } = options
  const router = express.Router()

  // ============================================================================
  // Service Endpoints
  // ============================================================================

  /**
   * GET /api/v1/services
   * List all available services
   */
  router.get('/services', (_req: Request, res: Response) => {
    res.json({
      total: services.length,
      services: services.map((service) => ({
        name: service.name,
        description: service.description,
        parameters: service.parameters.map((p) => ({
          name: p.name,
          type: p.type,
          description: p.description,
          required: p.required,
          default: p.default,
        })),
      })),
    })
  })

  /**
   * GET /api/v1/services/:service_name
   * Get details of a specific service
   */
  router.get('/services/:service_name', (req: Request, res: Response) => {
    const service = services.find((s) => s.name === req.params.service_name)

    if (!service) {
      return res.status(404).json({
        error: 'Service not found',
        service_name: req.params.service_name,
        available_services: services.map((s) => s.name),
      })
    }

    res.json({
      name: service.name,
      description: service.description,
      parameters: service.parameters.map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description,
        required: p.required,
        default: p.default,
      })),
    })
  })

  /**
   * POST /api/v1/services/:service_name
   * Execute a workflow (create a new job)
   */
  router.post('/services/:service_name', async (req: Request, res: Response) => {
    const startTime = Date.now()
    const serviceName = req.params.service_name

    try {
      // Find service configuration
      const service = services.find((s) => s.name === serviceName)
      if (!service) {
        return res.status(404).json({
          error: 'Service not found',
          service_name: serviceName,
          available_services: services.map((s) => s.name),
        })
      }

      // Validate parameters (including empty values)
      const validation = validateParameters(service, req.body)
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Parameter validation failed',
          validation_errors: validation.errors,
        })
      }

      // Load workflow
      const workflow = loadWorkflow(service.comfyuiWorkflowApi)

      // Apply parameter mappings
      service.parameters.forEach((param) => {
        const value = req.body[param.name] !== undefined ? req.body[param.name] : param.default
        if (value !== undefined && workflow[param.comfyuiNodeId]) {
          workflow[param.comfyuiNodeId].inputs[param.comfyuiWidgetName] = value
        }
      })

      // Create job
      const job = jobManager.createJob(serviceName!, req.body, workflow)
      logger.info(`Job created via REST API: ${job.jobId} for service: ${serviceName}`)

      // Import executeJobAsync from comfyui/index
      const { executeJobAsync } = await import('../comfyui/index.js')

      // Start background execution (don't await)
      executeJobAsync(job.jobId, service, req.body, workflow, jobManager).catch((error) => {
        logger.error(`Background execution failed for job ${job.jobId}`, error)
      })

      const duration = Date.now() - startTime
      logger.info(`REST API POST /api/v1/services/${serviceName} - 201 - ${duration}ms`)

      // Return job_id immediately with 201 Created
      res.status(201).json({
        job_id: job.jobId,
        status: 'pending',
        service: serviceName,
        message: 'Job created successfully. Use GET /api/v1/jobs/{job_id} to check progress.',
        created_at: job.createdAt.toISOString(),
        links: {
          status: `/api/v1/jobs/${job.jobId}`,
          result: `/api/v1/jobs/${job.jobId}/result`,
        },
      })
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error(`REST API POST /api/v1/services/${serviceName} - 500 - ${duration}ms`, error)

      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        service_name: serviceName,
      })
    }
  })

  // ============================================================================
  // Job Management Endpoints
  // ============================================================================

  /**
   * GET /api/v1/jobs
   * List jobs with optional filters
   */
  router.get('/jobs', (req: Request, res: Response) => {
    try {
      const filters: {
        service?: string
        status?: JobStatus
        limit?: number
        offset?: number
      } = {}

      if (req.query.service) {
        filters.service = String(req.query.service)
      }
      if (req.query.status) {
        const statusValue = String(req.query.status)
        // Validate status value
        if (
          statusValue === 'pending' ||
          statusValue === 'running' ||
          statusValue === 'completed' ||
          statusValue === 'failed' ||
          statusValue === 'timeout' ||
          statusValue === 'cancelled'
        ) {
          filters.status = statusValue as JobStatus
        }
      }
      if (req.query.limit) {
        filters.limit = parseInt(String(req.query.limit), 10)
      }
      if (req.query.offset) {
        filters.offset = parseInt(String(req.query.offset), 10)
      }

      const jobs = jobManager.listJobs(filters)

      res.json({
        total: jobs.length,
        filters: {
          service: filters.service,
          status: filters.status,
          limit: filters.limit,
          offset: filters.offset,
        },
        jobs: jobs.map((job) => ({
          job_id: job.jobId,
          service: job.service,
          status: job.status,
          created_at: job.createdAt.toISOString(),
          started_at: job.startedAt?.toISOString(),
          completed_at: job.completedAt?.toISOString(),
          links: {
            self: `/api/v1/jobs/${job.jobId}`,
            result: `/api/v1/jobs/${job.jobId}/result`,
          },
        })),
      })
    } catch (error) {
      logger.error('REST API GET /api/v1/jobs - 500', error)
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /api/v1/jobs/:job_id
   * Query job status
   */
  router.get('/jobs/:job_id', (req: Request, res: Response) => {
    try {
      const job = jobManager.getJob(req.params.job_id!)

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          job_id: req.params.job_id,
        })
      }

      res.json({
        job_id: job.jobId,
        service: job.service,
        status: job.status,
        created_at: job.createdAt.toISOString(),
        started_at: job.startedAt?.toISOString(),
        completed_at: job.completedAt?.toISOString(),
        progress: job.progress
          ? {
              current: job.progress.current,
              maximum: job.progress.maximum,
              node: job.progress.node,
              cached_nodes: job.progress.cachedNodes,
              timestamp: job.progress.timestamp.toISOString(),
            }
          : undefined,
        parameters: job.parameters,
        error: job.error,
        links: {
          self: `/api/v1/jobs/${job.jobId}`,
          result: `/api/v1/jobs/${job.jobId}/result`,
        },
      })
    } catch (error) {
      logger.error(`REST API GET /api/v1/jobs/${req.params.job_id} - 500`, error)
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /api/v1/jobs/:job_id/result
   * Get job result
   */
  router.get('/jobs/:job_id/result', (req: Request, res: Response) => {
    try {
      const job = jobManager.getJob(req.params.job_id!)

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          job_id: req.params.job_id,
        })
      }

      if (job.status !== 'completed') {
        return res.status(400).json({
          error: 'Job not completed',
          job_id: req.params.job_id,
          current_status: job.status,
          message: 'Result is only available for completed jobs',
        })
      }

      if (!job.result) {
        return res.status(400).json({
          error: 'Job completed but no result available',
          job_id: req.params.job_id,
        })
      }

      res.json({
        job_id: job.jobId,
        service: job.service,
        status: job.status,
        execution_time: `${job.result.executionTime}ms`,
        total_images: job.result.images.length,
        prompt_id: job.result.promptId,
        node: job.result.node,
        display_node: job.result.displayNode,
        node_history: job.result.nodeHistory.map((h) => ({
          node: h.nodeId,
          type: h.cached ? 'cached' : 'executed',
          executed_at: h.executedAt.toISOString(),
        })),
        parameters: job.parameters,
        images: job.result.images.map((image) => ({
          filename: image.filename,
          subfolder: image.subfolder,
          type: image.type,
          url: image.url,
          s3_url: image.s3Url,
        })),
      })
    } catch (error) {
      logger.error(`REST API GET /api/v1/jobs/${req.params.job_id}/result - 500`, error)
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * DELETE /api/v1/jobs/:job_id
   * Cancel/delete a job
   */
  router.delete('/jobs/:job_id', (req: Request, res: Response) => {
    try {
      const job = jobManager.getJob(req.params.job_id!)

      if (!job) {
        return res.status(404).json({
          error: 'Job not found',
          job_id: req.params.job_id,
        })
      }

      if (job.status === 'completed' || job.status === 'failed') {
        // Job already finished, just confirm it exists
        return res.json({
          job_id: job.jobId,
          status: job.status,
          message: `Job has already ${job.status}`,
        })
      }

      if (job.status === 'cancelled') {
        return res.json({
          job_id: job.jobId,
          status: 'cancelled',
          message: 'Job was already cancelled',
        })
      }

      // Update status to cancelled
      jobManager.updateJobStatus(req.params.job_id!, 'cancelled' as any, {
        completedAt: new Date(),
      })

      logger.info(`Job cancelled via REST API: ${req.params.job_id}`)

      res.json({
        job_id: job.jobId,
        status: 'cancelled',
        message: 'Job cancelled successfully',
      })
    } catch (error) {
      logger.error(`REST API DELETE /api/v1/jobs/${req.params.job_id} - 500`, error)
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ============================================================================
  // System Endpoints
  // ============================================================================

  /**
   * GET /api/v1/health
   * Health check endpoint
   */
  router.get('/health', async (req: Request, res: Response) => {
    try {
      const { getConfig } = await import('../config/index.js')
      const config = getConfig()
      const comfyuiConfig = config.comfyui

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      try {
        const response = await fetchWithConfig(
          `${comfyuiConfig.httpProtocol}://${comfyuiConfig.host}/system_stats`,
          { signal: controller.signal },
        )

        clearTimeout(timeoutId)

        if (response.ok) {
          const jobStats = jobManager.getStats()

          res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
              comfyui: 'available',
              mcp: 'available',
              rest_api: 'available',
            },
            jobs: {
              total: jobManager.getTotalJobCount(),
              ...jobStats,
            },
          })
        } else {
          res.status(503).json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            services: {
              comfyui: 'unavailable',
              mcp: 'available',
              rest_api: 'available',
            },
            error: 'ComfyUI service is unavailable',
          })
        }
      } catch (error) {
        clearTimeout(timeoutId)
        throw error
      }
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          comfyui: 'unreachable',
          mcp: 'available',
          rest_api: 'available',
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ============================================================================
  // Error Handlers
  // ============================================================================

  // 404 handler
  router.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
      available_endpoints: {
        services: {
          list_all: 'GET /api/v1/services',
          get_details: 'GET /api/v1/services/:service_name',
          execute: 'POST /api/v1/services/:service_name',
        },
        jobs: {
          list: 'GET /api/v1/jobs',
          get_status: 'GET /api/v1/jobs/:job_id',
          get_result: 'GET /api/v1/jobs/:job_id/result',
          cancel: 'DELETE /api/v1/jobs/:job_id',
        },
        system: {
          health_check: 'GET /api/v1/health',
        },
      },
    })
  })

  // Error handler
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('REST API error:', err)
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    })
  })

  return router
}
