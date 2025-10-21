interface Ayah {
  number: number;
  text: string;
  numberInSurah: number;
}

interface SurahData {
  number: number;
  ayahs: Ayah[];
}

export async function fetchSurahText(surahNumber: number): Promise<Ayah[]> {
  try {
    const response = await fetch(
      `https://api.alquran.cloud/v1/surah/${surahNumber}`
    );

    if (!response.ok) {
      throw new Error("Failed to fetch surah text");
    }

    const data = await response.json();
    const surahData: SurahData = data.data;

    return surahData.ayahs.map((ayah) => ({
      number: ayah.number,
      text: ayah.text,
      numberInSurah: ayah.numberInSurah,
    }));
  } catch (error) {
    console.error("Error fetching surah text:", error);
    throw error;
  }
}

export function matchSegmentsToAyahs(
  segments: { start: number; end: number; text: string }[],
  ayahs: Ayah[]
): { start: number; end: number; text: string; ayahNumber: number }[] {
  // Simple 1-to-1 mapping for now
  // Assumes segments.length matches ayahs.length
  return segments.map((segment, index) => ({
    ...segment,
    text: ayahs[index]?.text || segment.text,
    ayahNumber: ayahs[index]?.numberInSurah || index + 1,
  }));
}
