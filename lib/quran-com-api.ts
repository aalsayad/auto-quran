// Quran.com API v4 Integration for Authentic Mushaf Display
// Documentation: https://api-docs.quran.com/
// NOTE: API calls go through Next.js API routes to avoid CORS issues

interface QuranWord {
  id: number;
  position: number;
  text_uthmani: string;
  line_number: number;
  page_number: number;
  code_v1?: string; // Special code that may include verse markers
  verse_key?: string; // e.g., "1:1"
  char_type_name?: string; // Type of character: "word", "end", etc.
}

interface QuranVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  page_number: number;
  juz_number: number;
  hizb_number: number;
  chapter_id: number;
  words: QuranWord[];
}

interface QuranPageResponse {
  verses: QuranVerse[];
  pagination: {
    per_page: number;
    current_page: number;
    next_page: number | null;
    total_pages: number;
    total_records: number;
  };
}

export interface MushafLine {
  lineNumber: number;
  words: Array<{
    text: string;
    verseNumber: number;
    isVerseEnd: boolean;
  }>;
}

export interface MushafPage {
  pageNumber: number;
  lines: MushafLine[];
  verses: Array<{
    verseNumber: number;
    verseKey: string;
    chapterId: number;
  }>;
}

// Fetch verses for a specific Mushaf page (via Next.js API route to avoid CORS)
// NOTE: Authentication happens server-side in /api/quran/verses-by-page to avoid CORS issues
export async function fetchVersesByPage(
  pageNumber: number
): Promise<QuranPageResponse> {
  console.log(`📖 Fetching Mushaf page ${pageNumber}...`);

  try {
    const response = await fetch(
      `/api/quran/verses-by-page?page=${pageNumber}`
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Failed to fetch page ${pageNumber}: ${
          errorData.error || response.statusText
        }`
      );
    }

    const data = await response.json();
    console.log(
      `✅ Page ${pageNumber} fetched successfully (${
        data.verses?.length || 0
      } verses)`
    );
    return data;
  } catch (error) {
    console.error(`❌ Error fetching page ${pageNumber}:`, error);
    throw error;
  }
}

// Process page data into lines (as they appear in Mushaf)
export function processPageIntoLines(pageData: QuranPageResponse): MushafPage {
  const linesMap = new Map<number, MushafLine>();
  const verses = new Set<string>();

  pageData.verses.forEach((verse) => {
    verses.add(`${verse.chapter_id}:${verse.verse_number}`);

    // Filter out non-word items (like verse end markers that API might include)
    const actualWords = verse.words.filter(
      (w) => !w.char_type_name || w.char_type_name === "word"
    );

    actualWords.forEach((word, wordIndex) => {
      const lineNumber = word.line_number;
      const isLastWordInVerse = wordIndex === actualWords.length - 1;

      if (!linesMap.has(lineNumber)) {
        linesMap.set(lineNumber, {
          lineNumber,
          words: [],
        });
      }

      const line = linesMap.get(lineNumber)!;
      line.words.push({
        text: word.text_uthmani,
        verseNumber: verse.verse_number,
        isVerseEnd: isLastWordInVerse,
      });
    });
  });

  // Sort lines by line number
  const sortedLines = Array.from(linesMap.values()).sort(
    (a, b) => a.lineNumber - b.lineNumber
  );

  return {
    pageNumber: pageData.verses[0]?.page_number || 0,
    lines: sortedLines,
    verses: pageData.verses.map((v) => ({
      verseNumber: v.verse_number,
      verseKey: v.verse_key,
      chapterId: v.chapter_id,
    })),
  };
}

// Get page range for a surah (Madani Mushaf - 604 pages)
export function getSurahPageRange(surahNumber: number): {
  start: number;
  end: number;
} {
  const surahPages: Record<number, { start: number; end: number }> = {
    1: { start: 1, end: 1 },
    2: { start: 2, end: 49 },
    3: { start: 50, end: 76 },
    4: { start: 77, end: 106 },
    5: { start: 106, end: 127 },
    6: { start: 128, end: 151 },
    7: { start: 151, end: 176 },
    8: { start: 177, end: 186 },
    9: { start: 187, end: 207 },
    10: { start: 208, end: 221 },
    11: { start: 221, end: 235 },
    12: { start: 235, end: 248 },
    13: { start: 249, end: 255 },
    14: { start: 255, end: 261 },
    15: { start: 262, end: 267 },
    16: { start: 267, end: 281 },
    17: { start: 282, end: 293 },
    18: { start: 293, end: 304 },
    19: { start: 305, end: 311 },
    20: { start: 312, end: 321 },
    21: { start: 322, end: 331 },
    22: { start: 332, end: 341 },
    23: { start: 342, end: 349 },
    24: { start: 350, end: 359 },
    25: { start: 359, end: 366 },
    26: { start: 367, end: 376 },
    27: { start: 377, end: 385 },
    28: { start: 385, end: 396 },
    29: { start: 396, end: 404 },
    30: { start: 404, end: 410 },
    31: { start: 411, end: 414 },
    32: { start: 415, end: 417 },
    33: { start: 418, end: 427 },
    34: { start: 428, end: 433 },
    35: { start: 434, end: 439 },
    36: { start: 440, end: 445 },
    37: { start: 446, end: 451 },
    38: { start: 451, end: 457 },
    39: { start: 458, end: 466 },
    40: { start: 467, end: 476 },
    41: { start: 477, end: 482 },
    42: { start: 483, end: 489 },
    43: { start: 489, end: 495 },
    44: { start: 495, end: 498 },
    45: { start: 499, end: 502 },
    46: { start: 502, end: 506 },
    47: { start: 507, end: 510 },
    48: { start: 511, end: 515 },
    49: { start: 515, end: 517 },
    50: { start: 518, end: 520 },
    51: { start: 520, end: 523 },
    52: { start: 523, end: 525 },
    53: { start: 526, end: 528 },
    54: { start: 528, end: 531 },
    55: { start: 531, end: 534 },
    56: { start: 534, end: 537 },
    57: { start: 537, end: 541 },
    58: { start: 542, end: 545 },
    59: { start: 545, end: 548 },
    60: { start: 549, end: 551 },
    61: { start: 551, end: 553 },
    62: { start: 553, end: 554 },
    63: { start: 554, end: 556 },
    64: { start: 556, end: 558 },
    65: { start: 558, end: 560 },
    66: { start: 560, end: 562 },
    67: { start: 562, end: 564 },
    68: { start: 564, end: 566 },
    69: { start: 566, end: 568 },
    70: { start: 568, end: 569 },
    71: { start: 570, end: 571 },
    72: { start: 572, end: 573 },
    73: { start: 574, end: 575 },
    74: { start: 575, end: 577 },
    75: { start: 577, end: 578 },
    76: { start: 578, end: 580 },
    77: { start: 580, end: 581 },
    78: { start: 582, end: 583 },
    79: { start: 583, end: 584 },
    80: { start: 585, end: 586 },
    81: { start: 586, end: 586 },
    82: { start: 587, end: 587 },
    83: { start: 587, end: 588 },
    84: { start: 589, end: 589 },
    85: { start: 590, end: 590 },
    86: { start: 591, end: 591 },
    87: { start: 591, end: 592 },
    88: { start: 592, end: 592 },
    89: { start: 593, end: 594 },
    90: { start: 594, end: 595 },
    91: { start: 595, end: 595 },
    92: { start: 595, end: 596 },
    93: { start: 596, end: 596 },
    94: { start: 596, end: 596 },
    95: { start: 597, end: 597 },
    96: { start: 597, end: 598 },
    97: { start: 598, end: 598 },
    98: { start: 598, end: 599 },
    99: { start: 599, end: 599 },
    100: { start: 599, end: 600 },
    101: { start: 600, end: 600 },
    102: { start: 600, end: 600 },
    103: { start: 601, end: 601 },
    104: { start: 601, end: 601 },
    105: { start: 601, end: 602 },
    106: { start: 602, end: 602 },
    107: { start: 602, end: 602 },
    108: { start: 602, end: 602 },
    109: { start: 603, end: 603 },
    110: { start: 603, end: 603 },
    111: { start: 603, end: 603 },
    112: { start: 604, end: 604 },
    113: { start: 604, end: 604 },
    114: { start: 604, end: 604 },
  };

  return surahPages[surahNumber] || { start: 1, end: 604 };
}
