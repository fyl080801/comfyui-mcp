import { FastMCP } from "fastmcp"

type FastMcpSetup = (server: FastMCP) => void
const fastsetups: FastMcpSetup[] = []

export const startFastMcp = (port?: number) => {
  const server = new FastMCP({
    name: "ComfyUI",
    version: "0.1.0"
    // ping: {
    //   enabled: true
    // }
  })

  fastsetups.forEach((setup) => {
    setup(server)
  })

  const listenPort = Number(port || process.env.PORT || 3000)

  server.start({
    transportType: "httpStream",
    httpStream: {
      port: listenPort,
      endpoint: "/mcp"
    }
  })
}

export const useFastMcp = (setup: FastMcpSetup) => {
  fastsetups.push(setup)
}
