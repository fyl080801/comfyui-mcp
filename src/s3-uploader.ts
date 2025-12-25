import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getS3Config } from './config/index.js'
import { v4 as uuidv4 } from 'uuid'

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

export const uploadToS3 = async (imageData: Buffer, fileExtension: string): Promise<string> => {
  const config = getS3Config()
  const client = getS3Client()

  const key = `${uuidv4()}.${fileExtension}`
  const putCommand = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: imageData,
  })

  await client.send(putCommand)

  return `${config.publicDomain}/${config.bucket}/${key}`
}
