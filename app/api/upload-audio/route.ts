import { NextRequest, NextResponse } from "next/server";
import { uploadToS3 } from "@/lib/s3-upload";

export async function POST(request: NextRequest) {
  try {
    console.log("🎯 [API] Upload request received");

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.error("❌ [API] No file provided in request");
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log("📄 [API] File received:", file.name);
    console.log(
      "📏 [API] File size:",
      (file.size / 1024 / 1024).toFixed(2),
      "MB"
    );
    console.log("🎵 [API] File type:", file.type);

    // Validate file type
    if (!file.type.includes("audio")) {
      console.error("❌ [API] Invalid file type:", file.type);
      return NextResponse.json(
        { error: "File must be an audio file" },
        { status: 400 }
      );
    }

    console.log("✅ [API] File validation passed");
    console.log("🔄 [API] Converting file to buffer...");

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    console.log("✅ [API] Buffer created, size:", buffer.length, "bytes");

    // Upload to S3
    console.log("☁️  [API] Starting S3 upload...");
    const s3Url = await uploadToS3(buffer, file.name, file.type);
    console.log("✅ [API] S3 upload successful!");
    console.log("🔗 [API] S3 URL:", s3Url);

    return NextResponse.json({
      success: true,
      url: s3Url,
      fileName: file.name,
    });
  } catch (error: any) {
    console.error("💥 [API] Upload error:", error);
    console.error("📋 [API] Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      { error: error.message || "Upload failed" },
      { status: 500 }
    );
  }
}
