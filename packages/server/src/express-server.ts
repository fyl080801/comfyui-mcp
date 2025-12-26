/**
 * Express Server for Swagger UI Documentation and RESTful API
 *
 * This module creates a lightweight Express server that runs alongside FastMCP
 * to serve:
 * - RESTful API endpoints at /api/v1/*
 * - Swagger UI documentation at /api-docs
 */

import type { ServiceConfig } from './config/index.js'
import type { Request, Response, NextFunction } from 'express'
import type { JobManager } from './job/index.js'
import express from 'express'
import swaggerUi from 'swagger-ui-express'
import { createSwaggerSpec } from './swagger.js'
import { createApiRouter } from './api/routes.js'
import { createWorkflowRouter } from './api/workflow-routes.js'

export interface CreateExpressAppOptions {
  services: ServiceConfig[]
  jobManager: JobManager
}

export function createExpressApp(options: CreateExpressAppOptions) {
  const { services, jobManager } = options
  const app = express()

  // Parse JSON bodies
  app.use(express.json())

  // Request logging middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${req.method} ${req.url}`)
    next()
  })

  // CORS middleware (optional, for development)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200)
    }
    next()
  })

  // ============================================================================
  // RESTful API Routes
  // ============================================================================

  // Mount workflow management router first (before apiRouter with its 404 handler)
  const workflowRouter = createWorkflowRouter()
  app.use('/api/v1', workflowRouter)

  // Mount RESTful API router
  const apiRouter = createApiRouter({ jobManager, services })
  app.use('/api/v1', apiRouter)

  // ============================================================================
  // Documentation & Info Endpoints
  // ============================================================================

  // Health check endpoint (legacy)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'ComfyUI MCP Server',
      timestamp: new Date().toISOString(),
    })
  })

  // Root endpoint with API information
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'ComfyUI MCP Server',
      version: '1.0.0',
      description: 'ComfyUI workflows as clean API endpoints with async job-based execution',
      endpoints: {
        docs: '/api-docs',
        openapi: '/api-docs.json',
        rest_api: '/api/v1',
        health: '/health',
        mcp: 'Port 8080 (FastMCP)',
      },
      api: {
        restful: {
          base_url: '/api/v1',
          services: {
            list: 'GET /api/v1/services',
            get: 'GET /api/v1/services/:service_name',
            execute: 'POST /api/v1/services/:service_name',
          },
          jobs: {
            list: 'GET /api/v1/jobs',
            get: 'GET /api/v1/jobs/:job_id',
            result: 'GET /api/v1/jobs/:job_id/result',
            cancel: 'DELETE /api/v1/jobs/:job_id',
          },
          workflows: {
            list: 'GET /api/v1/workflows',
            get: 'GET /api/v1/workflows/:id',
            create: 'POST /api/v1/workflows',
            upload: 'POST /api/v1/workflows/upload',
            update: 'PUT /api/v1/workflows/:id',
            delete: 'DELETE /api/v1/workflows/:id',
          },
          system: {
            health: 'GET /api/v1/health',
          },
        },
      },
      services: services.map((s) => ({
        name: s.name,
        description: s.description,
        endpoint: `/api/v1/services/${s.name}`,
      })),
    })
  })

  // Generate Swagger spec
  const swaggerSpec = createSwaggerSpec(services)

  // Serve OpenAPI JSON spec
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })

  // Serve Swagger UI
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'ComfyUI MCP API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'list',
        filter: true,
        showRequestHeaders: true,
        tryItOutEnabled: true,
      },
    }),
  )

  // 404 handler (for paths not handled by API router)
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
      available_endpoints: {
        docs: '/api-docs',
        health: '/health',
        openapi: '/api-docs.json',
        rest_api: '/api/v1/*',
      },
    })
  })

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Express error:', err)
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    })
  })

  return app
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use createExpressApp with jobManager instead
 */
export function createSwaggerExpressApp(services: ServiceConfig[]) {
  console.warn(
    'createSwaggerExpressApp is deprecated. Use createExpressApp with jobManager for full REST API support.',
  )
  return createExpressApp({
    services,
    jobManager: null as any, // Legacy mode - REST API endpoints won't work
  })
}
