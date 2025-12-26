/**
 * Swagger/OpenAPI Documentation Configuration for ComfyUI-MCP Server
 *
 * This module provides comprehensive API documentation using Swagger/OpenAPI 3.0 specification.
 * The documentation is available at /api-docs and includes RESTful API endpoints.
 */

import swaggerJSDoc from 'swagger-jsdoc'
import type { ServiceConfig } from './config/index.js'

/**
 * Generate Swagger/OpenAPI specification dynamically from config
 */
export function createSwaggerSpec(services: ServiceConfig[]) {
  // Get server domain from environment variable or use localhost
  const serverDomain = process.env.SERVER_DOMAIN || 'localhost'
  const expressPort = process.env.EXPRESS_PORT || '3000'

  // Detect if domain already includes protocol (http:// or https://)
  const hasProtocol = /^https?:\/\//i.test(serverDomain)
  const protocol = hasProtocol ? '' : 'http://'

  // Build server URL for Swagger
  // Strategy:
  // 1. If domain already has port (e.g., "localhost:3000"), use as-is
  // 2. If production with external domain, omit port (for Ingress/LB access)
  // 3. Otherwise, add default port for local development
  const domainWithoutProtocol = serverDomain.replace(/^https?:\/\//i, '')
  const hasPortInDomain = /:\d+$/.test(domainWithoutProtocol)

  // Check if this looks like a production domain (no .local, not localhost/IP)
  const isLocalhost = serverDomain === 'localhost' ||
                      serverDomain === '127.0.0.1' ||
                      serverDomain.includes('.local')

  // For production accessed through Ingress, don't add port
  const isProductionAccess = process.env.NODE_ENV === 'production' &&
                             !isLocalhost &&
                             !hasPortInDomain &&
                             process.env.SERVER_PORT_IN_URL !== 'true'

  const serverUrl = hasPortInDomain
    ? `${protocol}${serverDomain}` // Already has port
    : isProductionAccess
      ? `${protocol}${serverDomain}` // Production: no port
      : `${protocol}${serverDomain}:${expressPort}` // Local: add port

  // MCP endpoint URL
  const mcpUrl = hasPortInDomain
    ? `${protocol}${serverDomain.replace(/:\d+$/, ':8080')}` // Replace port
    : isProductionAccess
      ? `${protocol}${serverDomain}/mcp` // Production: use /mcp path
      : `${protocol}${serverDomain}:8080` // Local: add 8080 port

  const servicePaths: Record<string, any> = {}

  // Generate paths for each service tool
  services.forEach((service) => {
    const path = `/api/v1/services/${service.name}`
    const parameters: any[] = []

    // Build parameters from service config
    service.parameters.forEach((param) => {
      const swaggerParam: any = {
        name: param.name,
        in: 'body',
        description: param.description || `Parameter: ${param.name}`,
        required: param.required || false,
        schema: {
          type: param.type || 'string',
        },
      }

      // Add default value if present
      if (param.default !== undefined) {
        swaggerParam.schema.default = param.default
      }

      parameters.push(swaggerParam)
    })

    // POST endpoint for executing service
    servicePaths[path] = {
      post: {
        tags: ['Services'],
        summary: service.description || `Execute ${service.name} workflow`,
        description:
          service.description ||
          `Execute ${service.name} workflow asynchronously. Returns a job_id for tracking.`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: service.parameters.reduce((acc: any, param) => {
                  acc[param.name] = {
                    type: param.type || 'string',
                    description: param.description,
                  }
                  if (param.default !== undefined) {
                    acc[param.name].default = param.default
                  }
                  return acc
                }, {}),
                required: service.parameters.filter((p) => p.required).map((p) => p.name),
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Job created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/JobCreatedResponse',
                },
              },
            },
          },
          '400': {
            description: 'Bad request - invalid parameters',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          '404': {
            description: 'Service not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          '500': {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    }
  })

  // ============================================================================
  // RESTful API Paths
  // ============================================================================

  const restPaths: Record<string, any> = {
    // Services endpoints
    '/api/v1/services': {
      get: {
        tags: ['Services'],
        summary: 'List All Services',
        description: 'Get a list of all available ComfyUI workflow services',
        responses: {
          '200': {
            description: 'Services retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    services: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/ServiceInfo',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/services/{service_name}': {
      get: {
        tags: ['Services'],
        summary: 'Get Service Details',
        description: 'Get detailed information about a specific service including its parameters',
        parameters: [
          {
            name: 'service_name',
            in: 'path',
            required: true,
            description: 'Name of the service',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Service details retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ServiceDetails',
                },
              },
            },
          },
          '404': {
            description: 'Service not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },

    // Jobs endpoints
    '/api/v1/jobs': {
      get: {
        tags: ['Jobs'],
        summary: 'List Jobs',
        description: 'List all ComfyUI jobs with optional filters',
        parameters: [
          {
            name: 'service',
            in: 'query',
            required: false,
            description: 'Filter by service name',
            schema: { type: 'string' },
          },
          {
            name: 'status',
            in: 'query',
            required: false,
            description: 'Filter by status',
            schema: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'],
            },
          },
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Maximum number of jobs to return',
            schema: { type: 'number', default: 20 },
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            description: 'Offset for pagination',
            schema: { type: 'number', default: 0 },
          },
        ],
        responses: {
          '200': {
            description: 'Jobs retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    filters: {
                      type: 'object',
                      properties: {
                        service: { type: 'string' },
                        status: { type: 'string' },
                        limit: { type: 'number' },
                        offset: { type: 'number' },
                      },
                    },
                    jobs: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/JobSummary',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/jobs/{job_id}': {
      get: {
        tags: ['Jobs'],
        summary: 'Query Job (Unified Endpoint)',
        description: 'Query job status or result. Returns status for pending/running jobs, and complete results (including outputs) for completed/failed jobs.',
        parameters: [
          {
            name: 'job_id',
            in: 'path',
            required: true,
            description: 'The job ID to query',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Job information retrieved successfully. Response format depends on job status.',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/JobStatus' },
                    { $ref: '#/components/schemas/JobResult' },
                  ],
                },
              },
            },
          },
          '404': {
            description: 'Job not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Jobs'],
        summary: 'Cancel Job',
        description: 'Cancel or delete a running/pending job',
        parameters: [
          {
            name: 'job_id',
            in: 'path',
            required: true,
            description: 'The job ID to cancel',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Job cancelled successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    job_id: { type: 'string' },
                    status: { type: 'string', enum: ['cancelled'] },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Job not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },

    // Workflows endpoints
    '/api/v1/workflows': {
      get: {
        tags: ['Workflows'],
        summary: 'List All Workflows',
        description: 'Get a list of all ComfyUI workflow files with optional pagination and search',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            description: 'Maximum number of workflows to return',
            schema: { type: 'number' },
          },
          {
            name: 'offset',
            in: 'query',
            required: false,
            description: 'Offset for pagination',
            schema: { type: 'number', default: 0 },
          },
          {
            name: 'search',
            in: 'query',
            required: false,
            description: 'Search term to filter workflows by name',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Workflows retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    count: { type: 'number' },
                    offset: { type: 'number' },
                    limit: { type: 'number' },
                    workflows: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/WorkflowMetadata',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Workflows'],
        summary: 'Create Workflow (JSON)',
        description: 'Create a new workflow from JSON body',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'content'],
                properties: {
                  name: {
                    type: 'string',
                    description: 'Workflow name',
                  },
                  description: {
                    type: 'string',
                    description: 'Workflow description',
                  },
                  filename: {
                    type: 'string',
                    description: 'Optional filename (will be generated if not provided)',
                  },
                  content: {
                    type: 'object',
                    description: 'ComfyUI workflow JSON content',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Workflow created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WorkflowDetail',
                },
              },
            },
          },
          '400': {
            description: 'Bad request - invalid input',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
          '409': {
            description: 'Conflict - workflow already exists',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/workflows/upload': {
      post: {
        tags: ['Workflows'],
        summary: 'Upload Workflow (File)',
        description: 'Upload a workflow file as multipart/form-data',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: {
                    type: 'string',
                    format: 'binary',
                    description: 'JSON workflow file',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Workflow uploaded successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WorkflowDetail',
                },
              },
            },
          },
          '400': {
            description: 'Bad request - invalid file',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/workflows/{id}': {
      get: {
        tags: ['Workflows'],
        summary: 'Get Workflow',
        description: 'Get a specific workflow by ID',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Workflow ID (filename without .json extension)',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Workflow retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WorkflowDetail',
                },
              },
            },
          },
          '404': {
            description: 'Workflow not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
      put: {
        tags: ['Workflows'],
        summary: 'Update Workflow',
        description: 'Update an existing workflow',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Workflow ID (filename without .json extension)',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'New workflow name',
                  },
                  description: {
                    type: 'string',
                    description: 'New workflow description',
                  },
                  content: {
                    type: 'object',
                    description: 'New workflow JSON content',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Workflow updated successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WorkflowDetail',
                },
              },
            },
          },
          '404': {
            description: 'Workflow not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ['Workflows'],
        summary: 'Delete Workflow',
        description: 'Delete a workflow',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Workflow ID (filename without .json extension)',
            schema: { type: 'string' },
          },
        ],
        responses: {
          '200': {
            description: 'Workflow deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    workflow_id: { type: 'string' },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Workflow not found',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },

    // System endpoints
    '/api/v1/health': {
      get: {
        tags: ['System'],
        summary: 'Health Check',
        description: 'Check if ComfyUI service is available and get job statistics',
        responses: {
          '200': {
            description: 'Health status retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['healthy', 'degraded', 'unhealthy'],
                    },
                    timestamp: { type: 'string', format: 'date-time' },
                    services: {
                      type: 'object',
                      properties: {
                        comfyui: { type: 'string', enum: ['available', 'unavailable'] },
                        mcp: { type: 'string', enum: ['available'] },
                        rest_api: { type: 'string', enum: ['available'] },
                      },
                    },
                    jobs: {
                      type: 'object',
                      properties: {
                        total: { type: 'number' },
                        pending: { type: 'number' },
                        running: { type: 'number' },
                        completed: { type: 'number' },
                        failed: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
          '503': {
            description: 'Service unavailable or unhealthy',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error',
                },
              },
            },
          },
        },
      },
    },
  }

  // Merge all paths
  const allPaths = { ...servicePaths, ...restPaths }

  const options: swaggerJSDoc.Options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'ComfyUI MCP Server API',
        version: '1.0.0',
        description: `
ComfyUI MCP Server - RESTful API for Async Job-based Workflow Execution

This server exposes ComfyUI workflows as clean RESTful API endpoints with asynchronous job-based execution.

## Features
- **RESTful API Design**: Proper HTTP methods (GET, POST, DELETE) for resource-oriented operations
- **Async Job Execution**: Submit jobs and get a \`job_id\` immediately for status polling
- **Status Polling**: Query job status, progress, and results via dedicated endpoints
- **Multiple Output Support**: Returns all images generated by a workflow
- **Complete Metadata**: Includes execution time, node history, and parameters
- **Progress Tracking**: Real-time progress updates during execution
- **S3 Upload**: Optional image upload to AWS S3
- **Workflow Management**: CRUD operations for managing ComfyUI workflow files

## RESTful API Endpoints

### Services
- \`GET /api/v1/services\` - List all available services
- \`GET /api/v1/services/{service_name}\` - Get service details
- \`POST /api/v1/services/{service_name}\` - Execute a workflow

### Jobs
- \`GET /api/v1/jobs\` - List jobs with filters
- \`GET /api/v1/jobs/{job_id}\` - Query job status (pending/running) or result (completed/failed)
- \`DELETE /api/v1/jobs/{job_id}\` - Cancel a job

### Workflows
- \`GET /api/v1/workflows\` - List all workflows
- \`GET /api/v1/workflows/{id}\` - Get workflow details
- \`POST /api/v1/workflows\` - Create a new workflow (JSON)
- \`POST /api/v1/workflows/upload\` - Upload a workflow file
- \`PUT /api/v1/workflows/{id}\` - Update a workflow
- \`DELETE /api/v1/workflows/{id}\` - Delete a workflow

### System
- \`GET /api/v1/health\` - Health check with statistics

## Job Lifecycle
1. **PENDING**: Job created, waiting to start
2. **RUNNING**: WebSocket connected, execution in progress
3. **COMPLETED**: Execution finished successfully
4. **FAILED**: Execution failed with error
5. **TIMEOUT**: Execution exceeded timeout
6. **CANCELLED**: Job was cancelled

## Usage Example

\`\`\`bash
# 1. List available services
curl http://localhost:3000/api/v1/services

# 2. Execute a service (e.g., text_to_image)
curl -X POST http://localhost:3000/api/v1/services/text_to_image \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "a beautiful sunset over the ocean"
  }'

# Response: { "job_id": "uuid", "status": "pending", ... }

# 3. Query job status or result (same endpoint, returns based on job state)
curl http://localhost:3000/api/v1/jobs/{job_id}

# 4. List workflows
curl http://localhost:3000/api/v1/workflows

# 5. Create a new workflow
curl -X POST http://localhost:3000/api/v1/workflows \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "my_workflow",
    "description": "My custom workflow",
    "content": { ... }
  }'
\`\`\`

## MCP Protocol
The server also supports the MCP (Model Context Protocol) on port 8080 for AI agent integration.
        `,
        contact: {
          name: 'ComfyUI MCP Server',
        },
        license: {
          name: 'ISC',
        },
      },
      servers: [
        {
          url: serverUrl,
          description: 'RESTful API server (Swagger UI + API endpoints)',
        },
        {
          url: mcpUrl,
          description: 'MCP endpoint (AI agent protocol)',
        },
      ],
      tags: [
        {
          name: 'Services',
          description: 'Workflow execution endpoints',
        },
        {
          name: 'Jobs',
          description: 'Job status and result queries',
        },
        {
          name: 'Workflows',
          description: 'Workflow management (CRUD operations)',
        },
        {
          name: 'System',
          description: 'Health check and system information',
        },
      ],
      components: {
        schemas: {
          Error: {
            type: 'object',
            properties: {
              error: {
                type: 'string',
                description: 'Error message',
              },
              job_id: {
                type: 'string',
                description: 'Job ID (if applicable)',
              },
            },
          },
          JobCreatedResponse: {
            type: 'object',
            properties: {
              job_id: {
                type: 'string',
                description: 'Unique job identifier (UUID v4)',
                format: 'uuid',
              },
              status: {
                type: 'string',
                enum: ['pending'],
                description: 'Initial job status',
              },
              service: {
                type: 'string',
                description: 'Service name that was executed',
              },
              message: {
                type: 'string',
                description: 'Additional information about the job',
              },
              created_at: {
                type: 'string',
                format: 'date-time',
                description: 'Job creation timestamp',
              },
              links: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    description: 'Link to job status endpoint',
                  },
                  result: {
                    type: 'string',
                    description: 'Link to job result endpoint',
                  },
                },
              },
            },
          },
          ServiceInfo: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Service name',
              },
              description: {
                type: 'string',
                description: 'Service description',
              },
              parameters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    description: { type: 'string' },
                    required: { type: 'boolean' },
                    default: { type: 'any' },
                  },
                },
              },
            },
          },
          ServiceDetails: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              parameters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    description: { type: 'string' },
                    required: { type: 'boolean' },
                    default: { type: 'any' },
                  },
                },
              },
            },
          },
          JobSummary: {
            type: 'object',
            properties: {
              job_id: { type: 'string', format: 'uuid' },
              service: { type: 'string' },
              status: {
                type: 'string',
                enum: ['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'],
              },
              created_at: { type: 'string', format: 'date-time' },
              started_at: { type: 'string', format: 'date-time' },
              completed_at: { type: 'string', format: 'date-time' },
              links: {
                type: 'object',
                properties: {
                  self: { type: 'string' },
                  result: { type: 'string' },
                },
              },
            },
          },
          JobStatus: {
            type: 'object',
            properties: {
              job_id: { type: 'string', format: 'uuid' },
              service: { type: 'string' },
              status: {
                type: 'string',
                enum: ['pending', 'running', 'completed', 'failed', 'timeout', 'cancelled'],
              },
              created_at: { type: 'string', format: 'date-time' },
              started_at: { type: 'string', format: 'date-time' },
              completed_at: { type: 'string', format: 'date-time' },
              progress: {
                type: 'object',
                properties: {
                  current: { type: 'number', description: 'Current progress value' },
                  maximum: { type: 'number', description: 'Maximum progress value' },
                  node: { type: 'string', description: 'Currently executing node ID' },
                  cached_nodes: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of cached node IDs',
                  },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
              parameters: {
                type: 'object',
                description: 'Original job parameters',
              },
              error: {
                type: 'string',
                description: 'Error message if job failed',
              },
              links: {
                type: 'object',
                properties: {
                  self: { type: 'string' },
                },
              },
            },
          },
          JobResult: {
            type: 'object',
            required: ['job_id', 'service', 'status', 'execution_time', 'images'],
            properties: {
              job_id: { type: 'string', format: 'uuid' },
              service: { type: 'string' },
              status: { type: 'string', enum: ['completed'] },
              execution_time: { type: 'string', description: 'Execution time in milliseconds' },
              total_images: { type: 'number' },
              prompt_id: { type: 'string' },
              node: { type: 'string' },
              display_node: { type: 'string' },
              node_history: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    node: { type: 'string' },
                    type: { type: 'string' },
                    executed_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
              parameters: { type: 'object' },
              outputs: {
                type: 'array',
                description: 'Structured outputs based on service output mapping',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Output name' },
                    type: {
                      type: 'string',
                      enum: ['image', 'video', '3d_model', 'audio', 'text', 'json'],
                    },
                    description: { type: 'string', description: 'Output description' },
                    filename: { type: 'string', description: 'Filename for file-based outputs' },
                    url: { type: 'string', description: 'ComfyUI URL' },
                    s3_url: { type: 'string', description: 'S3 URL if enabled' },
                  },
                },
              },
              images: {
                type: 'array',
                items: {
                  $ref: '#/components/schemas/Image',
                },
              },
              links: {
                type: 'object',
                properties: {
                  self: { type: 'string' },
                },
              },
            },
          },
          Image: {
            type: 'object',
            properties: {
              filename: { type: 'string', description: 'Image filename' },
              subfolder: { type: 'string', description: 'Subfolder path' },
              type: { type: 'string', description: 'Image type (usually "output")' },
              url: {
                type: 'string',
                description: 'ComfyUI direct URL',
                format: 'uri',
              },
              s3_url: {
                type: 'string',
                description: 'S3 URL (if S3 upload is enabled)',
                format: 'uri',
              },
            },
          },
          WorkflowMetadata: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Workflow ID (filename without .json extension)',
              },
              name: {
                type: 'string',
                description: 'Workflow display name',
              },
              filename: {
                type: 'string',
                description: 'Workflow filename (with .json extension)',
              },
              description: {
                type: 'string',
                description: 'Workflow description',
              },
              created_at: {
                type: 'string',
                format: 'date-time',
                description: 'Creation timestamp',
              },
              updated_at: {
                type: 'string',
                format: 'date-time',
                description: 'Last update timestamp',
              },
              size: {
                type: 'number',
                description: 'File size in bytes',
              },
              node_count: {
                type: 'number',
                description: 'Number of nodes in the workflow',
              },
              links: {
                type: 'object',
                properties: {
                  self: { type: 'string' },
                },
              },
            },
          },
          WorkflowDetail: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Workflow ID (filename without .json extension)',
              },
              name: {
                type: 'string',
                description: 'Workflow display name',
              },
              filename: {
                type: 'string',
                description: 'Workflow filename (with .json extension)',
              },
              description: {
                type: 'string',
                description: 'Workflow description',
              },
              created_at: {
                type: 'string',
                format: 'date-time',
                description: 'Creation timestamp',
              },
              updated_at: {
                type: 'string',
                format: 'date-time',
                description: 'Last update timestamp',
              },
              size: {
                type: 'number',
                description: 'File size in bytes',
              },
              node_count: {
                type: 'number',
                description: 'Number of nodes in the workflow',
              },
              content: {
                type: 'object',
                description: 'ComfyUI workflow JSON content',
              },
              links: {
                type: 'object',
                properties: {
                  self: { type: 'string' },
                },
              },
            },
          },
        },
      },
      paths: allPaths,
    },
    apis: ['./src/**/*.ts'], // Files containing annotations
  }

  return swaggerJSDoc(options)
}
