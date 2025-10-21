import { SURAHS } from "./surah-data";

/**
 * Attempts to detect the surah number from a filename
 * Looks for patterns like:
 * - 001.mp3
 * - 1.mp3
 * - surah-001.mp3
 * - Al-Fatihah.mp3
 * - Surah 1.mp3
 */
export function detectSurahFromFilename(filename: string): number | null {
  // Remove .mp3 extension and convert to lowercase for easier matching
  const cleanName = filename.replace(/\.mp3$/i, "").toLowerCase();

  // Pattern 1: Look for 3-digit numbers (001-114)
  const threeDigitMatch = cleanName.match(/\b(0\d{2}|1[01]\d|114)\b/);
  if (threeDigitMatch) {
    const num = parseInt(threeDigitMatch[1], 10);
    if (num >= 1 && num <= 114) {
      return num;
    }
  }

  // Pattern 2: Look for surah followed by number (surah 1, surah1, etc.)
  const surahNumberMatch = cleanName.match(/surah[_\s-]*(\d{1,3})/);
  if (surahNumberMatch) {
    const num = parseInt(surahNumberMatch[1], 10);
    if (num >= 1 && num <= 114) {
      return num;
    }
  }

  // Pattern 3: Look for standalone numbers between 1-114
  const standaloneMatch = cleanName.match(/\b(\d{1,3})\b/);
  if (standaloneMatch) {
    const num = parseInt(standaloneMatch[1], 10);
    if (num >= 1 && num <= 114) {
      return num;
    }
  }

  // Pattern 4: Match by surah name (transliteration)
  for (const surah of SURAHS) {
    const translitLower = surah.transliteration.toLowerCase();
    const nameLower = surah.name.toLowerCase();

    // Remove spaces and hyphens for matching
    const cleanTranslit = translitLower.replace(/[\s-]/g, "");
    const cleanFileName = cleanName.replace(/[\s-_]/g, "");

    if (
      cleanFileName.includes(cleanTranslit) ||
      cleanFileName.includes(translitLower) ||
      cleanFileName.includes(nameLower)
    ) {
      return surah.number;
    }
  }

  // Could not detect
  return null;
}
