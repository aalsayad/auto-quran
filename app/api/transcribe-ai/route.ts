import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AI-powered alignment: Let GPT-4o-mini intelligently map segments to ayahs
async function alignTextToAyahs(
  transcription: {
    segments?: { start: number; end: number; text: string }[];
    text?: string;
  },
  quranText: string[],
  surahNumber: number
) {
  const whisperSegments = transcription.segments || [];
  const isFatiha = surahNumber === 1;

  const startIndex = isFatiha ? 0 : 1;
  const maxIndex = whisperSegments.length - 1;

  // Show Whisper's transcribed text and actual Quran text for intelligent matching
  const whisperTexts = whisperSegments
    .slice(startIndex, maxIndex + 1)
    .map(
      (seg, i) => `[${i + startIndex}] "${seg.text.trim().substring(0, 80)}"`
    )
    .join("\n");

  const quranTexts = quranText
    .map((text, i) => `Ayah ${i + 1}: "${text.trim().substring(0, 80)}"`)
    .join("\n");

  // Enhanced prompt with actual text matching
  const prompt = `Map ${whisperSegments.length} Whisper segments to ${
    quranText.length
  } Quran ayahs by MATCHING THE ARABIC TEXT.

${
  isFatiha
    ? "Bismillah is Ayah 1 (segment 0)."
    : "Skip segment 0 (Bismillah). Start at segment 1."
}

WHISPER TRANSCRIBED (segments ${startIndex}-${maxIndex}):
${whisperTexts}

ACTUAL QURAN AYAHS:
${quranTexts}

CRITICAL: The QURAN TEXT is your REFERENCE. Match Whisper's transcribed Arabic to the actual Quran ayahs.

⚠️ AUDIO PAUSES ≠ AYAH BOUNDARIES!
- Segments [19] and [20] might BOTH be part of ayah 20 (Qari paused mid-ayah)
- You MUST read the Arabic text and match it to the actual Quran ayahs!

SCENARIO 1 - Long ayah, Qari paused (MULTIPLE segments, SAME ayah):
Segment [19]: "وَأَمَّا مَن جَاۤءَكَ يَسۡعَىٰ" ← Part of ayah 8
Segment [20]: "وَهُوَ يَخۡشَىٰ" ← Also part of ayah 8!
Ayah 8 full text: "وَأَمَّا مَن جَاۤءَكَ يَسۡعَىٰ وَهُوَ يَخۡشَىٰ"
→ {"segmentIndex": 19, "ayahNumbers": [8]}
→ {"segmentIndex": 20, "ayahNumbers": [8]}

SCENARIO 2 - Short ayahs, no pause (ONE segment, MULTIPLE ayahs):
Segment [5]: "أَمَّا مَنِ ٱسۡتَغۡنَىٰ فَأَنتَ لَهُۥ تَصَدَّىٰ" ← Contains ayahs 5 & 6
→ {"segmentIndex": 5, "ayahNumbers": [5, 6]}

PROCESS:
1. Look at Whisper transcribed text for segment [N]
2. Find which Quran ayah(s) contain that exact Arabic text
3. Assign those ayah number(s)

RULES:
- IGNORE audio pauses - use Arabic text matching ONLY
- Whisper text is PARTIAL/DIRTY - match it to clean Quran text
- ALL ayahs 1-${quranText.length} must appear

OUTPUT JSON:
{
  "segments": [
    {"segmentIndex": ${startIndex}, "ayahNumbers": [...]},
    ...
  ]
}`;

  try {
    const avgSegmentsPerAyah = Math.round(
      whisperSegments.length / quranText.length
    );
    console.log(
      `🤖 GPT-4o intelligently matching Whisper Arabic text to ${quranText.length} Quran ayahs...`
    );
    console.log(
      `📊 ${whisperSegments.length} Whisper segments available (avg ~${avgSegmentsPerAyah} per ayah)`
    );

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert at matching Whisper's Arabic transcriptions to the actual Quran text.

🎯 YOUR TASK: Match each Whisper segment's Arabic text to the correct Quran ayah(s).

CRITICAL UNDERSTANDING:
- Whisper segments = audio chunks (based on PAUSES, not ayah boundaries!)
- Quran ayahs = the actual verses (THE REFERENCE/GROUND TRUTH)
- YOU MUST: Read Whisper's Arabic text and find which ayah(s) it belongs to

KEY RULES:
1. AUDIO PAUSES ≠ AYAH BOUNDARIES! A Qari might pause mid-ayah.
2. Multiple segments can have the SAME ayah (long ayah, Qari paused)
3. One segment can have MULTIPLE ayahs (short ayahs, no pause)
4. Match by ARABIC TEXT ONLY - ignore timing/pauses!
5. All ayahs 1-N must appear in your output

Example (Qari paused mid-ayah):
Segment [19]: "وَأَمَّا مَن جَاۤءَكَ" → ayah 8 (first part)
Segment [20]: "يَسۡعَىٰ وَهُوَ يَخۡشَىٰ" → ayah 8 (second part)
Both return [8], not [19] and [20]!`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
      max_tokens: 4000, // Increase token limit for larger responses
    });

    const aiMapping = JSON.parse(
      response.choices[0].message.content || "{}"
    ) as {
      segments: { segmentIndex: number; ayahNumbers: number[] }[];
    };
    console.log(`✅ AI suggested ${aiMapping.segments?.length || 0} segments`);
    console.log(
      `📋 AI response sample:`,
      JSON.stringify(aiMapping.segments?.slice(0, 5), null, 2)
    );

    // Validate: Check all ayahs 1-N are covered
    if (!aiMapping.segments) {
      throw new Error("AI did not return segments array");
    }

    const allAyahNumbers = new Set<number>();
    aiMapping.segments.forEach(
      (seg: { segmentIndex: number; ayahNumbers: number[] }) => {
        seg.ayahNumbers.forEach((num) => allAyahNumbers.add(num));
      }
    );

    const missing: number[] = [];
    for (let i = 1; i <= quranText.length; i++) {
      if (!allAyahNumbers.has(i)) missing.push(i);
    }

    if (missing.length > 0) {
      console.error(`❌ Missing ayahs: ${missing.join(", ")}`);
      console.error(
        `   Got ayahs: ${Array.from(allAyahNumbers)
          .sort((a, b) => a - b)
          .join(", ")}`
      );
      throw new Error(
        `AI mapping incomplete: missing ${missing.length} ayahs (${missing.join(
          ", "
        )})`
      );
    }

    console.log(
      `✅ All ${quranText.length} ayahs covered across ${aiMapping.segments.length} segments`
    );

    // Convert AI segments to app format
    const ayahSegments = aiMapping.segments
      .map((mapping: { segmentIndex: number; ayahNumbers: number[] }) => {
        const segIdx = mapping.segmentIndex;

        // Validate segment index
        if (segIdx >= whisperSegments.length || segIdx < 0) {
          console.warn(
            `⚠️ Invalid segment index ${segIdx}, max: ${
              whisperSegments.length - 1
            }`
          );
          return null;
        }

        const segment = whisperSegments[segIdx];
        const ayahNumbers = mapping.ayahNumbers;

        // Get combined text for multiple ayahs
        const text = ayahNumbers
          .map((num) => quranText[num - 1])
          .filter(Boolean)
          .join(" ");

        return {
          start: segment.start,
          end: segment.end,
          text: text || `Ayah ${ayahNumbers.join(", ")}`,
          ayahNumbers: ayahNumbers.length > 1 ? ayahNumbers : undefined,
          ayahNumber: ayahNumbers.length === 1 ? ayahNumbers[0] : undefined,
          confidence: 0.9,
        };
      })
      .filter((seg) => seg !== null) as {
      start: number;
      end: number;
      text: string;
      ayahNumber?: number;
      ayahNumbers?: number[];
      confidence: number;
    }[];

    // MERGE consecutive segments with the same ayah number(s)
    const mergedSegments: typeof ayahSegments = [];
    for (let i = 0; i < ayahSegments.length; i++) {
      const current = ayahSegments[i];
      const next = ayahSegments[i + 1];

      // Check if next segment has same ayah number(s)
      const currentAyahs = current.ayahNumbers || [current.ayahNumber!];
      const nextAyahs = next ? next.ayahNumbers || [next.ayahNumber!] : null;

      const shouldMerge =
        next &&
        nextAyahs &&
        currentAyahs.length === nextAyahs.length &&
        currentAyahs.every((ayah, idx) => ayah === nextAyahs[idx]);

      if (shouldMerge) {
        // Merge with next segment(s)
        let endSegment = next;
        let j = i + 1;

        // Keep merging while consecutive segments have same ayah(s)
        while (j < ayahSegments.length) {
          const checkSegment = ayahSegments[j];
          const checkAyahs = checkSegment.ayahNumbers || [
            checkSegment.ayahNumber!,
          ];
          const isSame =
            currentAyahs.length === checkAyahs.length &&
            currentAyahs.every((ayah, idx) => ayah === checkAyahs[idx]);

          if (!isSame) break;

          endSegment = checkSegment;
          j++;
        }

        // Create merged segment
        mergedSegments.push({
          start: current.start,
          end: endSegment.end,
          text: current.text,
          ayahNumber: current.ayahNumber,
          ayahNumbers: current.ayahNumbers,
          confidence: current.confidence,
        });

        // Skip the merged segments
        i = j - 1;
      } else {
        // No merge needed
        mergedSegments.push(current);
      }
    }

    console.log(
      `✅ Created ${ayahSegments.length} segments → Merged to ${mergedSegments.length} (consecutive same ayahs merged)`
    );
    return mergedSegments;
  } catch (error) {
    console.error("❌ AI mapping failed:", error);
    throw new Error(`AI mapping failed: ${error}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const surahNumber = parseInt(formData.get("surahNumber") as string);
    const cachedTranscriptionStr = formData.get("cachedTranscription") as
      | string
      | null;

    let transcription: {
      segments?: { start: number; end: number; text: string }[];
      text?: string;
    };

    // Check if we have a cached transcription (saves API costs!)
    if (cachedTranscriptionStr) {
      try {
        transcription = JSON.parse(cachedTranscriptionStr);
        console.log(
          `♻️ Using cached Whisper transcription (${
            transcription.segments?.length || 0
          } segments) - saving API costs!`
        );
      } catch (e) {
        console.error("Failed to parse cached transcription:", e);
        return NextResponse.json(
          { error: "Invalid cached transcription format" },
          { status: 400 }
        );
      }
    } else {
      // No cache, need to transcribe with Whisper
      if (!file) {
        return NextResponse.json(
          { error: "No file or cached transcription provided" },
          { status: 400 }
        );
      }

      console.log(
        `🎵 Starting Whisper transcription for Surah ${surahNumber} (this costs tokens)`
      );

      // Step 1: Transcribe with Whisper (get word-level timestamps)
      transcription = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        language: "ar",
        response_format: "verbose_json",
        timestamp_granularities: ["segment", "word"],
      });

      console.log(
        `📝 Whisper transcription complete: ${
          transcription.segments?.length || 0
        } segments (cached for future use)`
      );
    }

    if (!surahNumber) {
      return NextResponse.json(
        { error: "Surah number required" },
        { status: 400 }
      );
    }

    // Step 2: Fetch Quran text for this surah
    const { fetchSurahText } = await import("@/lib/quran-api");
    const quranAyahs = await fetchSurahText(surahNumber);

    // Remove Bismillah from first ayah if not Surah 1 or 9
    if (surahNumber !== 1 && surahNumber !== 9 && quranAyahs.length > 0) {
      const firstAyah = quranAyahs[0];
      const words = firstAyah.text.split(" ");
      if (words.length > 4) {
        firstAyah.text = words.slice(4).join(" ");
      }
    }

    const quranTexts = quranAyahs.map((ayah) => ayah.text);
    console.log(`📖 Fetched ${quranTexts.length} ayah texts`);

    // Step 3: Align transcribed text to Quran ayahs using AI
    const alignedSegments = await alignTextToAyahs(
      transcription,
      quranTexts,
      surahNumber
    );

    // Segments already have correct text and ayah numbers from AI mapping
    const finalSegments = alignedSegments;

    console.log(
      `🎯 AI Detection complete: ${finalSegments.length} segments (covering ${quranTexts.length} ayahs)`
    );

    return NextResponse.json({
      segments: finalSegments,
      transcription: {
        text: transcription.text,
        segments: transcription.segments,
      },
      quranTexts: quranTexts,
      alignment: {
        totalAyahs: quranTexts.length,
        detectedSegments: finalSegments.length,
        confidence:
          finalSegments.reduce(
            (acc: number, seg: { confidence?: number }) =>
              acc + (seg.confidence || 0),
            0
          ) / finalSegments.length,
      },
    });
  } catch (error) {
    console.error("AI Transcription error:", error);
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
