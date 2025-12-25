import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { z, ZodError } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// Configuration Priority (highest to lowest):
// 1. Environment variables
// 2. config.json file values
// 3. Default values
// ============================================================================

// Initialize dotenv - load from multiple locations with priority
dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') })
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') })

// ============================================================================
// Configuration Schemas with Validation
// ============================================================================

const ComfyUIConfigSchema = z.object({
  address: z.string().url().default('http://127.0.0.1:8188'),
  client_id: z.string().default('comfyui-mcp-client'),
})

const S3ConfigFileSchema = z.object({
  bucket: z.string().default(''),
  region: z.string().default('us-east-1'),
  endpoint: z.string().optional(),
  public_domain: z.string().optional(),
  enable_path_style: z.boolean().default(false),
})

const ServiceParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']).default('string'),
  description: z.string().default(''),
  required: z.boolean().default(false),
  default: z.any().optional(),
  comfyui_node_id: z.string(),
  comfyui_widget_name: z.string(),
})

const ServiceConfigSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  route: z.string().optional(),
  comfyui_workflow_api: z.string(),
  parameters: z.array(ServiceParameterSchema).default([]),
})

const JobConfigSchema = z
  .object({
    max_job_age: z.number().default(86400000).optional(),
    max_jobs: z.number().default(1000).optional(),
    cleanup_interval: z.number().default(3600000).optional(),
  })
  .optional()

const ConfigFileSchema = z.object({
  comfyui: ComfyUIConfigSchema,
  s3: S3ConfigFileSchema.optional(),
  jobs: JobConfigSchema,
  services: z.array(ServiceConfigSchema).default([]),
})

// ============================================================================
// TypeScript Types
// ============================================================================

export interface ComfyUIConfig {
  address: string
  clientId: string
  host: string
  httpProtocol: string
  wsProtocol: string
}

export interface S3Config {
  enabled: boolean
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  region: string
  endpoint: string
  publicDomain: string
  enablePathStyle: boolean
}

export interface ServiceConfig {
  name: string
  description: string
  route?: string
  comfyuiWorkflowApi: string
  parameters: ServiceParameter[]
}

export interface ServiceParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required: boolean
  default?: any
  comfyuiNodeId: string
  comfyuiWidgetName: string
}

export interface JobConfig {
  maxJobAge?: number | undefined
  maxJobs?: number | undefined
  cleanupInterval?: number | undefined
}

export interface Config {
  comfyui: ComfyUIConfig
  s3: S3Config
  jobs?: JobConfig
  services: ServiceConfig[]
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a boolean string value with support for multiple formats
 */
function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (value === undefined || value === '') return defaultValue
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
}

/**
 * Get value with priority: env var > config value > default
 */
function getEnvOrConfig<T>(envKey: string, configValue: T | undefined, defaultValue: T): T {
  const envValue = process.env[envKey]
  if (envValue !== undefined && envValue !== '') {
    return envValue as unknown as T
  }
  return configValue !== undefined ? configValue : defaultValue
}

/**
 * Load and parse JSON configuration file
 */
function loadConfigFile(): z.infer<typeof ConfigFileSchema> {
  const projectRoot = path.join(__dirname, '..', '..')
  const configPath = path.join(projectRoot, 'config.json')
  const exampleConfigPath = path.join(projectRoot, 'config.example.json')

  // Copy example config if config.json doesn't exist
  if (!fs.existsSync(configPath)) {
    if (fs.existsSync(exampleConfigPath)) {
      fs.copyFileSync(exampleConfigPath, configPath)
      console.log(`✅ Created config.json from config.example.json`)
    } else {
      throw new Error('Neither config.json nor config.example.json found')
    }
  }

  const configFile = fs.readFileSync(configPath, 'utf-8')
  const parsed = JSON.parse(configFile)

  return ConfigFileSchema.parse(parsed)
}

/**
 * Parse ComfyUI URL to extract protocol and host
 */
function parseComfyUIUrl(address: string): {
  host: string
  httpProtocol: string
  wsProtocol: string
} {
  try {
    const url = new URL(address)
    const httpProtocol = url.protocol.slice(0, -1) // Remove trailing ':'
    const wsProtocol = httpProtocol === 'https' ? 'wss' : 'ws'
    return {
      host: url.host,
      httpProtocol,
      wsProtocol,
    }
  } catch (error) {
    throw new Error(`Invalid ComfyUI address: ${address}`)
  }
}

// ============================================================================
// Configuration Loader
// ============================================================================

let cachedConfig: Config | null = null

/**
 * Load and validate all configuration with proper priority
 */
export function loadConfig(): Config {
  if (cachedConfig) {
    return cachedConfig
  }

  try {
    const fileConfig = loadConfigFile()

    // ComfyUI Configuration with env override
    const comfyuiAddress = getEnvOrConfig(
      'COMFYUI_ADDRESS',
      fileConfig.comfyui.address,
      'http://127.0.0.1:8188'
    )
    const comfyuiClientId = getEnvOrConfig(
      'COMFYUI_CLIENT_ID',
      fileConfig.comfyui.client_id,
      'comfyui-mcp-client'
    )

    const parsedUrl = parseComfyUIUrl(comfyuiAddress)

    const comfyui: ComfyUIConfig = {
      address: comfyuiAddress,
      clientId: comfyuiClientId,
      ...parsedUrl,
    }

    // S3 Configuration with env override
    const fileS3Config = fileConfig.s3
    const s3: S3Config = {
      enabled: parseBoolean(process.env.S3_ENABLE, false),
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY || '',
      bucket: getEnvOrConfig('S3_BUCKET', fileS3Config?.bucket, ''),
      region: getEnvOrConfig('S3_REGION', fileS3Config?.region, 'us-east-1'),
      endpoint: getEnvOrConfig('S3_ENDPOINT', fileS3Config?.endpoint, ''),
      publicDomain: getEnvOrConfig('S3_PUBLIC_DOMAIN', fileS3Config?.public_domain, ''),
      enablePathStyle: parseBoolean(
        process.env.S3_ENABLE_PATH_STYLE,
        fileS3Config?.enable_path_style || false
      ),
    }

    // Derive public domain if not set
    if (!s3.publicDomain && s3.bucket) {
      s3.publicDomain = `https://s3.${s3.region}.amazonaws.com`
    }

    // Service Configuration
    const services: ServiceConfig[] = fileConfig.services.map((service) => {
      const result: ServiceConfig = {
        name: service.name,
        description: service.description,
        comfyuiWorkflowApi: service.comfyui_workflow_api,
        parameters: service.parameters.map((param) => ({
          name: param.name,
          type: param.type,
          description: param.description,
          required: param.required,
          default: param.default,
          comfyuiNodeId: param.comfyui_node_id,
          comfyuiWidgetName: param.comfyui_widget_name,
        })),
      }
      if (service.route !== undefined) {
        result.route = service.route
      }
      return result
    })

    // Job Configuration
    const fileJobConfig = fileConfig.jobs
    const jobs: JobConfig | undefined =
      fileJobConfig &&
      (fileJobConfig.max_job_age !== undefined ||
        fileJobConfig.max_jobs !== undefined ||
        fileJobConfig.cleanup_interval !== undefined)
        ? {
            maxJobAge: fileJobConfig.max_job_age,
            maxJobs: fileJobConfig.max_jobs,
            cleanupInterval: fileJobConfig.cleanup_interval,
          }
        : undefined

    const config: Config = {
      comfyui,
      s3,
      services,
    }

    // Only add jobs if it has values
    if (jobs) {
      config.jobs = jobs
    }

    cachedConfig = config

    return cachedConfig
  } catch (error) {
    if (error instanceof ZodError) {
      const errorDetails = error.issues
        .map((issue: any) => {
          const path = issue.path.join('.')
          return `  - ${path}: ${issue.message}`
        })
        .join('\n')
      throw new Error(`Configuration validation failed:\n${errorDetails}`)
    }
    throw error
  }
}

/**
 * Reset cached configuration (useful for testing)
 */
export function resetConfigCache(): void {
  cachedConfig = null
}

// ============================================================================
// Workflow Loader
// ============================================================================

/**
 * Load a workflow JSON file
 */
export function loadWorkflow(workflowPath: string): Record<string, any> {
  const projectRoot = path.join(__dirname, '..', '..')
  const fullPath = path.join(projectRoot, workflowPath)

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Workflow file not found: ${workflowPath}`)
  }

  const workflowFile = fs.readFileSync(fullPath, 'utf-8')
  return JSON.parse(workflowFile)
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get configuration object (cached)
 */
export function getConfig(): Config {
  return loadConfig()
}

/**
 * Get ComfyUI configuration
 */
export function getComfyUIConfig(): ComfyUIConfig {
  return loadConfig().comfyui
}

/**
 * Get S3 configuration
 */
export function getS3Config(): S3Config {
  return loadConfig().s3
}

/**
 * Get service configurations
 */
export function getServices(): ServiceConfig[] {
  return loadConfig().services
}

/**
 * Get a specific service by name
 */
export function getServiceByName(name: string): ServiceConfig | undefined {
  return loadConfig().services.find((s) => s.name === name)
}
