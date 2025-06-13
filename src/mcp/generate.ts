import z from "zod"
import { setupMCP } from "../server"
import { randomUUID } from "crypto"
import prompt from "./prompt"
import { jsonTryParse } from "../utils"
import { WebSocket } from "ws"
import { COMFYUI_URL, COMFYUI_WS, SERVER_HOST } from "../constants"
import axios from "axios"

setupMCP((server) => {
  server.registerTool(
    "comfyui_generate",
    {
      description: "comfyui generate image",
      inputSchema: {
        prompt: z.string().describe("prompt, must in english"),
        negative_prompt: z
          .string()
          .optional()
          .describe("negative prompt, must in english"),
        width: z.number().optional().describe("image width"),
        height: z.number().optional().describe("image height")
      }
    },
    async (params) => {
      const clientId = randomUUID()

      const executeGen = async () => {
        const response = await axios.post(`${COMFYUI_URL}/prompt`, {
          client_id: clientId,
          prompt: prompt(params)
        })

        if (response.status !== 200) throw new Error("ComfyUI调用失败")
      }

      const executeWs = () => {
        const { resolve, reject, promise } = Promise.withResolvers<any[]>()

        const ws = new WebSocket(`${COMFYUI_WS}/ws?clientId=${clientId}`)

        const start = new Date().valueOf()
        const timer = setInterval(() => {
          if (new Date().valueOf() - start < 8 * 60 * 1000) return

          clearInterval(timer)
          ws.close()

          reject(new Error("comfyui timeout"))
        }, 1000)

        ws.addEventListener("open", () => {
          executeGen()
        })

        ws.addEventListener("message", (ev) => {
          const data: any = jsonTryParse(ev.data?.toString())

          // if (
          //   ![
          //     "status",
          //     "executing",
          //     "execution_start",
          //     "executed",
          //     "progress"
          //   ].includes(data?.type)
          // )
          //   return

          if (data?.type === "executed") {
            clearInterval(timer)
            ws.close()

            resolve(data?.data?.output?.images || [])
          }
          // {"type": "status", "data": {"status": {"exec_info": {"queue_remaining": 0}}, "sid": "3b97fe3c916c4506a700973339641bdd"}}
          // {"type": "execution_start", "data": {"prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d", "timestamp": 1749660341752}}
          // {"type": "execution_cached", "data": {"nodes": [], "prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d", "timestamp": 1749660341766}}
          // {"type": "progress", "data": {"value": 25, "max": 25, "prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d", "node": "31"}}
          // {"type": "executing", "data": {"node": "32", "display_node": "32", "prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d"}}
          // {"type": "executed", "data": {"node": "144", "display_node": "144", "output": {"images": [{"filename": "ComfyUI_Export_00101_.png", "subfolder": "", "type": "output"}]}, "prompt_id": "548eeeca-87f3-4c18-87d1-afd68cfae89d"}}
        })

        ws.addEventListener("error", (e) => {
          clearInterval(timer)
          ws.close()

          reject(new Error(e?.message))
        })

        return promise
      }

      const images = await executeWs().catch((err) => {
        console.log(err)
        return []
      })

      return {
        content: images.map((image) => {
          return {
            type: "resource",
            resource: {
              text: "image",
              uri: `${SERVER_HOST}/view?filename=${image.filename}`
            }
          }
        })
      }

      // const results = await Promise.all(
      //   images.map(async (image) => {
      //     const downloaded = await downloadImageAsBase64(
      //       `${COMFYUI_URL}/view?filename=${image.filename}`
      //     ).catch((err) => {
      //       console.log(err)
      //       return null
      //     })

      //     return downloaded
      //   })
      // )

      // return {
      //   content: results
      //     .filter((item) => item !== null)
      //     .map((item) => ({
      //       type: "image",
      //       data: item.base64,
      //       mimeType: item.contentType
      //     }))
      // }
    }
  )
})
