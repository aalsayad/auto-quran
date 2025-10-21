import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Call Whisper API with verbose_json to get timestamps
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "ar",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    return NextResponse.json({
      segments: transcription.segments,
      text: transcription.text,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to transcribe audio",
      },
      { status: 500 }
    );
  }
}
