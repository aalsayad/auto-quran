import { NextRequest, NextResponse } from "next/server";
import { generatePresignedUrl } from "@/lib/s3-upload";

export async function POST(request: NextRequest) {
  try {
    console.log("🎯 [API] Presigned URL request received");

    const body = await request.json();
    const { fileName, contentType } = body;

    if (!fileName || !contentType) {
      console.error("❌ [API] Missing fileName or contentType");
      return NextResponse.json(
        { error: "fileName and contentType are required" },
        { status: 400 }
      );
    }

    console.log("📄 [API] Generating presigned URL for:", fileName);
    console.log("🎵 [API] Content type:", contentType);

    // Validate content type
    if (!contentType.includes("audio")) {
      console.error("❌ [API] Invalid content type:", contentType);
      return NextResponse.json(
        { error: "File must be an audio file" },
        { status: 400 }
      );
    }

    console.log("✅ [API] Validation passed");

    // Generate presigned URL
    console.log("🔐 [API] Generating presigned URL...");
    const { uploadUrl, fileUrl, key } = await generatePresignedUrl(
      fileName,
      contentType
    );
    console.log("✅ [API] Presigned URL generated!");
    console.log("🔗 [API] Upload URL:", uploadUrl);
    console.log("🔗 [API] Final file URL:", fileUrl);

    return NextResponse.json({
      success: true,
      uploadUrl,
      fileUrl,
      key,
      fileName,
    });
  } catch (error: unknown) {
    console.error("💥 [API] Error generating presigned URL:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate upload URL";
    console.error("📋 [API] Error details:", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
