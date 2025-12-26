/**
 * Workflow Management API Routes
 *
 * Provides RESTful endpoints for managing ComfyUI workflows:
 * - GET /api/v1/workflows - List all workflows
 * - GET /api/v1/workflows/:id - Get a specific workflow
 * - POST /api/v1/workflows - Create a new workflow
 * - PUT /api/v1/workflows/:id - Update a workflow
 * - DELETE /api/v1/workflows/:id - Delete a workflow
 */

import type { Router, Request, Response } from 'express'
import express from 'express'
import multer from 'multer'
import { getWorkflowManager, type CreateWorkflowOptions } from '../workflow/index.js'
import logger from '../logger/index.js'

// Configure multer for file upload (JSON files)
const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true)
    } else {
      cb(new Error('Only JSON files are allowed'))
    }
  },
})

/**
 * Create workflow management router
 */
export function createWorkflowRouter(): Router {
  const router = express.Router()
  const workflowManager = getWorkflowManager()

  // ============================================================================
  // List Workflows
  // ============================================================================

  /**
   * GET /api/v1/workflows
   * List all workflows with optional pagination and search
   */
  router.get('/workflows', (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0
      const search = req.query.search ? String(req.query.search) : undefined

      const workflows = workflowManager.listWorkflows({
        limit: limit ?? undefined,
        offset,
        search: search ?? undefined,
      })
      const total = workflowManager.getWorkflowCount()

      res.json({
        total,
        count: workflows.length,
        offset,
        limit: limit || 'all',
        workflows: workflows.map(w => ({
          id: w.id,
          name: w.name,
          filename: w.filename,
          description: w.description,
          created_at: w.createdAt,
          updated_at: w.updatedAt,
          size: w.size,
          node_count: w.nodeCount,
          links: {
            self: `/api/v1/workflows/${w.id}`,
          },
        })),
      })
    } catch (error) {
      logger.error('GET /api/v1/workflows - 500', error)
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ============================================================================
  // Get Workflow
  // ============================================================================

  /**
   * GET /api/v1/workflows/:id
   * Get a specific workflow by ID
   */
  router.get('/workflows/:id', (req: Request, res: Response) => {
    try {
      const workflow = workflowManager.getWorkflow(req.params.id!)

      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found',
          workflow_id: req.params.id,
        })
      }

      res.json({
        id: workflow.id,
        name: workflow.name,
        filename: workflow.filename,
        description: workflow.description,
        created_at: workflow.createdAt,
        updated_at: workflow.updatedAt,
        size: workflow.size,
        node_count: workflow.nodeCount,
        content: workflow.content,
        links: {
          self: `/api/v1/workflows/${workflow.id}`,
        },
      })
    } catch (error) {
      logger.error(`GET /api/v1/workflows/${req.params.id} - 500`, error)
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ============================================================================
  // Create Workflow (JSON body)
  // ============================================================================

  /**
   * POST /api/v1/workflows
   * Create a new workflow from JSON body
   */
  router.post('/workflows', express.json(), (req: Request, res: Response) => {
    try {
      const { name, description, content, filename } = req.body

      // Validate required fields
      if (!name) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Workflow name is required',
        })
      }

      if (!content) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Workflow content is required',
        })
      }

      const options: CreateWorkflowOptions = {
        name,
        description,
        content,
        filename,
      }

      const workflow = workflowManager.createWorkflow(options)

      logger.info(`Workflow created via REST API: ${workflow.id}`)

      res.status(201).json({
        id: workflow.id,
        name: workflow.name,
        filename: workflow.filename,
        description: workflow.description,
        created_at: workflow.createdAt,
        updated_at: workflow.updatedAt,
        size: workflow.size,
        node_count: workflow.nodeCount,
        content: workflow.content,
        links: {
          self: `/api/v1/workflows/${workflow.id}`,
        },
      })
    } catch (error) {
      logger.error('POST /api/v1/workflows - 500', error)

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          return res.status(409).json({
            error: 'Conflict',
            message: error.message,
          })
        }
      }

      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ============================================================================
  // Upload Workflow (File upload)
  // ============================================================================

  /**
   * POST /api/v1/workflows/upload
   * Upload a workflow file
   */
  router.post('/workflows/upload', upload.single('file'), (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'No file uploaded',
        })
      }

      // Parse JSON content
      let content: Record<string, any>
      try {
        content = JSON.parse(req.file.buffer.toString('utf-8'))
      } catch (error) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Invalid JSON file',
        })
      }

      // Use original filename or generate from metadata
      const metadata = (content as any)._metadata || {}
      const name = metadata.name || req.file.originalname.replace('.json', '')
      const description = metadata.description
      const filename = req.file.originalname

      const options: CreateWorkflowOptions = {
        name,
        description,
        content,
        filename,
      }

      const workflow = workflowManager.createWorkflow(options)

      logger.info(`Workflow uploaded via REST API: ${workflow.id}`)

      res.status(201).json({
        id: workflow.id,
        name: workflow.name,
        filename: workflow.filename,
        description: workflow.description,
        created_at: workflow.createdAt,
        updated_at: workflow.updatedAt,
        size: workflow.size,
        node_count: workflow.nodeCount,
        content: workflow.content,
        links: {
          self: `/api/v1/workflows/${workflow.id}`,
        },
      })
    } catch (error) {
      logger.error('POST /api/v1/workflows/upload - 500', error)

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('already exists')) {
          return res.status(409).json({
            error: 'Conflict',
            message: error.message,
          })
        }
      }

      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ============================================================================
  // Update Workflow
  // ============================================================================

  /**
   * PUT /api/v1/workflows/:id
   * Update an existing workflow
   */
  router.put('/workflows/:id', express.json(), (req: Request, res: Response) => {
    try {
      const { name, description, content } = req.body

      const workflow = workflowManager.updateWorkflow(req.params.id!, {
        name,
        description,
        content,
      })

      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found',
          workflow_id: req.params.id,
        })
      }

      logger.info(`Workflow updated via REST API: ${workflow.id}`)

      res.json({
        id: workflow.id,
        name: workflow.name,
        filename: workflow.filename,
        description: workflow.description,
        updated_at: workflow.updatedAt,
        size: workflow.size,
        node_count: workflow.nodeCount,
        content: workflow.content,
        links: {
          self: `/api/v1/workflows/${workflow.id}`,
        },
      })
    } catch (error) {
      logger.error(`PUT /api/v1/workflows/${req.params.id} - 500`, error)
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ============================================================================
  // Delete Workflow
  // ============================================================================

  /**
   * DELETE /api/v1/workflows/:id
   * Delete a workflow
   */
  router.delete('/workflows/:id', (req: Request, res: Response) => {
    try {
      const deleted = workflowManager.deleteWorkflow(req.params.id!)

      if (!deleted) {
        return res.status(404).json({
          error: 'Workflow not found',
          workflow_id: req.params.id,
        })
      }

      logger.info(`Workflow deleted via REST API: ${req.params.id}`)

      res.json({
        message: 'Workflow deleted successfully',
        workflow_id: req.params.id,
      })
    } catch (error) {
      logger.error(`DELETE /api/v1/workflows/${req.params.id} - 500`, error)
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // ============================================================================
  // Error Handlers
  // ============================================================================

  // Multer error handler
  router.use((error: any, _req: Request, res: Response, next: any) => {
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File too large',
          message: 'Workflow file size must be less than 10MB',
        })
      }
      return res.status(400).json({
        error: 'File upload error',
        message: error.message,
      })
    }
    next(error)
  })

  return router
}
