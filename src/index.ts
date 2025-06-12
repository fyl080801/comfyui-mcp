// #!/usr/bin/env node

import "./mcp"

import express from "express"
import { createProxyMiddleware } from "http-proxy-middleware"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableMCPServer } from "./server.js"
import { COMFYUI_URL } from "./constants.js"

let PORT = 3000

// Parse command-line arguments for --port=XXXX
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg.startsWith("--port=")) {
    const value = parseInt(arg.split("=")[1], 10)
    if (!isNaN(value)) {
      PORT = value
    } else {
      console.error("Invalid value for --port")
      process.exit(1)
    }
  }
}

const server = new StreamableMCPServer(
  new McpServer(
    {
      name: "comfyui",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {},
        logging: {}
      }
    }
  )
)

const app = express()
app.use(express.json())

const router = express.Router()

// single endpoint for the client to send messages to
const MCP_ENDPOINT = "/mcp"

router.post(MCP_ENDPOINT, async (req, res) => {
  await server.handlePostRequest(req, res)
})

router.get(MCP_ENDPOINT, async (req, res) => {
  await server.handleGetRequest(req, res)
})

app.get(
  "/view",
  createProxyMiddleware({
    target: COMFYUI_URL,
    changeOrigin: true,
    on: {}
  })
)

app.use("/", router)

app.listen(PORT, () => {
  console.log(`MCP Streamable HTTP Server listening on port ${PORT}`)
})

process.on("SIGINT", async () => {
  console.log("Shutting down server...")
  await server.cleanup()
  process.exit(0)
})
