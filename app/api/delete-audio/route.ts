import { NextRequest, NextResponse } from "next/server";
import { deleteFromS3 } from "@/lib/s3-upload";

export async function POST(request: NextRequest) {
  try {
    console.log("🎯 [API] Delete audio request received");

    const body = await request.json();
    const { audioUrl } = body;

    if (!audioUrl) {
      console.error("❌ [API] No audio URL provided in request");
      return NextResponse.json(
        { error: "No audio URL provided" },
        { status: 400 }
      );
    }

    console.log("🔗 [API] Audio URL to delete:", audioUrl);

    // Delete from S3
    console.log("☁️  [API] Starting S3 deletion...");
    const success = await deleteFromS3(audioUrl);

    if (success) {
      console.log("✅ [API] S3 deletion successful!");
      return NextResponse.json({
        success: true,
        message: "Audio file deleted from S3",
      });
    } else {
      console.warn("⚠️  [API] S3 deletion failed but continuing...");
      return NextResponse.json({
        success: false,
        message: "Failed to delete from S3, but project can still be deleted",
      });
    }
  } catch (error: unknown) {
    console.error("💥 [API] Delete error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Delete failed";
    console.error("📋 [API] Error details:", {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
