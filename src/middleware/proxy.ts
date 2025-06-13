import { createProxyMiddleware } from "http-proxy-middleware"
import { setupServer } from "../server"
import { COMFYUI_URL } from "../constants"

setupServer((app) => {
  app.get(
    "/view",
    createProxyMiddleware({
      target: COMFYUI_URL,
      changeOrigin: true,
      on: {}
    })
  )
})
