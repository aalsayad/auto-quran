"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SavedRecitation } from "@/lib/types";
import { SURAHS } from "@/lib/surah-data";
import { useAuth } from "@/contexts/auth-context";
import { getRecitation } from "@/lib/supabase-storage";
import { recitationToSavedRecitation } from "@/lib/types";
import {
  getRecitationBookmarks,
  getRecitationBookmarksDetailed,
  toggleBookmark,
  type Bookmark,
} from "@/lib/bookmark-manager";
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
  FiVolume2,
  FiVolume,
  FiVolume1,
  FiVolumeX,
  FiBookmark,
  FiMoreVertical,
  FiClock,
} from "react-icons/fi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  translation?: string;
}

export default function QuranReaderPage() {
  const params = useParams();
  const recitationId = params.recitationId as string;
  const { user } = useAuth();

  const [recitation, setRecitation] = useState<SavedRecitation | null>(null);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [mushafVerses, setMushafVerses] = useState<Verse[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "mushaf">("list");
  const [showTranslation, setShowTranslation] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentAyahNumbers, setCurrentAyahNumbers] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFetchingAudio, setIsFetchingAudio] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isLoopingAyah, setIsLoopingAyah] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [savedAyahNumbers, setSavedAyahNumbers] = useState<number[]>([]); // Track where user left off
  const [showSavedIndicator, setShowSavedIndicator] = useState(true); // Control saved position indicator
  const [bookmarkedAyahs, setBookmarkedAyahs] = useState<number[]>([]); // Track bookmarked ayahs
  const [bookmarksDetailed, setBookmarksDetailed] = useState<Bookmark[]>([]); // Track detailed bookmark info for dropdown

  const audioRef = useRef<HTMLAudioElement>(null);
  const ayahRefs = useRef<(HTMLDivElement | HTMLSpanElement | null)[]>([]);
  const volumeRef = useRef<HTMLDivElement>(null);
  const audioLoadedRef = useRef(false); // Track if audio has been loaded in this session
  const hasRestoredPositionRef = useRef(false); // Track if we've restored the saved position
  const savedPositionTimeRef = useRef<number>(0); // Store the exact time to restore to

  // Detect if device is iOS/iPadOS where volume control is not supported
  const isIOS =
    typeof window !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  // Load global settings from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Load global volume setting (default: 1)
    const savedVolume = localStorage.getItem("quran-reader-volume");
    if (savedVolume) {
      const vol = parseFloat(savedVolume);
      setVolume(vol);
      if (audioRef.current) {
        audioRef.current.volume = vol;
      }
    }

    // Load global playback speed setting (default: 1)
    const savedSpeed = localStorage.getItem("quran-reader-speed");
    if (savedSpeed) {
      const speed = parseFloat(savedSpeed);
      setPlaybackRate(speed);
      if (audioRef.current) {
        audioRef.current.playbackRate = speed;
      }
    }
  }, []);

  // Save current position to localStorage whenever currentAyahNumbers changes
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !recitationId ||
      currentAyahNumbers.length === 0
    )
      return;

    const positionKey = `quran-reader-position-${recitationId}`;
    localStorage.setItem(
      positionKey,
      JSON.stringify({
        ayahNumbers: currentAyahNumbers,
        timestamp: Date.now(),
      })
    );
  }, [currentAyahNumbers, recitationId]);

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

  // Clean HTML tags from translation text (e.g., footnotes)
  // TODO: Implement footnote display - fetch from API endpoint: /foot_notes/{id}
  // Example: https://api.quran.com/api/v4/foot_notes/195932
  // Could display as tooltips or expandable sections below each ayah
  const cleanTranslation = (text: string): string => {
    // Remove footnote markers like <sup foot_note=195932>1</sup>
    return text.replace(/<sup[^>]*>.*?<\/sup>/g, "");
  };

  // Load audio from S3 - only once per session
  const loadAudioFromS3 = useCallback(async (url: string, fileName: string) => {
    // Check if audio has already been loaded in this session
    if (audioLoadedRef.current) {
      console.log("📻 [Reader] Audio already loaded, skipping fetch");
      return null;
    }

    try {
      setIsFetchingAudio(true);
      console.log("📻 [Reader] Loading audio from S3...");
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

      // Mark audio as loaded for this session
      audioLoadedRef.current = true;
      console.log("✅ [Reader] Audio loaded successfully");

      return file;
    } catch (error) {
      console.error("❌ [Reader] Failed to load audio from S3:", error);
      alert("Failed to load audio from cloud storage.");
      return null;
    } finally {
      setIsFetchingAudio(false);
    }
  }, []);

  // Load recitation
  useEffect(() => {
    const loadRecitationData = async () => {
      if (!user) {
        alert("Please sign in to access this recitation");
        return;
      }

      // Load from Supabase
      const recitationData = await getRecitation(recitationId);
      if (!recitationData) {
        alert("Recitation not found. It may have been deleted.");
        return;
      }

      const loadedRecitation = recitationToSavedRecitation(recitationData);
      console.log("Recitation loaded from Supabase for reader");

      if (loadedRecitation) {
        setRecitation(loadedRecitation);

        // Auto-load audio from S3 if available
        if (loadedRecitation.audioUrl) {
          loadAudioFromS3(
            loadedRecitation.audioUrl,
            loadedRecitation.fileName ||
              loadedRecitation.audioFileName ||
              "audio.mp3"
          );
        }

        // Fetch Quran text from LOCAL data (no API calls!)
        const surahNumber = loadedRecitation.surahNumber;

        // Load for List View
        getVersesBySurah(surahNumber).then((verses) => {
          const formattedAyahs: Ayah[] = verses.map((v) => {
            // Extract verse number from verse_key (e.g., "1:5" -> 5)
            const verseNumber = parseInt(v.verse_key.split(":")[1]);
            let text = v.text_uthmani;

            // Remove Bismillah from first ayah if present (not Surah 1 or 9)
            if (verseNumber === 1 && surahNumber !== 1 && surahNumber !== 9) {
              const words = text.split(" ");
              // Only remove if it actually starts with Bismillah
              const bismillahPattern =
                /^بِسْمِ\s+ٱللَّهِ\s+ٱلرَّحْمَ[ـٰ]نِ\s+ٱلرَّحِيمِ/;
              if (bismillahPattern.test(text)) {
                text = words.slice(4).join(" ");
              }
            }

            // Extract translation (Clear Quran - ID 131)
            const translation =
              v.translations && v.translations.length > 0
                ? v.translations[0].text
                : undefined;

            return {
              number: v.id,
              text,
              numberInSurah: verseNumber,
              translation,
            };
          });
          setAyahs(formattedAyahs);

          // Load saved position from localStorage
          if (recitationId) {
            const positionKey = `quran-reader-position-${recitationId}`;
            const savedPosition = localStorage.getItem(positionKey);

            if (savedPosition) {
              try {
                const { ayahNumbers } = JSON.parse(savedPosition);

                // Find the segment for the saved ayah
                const segment = loadedRecitation.segments.find(
                  (seg: {
                    ayahNumbers?: number[];
                    ayahNumber?: number;
                    start: number;
                  }) =>
                    seg.ayahNumbers?.some((num: number) =>
                      ayahNumbers.includes(num)
                    ) ||
                    (seg.ayahNumber !== undefined &&
                      ayahNumbers.includes(seg.ayahNumber))
                );

                if (segment) {
                  setSavedAyahNumbers(ayahNumbers);
                  savedPositionTimeRef.current = segment.start;
                  console.log(
                    "📍 [Reader] Found saved position:",
                    ayahNumbers,
                    "at time:",
                    segment.start
                  );
                } else {
                  console.log("⚠️ [Reader] Saved position segment not found");
                }
              } catch (error) {
                console.error("Failed to load saved position:", error);
              }
            }

            // Load bookmarks from Supabase
            if (user) {
              getRecitationBookmarks(user.id, recitationId).then(
                (bookmarks) => {
                  setBookmarkedAyahs(bookmarks);
                  console.log("🔖 [Reader] Loaded bookmarks:", bookmarks);
                }
              );
              getRecitationBookmarksDetailed(user.id, recitationId).then(
                (detailedBookmarks) => {
                  setBookmarksDetailed(detailedBookmarks);
                  console.log(
                    "🔖 [Reader] Loaded detailed bookmarks:",
                    detailedBookmarks
                  );
                }
              );
            }
          }
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
    };

    loadRecitationData();
  }, [recitationId, user, loadAudioFromS3]);

  // Audio event handlers
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);

      // Find current ayah based on recitation segments
      if (recitation?.segments) {
        // For ayah looping, we need to check if we're past a segment end
        // BEFORE we try to find the current segment (which would fail if time >= seg.end)
        if (isLoopingAyah && currentAyahNumbers.length > 0) {
          const loopSegment = recitation.segments.find(
            (seg: {
              ayahNumbers?: number[];
              ayahNumber?: number;
              start: number;
              end: number;
            }) =>
              seg.ayahNumbers?.some((num: number) =>
                currentAyahNumbers.includes(num)
              ) ||
              (seg.ayahNumber !== undefined &&
                currentAyahNumbers.includes(seg.ayahNumber))
          );

          if (loopSegment && time >= loopSegment.end) {
            // Loop back to the start of this ayah
            console.log(
              "🔄 Looping ayah back from",
              time.toFixed(2),
              "to",
              loopSegment.start.toFixed(2)
            );
            audioRef.current.currentTime = loopSegment.start;
            if (audioRef.current.paused) {
              audioRef.current.play();
            }
            return; // Exit early after looping
          }
        }

        const currentSegment = recitation.segments.find(
          (seg: { start: number; end: number }) =>
            time >= seg.start && time < seg.end
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

            // Auto-scroll to active ayah ONLY if it's not in view
            const firstAyahNum = ayahNums[0];
            const ayahIndex = ayahs.findIndex(
              (a) => a.numberInSurah === firstAyahNum
            );
            if (ayahIndex >= 0 && ayahRefs.current[ayahIndex]) {
              const element = ayahRefs.current[ayahIndex];
              if (element) {
                // Check if element is in viewport
                const rect = element.getBoundingClientRect();
                const isInView =
                  rect.top >= 0 && rect.bottom <= window.innerHeight;

                // Only scroll if element is not in view
                if (!isInView) {
                  element.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
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

  // Handle when audio is ready to play - restore position here for better reliability
  const handleCanPlay = useCallback(() => {
    if (!audioRef.current) return;

    // Restore saved position if available (only once)
    if (
      !hasRestoredPositionRef.current &&
      savedPositionTimeRef.current > 0 &&
      savedAyahNumbers.length > 0
    ) {
      console.log(
        "📍 [Reader] Attempting to restore position to:",
        savedAyahNumbers,
        "at time:",
        savedPositionTimeRef.current
      );

      // Mark as restored FIRST to prevent multiple attempts
      hasRestoredPositionRef.current = true;

      // Set the audio position
      audioRef.current.currentTime = savedPositionTimeRef.current;

      // Highlight the saved ayah
      setCurrentAyahNumbers(savedAyahNumbers);

      console.log("✅ [Reader] Position restored successfully");

      // Scroll to the saved ayah after a short delay
      setTimeout(() => {
        const ayahIndex = ayahs.findIndex((a) =>
          savedAyahNumbers.includes(a.numberInSurah)
        );
        if (ayahIndex >= 0 && ayahRefs.current[ayahIndex]) {
          ayahRefs.current[ayahIndex]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, 300);
    }
  }, [savedAyahNumbers, ayahs]);

  // Prevent audio from seeking back to 0 after restoration
  const handleSeeking = useCallback(() => {
    if (!audioRef.current) return;

    // If we've restored the position and user hasn't interacted yet, enforce the saved position
    if (
      hasRestoredPositionRef.current &&
      !isPlaying &&
      savedPositionTimeRef.current > 0
    ) {
      const currentTime = audioRef.current.currentTime;

      // If something tries to seek away from our saved position (like back to 0), prevent it
      if (
        Math.abs(currentTime - savedPositionTimeRef.current) > 0.5 &&
        currentTime < 1
      ) {
        console.log(
          "🛡️ [Reader] Prevented unwanted seek, restoring to:",
          savedPositionTimeRef.current
        );
        audioRef.current.currentTime = savedPositionTimeRef.current;
      }
    }
  }, [isPlaying]);

  const handlePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        // Before playing, ensure we're at the saved position if it hasn't been restored yet
        if (
          !hasRestoredPositionRef.current &&
          savedPositionTimeRef.current > 0
        ) {
          audioRef.current.currentTime = savedPositionTimeRef.current;
          setCurrentAyahNumbers(savedAyahNumbers);
          hasRestoredPositionRef.current = true;
        }

        audioRef.current.play();

        // Hide the saved indicator once user starts playing
        setShowSavedIndicator(false);

        // Clear the saved position enforcement once user starts playing
        savedPositionTimeRef.current = 0;
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, savedAyahNumbers]);

  const handleEnded = () => {
    if (
      isLoopingAyah &&
      recitation?.segments &&
      currentAyahNumbers.length > 0
    ) {
      const currentSegment = recitation.segments.find(
        (seg: {
          ayahNumbers?: number[];
          ayahNumber?: number;
          start: number;
          end: number;
        }) =>
          seg.ayahNumbers?.some((num: number) =>
            currentAyahNumbers.includes(num)
          ) ||
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
    const newLooping = !isLooping;
    setIsLooping(newLooping);
    // If enabling full surah loop, disable ayah loop
    if (newLooping && isLoopingAyah) {
      setIsLoopingAyah(false);
    }
  };

  const handleToggleLoopAyah = () => {
    const newLoopingAyah = !isLoopingAyah;
    setIsLoopingAyah(newLoopingAyah);
    console.log("🔄 Ayah Loop:", newLoopingAyah ? "ENABLED" : "DISABLED");
    // If enabling ayah loop, disable full surah loop
    if (newLoopingAyah && isLooping) {
      setIsLooping(false);
    }
  };

  const handleNextAyah = () => {
    if (!recitation?.segments || currentAyahNumbers.length === 0) return;

    const currentIndex = recitation.segments.findIndex(
      (seg: { ayahNumbers?: number[]; ayahNumber?: number }) =>
        seg.ayahNumbers?.some((num: number) =>
          currentAyahNumbers.includes(num)
        ) ||
        (seg.ayahNumber !== undefined &&
          currentAyahNumbers.includes(seg.ayahNumber))
    );

    if (currentIndex < recitation.segments.length - 1 && audioRef.current) {
      const nextSegment = recitation.segments[currentIndex + 1];

      // Update currentAyahNumbers for the next ayah (important for looping)
      let ayahNums: number[] = [];
      if (nextSegment.ayahNumbers && nextSegment.ayahNumbers.length > 0) {
        ayahNums = nextSegment.ayahNumbers;
      } else if (nextSegment.ayahNumber !== undefined) {
        ayahNums = [nextSegment.ayahNumber];
      }
      if (ayahNums.length > 0) {
        setCurrentAyahNumbers(ayahNums);
      }

      audioRef.current.currentTime = nextSegment.start;
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handlePrevAyah = () => {
    if (!recitation?.segments || currentAyahNumbers.length === 0) return;

    const currentIndex = recitation.segments.findIndex(
      (seg: { ayahNumbers?: number[]; ayahNumber?: number }) =>
        seg.ayahNumbers?.some((num: number) =>
          currentAyahNumbers.includes(num)
        ) ||
        (seg.ayahNumber !== undefined &&
          currentAyahNumbers.includes(seg.ayahNumber))
    );

    if (currentIndex > 0 && audioRef.current) {
      const prevSegment = recitation.segments[currentIndex - 1];

      // Update currentAyahNumbers for the previous ayah (important for looping)
      let ayahNums: number[] = [];
      if (prevSegment.ayahNumbers && prevSegment.ayahNumbers.length > 0) {
        ayahNums = prevSegment.ayahNumbers;
      } else if (prevSegment.ayahNumber !== undefined) {
        ayahNums = [prevSegment.ayahNumber];
      }
      if (ayahNums.length > 0) {
        setCurrentAyahNumbers(ayahNums);
      }

      audioRef.current.currentTime = prevSegment.start;
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current) {
      try {
        audioRef.current.volume = newVolume;
        console.log("🔊 Volume changed to:", newVolume);
      } catch (error) {
        console.warn("⚠️ Volume control not supported on this device:", error);
      }
    }

    // Save to localStorage for global persistence
    if (typeof window !== "undefined") {
      localStorage.setItem("quran-reader-volume", newVolume.toString());
    }
  };

  const getVolumeIcon = () => {
    if (volume === 0) return FiVolumeX;
    if (volume < 0.5) return FiVolume;
    if (volume < 0.8) return FiVolume1;
    return FiVolume2;
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }

    // Save to localStorage for global persistence
    if (typeof window !== "undefined") {
      localStorage.setItem("quran-reader-speed", speed.toString());
    }
  };

  const handleAyahClick = (ayahNumber: number) => {
    if (!recitation?.segments || !audioRef.current) return;

    const segment = recitation.segments.find(
      (seg: { ayahNumbers?: number[]; ayahNumber?: number; start: number }) =>
        seg.ayahNumbers?.includes(ayahNumber) || seg.ayahNumber === ayahNumber
    );

    if (segment) {
      // Update currentAyahNumbers to the newly selected ayah
      // This is crucial for ayah looping to work with the new selection
      let ayahNums: number[] = [];
      if (segment.ayahNumbers && segment.ayahNumbers.length > 0) {
        ayahNums = segment.ayahNumbers;
      } else if (segment.ayahNumber !== undefined) {
        ayahNums = [segment.ayahNumber];
      }

      if (ayahNums.length > 0) {
        setCurrentAyahNumbers(ayahNums);
        console.log(
          "👆 Clicked ayah:",
          ayahNums,
          "- Loop active:",
          isLoopingAyah
        );
      }

      audioRef.current.currentTime = segment.start;

      // Hide saved indicator when user manually selects an ayah
      setShowSavedIndicator(false);

      // Clear the saved position enforcement when user manually jumps
      savedPositionTimeRef.current = 0;

      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  // Toggle bookmark for an ayah
  const handleToggleBookmark = async (ayahNumber: number) => {
    if (!user || !recitationId) return;

    const isBookmarked = bookmarkedAyahs.includes(ayahNumber);

    // Optimistically update UI
    if (isBookmarked) {
      setBookmarkedAyahs(bookmarkedAyahs.filter((num) => num !== ayahNumber));
    } else {
      setBookmarkedAyahs(
        [...bookmarkedAyahs, ayahNumber].sort((a, b) => a - b)
      );
    }

    // Update in Supabase
    const result = await toggleBookmark(
      user.id,
      recitationId,
      ayahNumber,
      isBookmarked
    );

    if (!result.success) {
      // Revert on error
      if (isBookmarked) {
        setBookmarkedAyahs(
          [...bookmarkedAyahs, ayahNumber].sort((a, b) => a - b)
        );
      } else {
        setBookmarkedAyahs(bookmarkedAyahs.filter((num) => num !== ayahNumber));
      }
      console.error("Failed to toggle bookmark:", result.error);
    } else {
      // Reload detailed bookmarks after successful update
      getRecitationBookmarksDetailed(user.id, recitationId).then(
        (detailedBookmarks) => {
          setBookmarksDetailed(detailedBookmarks);
        }
      );
    }
  };

  // Jump to a specific ayah (for bookmarks and last played)
  const handleJumpToAyah = (ayahNumber: number) => {
    if (!recitation || !audioRef.current) return;

    // Find the segment that contains this ayah
    const segment = recitation.segments.find((seg) =>
      seg.ayahs.includes(ayahNumber)
    );

    if (!segment) {
      console.warn("No segment found for ayah:", ayahNumber);
      return;
    }

    // Set audio to the start of this segment
    audioRef.current.currentTime = segment.start;
    setCurrentAyahNumbers(segment.ayahs);

    // Scroll to the ayah
    const ayahIndex = ayahs.findIndex((a) => a.numberInSurah === ayahNumber);
    if (ayahIndex >= 0 && ayahRefs.current[ayahIndex]) {
      ayahRefs.current[ayahIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }

    // Auto-play after jumping
    audioRef.current.play();
    setIsPlaying(true);
  };

  // Jump to last played position
  const handleJumpToLastPlayed = () => {
    if (!audioRef.current || savedPositionTimeRef.current === 0) return;

    audioRef.current.currentTime = savedPositionTimeRef.current;
    setCurrentAyahNumbers(savedAyahNumbers);

    // Scroll to the saved ayah
    if (savedAyahNumbers.length > 0) {
      const firstSavedAyah = savedAyahNumbers[0];
      const ayahIndex = ayahs.findIndex(
        (a) => a.numberInSurah === firstSavedAyah
      );
      if (ayahIndex >= 0 && ayahRefs.current[ayahIndex]) {
        ayahRefs.current[ayahIndex]?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }

    // Hide the saved indicator after jumping
    setShowSavedIndicator(false);

    // Auto-play after jumping
    audioRef.current.play();
    setIsPlaying(true);
  };

  // Click outside to close volume slider
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        volumeRef.current &&
        !volumeRef.current.contains(event.target as Node)
      ) {
        setShowVolumeSlider(false);
      }
    };

    if (showVolumeSlider) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showVolumeSlider]);

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

  if (!recitation) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading recitation...</p>
      </div>
    );
  }

  const surahInfo = SURAHS.find((s) => s.number === recitation.surahNumber);
  const speedOptions = [
    0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2,
  ];

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl font-bold truncate">
                {recitation.name}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {surahInfo
                  ? `Surah ${surahInfo.number}: ${surahInfo.transliteration} (${surahInfo.translation})`
                  : `Surah ${recitation.surahNumber}`}
              </p>
            </div>

            {/* Mobile: Stack controls vertically */}
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {/* View Mode Toggle */}
              <div className="flex gap-1 sm:gap-2">
                <Link href="/library">
                  <Button
                    variant="outline"
                    className="cursor-pointer gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
                  >
                    <FiArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span>Library</span>
                  </Button>
                </Link>

                {/* Divider */}
                <div className="w-px bg-border mx-1 sm:mx-2 hidden sm:block" />

                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  className="cursor-pointer gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
                  onClick={() => setViewMode("list")}
                >
                  <FiList className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>List</span>
                </Button>
                <Button
                  variant={viewMode === "mushaf" ? "default" : "outline"}
                  className="cursor-pointer gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
                  onClick={() => setViewMode("mushaf")}
                >
                  <FiBook className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Mushaf</span>
                </Button>

                {/* Divider */}
                <div className="w-px bg-border mx-1 sm:mx-2 hidden sm:block" />

                {/* Translation Toggle (only in list view) */}
                {viewMode === "list" && (
                  <Button
                    variant={showTranslation ? "default" : "outline"}
                    className="cursor-pointer gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
                    onClick={() => setShowTranslation(!showTranslation)}
                  >
                    <span>{showTranslation ? "Hide" : "Show"} Translation</span>
                  </Button>
                )}
              </div>

              {/* Action buttons / Menu */}
              <div className="gap-1 sm:gap-2 flex">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="cursor-pointer gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
                    >
                      <FiMoreVertical className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-64"
                    sideOffset={8}
                  >
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    {/* Edit */}
                    <Link href={`/editor/${recitation.id}`}>
                      <DropdownMenuItem className="cursor-pointer">
                        <FiEdit className="mr-2 h-4 w-4" />
                        <span>Edit Recitation</span>
                      </DropdownMenuItem>
                    </Link>

                    {/* Translation Toggle */}
                    {viewMode === "list" && (
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => setShowTranslation(!showTranslation)}
                      >
                        <FiBook className="mr-2 h-4 w-4" />
                        <span>
                          {showTranslation ? "Hide" : "Show"} Translation
                        </span>
                      </DropdownMenuItem>
                    )}

                    {/* Last Played Position */}
                    {savedAyahNumbers.length > 0 && showSavedIndicator && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-amber-600">
                          Last Played
                        </DropdownMenuLabel>
                        <DropdownMenuItem
                          className="cursor-pointer"
                          onClick={handleJumpToLastPlayed}
                        >
                          <FiClock className="mr-2 h-4 w-4 text-amber-500" />
                          <div className="flex flex-col">
                            <span>Ayah {savedAyahNumbers.join(", ")}</span>
                            <span className="text-xs text-muted-foreground">
                              Click to continue
                            </span>
                          </div>
                        </DropdownMenuItem>
                      </>
                    )}

                    {/* Bookmarks */}
                    {bookmarksDetailed.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-purple-600">
                          Bookmarks ({bookmarksDetailed.length})
                        </DropdownMenuLabel>
                        <div className="max-h-48 overflow-y-auto">
                          {bookmarksDetailed.map((bookmark) => (
                            <DropdownMenuItem
                              key={bookmark.id}
                              className="cursor-pointer"
                              onClick={() =>
                                handleJumpToAyah(bookmark.ayah_number)
                              }
                            >
                              <FiBookmark className="mr-2 h-4 w-4 text-purple-500 fill-current" />
                              <div className="flex flex-col">
                                <span>Ayah {bookmark.ayah_number}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(
                                    bookmark.created_at
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </>
                    )}

                    {/* No bookmarks message */}
                    {bookmarksDetailed.length === 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-muted-foreground">
                          No bookmarks yet
                        </DropdownMenuLabel>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quran Text */}
      <div className="w-full px-2 sm:px-4 py-8">
        <div
          className={
            viewMode === "mushaf" ? "max-w-full mx-auto" : "max-w-4xl mx-auto"
          }
        >
          {/* Surah Header */}
          <div className="text-center mb-8 pb-8 border-b">
            <h2 className={`text-4xl font-bold mb-2 ${amiri.className}`}>
              سُورَةُ {surahInfo?.name}
            </h2>
            <p className="text-lg text-muted-foreground">
              {surahInfo?.transliteration} • {surahInfo?.ayahs} Ayahs
            </p>
            {recitation.surahNumber !== 1 && recitation.surahNumber !== 9 && (
              <p
                className={`text-xl sm:text-2xl md:text-3xl mt-6 ${amiri.className}`}
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
                const isSavedPosition =
                  savedAyahNumbers.includes(ayah.numberInSurah) &&
                  showSavedIndicator;
                const isBookmarked = bookmarkedAyahs.includes(
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
                    border-b border-border/40 relative
                    ${isActive ? "bg-primary/5" : "hover:bg-muted/30"}
                    ${isSavedPosition ? "border-l-4 border-l-amber-500" : ""}
                    ${
                      isBookmarked
                        ? "border-l-4 border-l-purple-500 bg-purple-50/30"
                        : ""
                    }
                  `}
                    onClick={() => handleAyahClick(ayah.numberInSurah)}
                  >
                    {isSavedPosition && (
                      <div className="absolute -left-2 bottom-6 bg-amber-500 text-white text-xs px-2 py-1 rounded-r shadow-sm flex items-center gap-1">
                        <FiInfo className="h-3 w-3" />
                        <span>Last played</span>
                      </div>
                    )}
                    {isBookmarked && (
                      <div className="absolute -right-2 top-6 bg-purple-500 text-white text-xs px-2 py-1 rounded-l shadow-sm flex items-center gap-1">
                        <FiBookmark className="h-3 w-3" />
                        <span>Bookmarked</span>
                      </div>
                    )}
                    <div className="flex items-start gap-3 px-2">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground opacity-60">
                          {recitation.surahNumber}:{ayah.numberInSurah}
                        </span>
                        {/* Bookmark button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleBookmark(ayah.numberInSurah);
                          }}
                          className={`mt-2 p-1.5 rounded hover:bg-purple-100 transition-colors ${
                            isBookmarked ? "text-purple-600" : "text-gray-400"
                          }`}
                          title={
                            isBookmarked ? "Remove bookmark" : "Add bookmark"
                          }
                        >
                          <FiBookmark
                            className={`h-4 w-4 ${
                              isBookmarked ? "fill-current" : ""
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex-1 space-y-3">
                        <p
                          className={`
                          text-right text-2xl md:text-2xl lg:text-3xl leading-[2.3] ${
                            amiri.className
                          }
                          ${isActive ? "text-primary font-semibold" : ""}
                        `}
                          dir="rtl"
                          lang="ar"
                        >
                          {ayah.text} {getVerseMarker(ayah.numberInSurah)}
                        </p>
                        {showTranslation && ayah.translation && (
                          <p
                            className={`
                            text-left text-sm md:text-base text-muted-foreground
                            ${isActive ? "text-primary/80" : ""}
                          `}
                          >
                            {cleanTranslation(ayah.translation)}
                          </p>
                        )}
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
                                text-center px-2 sm:px-4 py-1
                                ${amiri.className}
                              `}
                              dir="rtl"
                              lang="ar"
                              style={{
                                width: "100%",
                                maxWidth: "100%",
                                margin: "0 auto",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <div
                                className="text-lg sm:text-2xl md:text-3xl lg:text-4xl mushaf-line"
                                style={{
                                  whiteSpace: "nowrap",
                                  overflow: "visible",
                                  lineHeight: "1.4",
                                  padding: "0.25rem",
                                }}
                              >
                                {(() => {
                                  // Collect all words for this line grouped by verse
                                  const verseWordGroups: Record<
                                    number,
                                    Array<{
                                      word: {
                                        id: number;
                                        text_uthmani: string;
                                        line_number: number;
                                        char_type_name: string;
                                      };
                                      isLastWordOfVerse: boolean;
                                    }>
                                  > = {};

                                  lineVerses.forEach((verse) => {
                                    if (
                                      !verse.verse_key ||
                                      !verse.id ||
                                      !verse.words
                                    )
                                      return;

                                    const verseNumber =
                                      verse.verse_number ||
                                      parseInt(verse.verse_key.split(":")[1]);

                                    const lineWords = verse.words.filter(
                                      (w) =>
                                        w.line_number === parseInt(lineNum) &&
                                        w.char_type_name === "word"
                                    );

                                    const allVerseWords = verse.words.filter(
                                      (w) => w.char_type_name === "word"
                                    );
                                    const lastVerseWordId =
                                      allVerseWords[allVerseWords.length - 1]
                                        ?.id;

                                    if (!verseWordGroups[verseNumber]) {
                                      verseWordGroups[verseNumber] = [];
                                    }

                                    lineWords.forEach((word) => {
                                      verseWordGroups[verseNumber].push({
                                        word,
                                        isLastWordOfVerse:
                                          word.id === lastVerseWordId,
                                      });
                                    });
                                  });

                                  // Render each verse's words together
                                  return Object.entries(verseWordGroups).map(
                                    ([verseNum, words]) => {
                                      const verseNumber = parseInt(verseNum);
                                      const isActive =
                                        currentAyahNumbers.includes(
                                          verseNumber
                                        );
                                      const isSavedPosition =
                                        savedAyahNumbers.includes(
                                          verseNumber
                                        ) && showSavedIndicator;
                                      const isBookmarked =
                                        bookmarkedAyahs.includes(verseNumber);

                                      return (
                                        <span
                                          key={`verse-${verseNum}`}
                                          ref={(el) => {
                                            // Add ref for this verse so we can scroll to it
                                            const ayahIndex = ayahs.findIndex(
                                              (a) =>
                                                a.numberInSurah === verseNumber
                                            );
                                            if (ayahIndex >= 0) {
                                              ayahRefs.current[ayahIndex] = el;
                                            }
                                          }}
                                          onClick={() =>
                                            handleAyahClick(verseNumber)
                                          }
                                          className={`
                                            cursor-pointer transition-all duration-200 px-1 rounded
                                            ${
                                              isActive
                                                ? "bg-primary/10 text-primary font-semibold"
                                                : "hover:bg-muted/30"
                                            }
                                            ${
                                              isSavedPosition
                                                ? "bg-amber-100 border-2 border-amber-500"
                                                : ""
                                            }
                                            ${
                                              isBookmarked
                                                ? "bg-purple-100/50 border-2 border-purple-500"
                                                : ""
                                            }
                                          `}
                                        >
                                          {words.map((item, idx) => (
                                            <span
                                              key={`${item.word.id}-${idx}`}
                                              className="inline"
                                            >
                                              {item.word.text_uthmani}{" "}
                                              {item.isLastWordOfVerse && (
                                                <span className="inline text-xs sm:text-base md:text-lg lg:text-xl">
                                                  {getVerseMarker(verseNumber)}{" "}
                                                </span>
                                              )}
                                            </span>
                                          ))}
                                        </span>
                                      );
                                    }
                                  );
                                })()}
                              </div>
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
        <div className="w-full px-2 sm:px-4 md:px-6 py-2 sm:py-3">
          {isFetchingAudio ? (
            <div className="flex items-center justify-center gap-2 py-1 sm:py-2">
              <div className="animate-spin h-4 w-4 sm:h-5 sm:w-5 border-2 border-primary border-t-transparent rounded-full"></div>
              <span className="text-xs sm:text-sm text-muted-foreground">
                Fetching audio...
              </span>
            </div>
          ) : !audioFile ? (
            <div className="flex items-center justify-center py-1 sm:py-2">
              <p className="text-xs sm:text-sm text-muted-foreground">
                <FiInfo className="inline mr-1" /> No audio available
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 sm:space-y-2">
              {/* Progress Bar */}
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-1 relative">
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={(e) => {
                      if (audioRef.current) {
                        audioRef.current.currentTime = parseFloat(
                          e.target.value
                        );
                      }
                    }}
                    className="w-full cursor-pointer h-2 bg-muted rounded-lg appearance-none"
                  />
                  {/* Bookmark markers on progress bar */}
                  {recitation?.segments &&
                    bookmarkedAyahs.map((ayahNum) => {
                      const segment = recitation.segments.find(
                        (seg: {
                          ayahNumbers?: number[];
                          ayahNumber?: number;
                          start: number;
                        }) =>
                          seg.ayahNumbers?.includes(ayahNum) ||
                          seg.ayahNumber === ayahNum
                      );
                      if (!segment || !duration) return null;

                      const position = (segment.start / duration) * 100;

                      return (
                        <div
                          key={`bookmark-marker-${ayahNum}`}
                          className="absolute top-0 w-1 h-2 bg-purple-500 rounded-full pointer-events-none"
                          style={{ left: `${position}%` }}
                          title={`Bookmark: Ayah ${ayahNum}`}
                        />
                      );
                    })}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-between gap-1 sm:gap-2 md:gap-4">
                {/* Left: Volume & Loop Controls */}
                <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2">
                  {/* Volume Control - Hidden on iOS/iPadOS where it's not supported */}
                  {!isIOS && (
                    <div className="relative" ref={volumeRef}>
                      <Button
                        onClick={() => setShowVolumeSlider(!showVolumeSlider)}
                        variant="outline"
                        size="icon"
                        className="cursor-pointer h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10"
                        title={`Volume: ${Math.round(volume * 100)}%`}
                      >
                        {(() => {
                          const VolumeIcon = getVolumeIcon();
                          return (
                            <VolumeIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          );
                        })()}
                      </Button>

                      {/* Vertical Volume Slider Popup */}
                      {showVolumeSlider && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-background border rounded-lg shadow-lg p-2 flex items-center justify-center z-10">
                          <div className="h-24 w-8 flex items-center justify-center">
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={volume}
                              onChange={(e) =>
                                handleVolumeChange(parseFloat(e.target.value))
                              }
                              className="w-24 cursor-pointer accent-primary -rotate-90"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleToggleLoop}
                    variant={isLooping ? "default" : "outline"}
                    size="icon"
                    className="cursor-pointer h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10"
                    title="Repeat surah"
                  >
                    <FiRepeat className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                  <Button
                    onClick={handleToggleLoopAyah}
                    variant={isLoopingAyah ? "default" : "outline"}
                    size="icon"
                    className="cursor-pointer h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10"
                    title="Repeat current ayah"
                    disabled={currentAyahNumbers.length === 0}
                  >
                    <FiRotateCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </div>

                {/* Center: Playback Controls */}
                <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
                  <Button
                    onClick={handlePrevAyah}
                    variant="outline"
                    size="icon"
                    className="cursor-pointer h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10"
                    disabled={currentAyahNumbers.length === 0}
                  >
                    <FiSkipBack className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                  <Button
                    onClick={handlePlayPause}
                    size="icon"
                    className="cursor-pointer h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12"
                  >
                    {isPlaying ? (
                      <FiPause className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                    ) : (
                      <FiPlay className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                    )}
                  </Button>
                  <Button
                    onClick={handleNextAyah}
                    variant="outline"
                    size="icon"
                    className="cursor-pointer h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10"
                    disabled={currentAyahNumbers.length === 0}
                  >
                    <FiSkipForward className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  </Button>
                </div>

                {/* Right: Speed Control */}
                <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2">
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    Speed:
                  </span>
                  <select
                    value={playbackRate}
                    onChange={(e) =>
                      handleSpeedChange(parseFloat(e.target.value))
                    }
                    className="px-1.5 py-0.5 sm:px-2 sm:py-1 text-xs border rounded bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
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
        onCanPlay={handleCanPlay}
        onSeeking={handleSeeking}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />
    </div>
  );
}
