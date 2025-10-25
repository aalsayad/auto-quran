"use client";

import { memo, useCallback } from "react";
import { FiBookmark } from "react-icons/fi";

interface Verse {
  verse_key: string;
  text_uthmani: string;
  page_number?: number;
  translation?: string;
}

interface MushafPageViewProps {
  verses: Verse[];
  currentPage: number;
  currentAyahNumbers: number[];
  bookmarkedAyahs: number[];
  showTranslation: boolean;
  onAyahClick: (ayahNumber: number) => void;
  onBookmarkToggle: (ayahNumber: number) => void;
  ayahRefs: React.MutableRefObject<(HTMLDivElement | HTMLSpanElement | null)[]>;
}

const MushafPageViewComponent = ({
  verses,
  currentPage,
  currentAyahNumbers,
  bookmarkedAyahs,
  showTranslation,
  onAyahClick,
  onBookmarkToggle,
  ayahRefs,
}: MushafPageViewProps) => {
  const toArabicNumerals = useCallback((num: number): string => {
    if (num === undefined || num === null || isNaN(num)) {
      return "";
    }
    const arabicNumerals = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return num
      .toString()
      .split("")
      .map((digit) => arabicNumerals[parseInt(digit)])
      .join("");
  }, []);

  const getVerseMarker = useCallback(
    (num: number): string => {
      return `۝${toArabicNumerals(num)}`;
    },
    [toArabicNumerals]
  );

  const cleanTranslation = useCallback((text: string): string => {
    return text.replace(/<sup[^>]*>.*?<\/sup>/g, "");
  }, []);

  const currentPageVerses = verses.filter((v) => v.page_number === currentPage);

  // Find first ayah index for ref mapping
  const getAyahIndex = (verseKey: string) => {
    const ayahNum = parseInt(verseKey.split(":")[1]);
    return verses.findIndex(
      (v) => parseInt(v.verse_key.split(":")[1]) === ayahNum
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      <div className="bg-card border rounded-lg p-4 sm:p-6 md:p-8 shadow-sm">
        <div
          className="text-right space-y-2 sm:space-y-3 text-2xl sm:text-3xl md:text-4xl leading-loose"
          dir="rtl"
          lang="ar"
        >
          {currentPageVerses.map((verse) => {
            const ayahNum = parseInt(verse.verse_key.split(":")[1]);
            const ayahIndex = getAyahIndex(verse.verse_key);
            const isActive = currentAyahNumbers.includes(ayahNum);
            const isBookmarked = bookmarkedAyahs.includes(ayahNum);

            return (
              <span key={verse.verse_key} className="inline">
                <span
                  ref={(el) => {
                    if (ayahIndex >= 0) {
                      ayahRefs.current[ayahIndex] = el;
                    }
                  }}
                  onClick={() => onAyahClick(ayahNum)}
                  className={`cursor-pointer transition-colors inline ${
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "hover:bg-accent/50"
                  }`}
                >
                  {verse.text_uthmani}
                </span>{" "}
                <span className="relative inline-block group">
                  <span className="text-lg sm:text-xl md:text-2xl text-muted-foreground">
                    {getVerseMarker(ayahNum)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onBookmarkToggle(ayahNum);
                    }}
                    className={`absolute -top-1 -right-1 p-0.5 sm:p-1 rounded-full transition-all opacity-0 group-hover:opacity-100 ${
                      isBookmarked
                        ? "text-primary opacity-100"
                        : "text-muted-foreground hover:text-primary bg-background"
                    }`}
                    title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                  >
                    <FiBookmark
                      className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${
                        isBookmarked ? "fill-current" : ""
                      }`}
                    />
                  </button>
                </span>{" "}
                {showTranslation && verse.translation && (
                  <span className="block text-xs sm:text-sm md:text-base text-muted-foreground mt-1 sm:mt-1.5 mb-2 sm:mb-3 text-left">
                    {cleanTranslation(verse.translation)}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const MushafPageView = memo(MushafPageViewComponent);
