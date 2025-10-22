/**
 * Local Quran Data Helper
 *
 * Reads from pre-fetched JSON files in /public/quran-data/
 * No API calls needed!
 */

// Surah metadata
export interface Surah {
  id: number;
  revelation_place: string;
  revelation_order: number;
  bismillah_pre: boolean;
  name_simple: string;
  name_complex: string;
  name_arabic: string;
  verses_count: number;
  pages: number[];
  translated_name: {
    language_name: string;
    name: string;
  };
}

// Verse data
export interface Verse {
  id: number;
  verse_key: string;
  text_uthmani: string;
  // Fields from mushaf-pages.json
  verse_number?: number;
  juz_number?: number;
  hizb_number?: number;
  rub_el_hizb_number?: number;
  page_number?: number;
  words?: Word[];
  // Translation
  translations?: Array<{
    id: number;
    text: string;
    resource_name: string;
    language_name: string;
  }>;
}

// Word data (for Mushaf pages)
export interface Word {
  id: number;
  position: number;
  audio_url: string | null;
  char_type_name: string; // "word" or "end"
  text_uthmani: string;
  text: string;
  line_number: number;
  location: string;
  page_number: number;
  translation?: {
    text: string;
    language_name: string;
  };
  transliteration?: {
    text: string | null;
    language_name: string;
  };
}

// Juz data
export interface Juz {
  id: number;
  juz_number: number;
  verse_mapping: Record<string, string>;
}

/**
 * Get all surah metadata
 */
export async function getAllSurahs(): Promise<Surah[]> {
  const response = await fetch("/quran-data/surahs.json");
  return response.json();
}

/**
 * Get a specific surah by number (1-114)
 */
export async function getSurahByNumber(
  surahNumber: number
): Promise<Surah | null> {
  const surahs = await getAllSurahs();
  return surahs.find((s) => s.id === surahNumber) || null;
}

/**
 * Get all verses for a specific surah
 */
export async function getVersesBySurah(surahNumber: number): Promise<Verse[]> {
  const response = await fetch("/quran-data/verses.json");
  const allVerses: Record<string, Verse[]> = await response.json();
  return allVerses[surahNumber.toString()] || [];
}

/**
 * Get Mushaf page data (with word-level info for line-by-line rendering)
 */
export async function getMushafPage(pageNumber: number): Promise<Verse[]> {
  const response = await fetch("/quran-data/mushaf-pages.json");
  const allPages: Record<string, Verse[]> = await response.json();
  return allPages[pageNumber.toString()] || [];
}

/**
 * Get multiple Mushaf pages (for a surah that spans multiple pages)
 */
export async function getMushafPagesForSurah(
  surahNumber: number
): Promise<Verse[]> {
  const surah = await getSurahByNumber(surahNumber);
  if (!surah || !surah.pages || surah.pages.length === 0) {
    return [];
  }

  const response = await fetch("/quran-data/mushaf-pages.json");
  const allPages: Record<string, Verse[]> = await response.json();

  // Generate full range of pages (the pages array only has first and last)
  const firstPage = Math.min(...surah.pages);
  const lastPage = Math.max(...surah.pages);
  const allPageNumbers: number[] = [];
  for (let page = firstPage; page <= lastPage; page++) {
    allPageNumbers.push(page);
  }

  const allVerses: Verse[] = [];
  for (const pageNum of allPageNumbers) {
    const pageVerses = allPages[pageNum.toString()] || [];
    allVerses.push(...pageVerses);
  }

  // Filter to only include verses from this surah
  return allVerses.filter((v) => {
    if (!v.verse_key) {
      console.warn("⚠️ Skipping verse with missing verse_key:", v);
      return false;
    }
    const [chapterNum] = v.verse_key.split(":").map(Number);
    return chapterNum === surahNumber;
  });
}

/**
 * Get all Juz data
 */
export async function getAllJuzs(): Promise<Juz[]> {
  const response = await fetch("/quran-data/juzs.json");
  return response.json();
}

/**
 * Get metadata about when the data was fetched
 */
export async function getMetadata() {
  const response = await fetch("/quran-data/metadata.json");
  return response.json();
}

/**
 * Convert Arabic-Indic numerals (for ayah numbers)
 */
export function toArabicIndic(num: number): string {
  const arabicIndic = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return num
    .toString()
    .split("")
    .map((digit) => arabicIndic[parseInt(digit)])
    .join("");
}
