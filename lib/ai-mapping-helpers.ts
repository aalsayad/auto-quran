/**
 * Helper functions for AI-powered Quran ayah mapping
 * Breaks down complex GPT-5 mapping logic into focused, reusable functions
 */

import type { WhisperSegment, AyahMapping, FinalSegment } from "./types";

/**
 * Builds the GPT-5 prompt for mapping Whisper segments to Quran ayahs
 */
export function buildMappingPrompt(
  quranText: string[],
  whisperSegments: WhisperSegment[],
  isFatiha: boolean
): string {
  const startIndex = isFatiha ? 0 : 1;
  const maxIndex = whisperSegments.length - 1;

  const whisperTexts = whisperSegments
    .slice(startIndex, maxIndex + 1)
    .map((seg, i) => `[${i + startIndex}] "${seg.text.trim()}"`)
    .join("\n");

  const quranTexts = quranText
    .map((text, i) => `Ayah ${i + 1}: "${text.trim()}"`)
    .join("\n");

  return `🎯 YOUR MISSION: For EACH of the ${
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
}

/**
 * Builds system instructions for GPT-5
 */
export function buildSystemInstructions(): string {
  return `You are a Quran expert analyzing audio transcriptions. You MUST match Arabic text content, NOT distribute segments proportionally.

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
}

/**
 * Validates AI mapping response
 */
export function validateAIMapping(
  ayahs: AyahMapping[] | undefined,
  expectedCount: number
): { valid: boolean; error?: string } {
  if (!ayahs) {
    return { valid: false, error: "AI did not return ayahs array" };
  }

  if (ayahs.length !== expectedCount) {
    return {
      valid: false,
      error: `AI returned ${ayahs.length} ayahs, expected ${expectedCount}`,
    };
  }

  // Check all ayahs 1-N are present
  const returnedAyahNumbers = new Set(ayahs.map((a) => a.ayahNumber));
  const missing: number[] = [];
  for (let i = 1; i <= expectedCount; i++) {
    if (!returnedAyahNumbers.has(i)) missing.push(i);
  }

  if (missing.length > 0) {
    return {
      valid: false,
      error: `AI mapping incomplete: missing ayahs ${missing.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Converts ayah-centric mapping to segment-centric format
 */
export function convertToSegments(
  ayahMappings: AyahMapping[],
  whisperSegments: WhisperSegment[],
  quranText: string[]
): FinalSegment[] {
  // Build map of segmentIndex → ayahNumbers[]
  const segmentToAyahsMap = new Map<number, number[]>();

  for (const { ayahNumber, segmentIndices } of ayahMappings) {
    for (const segIdx of segmentIndices) {
      // Validate segment index
      if (segIdx < 0 || segIdx >= whisperSegments.length) {
        console.warn(
          `⚠️ Ayah ${ayahNumber} references invalid segment ${segIdx}, skipping`
        );
        continue;
      }

      if (!segmentToAyahsMap.has(segIdx)) {
        segmentToAyahsMap.set(segIdx, []);
      }
      segmentToAyahsMap.get(segIdx)!.push(ayahNumber);
    }
  }

  // Build final segments by merging consecutive segments with same ayah(s)
  return mergeConsecutiveSegments(
    segmentToAyahsMap,
    whisperSegments,
    quranText
  );
}

/**
 * Merges consecutive Whisper segments that belong to the same ayah(s)
 */
function mergeConsecutiveSegments(
  segmentToAyahsMap: Map<number, number[]>,
  whisperSegments: WhisperSegment[],
  quranText: string[]
): FinalSegment[] {
  const sortedIndices = Array.from(segmentToAyahsMap.keys()).sort(
    (a, b) => a - b
  );
  const segments: FinalSegment[] = [];

  let i = 0;
  while (i < sortedIndices.length) {
    const currentIdx = sortedIndices[i];
    const currentAyahs = segmentToAyahsMap
      .get(currentIdx)!
      .sort((a, b) => a - b);

    // Find consecutive segments with same ayahs
    let endIdx = currentIdx;
    let j = i + 1;

    while (j < sortedIndices.length) {
      const nextIdx = sortedIndices[j];
      const nextAyahs = segmentToAyahsMap.get(nextIdx)!.sort((a, b) => a - b);

      const isConsecutive = nextIdx === endIdx + 1;
      const hasSameAyahs =
        currentAyahs.length === nextAyahs.length &&
        currentAyahs.every((ayah, idx) => ayah === nextAyahs[idx]);

      if (isConsecutive && hasSameAyahs) {
        endIdx = nextIdx;
        j++;
      } else {
        break;
      }
    }

    // Create merged segment
    const startWhisper = whisperSegments[currentIdx];
    const endWhisper = whisperSegments[endIdx];
    const text = currentAyahs
      .map((num) => quranText[num - 1])
      .filter(Boolean)
      .join(" ");

    segments.push({
      start: startWhisper.start,
      end: endWhisper.end,
      text: text || `Ayah ${currentAyahs.join(", ")}`,
      ayahNumbers: currentAyahs.length > 1 ? currentAyahs : undefined,
      ayahNumber: currentAyahs.length === 1 ? currentAyahs[0] : undefined,
      confidence: 0.9,
    });

    i = j;
  }

  return segments;
}

/**
 * Fills gaps between segments and extends to audio boundaries
 */
export function fillSegmentGaps(
  segments: FinalSegment[],
  audioEnd: number
): FinalSegment[] {
  if (segments.length === 0) return segments;

  const sorted = segments.sort((a, b) => a.start - b.start);

  // Fill gaps between segments
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    if (current.end < next.start) {
      current.end = next.start; // Extend to fill gap
    } else if (current.end > next.start) {
      current.end = next.start; // Fix overlap
    }
  }

  // Extend last segment to audio end
  const last = sorted[sorted.length - 1];
  if (last.end < audioEnd) {
    last.end = audioEnd;
  }

  return sorted;
}

/**
 * Removes Bismillah from first ayah text if present (excluding Surah 1 & 9)
 */
export function removeBismillahIfPresent(
  text: string,
  surahNumber: number,
  ayahNumber: number
): string {
  if (ayahNumber !== 1 || surahNumber === 1 || surahNumber === 9) {
    return text;
  }

  const bismillahPattern =
    /^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَ[ـٰ]نِ\s+ٱلرَّحِيمِ\s*/;

  if (bismillahPattern.test(text)) {
    const words = text.split(" ");
    return words.slice(4).join(" ");
  }

  return text;
}
