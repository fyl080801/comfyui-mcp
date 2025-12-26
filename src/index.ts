import 'dotenv/config'
import { FastMCP } from 'fastmcp'
import { registerComfyUITools } from './comfyui/index.js'
import { JobManager } from './job/index.js'
import { getConfig } from './config/index.js'
import { createExpressApp } from './express-server.js'
import { createServer } from 'http'
import logger from './logger/index.js'

const server = new FastMCP({
  name: 'ComfyUI MCP Server',
  version: '1.0.0',
})

// Initialize JobManager
const jobManager = new JobManager(getConfig())
logger.info('JobManager initialized')

// Register ComfyUI tools with JobManager
try {
  registerComfyUITools(server, jobManager)
  logger.info('ComfyUI tools registered successfully')
} catch (error) {
  logger.error('Failed to register ComfyUI tools', error)
}

// Optional: Start periodic job cleanup
const config = getConfig()
if (config.jobs?.cleanupInterval) {
  setInterval(() => {
    const cutoff = new Date(Date.now() - (config.jobs!.maxJobAge || 86400000))
    const deleted = jobManager.cleanupOldJobs(cutoff)
    if (deleted > 0) {
      logger.info(`Cleaned up ${deleted} old jobs`)
    }
  }, config.jobs.cleanupInterval)
  logger.info(`Job cleanup scheduled (interval: ${config.jobs.cleanupInterval}ms)`)
}

// Start FastMCP server with HTTP transport (MCP Protocol on port 8080)
server.start({
  transportType: 'httpStream',
  httpStream: {
    port: 8080,
  },
})

logger.info('ComfyUI MCP Server (MCP Protocol) started on port 8080')

// Start Express server for RESTful API and Swagger UI
const expressPort = parseInt(process.env.EXPRESS_PORT || '3000', 10)
const expressApp = createExpressApp({
  services: config.services,
  jobManager,
})
const expressServer = createServer(expressApp)

expressServer.listen(expressPort, () => {
  logger.info('RESTful API server started on port %d', expressPort)
  logger.info('')
  logger.info('RESTful API endpoints:')
  logger.info('   → GET  /api/v1/services')
  logger.info('   → GET  /api/v1/services/{service_name}')
  logger.info('   → POST /api/v1/services/{service_name}')
  logger.info('   → GET  /api/v1/jobs')
  logger.info('   → GET  /api/v1/jobs/{job_id}')
  logger.info('   → GET  /api/v1/jobs/{job_id}/result')
  logger.info('   → DELETE /api/v1/jobs/{job_id}')
  logger.info('   → GET  /api/v1/workflows')
  logger.info('   → GET  /api/v1/workflows/{id}')
  logger.info('   → POST /api/v1/workflows')
  logger.info('   → POST /api/v1/workflows/upload')
  logger.info('   → PUT  /api/v1/workflows/{id}')
  logger.info('   → DELETE /api/v1/workflows/{id}')
  logger.info('   → GET  /api/v1/health')
  logger.info('')
  logger.info('Documentation:')
  logger.info('   → Swagger UI: http://localhost:%d/api-docs', expressPort)
  logger.info('   → OpenAPI JSON: http://localhost:%d/api-docs.json', expressPort)
  logger.info('   → API Info: http://localhost:%d/', expressPort)
  logger.info('')
  logger.info('MCP Protocol (AI Agents): http://localhost:8080/mcp')
})
