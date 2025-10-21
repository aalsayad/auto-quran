import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Initialize S3 client (server-side only) - lazy initialization
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    console.log("🔧 [S3] Initializing S3 client...");
    console.log("🌍 [S3] Region:", process.env.AWS_REGION);
    console.log("🪣 [S3] Bucket:", process.env.AWS_S3_BUCKET_NAME);

    s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    console.log("✅ [S3] S3 client initialized successfully");
  }
  return s3Client;
}

export async function uploadToS3(
  file: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  console.log("📦 [S3] uploadToS3 called");
  console.log("📁 [S3] Original file name:", fileName);
  console.log("📊 [S3] Buffer size:", file.length, "bytes");
  console.log("🎵 [S3] Content type:", contentType);

  const bucketName = process.env.AWS_S3_BUCKET_NAME!;

  // Generate unique file name with timestamp
  const timestamp = Date.now();
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const key = `audio/${timestamp}-${cleanFileName}`;

  console.log("🔑 [S3] Generated S3 key:", key);
  console.log("🪣 [S3] Target bucket:", bucketName);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: file,
    ContentType: contentType,
  });

  console.log("⏳ [S3] Sending PutObject command to AWS...");

  const client = getS3Client();

  try {
    const result = await client.send(command);
    console.log("✅ [S3] Upload to S3 successful!");
    console.log("📋 [S3] AWS Response:", {
      ETag: result.ETag,
      VersionId: result.VersionId,
    });
  } catch (error) {
    console.error("💥 [S3] AWS S3 upload failed:", error);
    throw error;
  }

  // Return the S3 URL
  const url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  console.log("🔗 [S3] Generated public URL:", url);

  return url;
}

export async function deleteFromS3(fileUrl: string): Promise<boolean> {
  console.log("🗑️  [S3] deleteFromS3 called");
  console.log("🔗 [S3] File URL:", fileUrl);

  const bucketName = process.env.AWS_S3_BUCKET_NAME!;

  try {
    // Extract the key from the URL
    // URL format: https://bucket.s3.region.amazonaws.com/audio/timestamp-filename.mp3
    const url = new URL(fileUrl);
    const key = url.pathname.substring(1); // Remove leading '/'

    console.log("🔑 [S3] Extracted S3 key:", key);
    console.log("🪣 [S3] Target bucket:", bucketName);

    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    console.log("⏳ [S3] Sending DeleteObject command to AWS...");

    const client = getS3Client();
    const result = await client.send(command);

    console.log("✅ [S3] File deleted successfully from S3!");
    console.log("📋 [S3] AWS Response:", {
      DeleteMarker: result.DeleteMarker,
      VersionId: result.VersionId,
    });

    return true;
  } catch (error) {
    console.error("💥 [S3] AWS S3 deletion failed:", error);
    // Don't throw error - just log it and return false
    // This prevents deletion from failing if file is already gone
    return false;
  }
}
