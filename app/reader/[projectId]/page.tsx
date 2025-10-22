"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getProject, type SavedProject } from "@/lib/library-storage";
import { SURAHS } from "@/lib/surah-data";
import { Amiri } from "next/font/google";
import {
  FiEdit,
  FiPlay,
  FiPause,
  FiInfo,
  FiArrowLeft,
  FiSkipBack,
  FiSkipForward,
  FiRepeat,
  FiRotateCw,
  FiList,
  FiBook,
} from "react-icons/fi";
import {
  getVersesBySurah,
  getMushafPagesForSurah,
  type Verse,
} from "@/lib/local-quran-data";

const amiri = Amiri({ subsets: ["arabic"], weight: ["400", "700"] });

interface Ayah {
  number: number;
  text: string;
  numberInSurah: number;
}

export default function QuranReaderPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<SavedProject | null>(null);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [mushafVerses, setMushafVerses] = useState<Verse[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "mushaf">("list");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentAyahNumbers, setCurrentAyahNumbers] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFetchingAudio, setIsFetchingAudio] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isLoopingAyah, setIsLoopingAyah] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const ayahRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Convert to Arabic-Indic numerals
  const toArabicNumerals = (num: number): string => {
    if (num === undefined || num === null || isNaN(num)) {
      return "";
    }
    const arabicNumerals = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return num
      .toString()
      .split("")
      .map((digit) => arabicNumerals[parseInt(digit)])
      .join("");
  };

  // Get decorative Quranic verse marker
  const getVerseMarker = (num: number): string => {
    return `۝${toArabicNumerals(num)}`;
  };

  // Load audio from S3
  const loadAudioFromS3 = useCallback(async (url: string, fileName: string) => {
    try {
      setIsFetchingAudio(true);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch audio from S3");
      }

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: "audio/mpeg" });

      setAudioFile(file);
      if (audioRef.current) {
        audioRef.current.src = URL.createObjectURL(file);
      }
      return file;
    } catch (error) {
      console.error("❌ [Reader] Failed to load audio from S3:", error);
      alert("Failed to load audio from cloud storage.");
      return null;
    } finally {
      setIsFetchingAudio(false);
    }
  }, []);

  // Load project
  useEffect(() => {
    const loadedProject = getProject(projectId);
    if (loadedProject) {
      setProject(loadedProject);

      // Auto-load audio from S3 if available
      if (loadedProject.audioUrl) {
        loadAudioFromS3(loadedProject.audioUrl, loadedProject.fileName);
      }

      // Fetch Quran text from LOCAL data (no API calls!)
      const surahNumber = loadedProject.surahNumber;

      // Load for List View
      getVersesBySurah(surahNumber).then((verses) => {
        const formattedAyahs: Ayah[] = verses.map((v) => {
          // Extract verse number from verse_key (e.g., "1:5" -> 5)
          const verseNumber = parseInt(v.verse_key.split(":")[1]);
          let text = v.text_uthmani;

          // Remove Bismillah from first ayah if not Surah 1 or 9
          if (verseNumber === 1 && surahNumber !== 1 && surahNumber !== 9) {
            const words = text.split(" ");
            if (words.length > 4) {
              text = words.slice(4).join(" ");
            }
          }

          return {
            number: v.id,
            text,
            numberInSurah: verseNumber,
          };
        });
        setAyahs(formattedAyahs);
      });

      // Load for Mushaf View
      getMushafPagesForSurah(surahNumber)
        .then((verses) => {
          console.log(`📖 Loaded ${verses.length} verses for Mushaf view`);
          if (verses.length > 0) {
            console.log("Sample verse:", verses[0]);
          }
          setMushafVerses(verses);
        })
        .catch((error) => {
          console.error("❌ Failed to load Mushaf verses:", error);
          setMushafVerses([]);
        });
    }
  }, [projectId, loadAudioFromS3]);

  // Audio event handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);

      // Find current ayah based on project segments
      if (project?.segments) {
        const currentSegment = project.segments.find(
          (seg) => time >= seg.start && time < seg.end
        );

        if (currentSegment) {
          // Handle both old format (ayahNumber) and new format (ayahNumbers)
          let ayahNums: number[] = [];

          if (
            currentSegment.ayahNumbers &&
            currentSegment.ayahNumbers.length > 0
          ) {
            ayahNums = currentSegment.ayahNumbers;
          } else if (currentSegment.ayahNumber !== undefined) {
            ayahNums = [currentSegment.ayahNumber];
          }

          if (ayahNums.length > 0) {
            setCurrentAyahNumbers(ayahNums);

            // Auto-scroll to active ayah
            const firstAyahNum = ayahNums[0];
            const ayahIndex = ayahs.findIndex(
              (a) => a.numberInSurah === firstAyahNum
            );
            if (ayahIndex >= 0 && ayahRefs.current[ayahIndex]) {
              ayahRefs.current[ayahIndex]?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
            }

            // Ayah looping logic
            if (isLoopingAyah && currentSegment) {
              const timeUntilEnd = currentSegment.end - time;
              if (timeUntilEnd < 0.15) {
                audioRef.current.currentTime = currentSegment.start;
                if (audioRef.current.paused) {
                  audioRef.current.play();
                }
              }
            }
          } else {
            setCurrentAyahNumbers([]);
          }
        } else {
          setCurrentAyahNumbers([]);
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handlePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleEnded = () => {
    if (isLoopingAyah && project?.segments && currentAyahNumbers.length > 0) {
      const currentSegment = project.segments.find(
        (seg) =>
          seg.ayahNumbers?.some((num) => currentAyahNumbers.includes(num)) ||
          (seg.ayahNumber !== undefined &&
            currentAyahNumbers.includes(seg.ayahNumber))
      );
      if (currentSegment && audioRef.current) {
        audioRef.current.currentTime = currentSegment.start;
        audioRef.current.play();
      }
    } else {
      setIsPlaying(false);
    }
  };

  const handleToggleLoop = () => {
    setIsLooping(!isLooping);
  };

  const handleToggleLoopAyah = () => {
    setIsLoopingAyah(!isLoopingAyah);
  };

  const handleNextAyah = () => {
    if (!project?.segments || currentAyahNumbers.length === 0) return;

    const currentIndex = project.segments.findIndex(
      (seg) =>
        seg.ayahNumbers?.some((num) => currentAyahNumbers.includes(num)) ||
        (seg.ayahNumber !== undefined &&
          currentAyahNumbers.includes(seg.ayahNumber))
    );

    if (currentIndex < project.segments.length - 1 && audioRef.current) {
      const nextSegment = project.segments[currentIndex + 1];
      audioRef.current.currentTime = nextSegment.start;
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handlePrevAyah = () => {
    if (!project?.segments || currentAyahNumbers.length === 0) return;

    const currentIndex = project.segments.findIndex(
      (seg) =>
        seg.ayahNumbers?.some((num) => currentAyahNumbers.includes(num)) ||
        (seg.ayahNumber !== undefined &&
          currentAyahNumbers.includes(seg.ayahNumber))
    );

    if (currentIndex > 0 && audioRef.current) {
      const prevSegment = project.segments[currentIndex - 1];
      audioRef.current.currentTime = prevSegment.start;
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const handleAyahClick = (ayahNumber: number) => {
    if (!project?.segments || !audioRef.current) return;

    const segment = project.segments.find(
      (seg) =>
        seg.ayahNumbers?.includes(ayahNumber) || seg.ayahNumber === ayahNumber
    );

    if (segment) {
      audioRef.current.currentTime = segment.start;
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // Spacebar play/pause
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === "Space" && audioRef.current) {
        const target = e.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          e.preventDefault();
          handlePlayPause();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handlePlayPause]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  const surahInfo = SURAHS.find((s) => s.number === project.surahNumber);
  const speedOptions = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5];

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <p className="text-sm text-muted-foreground">
                {surahInfo
                  ? `Surah ${surahInfo.number}: ${surahInfo.transliteration} (${surahInfo.translation})`
                  : `Surah ${project.surahNumber}`}
              </p>
            </div>
            <div className="flex gap-2">
              {/* View Mode Toggle */}
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                className="cursor-pointer gap-2"
                onClick={() => setViewMode("list")}
              >
                <FiList /> List
              </Button>
              <Button
                variant={viewMode === "mushaf" ? "default" : "outline"}
                className="cursor-pointer gap-2"
                onClick={() => setViewMode("mushaf")}
              >
                <FiBook /> Mushaf
              </Button>

              <div className="w-px bg-border mx-2" />

              <Link href={`/editor/${project.id}`}>
                <Button variant="outline" className="cursor-pointer gap-2">
                  <FiEdit /> Edit
                </Button>
              </Link>
              <Link href="/library">
                <Button variant="outline" className="cursor-pointer gap-2">
                  <FiArrowLeft /> Library
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quran Text */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Surah Header */}
          <div className="text-center mb-8 pb-8 border-b">
            <h2 className={`text-4xl font-bold mb-2 ${amiri.className}`}>
              سُورَةُ {surahInfo?.name}
            </h2>
            <p className="text-lg text-muted-foreground">
              {surahInfo?.transliteration} • {surahInfo?.ayahs} Ayahs
            </p>
            {project.surahNumber !== 1 && project.surahNumber !== 9 && (
              <p
                className={`text-3xl mt-6 ${amiri.className}`}
                dir="rtl"
                lang="ar"
              >
                بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
              </p>
            )}
          </div>

          {/* LIST VIEW: Simple ayah-by-ayah */}
          {viewMode === "list" && (
            <div>
              {ayahs.map((ayah, index) => {
                const isActive = currentAyahNumbers.includes(
                  ayah.numberInSurah
                );

                return (
                  <div
                    key={ayah.number}
                    ref={(el) => {
                      ayahRefs.current[index] = el;
                    }}
                    className={`
                    py-6 transition-all duration-300 cursor-pointer
                    border-b border-border/40
                    ${isActive ? "bg-primary/5" : "hover:bg-muted/30"}
                  `}
                    onClick={() => handleAyahClick(ayah.numberInSurah)}
                  >
                    <div className="flex items-start gap-4 px-2">
                      <div
                        className={`
                        shrink-0 w-10 h-10 rounded-full 
                        flex items-center justify-center
                        transition-colors
                        ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }
                      `}
                      >
                        <span className="text-sm font-semibold">
                          {toArabicNumerals(ayah.numberInSurah)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p
                          className={`
                          text-right text-2xl leading-loose ${amiri.className}
                          ${isActive ? "text-primary font-semibold" : ""}
                        `}
                          dir="rtl"
                          lang="ar"
                        >
                          {ayah.text} {getVerseMarker(ayah.numberInSurah)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MUSHAF VIEW: Page-by-page with line breaks */}
          {viewMode === "mushaf" && (
            <div className="space-y-8">
              {mushafVerses.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  Loading Mushaf view...
                </p>
              ) : (
                (() => {
                  // Group verses by page for better organization
                  const pageGroups: Record<number, Verse[]> = {};
                  mushafVerses.forEach((v) => {
                    if (!v.page_number) return; // Skip if no page number
                    if (!pageGroups[v.page_number]) {
                      pageGroups[v.page_number] = [];
                    }
                    pageGroups[v.page_number].push(v);
                  });

                  return Object.entries(pageGroups).map(([pageNum, verses]) => (
                    <div key={pageNum} className="space-y-4">
                      <div className="text-center text-sm text-muted-foreground mb-4 pb-2 border-b">
                        صفحة {toArabicNumerals(parseInt(pageNum))}
                      </div>

                      {/* Group by line number within page */}
                      {(() => {
                        const lineGroups: Record<number, Verse[]> = {};
                        verses.forEach((v) => {
                          if (v.words) {
                            v.words.forEach((word) => {
                              if (!lineGroups[word.line_number]) {
                                lineGroups[word.line_number] = [];
                              }
                              // Add verse if not already in this line group
                              if (
                                !lineGroups[word.line_number].find(
                                  (lv) => lv.id === v.id
                                )
                              ) {
                                lineGroups[word.line_number].push(v);
                              }
                            });
                          }
                        });

                        return Object.entries(lineGroups)
                          .sort(([a], [b]) => parseInt(a) - parseInt(b))
                          .map(([lineNum, lineVerses]) => (
                            <div
                              key={`line-${lineNum}`}
                              className={`
                                text-right leading-loose px-4 py-2
                                ${amiri.className}
                              `}
                              style={{
                                textAlign: 'justify',
                                textAlignLast: 'right',
                              }}
                              dir="rtl"
                              lang="ar"
                            >
                              {lineVerses.map((verse) => {
                                // Skip if verse doesn't have required data
                                if (!verse.verse_key || !verse.id) {
                                  return null;
                                }

                                // Use verse_number from API if available, fallback to parsing verse_key
                                const verseNumber =
                                  verse.verse_number ||
                                  parseInt(verse.verse_key.split(":")[1]);

                                const isActive =
                                  currentAyahNumbers.includes(verseNumber);

                                // Get words for this line, filter out "end" markers
                                const lineWords =
                                  verse.words?.filter(
                                    (w) =>
                                      w.line_number === parseInt(lineNum) &&
                                      w.char_type_name === "word"
                                  ) || [];

                                return (
                                  <span
                                    key={verse.id}
                                    onClick={() => handleAyahClick(verseNumber)}
                                    className={`
                                      cursor-pointer transition-colors inline
                                      ${
                                        isActive
                                          ? "bg-primary/10 text-primary font-semibold"
                                          : "hover:bg-muted/50"
                                      }
                                    `}
                                  >
                                    {lineWords.map((word, idx) => (
                                      <span key={word.id} className="text-3xl">
                                        {word.text_uthmani}
                                        {idx < lineWords.length - 1 ? " " : ""}
                                      </span>
                                    ))}{" "}
                                    {/* Check if this is the last word of the verse */}
                                    {(() => {
                                      if (
                                        !verse.words ||
                                        lineWords.length === 0
                                      )
                                        return null;
                                      const lastLineWordId =
                                        lineWords[lineWords.length - 1]?.id;
                                      // Get the last actual word (not "end" marker) from verse
                                      const allVerseWords = verse.words.filter(
                                        (w) => w.char_type_name === "word"
                                      );
                                      const lastVerseWordId =
                                        allVerseWords[allVerseWords.length - 1]
                                          ?.id;

                                      if (lastLineWordId === lastVerseWordId) {
                                        return (
                                          <span className="text-2xl mx-1">
                                            {getVerseMarker(verseNumber)}
                                          </span>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </span>
                                );
                              })}
                            </div>
                          ));
                      })()}
                    </div>
                  ));
                })()
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Audio Player at Bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg">
        <div className="w-full px-6 py-4">
          {isFetchingAudio ? (
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
              <span className="text-sm text-muted-foreground">
                Fetching audio from cloud storage...
              </span>
            </div>
          ) : !audioFile ? (
            <div className="flex items-center justify-center py-2">
              <p className="text-sm text-muted-foreground">
                <FiInfo className="inline mr-1" /> No audio file available for
                this project
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Progress Bar */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground min-w-[45px]">
                  {formatTime(currentTime)}
                </span>
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={(e) => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = parseFloat(e.target.value);
                    }
                  }}
                  className="flex-1 cursor-pointer"
                />
                <span className="text-xs text-muted-foreground min-w-[45px] text-right">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between gap-4">
                {/* Left: Loop Options & Current Ayah */}
                <div className="flex items-center gap-2 flex-1">
                  <Button
                    onClick={handleToggleLoop}
                    variant={isLooping ? "default" : "outline"}
                    size="icon"
                    className="cursor-pointer"
                    title="Repeat surah"
                  >
                    <FiRepeat className={isLooping ? "" : "opacity-50"} />
                  </Button>
                  <Button
                    onClick={handleToggleLoopAyah}
                    variant={isLoopingAyah ? "default" : "outline"}
                    size="icon"
                    className="cursor-pointer"
                    title="Repeat current ayah"
                    disabled={currentAyahNumbers.length === 0}
                  >
                    <FiRotateCw className={isLoopingAyah ? "" : "opacity-50"} />
                  </Button>
                  {currentAyahNumbers.length > 0 && (
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
                      <span className="text-base font-medium">
                        {currentAyahNumbers
                          .map((num) => getVerseMarker(num))
                          .join(" ")}
                      </span>
                    </div>
                  )}
                </div>

                {/* Center: Playback Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handlePrevAyah}
                    variant="outline"
                    size="icon"
                    className="cursor-pointer"
                    disabled={currentAyahNumbers.length === 0}
                  >
                    <FiSkipBack />
                  </Button>
                  <Button
                    onClick={handlePlayPause}
                    size="icon"
                    className="cursor-pointer h-12 w-12"
                  >
                    {isPlaying ? <FiPause size={20} /> : <FiPlay size={20} />}
                  </Button>
                  <Button
                    onClick={handleNextAyah}
                    variant="outline"
                    size="icon"
                    className="cursor-pointer"
                    disabled={currentAyahNumbers.length === 0}
                  >
                    <FiSkipForward />
                  </Button>
                </div>

                {/* Right: Speed Control */}
                <div className="flex items-center gap-2 flex-1 justify-end">
                  <span className="text-xs text-muted-foreground">Speed:</span>
                  <select
                    value={playbackRate}
                    onChange={(e) =>
                      handleSpeedChange(parseFloat(e.target.value))
                    }
                    className="px-3 py-1.5 text-sm border rounded-md bg-background cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {speedOptions.map((speed) => (
                      <option key={speed} value={speed}>
                        {speed}x
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        loop={isLooping}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
}
