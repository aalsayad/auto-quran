"use client";

import { memo, useCallback } from "react";
import { FiBookmark } from "react-icons/fi";

interface Ayah {
  numberInSurah: number;
  text: string;
  translation?: string;
}

interface AyahListViewProps {
  ayahs: Ayah[];
  currentAyahNumbers: number[];
  bookmarkedAyahs: number[];
  showTranslation: boolean;
  onAyahClick: (ayahNumber: number) => void;
  onBookmarkToggle: (ayahNumber: number) => void;
  ayahRefs: React.MutableRefObject<(HTMLDivElement | HTMLSpanElement | null)[]>;
}

const AyahListViewComponent = ({
  ayahs,
  currentAyahNumbers,
  bookmarkedAyahs,
  showTranslation,
  onAyahClick,
  onBookmarkToggle,
  ayahRefs,
}: AyahListViewProps) => {
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

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
      {ayahs.map((ayah, idx) => (
        <div
          key={ayah.numberInSurah}
          ref={(el) => {
            if (el) ayahRefs.current[idx] = el;
          }}
          onClick={() => onAyahClick(ayah.numberInSurah)}
          className={`p-3 sm:p-4 md:p-6 rounded-lg border transition-all cursor-pointer group ${
            currentAyahNumbers.includes(ayah.numberInSurah)
              ? "bg-primary/10 border-primary shadow-md"
              : "bg-card hover:bg-accent/50 border-border"
          }`}
        >
          <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2 sm:mb-3">
            <span className="text-xs sm:text-sm font-medium text-primary">
              Ayah {ayah.numberInSurah}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBookmarkToggle(ayah.numberInSurah);
              }}
              className={`p-1 sm:p-1.5 rounded transition-colors ${
                bookmarkedAyahs.includes(ayah.numberInSurah)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary"
              }`}
              title={
                bookmarkedAyahs.includes(ayah.numberInSurah)
                  ? "Remove bookmark"
                  : "Add bookmark"
              }
            >
              <FiBookmark
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                  bookmarkedAyahs.includes(ayah.numberInSurah)
                    ? "fill-current"
                    : ""
                }`}
              />
            </button>
          </div>

          <p
            className="text-right text-xl sm:text-2xl md:text-3xl leading-loose mb-2 sm:mb-3"
            dir="rtl"
            lang="ar"
          >
            {ayah.text}{" "}
            <span className="text-base sm:text-lg md:text-xl text-muted-foreground">
              {getVerseMarker(ayah.numberInSurah)}
            </span>
          </p>

          {showTranslation && ayah.translation && (
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed pt-2 sm:pt-3 border-t">
              {cleanTranslation(ayah.translation)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export const AyahListView = memo(AyahListViewComponent);
