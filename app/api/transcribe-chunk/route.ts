import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    let file: File;
    let chunkIndex: number;
    let totalChunks: number;
    let timeOffset: number;

    // Try JSON first (S3 URL), fall back to FormData
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // New way: Download from S3
      const body = await request.json();
      const {
        audioUrl,
        chunkIndex: idx,
        totalChunks: total,
        timeOffset: offset,
      } = body;

      chunkIndex = idx;
      totalChunks = total;
      timeOffset = offset || 0;

      if (!audioUrl) {
        return NextResponse.json(
          { error: "No audioUrl provided" },
          { status: 400 }
        );
      }

      console.log(
        `🎤 [Chunk ${chunkIndex + 1}/${totalChunks}] Downloading from S3...`
      );
      console.log(`🔗 [Chunk ${chunkIndex + 1}] URL: ${audioUrl}`);

      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error("Failed to download audio chunk from S3");
      }

      const audioBlob = await audioResponse.blob();
      file = new File([audioBlob], `whisper-chunk-${chunkIndex}.mp3`, {
        type: "audio/mpeg",
      });

      console.log(`✅ [Chunk ${chunkIndex + 1}] Downloaded from S3`);
    } else {
      // Old way: Direct file upload (fallback for small files)
      const formData = await request.formData();
      const uploadedFile = formData.get("file") as File;
      chunkIndex = parseInt(formData.get("chunkIndex") as string);
      totalChunks = parseInt(formData.get("totalChunks") as string);
      timeOffset = parseFloat(formData.get("timeOffset") as string) || 0;

      if (!uploadedFile) {
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 }
        );
      }

      file = uploadedFile;
      console.log(
        `🎤 [Chunk ${chunkIndex + 1}/${totalChunks}] Using uploaded file`
      );
    }

    console.log(
      `📦 [Chunk ${chunkIndex + 1}] Size: ${(file.size / 1024 / 1024).toFixed(
        2
      )} MB`
    );
    console.log(
      `⏰ [Chunk ${chunkIndex + 1}] Time offset: ${timeOffset.toFixed(2)}s`
    );

    // Transcribe this chunk with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "ar",
      response_format: "verbose_json",
      timestamp_granularities: ["segment", "word"],
      prompt: "آية. جملة قصيرة. توقف. فاصل.", // "Verse. Short sentence. Stop. Break." - encourages very short segments
      temperature: 0, // More consistent segmentation
    });

    console.log(
      `✅ [Chunk ${chunkIndex + 1}] Transcription complete: ${
        transcription.segments?.length || 0
      } segments`
    );

    // Adjust timestamps by the time offset for this chunk
    const adjustedSegments = (transcription.segments || []).map((seg) => ({
      start: seg.start + timeOffset,
      end: seg.end + timeOffset,
      text: seg.text,
    }));

    console.log(
      `📝 [Chunk ${
        chunkIndex + 1
      }] Adjusted timestamps (offset: +${timeOffset.toFixed(2)}s)`
    );

    return NextResponse.json({
      success: true,
      chunkIndex,
      segments: adjustedSegments,
      text: transcription.text,
    });
  } catch (error: unknown) {
    console.error("❌ Chunk transcription error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Transcription failed";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
