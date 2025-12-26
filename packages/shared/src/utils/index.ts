/**
 * Download an image from a URL and return as base64
 * @param url - URL of the image to download
 * @returns Object containing base64 string, content type, and data URL
 */
export const downloadImageAsBase64 = async (
  url: string,
  httpClient: any
): Promise<{
  base64: string
  contentType: string
  dataUrl: string
}> => {
  try {
    const response = await httpClient.get(url, {
      responseType: 'arraybuffer',
    })
    const base64String = Buffer.from(response.data, 'binary').toString('base64')
    const contentType = response.headers['content-type']
    const dataUrl = `data:${contentType};base64,${base64String}`

    return {
      base64: base64String,
      contentType,
      dataUrl,
    }
  } catch (error) {
    throw error
  }
}

/**
 * Try to parse JSON string, return default value if parsing fails
 * @param input - JSON string to parse
 * @param def - Default value to return if parsing fails
 * @returns Parsed object or default value
 */
export const jsonTryParse = <T = any>(input: string, def?: T): T => {
  try {
    return JSON.parse(input)
  } catch {
    return def as T
  }
}

/**
 * Parse a boolean string value with support for multiple formats
 * @param value - String value to parse
 * @param defaultValue - Default value if undefined or empty
 * @returns Parsed boolean value
 */
export function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (value === undefined || value === '') return defaultValue
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
}

/**
 * Parse ComfyUI URL to extract protocol and host
 * @param address - ComfyUI address URL
 * @returns Object containing host, httpProtocol, and wsProtocol
 */
export function parseComfyUIUrl(address: string): {
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
