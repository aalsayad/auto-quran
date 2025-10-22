import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const chunkIndex = parseInt(formData.get("chunkIndex") as string);
    const totalChunks = parseInt(formData.get("totalChunks") as string);
    const timeOffset = parseFloat(formData.get("timeOffset") as string) || 0;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    console.log(
      `🎤 [Chunk ${
        chunkIndex + 1
      }/${totalChunks}] Starting Whisper transcription`
    );
    console.log(
      `📦 [Chunk ${chunkIndex + 1}] File size: ${(
        file.size /
        1024 /
        1024
      ).toFixed(2)} MB`
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
