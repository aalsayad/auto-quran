/**
 * API Route: AI-Powered Quran Ayah Mapping
 *
 * Uses GPT-5 to intelligently map Whisper transcription segments to Quran ayahs
 * by matching Arabic text content (not by proportional distribution)
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildMappingPrompt,
  buildSystemInstructions,
  validateAIMapping,
  convertToSegments,
  fillSegmentGaps,
  removeBismillahIfPresent,
} from "@/lib/ai-mapping-helpers";
import type { WhisperTranscription, AyahMapping } from "@/lib/types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Maps Whisper transcription segments to Quran ayahs using GPT-5
 */
async function alignTextToAyahs(
  transcription: WhisperTranscription,
  quranText: string[],
  surahNumber: number
) {
  const whisperSegments = transcription.segments;
  const isFatiha = surahNumber === 1;

  console.log(
    `🤖 GPT-5 matching ${whisperSegments.length} Whisper segments to ${quranText.length} ayahs...`
  );

  // Build prompt
  const prompt = buildMappingPrompt(quranText, whisperSegments, isFatiha);
  const systemInstructions = buildSystemInstructions();

  // Call GPT-5
  const response = await openai.chat.completions.create({
    model: "gpt-5",
    messages: [
      {
        role: "user",
        content: systemInstructions + "\n\n" + prompt,
      },
    ],
    max_completion_tokens: 16000,
  });

  // 💰 Log and save GPT-5 token usage for cost calculation
  const gpt5InputTokens = response.usage?.prompt_tokens || 0;
  const gpt5OutputTokens = response.usage?.completion_tokens || 0;
  const gpt5TotalTokens = response.usage?.total_tokens || 0;

  console.log(
    `💰 GPT-5 tokens: ${gpt5InputTokens} in + ${gpt5OutputTokens} out = ${gpt5TotalTokens} total`
  );

  // Parse AI response
  const aiMapping = JSON.parse(response.choices[0].message.content || "{}") as {
    ayahs: AyahMapping[];
  };

  // Validate response
  const validation = validateAIMapping(aiMapping.ayahs, quranText.length);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  console.log(`✅ AI returned all ${quranText.length} ayahs successfully!`);

  // Convert ayah-centric format to segments
  const segments = convertToSegments(
    aiMapping.ayahs,
    whisperSegments,
    quranText
  );

  // Fill gaps and extend to audio boundaries
  const audioEnd = whisperSegments[whisperSegments.length - 1]?.end || 0;
  const finalSegments = fillSegmentGaps(segments, audioEnd);

  console.log(
    `✅ Created ${finalSegments.length} final segments from ${whisperSegments.length} Whisper segments`
  );

  return {
    segments: finalSegments,
    usage: {
      gpt5InputTokens,
      gpt5OutputTokens,
      gpt5TotalTokens,
    },
  };
}

/**
 * POST /api/transcribe-ai
 *
 * Transcribes audio with Whisper (or uses cached) and maps to ayahs with GPT-5
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audioUrl, surahNumber, cachedTranscription } = body;

    if (!surahNumber) {
      return NextResponse.json(
        { error: "Surah number required" },
        { status: 400 }
      );
    }

    let transcription: WhisperTranscription;

    // Use cached Whisper transcription if available
    if (cachedTranscription) {
      try {
        if (
          !cachedTranscription.segments ||
          !Array.isArray(cachedTranscription.segments)
        ) {
          throw new Error("Invalid transcription format");
        }
        transcription = cachedTranscription;
        console.log(
          `♻️ Using cached Whisper (${transcription.segments.length} segments)`
        );
      } catch {
        return NextResponse.json(
          { error: "Invalid cached transcription" },
          { status: 400 }
        );
      }
    } else {
      // Transcribe with Whisper
      if (!audioUrl) {
        return NextResponse.json(
          { error: "No audioUrl or cached transcription provided" },
          { status: 400 }
        );
      }

      console.log(`🎵 Downloading from S3: ${audioUrl}`);

      // Download file from S3
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error("Failed to download audio from S3");
      }

      const audioBlob = await audioResponse.blob();
      const audioFile = new File([audioBlob], "audio.mp3", {
        type: "audio/mpeg",
      });

      console.log(`🎵 Transcribing with Whisper for Surah ${surahNumber}...`);

      const whisperResult = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "ar",
        response_format: "verbose_json",
        timestamp_granularities: ["segment", "word"],
      });

      if (!whisperResult.segments || whisperResult.segments.length === 0) {
        throw new Error("Whisper transcription returned no segments");
      }

      transcription = {
        segments: whisperResult.segments.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
        text: whisperResult.text || "",
      };

      console.log(
        `📝 Whisper complete: ${transcription.segments.length} segments`
      );
    }

    // Fetch Quran text
    const { fetchSurahText } = await import("@/lib/quran-api");
    const quranAyahs = await fetchSurahText(surahNumber);

    // Remove Bismillah from first ayah if present
    if (quranAyahs.length > 0) {
      quranAyahs[0].text = removeBismillahIfPresent(
        quranAyahs[0].text,
        surahNumber,
        1
      );
    }

    const quranTexts = quranAyahs.map((ayah) => ayah.text);

    // Map segments to ayahs using GPT-5
    const mappingResult = await alignTextToAyahs(
      transcription,
      quranTexts,
      surahNumber
    );

    return NextResponse.json({
      segments: mappingResult.segments,
      transcription: {
        text: transcription.text,
        segments: transcription.segments,
      },
      quranTexts: quranTexts,
      alignment: {
        totalAyahs: quranTexts.length,
        detectedSegments: mappingResult.segments.length,
        confidence:
          mappingResult.segments.reduce((acc, seg) => acc + (seg.confidence || 0), 0) /
          mappingResult.segments.length,
      },
      // 💰 GPT-5 usage for token cost calculation
      usage: mappingResult.usage,
    });
  } catch (error) {
    console.error("❌ AI mapping error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to transcribe audio with AI",
      },
      { status: 500 }
    );
  }
}
