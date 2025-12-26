/**
 * Service type enumeration
 */
export type ServiceType = 'mcp' | 'api'

/**
 * ComfyUI configuration
 */
export interface ComfyUIConfig {
  address: string
  clientId: string
  host: string
  httpProtocol: string
  wsProtocol: string
}

/**
 * S3 configuration
 */
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

/**
 * Service parameter definition
 */
export interface ServiceParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description: string
  required: boolean
  default?: any
  comfyuiNodeId: string
  comfyuiWidgetName: string
}

/**
 * Service output source definition
 */
export interface ServiceOutputSource {
  nodeId: string
  outputType?: 'images' | 'video' | 'mesh' | 'audio' | 'text'
  index?: number
}

/**
 * Service output definition
 */
export interface ServiceOutput {
  name: string
  type: 'image' | 'video' | '3d_model' | 'audio' | 'text' | 'json'
  description?: string
  source: ServiceOutputSource
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  name: string
  description: string
  route?: string
  comfyuiWorkflowApi: string
  parameters: ServiceParameter[]
  outputs?: ServiceOutput[]
}

/**
 * Job configuration
 */
export interface JobConfig {
  maxJobAge?: number
  maxJobs?: number
  cleanupInterval?: number
}

/**
 * Complete configuration
 */
export interface Config {
  comfyui: ComfyUIConfig
  s3: S3Config
  jobs?: JobConfig
  services: ServiceConfig[]
}
