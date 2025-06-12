import axios from "axios"

export const downloadImageAsBase64 = async (url: string) => {
  try {
    const response = await axios.get(url, {
      responseType: "arraybuffer"
    })
    const base64String = Buffer.from(response.data, "binary").toString("base64")
    const contentType = response.headers["content-type"]
    const dataUrl = `data:${contentType};base64,${base64String}`

    return {
      base64: base64String,
      contentType,
      dataUrl
    }
  } catch (error) {
    throw error
  }
}

export const jsonTryParse = (input: string, def?: any) => {
  try {
    return JSON.parse(input)
  } catch {
    return def
  }
}
