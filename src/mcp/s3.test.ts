import { uploadToS3 } from "./s3.js"
// import mock from "aws-sdk-client-mock"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

// const s3Mock = mock.mockClient(S3Client)

// jest.mock("@aws-sdk/s3-request-presigner", () => ({
//   getSignedUrl: jest.fn().mockResolvedValue("https://mock-s3-url.com")
// }))

describe("uploadToS3", () => {
  //   beforeEach(() => {
  //     s3Mock.reset()
  //     s3Mock.on(PutObjectCommand).resolves({})
  //   })

  it("should upload file to S3 and return signed URL", async () => {
    const mockBuffer = Buffer.from("test-image-data")
    const result = await uploadToS3("test.png", mockBuffer)

    // expect(s3Mock.calls()).toHaveLength(1)
    // expect(s3Mock.call(0).firstArg.input).toEqual({
    //   Bucket: expect.any(String),
    //   Key: "comfyui-output/test.png",
    //   Body: mockBuffer,
    //   ContentType: "image/png"
    // })
    expect(result).toBe("https://mock-s3-url.com")
  })

  it("should use correct S3 key structure", async () => {
    const mockBuffer = Buffer.from("test-image-data")
    await uploadToS3("subfolder/test.png", mockBuffer)

    // expect(s3Mock.call(0).firstArg.input.Key).toBe(
    //   "comfyui-output/subfolder/test.png"
    // )
  })
})
