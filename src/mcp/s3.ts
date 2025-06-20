import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { randomUUID } from "crypto"
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import {
  S3_ENDPOINT,
  S3_REGION,
  S3_ACCESS_KEY_ID,
  S3_SECRET_ACCESS_KEY,
  S3_BUCKET,
  S3_ENABLE_PATH_STYLE,
  S3_PUBLIC_DOMAIN
} from "../constants.js"

const s3Client = new S3Client({
  endpoint: S3_ENDPOINT,
  region: S3_REGION,
  forcePathStyle:
    S3_ENABLE_PATH_STYLE === "true" || S3_ENABLE_PATH_STYLE === "1",
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY
  }
})

export async function uploadToS3(filename: string, imageBuffer: Buffer) {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const randomId = randomUUID()
  const ext = filename.split('.').pop()
  const key = `comfyui-output/${year}/${month}/${day}/${randomId}.${ext}`
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: imageBuffer,
    ContentType: "image/png"
  })

  await s3Client.send(command)

  return `${S3_PUBLIC_DOMAIN}/${S3_BUCKET}/${key}`
  // return getSignedUrl(s3Client, command, { expiresIn: 3600 }) // 1 hour expiry
  // return `https://${S3_BUCKET}.${S3_ENDPOINT}/${key}`
}
