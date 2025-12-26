import axios from '../http-client.js'
import { downloadImageAsBase64 as downloadImageAsBase64Shared, jsonTryParse } from '@comfyui-mcp/shared/utils'

export const downloadImageAsBase64 = async (url: string) => {
  return downloadImageAsBase64Shared(url, axios)
}

export { jsonTryParse }
