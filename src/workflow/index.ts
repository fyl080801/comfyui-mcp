/**
 * Workflow Manager Module
 *
 * Provides CRUD operations for managing ComfyUI workflow files.
 * Workflows are stored as JSON files in the workflows directory.
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import logger from '../logger/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Type Definitions
// ============================================================================

export interface WorkflowMetadata {
  id: string
  name: string
  filename: string
  description: string | undefined
  createdAt: string
  updatedAt: string
  size: number
  nodeCount: number
}

export interface WorkflowDetail extends WorkflowMetadata {
  content: Record<string, any>
}

export interface CreateWorkflowOptions {
  name: string
  description?: string
  content: Record<string, any>
  filename?: string
}

export interface UpdateWorkflowOptions {
  name: string | undefined
  description: string | undefined
  content: Record<string, any> | undefined
}

export interface ListWorkflowsOptions {
  limit: number | undefined
  offset: number
  search: string | undefined
}

// ============================================================================
// Workflow Manager
// ============================================================================

export class WorkflowManager {
  private workflowsDir: string

  constructor(workflowsDir?: string) {
    // Default to workflows directory in project root
    const projectRoot = path.join(__dirname, '..', '..')
    this.workflowsDir = workflowsDir || path.join(projectRoot, 'workflows')

    // Ensure workflows directory exists
    if (!fs.existsSync(this.workflowsDir)) {
      fs.mkdirSync(this.workflowsDir, { recursive: true })
      logger.info(`Created workflows directory: ${this.workflowsDir}`)
    }
  }

  /**
   * Get the workflows directory path
   */
  getWorkflowsDir(): string {
    return this.workflowsDir
  }

  /**
   * List all workflows with optional pagination and search
   */
  listWorkflows(options: Partial<ListWorkflowsOptions> = {}): WorkflowMetadata[] {
    const { limit, offset = 0, search } = options

    let files = fs.readdirSync(this.workflowsDir)
      .filter(file => file.endsWith('.json'))

    // Filter by search term (search in filename)
    if (search) {
      const searchLower = search.toLowerCase()
      files = files.filter(file =>
        file.toLowerCase().includes(searchLower)
      )
    }

    // Read all workflow files
    const workflows: WorkflowMetadata[] = files.map(file => {
      const filePath = path.join(this.workflowsDir, file)
      const stats = fs.statSync(filePath)
      const content = this.readWorkflowFile(file)
      const metadata = this.extractMetadata(content)

      return {
        id: this.filenameToId(file),
        name: metadata.name || this.filenameToName(file),
        filename: file,
        description: metadata.description,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
        size: stats.size,
        nodeCount: Object.keys(content).length,
      }
    })

    // Sort by updated date (newest first)
    workflows.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )

    // Apply pagination
    const start = offset
    const end = limit !== undefined ? start + limit : undefined

    return workflows.slice(start, end)
  }

  /**
   * Get a workflow by ID
   */
  getWorkflow(id: string): WorkflowDetail | null {
    const filename = this.idToFilename(id)
    const filePath = path.join(this.workflowsDir, filename)

    if (!fs.existsSync(filePath)) {
      return null
    }

    const content = this.readWorkflowFile(filename)
    const stats = fs.statSync(filePath)
    const metadata = this.extractMetadata(content)

    return {
      id,
      name: metadata.name || this.filenameToName(filename),
      filename,
      description: metadata.description,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
      size: stats.size,
      nodeCount: Object.keys(content).length,
      content,
    }
  }

  /**
   * Create a new workflow
   */
  createWorkflow(options: CreateWorkflowOptions): WorkflowDetail {
    const { name, description, content, filename } = options

    // Validate content
    if (!content || typeof content !== 'object') {
      throw new Error('Workflow content must be a valid object')
    }

    // Validate name
    if (!name || name.trim() === '') {
      throw new Error('Workflow name is required')
    }

    // Generate filename if not provided
    const workflowFilename = filename || this.sanitizeFilename(name)

    // Check if file already exists
    const filePath = path.join(this.workflowsDir, workflowFilename)
    if (fs.existsSync(filePath)) {
      throw new Error(`Workflow already exists: ${workflowFilename}`)
    }

    // Add metadata to workflow content
    const workflowContent = {
      ...content,
      _metadata: {
        name,
        description: description || '',
        createdAt: new Date().toISOString(),
      },
    }

    // Write workflow file
    fs.writeFileSync(filePath, JSON.stringify(workflowContent, null, 2), 'utf-8')

    logger.info(`Created workflow: ${workflowFilename}`)

    // Return created workflow
    const stats = fs.statSync(filePath)
    const id = this.filenameToId(workflowFilename)

    return {
      id,
      name,
      filename: workflowFilename,
      description,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
      size: stats.size,
      nodeCount: Object.keys(content).length,
      content: workflowContent,
    }
  }

  /**
   * Update an existing workflow
   */
  updateWorkflow(id: string, options: UpdateWorkflowOptions): WorkflowDetail | null {
    const filename = this.idToFilename(id)
    const filePath = path.join(this.workflowsDir, filename)

    if (!fs.existsSync(filePath)) {
      return null
    }

    const existingContent = this.readWorkflowFile(filename)
    const existingMetadata = this.extractMetadata(existingContent)

    // Update fields
    const updatedName = options.name || existingMetadata.name || this.filenameToName(filename)
    const updatedDescription = options.description !== undefined
      ? options.description
      : existingMetadata.description
    const updatedContent = options.content || existingContent

    // Remove _metadata from content
    const { _metadata, ...contentOnly } = updatedContent as any

    // Add updated metadata
    const workflowContent = {
      ...contentOnly,
      _metadata: {
        name: updatedName,
        description: updatedDescription || '',
        createdAt: existingMetadata.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }

    // Write updated workflow file
    fs.writeFileSync(filePath, JSON.stringify(workflowContent, null, 2), 'utf-8')

    logger.info(`Updated workflow: ${filename}`)

    // Return updated workflow
    const stats = fs.statSync(filePath)

    return {
      id,
      name: updatedName,
      filename,
      description: updatedDescription,
      createdAt: stats.birthtime.toISOString(),
      updatedAt: stats.mtime.toISOString(),
      size: stats.size,
      nodeCount: Object.keys(contentOnly).length,
      content: workflowContent,
    }
  }

  /**
   * Delete a workflow
   */
  deleteWorkflow(id: string): boolean {
    const filename = this.idToFilename(id)
    const filePath = path.join(this.workflowsDir, filename)

    if (!fs.existsSync(filePath)) {
      return false
    }

    fs.unlinkSync(filePath)
    logger.info(`Deleted workflow: ${filename}`)

    return true
  }

  /**
   * Check if a workflow exists
   */
  workflowExists(id: string): boolean {
    const filename = this.idToFilename(id)
    const filePath = path.join(this.workflowsDir, filename)
    return fs.existsSync(filePath)
  }

  /**
   * Get workflow count
   */
  getWorkflowCount(): number {
    const files = fs.readdirSync(this.workflowsDir)
    return files.filter(file => file.endsWith('.json')).length
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Read and parse a workflow file
   */
  private readWorkflowFile(filename: string): Record<string, any> {
    const filePath = path.join(this.workflowsDir, filename)
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  }

  /**
   * Extract metadata from workflow content
   */
  private extractMetadata(content: Record<string, any>): {
    name?: string
    description?: string
    createdAt?: string
    updatedAt?: string
  } {
    const metadata = (content as any)._metadata || {}
    return {
      name: metadata.name,
      description: metadata.description,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
    }
  }

  /**
   * Convert filename to ID (remove .json extension)
   */
  private filenameToId(filename: string): string {
    return filename.replace(/\.json$/, '')
  }

  /**
   * Convert ID to filename (add .json extension)
   */
  private idToFilename(id: string): string {
    return id.endsWith('.json') ? id : `${id}.json`
  }

  /**
   * Convert filename to name (remove extension and format)
   */
  private filenameToName(filename: string): string {
    return filename.replace(/\.json$/, '').replace(/_/g, ' ').replace(/-/g, ' ')
  }

  /**
   * Sanitize a string to be used as a filename
   */
  private sanitizeFilename(name: string): string {
    // Convert to lowercase, replace spaces with underscores, remove special chars
    let filename = name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '')

    // Add .json extension if not present
    if (!filename.endsWith('.json')) {
      filename += '.json'
    }

    // If filename is empty, generate a UUID-based one
    if (filename === '.json') {
      filename = `${uuidv4()}.json`
    }

    return filename
  }
}

// ============================================================================
// Default Export
// ============================================================================

// Create a singleton instance
let defaultWorkflowManager: WorkflowManager | null = null

export function getWorkflowManager(): WorkflowManager {
  if (!defaultWorkflowManager) {
    defaultWorkflowManager = new WorkflowManager()
  }
  return defaultWorkflowManager
}
