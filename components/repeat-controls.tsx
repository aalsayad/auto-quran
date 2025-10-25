"use client";

import { memo } from "react";
import { FiRepeat } from "react-icons/fi";

export type RepeatMode =
  | "off"
  | "ayah"
  | "ayah-range"
  | "surah"
  | "page"
  | "page-range"
  | "juz";

export interface RepeatConfig {
  mode: RepeatMode;
  ayahStart?: number;
  ayahEnd?: number;
  pageStart?: number;
  pageEnd?: number;
  juzNumber?: number;
}

interface RepeatControlsProps {
  repeatConfig: RepeatConfig;
  showRepeatMenu: boolean;
  totalAyahs: number;
  surahPageRange: { min: number; max: number };
  onToggleMenu: () => void;
  onSetRepeatMode: (mode: RepeatMode) => void;
  onSetAyahRange: (start: number, end: number) => void;
  onSetPageRange: (start: number, end: number) => void;
  onSetJuz: (juz: number) => void;
}

const RepeatControlsComponent = ({
  repeatConfig,
  showRepeatMenu,
  totalAyahs,
  surahPageRange,
  onToggleMenu,
  onSetRepeatMode,
  onSetAyahRange,
  onSetPageRange,
  onSetJuz,
}: RepeatControlsProps) => {
  const getRepeatLabel = () => {
    switch (repeatConfig.mode) {
      case "ayah":
        return "Repeat: Ayah";
      case "ayah-range":
        return `Repeat: Ayah ${repeatConfig.ayahStart}-${repeatConfig.ayahEnd}`;
      case "surah":
        return "Repeat: Surah";
      case "page":
        return "Repeat: Page";
      case "page-range":
        return `Repeat: Page ${repeatConfig.pageStart}-${repeatConfig.pageEnd}`;
      case "juz":
        return `Repeat: Juz ${repeatConfig.juzNumber}`;
      default:
        return "Repeat: Off";
    }
  };

  return (
    <div className="relative">
      <button
        onClick={onToggleMenu}
        className={`p-1.5 sm:p-2 rounded transition-colors ${
          repeatConfig.mode !== "off"
            ? "bg-primary text-primary-foreground"
            : "hover:bg-accent"
        }`}
        title={getRepeatLabel()}
      >
        <FiRepeat className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>

      {showRepeatMenu && (
        <div className="absolute top-full right-0 mt-1 sm:mt-2 bg-popover border rounded-lg shadow-lg p-2 sm:p-3 min-w-[180px] sm:min-w-[200px] z-50">
          <div className="space-y-1.5 sm:space-y-2">
            <button
              onClick={() => {
                onSetRepeatMode("off");
                onToggleMenu();
              }}
              className={`w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm transition-colors ${
                repeatConfig.mode === "off"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              Off
            </button>
            <button
              onClick={() => {
                onSetRepeatMode("ayah");
                onToggleMenu();
              }}
              className={`w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm transition-colors ${
                repeatConfig.mode === "ayah"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              Current Ayah
            </button>
            <button
              onClick={() => {
                onSetRepeatMode("surah");
                onToggleMenu();
              }}
              className={`w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm transition-colors ${
                repeatConfig.mode === "surah"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              Entire Surah
            </button>
            <button
              onClick={() => {
                onSetRepeatMode("page");
                onToggleMenu();
              }}
              className={`w-full text-left px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm transition-colors ${
                repeatConfig.mode === "page"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              Current Page
            </button>

            {/* Ayah Range */}
            <div className="border-t pt-1.5 sm:pt-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
                Ayah Range:
              </p>
              <div className="flex gap-1 sm:gap-1.5">
                <input
                  type="number"
                  min="1"
                  max={totalAyahs}
                  defaultValue={repeatConfig.ayahStart || 1}
                  placeholder="From"
                  className="w-full px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs bg-background border rounded"
                  onChange={(e) => {
                    const start = parseInt(e.target.value) || 1;
                    const end = repeatConfig.ayahEnd || totalAyahs;
                    onSetAyahRange(start, end);
                  }}
                />
                <input
                  type="number"
                  min="1"
                  max={totalAyahs}
                  defaultValue={repeatConfig.ayahEnd || totalAyahs}
                  placeholder="To"
                  className="w-full px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs bg-background border rounded"
                  onChange={(e) => {
                    const end = parseInt(e.target.value) || totalAyahs;
                    const start = repeatConfig.ayahStart || 1;
                    onSetAyahRange(start, end);
                  }}
                />
              </div>
            </div>

            {/* Page Range */}
            <div className="border-t pt-1.5 sm:pt-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
                Page Range:
              </p>
              <div className="flex gap-1 sm:gap-1.5">
                <input
                  type="number"
                  min={surahPageRange.min}
                  max={surahPageRange.max}
                  defaultValue={repeatConfig.pageStart || surahPageRange.min}
                  placeholder="From"
                  className="w-full px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs bg-background border rounded"
                  onChange={(e) => {
                    const start =
                      parseInt(e.target.value) || surahPageRange.min;
                    const end = repeatConfig.pageEnd || surahPageRange.max;
                    onSetPageRange(start, end);
                  }}
                />
                <input
                  type="number"
                  min={surahPageRange.min}
                  max={surahPageRange.max}
                  defaultValue={repeatConfig.pageEnd || surahPageRange.max}
                  placeholder="To"
                  className="w-full px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs bg-background border rounded"
                  onChange={(e) => {
                    const end = parseInt(e.target.value) || surahPageRange.max;
                    const start = repeatConfig.pageStart || surahPageRange.min;
                    onSetPageRange(start, end);
                  }}
                />
              </div>
            </div>

            {/* Juz */}
            <div className="border-t pt-1.5 sm:pt-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">
                Juz Number:
              </p>
              <input
                type="number"
                min="1"
                max="30"
                defaultValue={repeatConfig.juzNumber || 1}
                placeholder="Juz"
                className="w-full px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs bg-background border rounded"
                onChange={(e) => {
                  const juz = parseInt(e.target.value) || 1;
                  onSetJuz(juz);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const RepeatControls = memo(RepeatControlsComponent);
