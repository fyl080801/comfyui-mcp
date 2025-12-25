import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import { getS3Config } from '../config/index.js'

let s3Client: S3Client | null = null

/**
 * Get or create S3 client (lazy initialization)
 */
function getS3Client(): S3Client {
  if (!s3Client) {
    const config = getS3Config()
    const clientConfig: Record<string, any> = {
      region: config.region,
      forcePathStyle: config.enablePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }

    // Only add endpoint if it's defined
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint
    }

    s3Client = new S3Client(clientConfig)
  }
  return s3Client
}

export async function uploadToS3(filename: string, imageBuffer: Buffer) {
  const config = getS3Config()
  const client = getS3Client()

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const randomId = randomUUID()
  const ext = filename.split('.').pop()
  const key = `comfyui-output/${year}/${month}/${day}/${randomId}.${ext}`
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: imageBuffer,
    ContentType: 'image/png',
  })

  await client.send(command)

  return `${config.publicDomain}/${config.bucket}/${key}`
  // return getSignedUrl(client, command, { expiresIn: 3600 }) // 1 hour expiry
  // return `https://${config.bucket}.${config.endpoint}/${key}`
}
