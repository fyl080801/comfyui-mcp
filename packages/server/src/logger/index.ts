/**
 * Logger Configuration Module
 * Provides Winston logger with console and file transports
 */
import winston from 'winston'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get log level from environment variable (default: 'info')
const logLevel = process.env.LOG_LEVEL || 'info'

// Get log directory from environment variable (default: 'logs')
const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs')

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
)

// Define console format with colors
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
)

// Create Winston logger instance
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'comfyui-mcp' },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
})

// If we're not in production, also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  )
}

// Add API-specific logging helpers
export const apiLogger = {
  request: (method: string, path: string, params?: any) => {
    logger.info(`API Request: ${method} ${path}`, {
      type: 'api_request',
      method,
      path,
      params,
    })
  },
  response: (method: string, path: string, statusCode: number, duration: number) => {
    logger.info(`API Response: ${method} ${path} - ${statusCode} (${duration}ms)`, {
      type: 'api_response',
      method,
      path,
      statusCode,
      duration,
    })
  },
  error: (method: string, path: string, error: Error) => {
    logger.error(`API Error: ${method} ${path}`, {
      type: 'api_error',
      method,
      path,
      error: error.message,
      stack: error.stack,
    })
  },
}

// Add job-specific logging helpers
export const jobLogger = {
  created: (jobId: string, service: string, parameters: any) => {
    logger.info(`Job created: ${jobId} (${service})`, {
      type: 'job_created',
      jobId,
      service,
      parameters,
    })
  },
  started: (jobId: string, service: string) => {
    logger.info(`Job started: ${jobId} (${service})`, {
      type: 'job_started',
      jobId,
      service,
    })
  },
  completed: (jobId: string, service: string, duration: number, imageCount: number) => {
    logger.info(`Job completed: ${jobId} (${service}) - ${imageCount} images in ${duration}ms`, {
      type: 'job_completed',
      jobId,
      service,
      duration,
      imageCount,
    })
  },
  failed: (jobId: string, service: string, error: Error) => {
    logger.error(`Job failed: ${jobId} (${service}) - ${error.message}`, {
      type: 'job_failed',
      jobId,
      service,
      error: error.message,
      stack: error.stack,
    })
  },
  progress: (jobId: string, current: number, maximum: number, node: string) => {
    logger.debug(`Job progress: ${jobId} - ${current}/${maximum} (node: ${node})`, {
      type: 'job_progress',
      jobId,
      current,
      maximum,
      node,
    })
  },
}

// Add WebSocket-specific logging helpers
export const wsLogger = {
  connected: (clientId: string, host: string) => {
    logger.info(`WebSocket connected: ${clientId} to ${host}`, {
      type: 'ws_connected',
      clientId,
      host,
    })
  },
  disconnected: (clientId: string) => {
    logger.info(`WebSocket disconnected: ${clientId}`, {
      type: 'ws_disconnected',
      clientId,
    })
  },
  message: (clientId: string, messageType: string, data?: any) => {
    logger.debug(`WebSocket message: ${clientId} - ${messageType}`, {
      type: 'ws_message',
      clientId,
      messageType,
      data,
    })
  },
  error: (clientId: string, error: Error) => {
    logger.error(`WebSocket error: ${clientId} - ${error.message}`, {
      type: 'ws_error',
      clientId,
      error: error.message,
      stack: error.stack,
    })
  },
}

export default logger
