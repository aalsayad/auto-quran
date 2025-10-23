/**
 * ONE-TIME SCRIPT: Fetch ALL Quran data from Quran.com API
 *
 * This script downloads:
 * - All 114 surahs metadata (names, revelation place, ayah counts)
 * - All 604 Mushaf pages with word-by-word data
 * - All verses with Uthmani text
 *
 * Run once: npx tsx scripts/fetch-quran-data.ts
 */

import * as fs from "fs";
import * as path from "path";

const API_BASE = "https://api.quran.com/api/v4";

async function fetchData(url: string) {
  console.log(`  Fetching: ${url}`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchAllSurahs() {
  console.log("\n📖 Fetching all surahs metadata...");
  const data = await fetchData(`${API_BASE}/chapters`);
  console.log(`✅ Got ${data.chapters.length} surahs`);
  return data.chapters;
}

async function fetchAllVerses() {
  console.log(
    "\n📜 Fetching all verses with English translation (1-114 surahs)..."
  );
  const allVerses: Record<number, unknown[]> = {};

  for (let surahNum = 1; surahNum <= 114; surahNum++) {
    console.log(`  Fetching Surah ${surahNum}...`);

    // Fetch Arabic text
    const arabicData = await fetchData(
      `${API_BASE}/quran/verses/uthmani?chapter_number=${surahNum}`
    );

    // Fetch translation (ID 20 = Saheeh International)
    const translationData = await fetchData(
      `${API_BASE}/quran/translations/20?chapter_number=${surahNum}`
    );

    // Merge translations into verses
    const verses = arabicData.verses.map(
      (verse: Record<string, unknown>, index: number) => ({
        ...verse,
        translations: translationData.translations[index]
          ? [translationData.translations[index]]
          : [],
      })
    );

    allVerses[surahNum] = verses;
    await delay(300); // Rate limiting (2 requests per surah)
  }

  console.log(`✅ Got all verses with translations for 114 surahs`);
  return allVerses;
}

async function fetchAllMushafPages() {
  console.log("\n📄 Fetching all 604 Mushaf pages with word-by-word data...");
  const allPages: Record<number, unknown> = {};

  for (let pageNum = 1; pageNum <= 604; pageNum++) {
    if (pageNum % 50 === 0) {
      console.log(`  Progress: ${pageNum}/604 pages...`);
    }

    // Use the correct endpoint that includes word-level data with line numbers!
    const data = await fetchData(
      `${API_BASE}/verses/by_page/${pageNum}?words=true&fields=text_uthmani&word_fields=text_uthmani,line_number,page_number,location`
    );

    allPages[pageNum] = data.verses;
    await delay(200); // Rate limiting
  }

  console.log(`✅ Got all 604 Mushaf pages with word-level data!`);
  return allPages;
}

async function fetchJuzData() {
  console.log("\n📚 Fetching Juz (parts) data...");
  const data = await fetchData(`${API_BASE}/juzs`);
  console.log(`✅ Got ${data.juzs.length} Juz data`);
  return data.juzs;
}

async function main() {
  console.log("🚀 Starting Quran data download...\n");

  // Create output directory
  const outputDir = path.join(process.cwd(), "public", "quran-data");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Fetch all data (Quran.com API is public, no auth needed!)
  const surahs = await fetchAllSurahs();
  const verses = await fetchAllVerses();
  const mushafPages = await fetchAllMushafPages();
  const juzs = await fetchJuzData();

  // Save to JSON files
  console.log("\n💾 Saving data to local files...");

  fs.writeFileSync(
    path.join(outputDir, "surahs.json"),
    JSON.stringify(surahs, null, 2)
  );
  console.log("  ✅ surahs.json");

  fs.writeFileSync(
    path.join(outputDir, "verses.json"),
    JSON.stringify(verses, null, 2)
  );
  console.log("  ✅ verses.json");

  fs.writeFileSync(
    path.join(outputDir, "mushaf-pages.json"),
    JSON.stringify(mushafPages, null, 2)
  );
  console.log("  ✅ mushaf-pages.json");

  fs.writeFileSync(
    path.join(outputDir, "juzs.json"),
    JSON.stringify(juzs, null, 2)
  );
  console.log("  ✅ juzs.json");

  // Create metadata file
  const metadata = {
    fetchedAt: new Date().toISOString(),
    totalSurahs: surahs.length,
    totalPages: Object.keys(mushafPages).length,
    totalJuzs: juzs.length,
    source: "Quran.com API v4",
  };

  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );
  console.log("  ✅ metadata.json");

  console.log("\n🎉 SUCCESS! All Quran data downloaded and saved locally!");
  console.log(`📁 Location: ${outputDir}`);
  console.log("\nYou can now serve this data without any API calls! 🚀");
}

main().catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
