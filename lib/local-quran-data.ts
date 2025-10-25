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
 * Returns all verses on page pageNumber (1-604)
 */
export async function getMushafPage(pageNumber: number): Promise<Verse[]> {
  const response = await fetch("/quran-data/mushaf-pages.json");
  const allPages: Record<string, Verse[]> = await response.json();
  return allPages[pageNumber.toString()] || [];
}

/**
 * Get page number for a specific surah's first ayah
 * Used to jump to the start of a surah in the standalone Mushaf
 */
export async function getPageForSurah(surahNumber: number): Promise<number> {
  const surah = await getSurahByNumber(surahNumber);
  if (!surah || !surah.pages || surah.pages.length === 0) {
    return 1; // Default to page 1 if surah not found
  }
  return Math.min(...surah.pages); // Return the first page of the surah
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
 * Get ALL Mushaf pages at once (1-604)
 * This loads the entire Quran for fast navigation
 * Also merges translations from verses.json
 */
export async function getAllMushafPages(): Promise<Record<string, Verse[]>> {
  const [pagesResponse, versesResponse] = await Promise.all([
    fetch("/quran-data/mushaf-pages.json"),
    fetch("/quran-data/verses.json"),
  ]);

  const allPages: Record<string, Verse[]> = await pagesResponse.json();
  const allVerses: Record<string, Verse[]> = await versesResponse.json();

  // Create a map of verse_key to translations for fast lookup
  const translationsMap = new Map<string, Verse["translations"]>();
  Object.values(allVerses).forEach((verses) => {
    verses.forEach((verse) => {
      if (verse.verse_key && verse.translations) {
        translationsMap.set(verse.verse_key, verse.translations);
      }
    });
  });

  // Merge translations into mushaf pages
  Object.keys(allPages).forEach((pageNum) => {
    allPages[pageNum] = allPages[pageNum].map((verse) => {
      if (verse.verse_key && translationsMap.has(verse.verse_key)) {
        return {
          ...verse,
          translations: translationsMap.get(verse.verse_key),
        };
      }
      return verse;
    });
  });

  return allPages;
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
