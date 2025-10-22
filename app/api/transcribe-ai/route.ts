import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// AI-powered alignment: Let GPT-4o intelligently map segments to ayahs
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
    .map((seg, i) => `[${i + startIndex}] "${seg.text.trim()}"`)
    .join("\n");

  // Send FULL Quran ayahs for accurate matching (especially important for long ayahs like An-Nisa!)
  const quranTexts = quranText
    .map((text, i) => `Ayah ${i + 1}: "${text.trim()}"`)
    .join("\n");

  // 🔥 QURAN-FIRST PROMPT: Start with ayahs, find segments
  const prompt = `🎯 YOUR MISSION: For EACH of the ${
    quranText.length
  } Quran ayahs, find which Whisper segment(s) contain that ayah's recitation.

  📖 THE GROUND TRUTH - ${quranText.length} QURAN AYAHS:
  ${quranTexts}

  🎤 THE AUDIO TRANSCRIPTION - ${whisperSegments.length} WHISPER SEGMENTS:
  ${whisperTexts}

  ${
    isFatiha
      ? "ℹ️ Surah Al-Fatiha: Bismillah IS Ayah 1 (likely in segment 0)"
      : "ℹ️ Bismillah is NOT an ayah (likely in segment 0, ignore it)"
  }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🔍 YOUR PROCESS (QURAN-FIRST APPROACH - TEXT MATCHING, NOT DISTRIBUTION!):

  ⚠️ DO NOT distribute segments proportionally! You MUST match Arabic text!

  For EACH Ayah (1 through ${quranText.length}):
    1. Read the FULL Arabic text of the ayah
    2. Find which Whisper segments contain ANY words from this ayah
    3. Look for Arabic word matches (even partial/misspelled)
    4. A single ayah can span MULTIPLE segments if the Qari paused
    5. Multiple ayahs can be in ONE segment if recited without pause
    
  CRITICAL: Match by ACTUAL ARABIC WORDS, not by segment position!

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📋 EXAMPLES:

  Example 1 - Simple 1:1 mapping:
  Ayah 5: "فَأَنتَ لَهُۥ تَصَدَّىٰ"
  Whisper [12]: "فَأَنتَ لَهُۥ تَصَدَّىٰ"
  → {"ayahNumber": 5, "segmentIndices": [12]}

  Example 2 - Qari paused mid-ayah (ONE ayah in MULTIPLE segments):
  Ayah 8: "وَأَمَّا مَن جَاۤءَكَ يَسۡعَىٰ وَهُوَ يَخۡشَىٰ"
  Whisper [19]: "وَأَمَّا مَن جَاۤءَكَ يَسۡعَىٰ" (first part)
  Whisper [20]: "وَهُوَ يَخۡشَىٰ" (second part)
  → {"ayahNumber": 8, "segmentIndices": [19, 20]}

  Example 3 - Short ayahs merged (MULTIPLE ayahs in ONE segment):
  Ayah 5: "أَمَّا مَنِ ٱسۡتَغۡنَىٰ"
  Ayah 6: "فَأَنتَ لَهُۥ تَصَدَّىٰ"
  Whisper [12]: "أَمَّا مَنِ ٱسۡتَغۡنَىٰ فَأَنتَ لَهُۥ تَصَدَّىٰ" (both together!)
  → {"ayahNumber": 5, "segmentIndices": [12]}
  → {"ayahNumber": 6, "segmentIndices": [12]}

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✅ REQUIRED JSON OUTPUT FORMAT:

  Return your response as valid JSON with this exact structure:

  {
    "ayahs": [
      {"ayahNumber": 1, "segmentIndices": [...]},
      {"ayahNumber": 2, "segmentIndices": [...]},
      {"ayahNumber": 3, "segmentIndices": [...]},
      ...
      {"ayahNumber": ${quranText.length}, "segmentIndices": [...]}
    ]
  }

  ⚠️ CRITICAL RULES:
  1. Return EXACTLY ${quranText.length} objects (one per ayah)
  2. Every ayah MUST appear (1, 2, 3... ${quranText.length})
  3. ❌ DO NOT DISTRIBUTE PROPORTIONALLY! Match by Arabic text content!
  4. ❌ DO NOT assign segments sequentially (segment 1 → ayah 1, segment 2 → ayah 2)!
  5. ✅ READ the Arabic words in each Whisper segment
  6. ✅ MATCH those words to the corresponding Quran ayah
  7. Whisper text is dirty/partial - be flexible with matching
  8. Segment indices must be in range [${startIndex}-${maxIndex}]
  9. ALL Whisper segments should be used - don't leave big gaps or dump remaining segments in last ayah!
  10. ⚡ MOST CRITICAL: Your output MUST contain ALL ${
    quranText.length
  } ayahs (1-${quranText.length})
      - It's OK if multiple ayahs share the same segment (merged)
      - It's OK if one ayah spans multiple segments (Qari paused)
      - But EVERY single ayah number from 1 to ${
        quranText.length
      } MUST appear in your response
      - Missing even ONE ayah is unacceptable!

  🎯 REMEMBER: 
  - QURAN text is your ground truth
  - WHISPER text is what you're searching in
  - Match by ARABIC WORD CONTENT, not by position or distribution!`;

  try {
    const avgSegmentsPerAyah = Math.round(
      whisperSegments.length / quranText.length
    );
    console.log(
      `🤖 GPT-5 matching Whisper Arabic text to ${quranText.length} Quran ayahs...`
    );
    console.log(
      `📊 ${whisperSegments.length} Whisper segments available (avg ~${avgSegmentsPerAyah} per ayah)`
    );

    // GPT-5 requires different parameters (like o1 models)
    const systemInstructions = `You are a Quran expert analyzing audio transcriptions. You MUST match Arabic text content, NOT distribute segments proportionally.

🔥 CRITICAL: Use a QURAN-FIRST TEXT-MATCHING approach!

YOUR TASK:
- Read each Quran ayah's FULL Arabic text
- Search through Whisper segments for Arabic words that match that ayah
- Return EXACTLY N objects (one per ayah) in JSON format

❌ FORBIDDEN APPROACHES:
- ❌ Distributing segments proportionally (e.g., first 150 segments = first 150 ayahs)
- ❌ Sequential assignment (segment 1 → ayah 1, segment 2 → ayah 2)
- ❌ Bunching segments at the start and dumping remaining ones in the last ayah
- ❌ Letting audio pauses determine ayah boundaries

✅ REQUIRED APPROACH:
- ✅ Match by ACTUAL ARABIC WORD CONTENT in the Whisper transcription
- ✅ Look for word-level matches between Quran text and Whisper text
- ✅ Be flexible with spelling/diacritics (Whisper is imperfect)
- ✅ One ayah can span multiple segments (Qari paused for breath)
- ✅ Multiple ayahs can be in one segment (recited without pause)

REAL-WORLD SCENARIOS:
1. Long ayah + Qari paused → ONE ayah maps to MULTIPLE segments
   Example: Ayah 1 of An-Nisa (very long) → segments [1, 2, 3, 4]
2. Short ayahs + No pause → MULTIPLE ayahs map to ONE segment
   Example: Ayahs 5-7 (short) → all in segment [12]
3. Normal → ONE ayah maps to ONE segment
   Example: Ayah 10 → segment [25]

⚡ ABSOLUTE REQUIREMENTS:
- Return EXACTLY N ayah objects (where N = number of Quran ayahs)
- Every ayah number from 1 to N MUST appear
- Use ALL Whisper segments (don't leave gaps or dump extras at the end)
- Match by Arabic text content, not by position!
- Return your response in valid JSON format

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;

    const response = await openai.chat.completions.create({
      model: "gpt-5", // Latest model - requires max_completion_tokens
      messages: [
        {
          role: "user",
          content: systemInstructions + "\n\n" + prompt,
        },
      ],
      max_completion_tokens: 16000, // GPT-5 uses max_completion_tokens like o1
    });

    // Log token usage for monitoring
    console.log("📊 Token usage:", response.usage);
    if (response.usage) {
      console.log(
        `💰 GPT-5 token usage: ${response.usage.prompt_tokens} input + ${response.usage.completion_tokens} output`
      );
    }

    const aiMapping = JSON.parse(
      response.choices[0].message.content || "{}"
    ) as {
      ayahs: { ayahNumber: number; segmentIndices: number[] }[];
    };

    console.log(`✅ AI returned ${aiMapping.ayahs?.length || 0} ayahs`);
    console.log(
      `📋 AI response sample:`,
      JSON.stringify(aiMapping.ayahs?.slice(0, 5), null, 2)
    );

    // Validate: Check we got exactly N ayahs
    if (!aiMapping.ayahs) {
      throw new Error("AI did not return ayahs array");
    }

    if (aiMapping.ayahs.length !== quranText.length) {
      throw new Error(
        `AI returned ${aiMapping.ayahs.length} ayahs, expected ${quranText.length}`
      );
    }

    // Validate: Check all ayahs 1-N are present
    const returnedAyahNumbers = new Set(
      aiMapping.ayahs.map((a) => a.ayahNumber)
    );
    const missing: number[] = [];
    for (let i = 1; i <= quranText.length; i++) {
      if (!returnedAyahNumbers.has(i)) missing.push(i);
    }

    if (missing.length > 0) {
      throw new Error(
        `AI mapping incomplete: missing ayahs ${missing.join(", ")}`
      );
    }

    console.log(
      `✅ All ${quranText.length} ayahs returned by AI in QURAN-FIRST format!`
    );

    // Convert QURAN-FIRST format to segments for waveform editor
    console.log("🔄 Converting ayah-centric to segment-centric format...");

    // Step 1: Build map of segmentIndex → ayahNumbers[]
    const segmentToAyahsMap = new Map<number, number[]>();

    for (const ayahMapping of aiMapping.ayahs) {
      const { ayahNumber, segmentIndices } = ayahMapping;

      // Validate segment indices
      for (const segIdx of segmentIndices) {
        if (segIdx < 0 || segIdx >= whisperSegments.length) {
          console.warn(
            `⚠️ Ayah ${ayahNumber} references invalid segment ${segIdx} (max: ${
              whisperSegments.length - 1
            }), skipping`
          );
          continue;
        }

        // Add this ayah to the segment
        if (!segmentToAyahsMap.has(segIdx)) {
          segmentToAyahsMap.set(segIdx, []);
        }
        segmentToAyahsMap.get(segIdx)!.push(ayahNumber);
      }

      // If ayah spans multiple segments, we'll merge them later
      if (segmentIndices.length > 1) {
        console.log(
          `📝 Ayah ${ayahNumber} spans ${
            segmentIndices.length
          } segments: [${segmentIndices.join(", ")}]`
        );
      }
    }

    console.log(
      `🗺️  Created segment map: ${segmentToAyahsMap.size} unique segments with ayah assignments`
    );

    // Step 2: Build final segments by grouping consecutive segments with same ayah(s)
    const sortedSegmentIndices = Array.from(segmentToAyahsMap.keys()).sort(
      (a, b) => a - b
    );
    const finalSegments: {
      start: number;
      end: number;
      text: string;
      ayahNumber?: number;
      ayahNumbers?: number[];
      confidence: number;
    }[] = [];

    let i = 0;
    while (i < sortedSegmentIndices.length) {
      const currentSegIdx = sortedSegmentIndices[i];
      const currentAyahs = segmentToAyahsMap
        .get(currentSegIdx)!
        .sort((a, b) => a - b);

      // Find consecutive segments with the same ayah(s) and merge them
      let endSegIdx = currentSegIdx;
      let j = i + 1;

      while (j < sortedSegmentIndices.length) {
        const nextSegIdx = sortedSegmentIndices[j];
        const nextAyahs = segmentToAyahsMap
          .get(nextSegIdx)!
          .sort((a, b) => a - b);

        // Check if consecutive AND same ayahs
        const isConsecutive = nextSegIdx === endSegIdx + 1;
        const hasSameAyahs =
          currentAyahs.length === nextAyahs.length &&
          currentAyahs.every((ayah, idx) => ayah === nextAyahs[idx]);

        if (isConsecutive && hasSameAyahs) {
          endSegIdx = nextSegIdx;
          j++;
        } else {
          break;
        }
      }

      // Create merged segment
      const startWhisper = whisperSegments[currentSegIdx];
      const endWhisper = whisperSegments[endSegIdx];

      // Get combined text for ayahs
      const text = currentAyahs
        .map((num) => quranText[num - 1])
        .filter(Boolean)
        .join(" ");

      finalSegments.push({
        start: startWhisper.start,
        end: endWhisper.end,
        text: text || `Ayah ${currentAyahs.join(", ")}`,
        ayahNumbers: currentAyahs.length > 1 ? currentAyahs : undefined,
        ayahNumber: currentAyahs.length === 1 ? currentAyahs[0] : undefined,
        confidence: 0.9,
      });

      if (currentSegIdx !== endSegIdx) {
        console.log(
          `🔗 Merged Whisper segments ${currentSegIdx}-${endSegIdx} → Ayah(s) ${currentAyahs.join(
            ", "
          )}`
        );
      }

      i = j;
    }

    console.log(
      `✅ Created ${finalSegments.length} final segments from ${segmentToAyahsMap.size} Whisper segments`
    );

    // Step 3: Fill gaps by extending each segment to start of next
    console.log(`🔍 Checking for gaps in ${finalSegments.length} segments...`);
    const sortedSegments = finalSegments.sort((a, b) => a.start - b.start);

    let gapsFilled = 0;
    for (let i = 0; i < sortedSegments.length - 1; i++) {
      const currentSeg = sortedSegments[i];
      const nextSeg = sortedSegments[i + 1];

      // Check for gap or backwards jump
      if (currentSeg.end < nextSeg.start) {
        const gapDuration = nextSeg.start - currentSeg.end;
        console.log(
          `🔧 Filling ${gapDuration.toFixed(
            2
          )}s gap: extending segment ${i} (ayah ${
            currentSeg.ayahNumber || currentSeg.ayahNumbers?.join(",")
          }) from ${currentSeg.end.toFixed(2)}s to ${nextSeg.start.toFixed(2)}s`
        );
        currentSeg.end = nextSeg.start;
        gapsFilled++;
      } else if (currentSeg.end > nextSeg.start) {
        console.warn(
          `⚠️ Segment ${i} ends (${currentSeg.end.toFixed(2)}s) after segment ${
            i + 1
          } starts (${nextSeg.start.toFixed(2)}s) - adjusting`
        );
        currentSeg.end = nextSeg.start;
      }
    }

    // Extend last segment to end of audio
    if (sortedSegments.length > 0) {
      const lastSegment = sortedSegments[sortedSegments.length - 1];
      const audioEnd = whisperSegments[whisperSegments.length - 1].end;

      if (lastSegment.end < audioEnd) {
        const extensionDuration = audioEnd - lastSegment.end;
        console.log(
          `🔧 Extending last segment (ayah ${
            lastSegment.ayahNumber || lastSegment.ayahNumbers?.join(",")
          }) from ${lastSegment.end.toFixed(2)}s to ${audioEnd.toFixed(
            2
          )}s (+${extensionDuration.toFixed(2)}s to end of audio)`
        );
        lastSegment.end = audioEnd;
        gapsFilled++;
      }
    }

    console.log(
      `✅ Filled ${gapsFilled} gaps. Segments now have complete coverage from start to end.`
    );

    return sortedSegments;
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

      // Note: Large files will be chunked on client-side before sending
      const fileSize = file.size;
      const fileSizeMB = fileSize / (1024 * 1024);
      console.log(`📦 File chunk size: ${fileSizeMB.toFixed(2)} MB`);

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

    // Remove Bismillah from first ayah if present (not Surah 1 or 9)
    if (surahNumber !== 1 && surahNumber !== 9 && quranAyahs.length > 0) {
      const firstAyah = quranAyahs[0];
      // Only remove if it actually starts with Bismillah
      const bismillahPattern =
        /^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَ[ـٰ]نِ\s+ٱلرَّحِيمِ/;
      if (bismillahPattern.test(firstAyah.text)) {
        const words = firstAyah.text.split(" ");
        firstAyah.text = words.slice(4).join(" ");
      }
    }

    const quranTexts = quranAyahs.map((ayah) => ayah.text);
    console.log(
      `📖 Mapping ${transcription.segments?.length || 0} Whisper segments to ${
        quranTexts.length
      } ayahs`
    );
    console.log(
      `🎯 Using FULL Quran ayah text for accurate matching (critical for long ayahs!)`
    );

    // Step 3: Align transcribed text to Quran ayahs using AI (QURAN-FIRST)
    const finalSegments = await alignTextToAyahs(
      transcription,
      quranTexts,
      surahNumber
    );

    console.log(
      `✅ AI mapping complete: ${finalSegments.length} segments for ${quranTexts.length} ayahs`
    );

    console.log(
      `🎯 QURAN-FIRST AI Detection complete: ${finalSegments.length} segments (covering ${quranTexts.length} ayahs)`
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
