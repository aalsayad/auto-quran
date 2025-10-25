"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SavedRecitation } from "@/lib/types";
import TopNavbar from "@/components/top-navbar";
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
  FiSkipBack,
  FiSkipForward,
  FiRepeat,
  FiRotateCw,
  FiBook,
  FiVolume2,
  FiVolume,
  FiVolume1,
  FiVolumeX,
  FiBookmark,
  FiMoreVertical,
  FiClock,
  FiChevronLeft,
  FiChevronRight,
  FiTrash2,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
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
  const { user, loading: authLoading } = useAuth();

  const [recitation, setRecitation] = useState<SavedRecitation | null>(null);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [mushafVerses, setMushafVerses] = useState<Verse[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "mushaf">("list");
  const [showTranslation, setShowTranslation] = useState(() => {
    // Load translation preference from localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showTranslation");
      return saved === "true";
    }
    return false;
  });
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentAyahNumbers, setCurrentAyahNumbers] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      if (audioRef.current?.src && audioRef.current.src.startsWith("blob:")) {
        console.log("🧹 Cleaning up blob URL on unmount");
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  // Keep ref in sync with state for stable access in event handlers
  useEffect(() => {
    currentAyahNumbersRef.current = currentAyahNumbers;
  }, [currentAyahNumbers]);

  // Save translation preference to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("showTranslation", String(showTranslation));
    }
  }, [showTranslation]);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFetchingAudio, setIsFetchingAudio] = useState(false);
  const [isLoadingRecitation, setIsLoadingRecitation] = useState(true);
  const [isLooping, setIsLooping] = useState(false);
  const [isLoopingAyah, setIsLoopingAyah] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [savedAyahNumbers, setSavedAyahNumbers] = useState<number[]>([]); // Track where user left off
  const [showSavedIndicator, setShowSavedIndicator] = useState(true); // Control saved position indicator
  const [bookmarkedAyahs, setBookmarkedAyahs] = useState<number[]>([]); // Track bookmarked ayahs
  const [bookmarksDetailed, setBookmarksDetailed] = useState<Bookmark[]>([]); // Track detailed bookmark info for dropdown

  // Navigation dialog state
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);
  const [navigationMode, setNavigationMode] = useState<"ayah" | "page">("page");
  const [selectedAyah, setSelectedAyah] = useState(1);
  const [selectedPage, setSelectedPage] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const audioRef = useRef<HTMLAudioElement>(null);
  const ayahRefs = useRef<(HTMLDivElement | HTMLSpanElement | null)[]>([]);
  const volumeRef = useRef<HTMLDivElement>(null);
  const audioLoadedRef = useRef(false); // Track if audio has been loaded in this session
  const savedPositionTimeRef = useRef<number>(0); // Store the exact time to restore to (for manual jump only)
  const previousAyahRef = useRef<number | null>(null); // Track previous ayah to detect changes
  const playPromiseRef = useRef<Promise<void> | null>(null); // Track ongoing play promise
  const currentAyahNumbersRef = useRef<number[]>([]); // Track current ayah numbers for stable reference

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

    // Validate URL
    if (!url || url.trim() === "") {
      console.error("❌ [Reader] No audio URL provided");
      alert(
        "This recitation has no audio file. Please upload audio in the editor."
      );
      return null;
    }

    try {
      setIsFetchingAudio(true);
      console.log("📻 [Reader] Loading audio from S3...");
      console.log("📻 [Reader] Audio URL:", url);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch audio from S3 (Status: ${response.status})`
        );
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
      console.error("❌ [Reader] Attempted URL:", url);
      alert(
        "Failed to load audio from cloud storage. The file may have been deleted or is inaccessible."
      );
      return null;
    } finally {
      setIsFetchingAudio(false);
    }
  }, []);

  // Load recitation
  useEffect(() => {
    const loadRecitationData = async () => {
      // Wait for auth to finish loading
      if (authLoading) {
        console.log("⏳ [Reader] Waiting for auth to load...");
        return;
      }

      if (!user) {
        alert("Please sign in to access this recitation");
        setIsLoadingRecitation(false);
        return;
      }

      setIsLoadingRecitation(true);

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

        // Load both List and Mushaf data in parallel for speed
        const [versesData, mushafData] = await Promise.all([
          getVersesBySurah(surahNumber),
          getMushafPagesForSurah(surahNumber),
        ]);

        // Process and set List View data
        const formattedAyahs: Ayah[] = versesData.map((v) => {
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

        // Set Mushaf data and initial page immediately
        console.log(`📖 Loaded ${mushafData.length} verses for Mushaf view`);
        if (mushafData.length > 0) {
          const firstPage = mushafData[0].page_number;
          if (firstPage) {
            setCurrentPage(firstPage);
            console.log(`📄 Set initial page to ${firstPage}`);
          }
        }
        setMushafVerses(mushafData);

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
            getRecitationBookmarks(user.id, recitationId).then((bookmarks) => {
              setBookmarkedAyahs(bookmarks);
              console.log("🔖 [Reader] Loaded bookmarks:", bookmarks);
            });
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

        // Mark loading as complete
        setIsLoadingRecitation(false);
        console.log("✅ [Reader] Recitation data loaded successfully");
      }
    };

    loadRecitationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recitationId, user, authLoading]);

  // Scroll to ayah with offset for navbar (mobile-friendly)
  const scrollToAyah = useCallback(
    (ayahNumberInSurah: number) => {
      const ayahIndex = ayahs.findIndex(
        (a) => a.numberInSurah === ayahNumberInSurah
      );
      if (ayahIndex !== -1 && ayahRefs.current[ayahIndex]) {
        const element = ayahRefs.current[ayahIndex];
        const navbarHeight = 180; // Approximate height of sticky header + navigation
        const elementPosition =
          element.getBoundingClientRect().top + window.pageYOffset;
        const offsetPosition = elementPosition - navbarHeight;

        window.scrollTo({
          top: offsetPosition,
          behavior: "smooth",
        });
      }
    },
    [ayahs]
  );

  // Auto-follow currently playing ayah ONLY when ayah changes during playback
  useEffect(() => {
    if (
      currentAyahNumbers.length > 0 &&
      mushafVerses.length > 0 &&
      ayahs.length > 0 &&
      isPlaying
    ) {
      const firstAyahNum = currentAyahNumbers[0];

      // Only proceed if the ayah actually changed
      if (previousAyahRef.current !== firstAyahNum) {
        previousAyahRef.current = firstAyahNum;

        const ayah = ayahs.find((a) => a.numberInSurah === firstAyahNum);
        if (ayah) {
          const verse = mushafVerses.find((v) => {
            const ayahNumInVerse = parseInt(v.verse_key.split(":")[1]);
            return ayahNumInVerse === ayah.numberInSurah;
          });

          // Change page if needed
          if (verse?.page_number && verse.page_number !== currentPage) {
            setCurrentPage(verse.page_number);
            // Wait for page to render before scrolling
            setTimeout(() => {
              scrollToAyah(firstAyahNum);
            }, 100);
          } else {
            // Same page, just scroll to the ayah
            scrollToAyah(firstAyahNum);
          }
        }
      }
    } else if (
      !isPlaying &&
      mushafVerses.length > 0 &&
      mushafVerses[0]?.page_number &&
      currentPage === 1
    ) {
      // Default to first page of surah only on initial load
      setCurrentPage(mushafVerses[0].page_number);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentAyahNumbers,
    mushafVerses,
    ayahs,
    currentPage,
    isPlaying,
    // scrollToAyah is stable (only depends on ayahs)
  ]);

  // Audio event handlers
  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      const time = audioRef.current.currentTime;
      setCurrentTime(time);

      // Find current ayah based on recitation segments
      if (recitation?.segments) {
        // For ayah looping, we need to check if we're past a segment end
        // BEFORE we try to find the current segment (which would fail if time >= seg.end)
        const currentAyahs = currentAyahNumbersRef.current;
        if (isLoopingAyah && currentAyahs.length > 0) {
          const loopSegment = recitation.segments.find(
            (seg: {
              ayahNumbers?: number[];
              ayahNumber?: number;
              start: number;
              end: number;
            }) =>
              seg.ayahNumbers?.some((num: number) =>
                currentAyahs.includes(num)
              ) ||
              (seg.ayahNumber !== undefined &&
                currentAyahs.includes(seg.ayahNumber))
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
              safePlay();
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
                const navbarHeight = 180;
                const isInView =
                  rect.top >= navbarHeight && rect.bottom <= window.innerHeight;

                // Only scroll if element is not in view
                if (!isInView) {
                  scrollToAyah(firstAyahNum);
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
    // scrollToAyah and safePlay are stable callbacks (defined with useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recitation?.segments, isLoopingAyah, ayahs]);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  }, []);

  // Handle when audio is ready to play
  const handleCanPlay = useCallback(() => {
    if (!audioRef.current) return;

    // Don't auto-restore position - let user manually click the red marker or "Last Played" button
    console.log("✅ [Reader] Audio ready to play (no auto-restore)");
  }, []);

  // Handle seeking events (no auto-restore)
  const handleSeeking = useCallback(() => {
    // Allow free seeking - no auto-restore
  }, []);

  // Safe play function that properly handles promises
  const safePlay = useCallback(async () => {
    if (!audioRef.current) return;

    try {
      // Wait for any existing play promise to complete first
      if (playPromiseRef.current !== null) {
        await playPromiseRef.current;
      }

      // Start new play and track the promise
      playPromiseRef.current = audioRef.current.play();
      await playPromiseRef.current;

      // Clear the promise after it completes
      playPromiseRef.current = null;
      setIsPlaying(true);
    } catch (error) {
      console.warn("Play interrupted:", error);
      playPromiseRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  // Safe pause function that waits for play promise
  const safePause = useCallback(async () => {
    if (!audioRef.current) return;

    try {
      // Wait for any ongoing play promise before pausing
      if (playPromiseRef.current !== null) {
        await playPromiseRef.current;
      }

      audioRef.current.pause();
      setIsPlaying(false);
    } catch (error) {
      console.warn("Pause after play completion:", error);
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handlePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        safePause();
      } else {
        safePlay();
        // Hide the saved indicator once user starts playing from any position
        setShowSavedIndicator(false);
      }
    }
  }, [isPlaying, safePlay, safePause]);

  const handleEnded = useCallback(() => {
    const currentAyahs = currentAyahNumbersRef.current;
    if (isLoopingAyah && recitation?.segments && currentAyahs.length > 0) {
      const currentSegment = recitation.segments.find(
        (seg: {
          ayahNumbers?: number[];
          ayahNumber?: number;
          start: number;
          end: number;
        }) =>
          seg.ayahNumbers?.some((num: number) => currentAyahs.includes(num)) ||
          (seg.ayahNumber !== undefined &&
            currentAyahs.includes(seg.ayahNumber))
      );
      if (currentSegment && audioRef.current) {
        audioRef.current.currentTime = currentSegment.start;
        safePlay();
      }
    } else {
      setIsPlaying(false);
    }
  }, [isLoopingAyah, recitation?.segments, safePlay]);

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
    const currentAyahs = currentAyahNumbersRef.current;
    if (!recitation?.segments || currentAyahs.length === 0) return;

    const currentIndex = recitation.segments.findIndex(
      (seg: { ayahNumbers?: number[]; ayahNumber?: number }) =>
        seg.ayahNumbers?.some((num: number) => currentAyahs.includes(num)) ||
        (seg.ayahNumber !== undefined && currentAyahs.includes(seg.ayahNumber))
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
        safePlay();
      }
    }
  };

  const handlePrevAyah = () => {
    const currentAyahs = currentAyahNumbersRef.current;
    if (!recitation?.segments || currentAyahs.length === 0) return;

    const currentIndex = recitation.segments.findIndex(
      (seg: { ayahNumbers?: number[]; ayahNumber?: number }) =>
        seg.ayahNumbers?.some((num: number) => currentAyahs.includes(num)) ||
        (seg.ayahNumber !== undefined && currentAyahs.includes(seg.ayahNumber))
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
        safePlay();
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
        safePlay();
      }
    }
  };

  // Page-based navigation (like Mushaf)
  const handleNextPage = () => {
    if (!mushafVerses.length) return;
    const nextPageNum = currentPage + 1;
    // Check if there are verses on the next page for this surah
    const hasNextPage = mushafVerses.some((v) => v.page_number === nextPageNum);
    if (hasNextPage) {
      setCurrentPage(nextPageNum);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handlePrevPage = () => {
    if (!mushafVerses.length) return;
    const prevPageNum = currentPage - 1;
    // Check if there are verses on the previous page for this surah
    const hasPrevPage = mushafVerses.some((v) => v.page_number === prevPageNum);
    if (hasPrevPage && prevPageNum >= 1) {
      setCurrentPage(prevPageNum);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Navigate to ayah/page from dialog
  const handleNavigate = () => {
    if (navigationMode === "ayah") {
      // Navigate to specific ayah
      const ayahNum = selectedAyah;
      if (ayahNum >= 1 && ayahNum <= ayahs.length) {
        // Find which page this ayah is on
        const ayah = ayahs.find((a) => a.numberInSurah === ayahNum);
        if (ayah) {
          const verse = mushafVerses.find((v) => {
            const ayahNumInVerse = parseInt(v.verse_key.split(":")[1]);
            return ayahNumInVerse === ayah.numberInSurah;
          });

          if (verse?.page_number) {
            // Update page first
            setCurrentPage(verse.page_number);
            // Then scroll to ayah after page renders
            setTimeout(() => {
              scrollToAyah(ayahNum);
            }, 100);
          }
        }
        setShowNavigationDialog(false);
      }
    } else if (navigationMode === "page") {
      // Navigate to specific page
      const pageNum = selectedPage;
      // Check if this page has verses from this surah
      const hasVerses = mushafVerses.some((v) => v.page_number === pageNum);

      if (hasVerses) {
        setCurrentPage(pageNum);
        // Scroll to top after page change
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }, 100);
        setShowNavigationDialog(false);
      }
    }
  };

  // Format relative date/time for bookmarks
  const formatBookmarkDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (diffInDays === 0) {
      return `Today at ${timeStr}`;
    } else if (diffInDays === 1) {
      return `Yesterday at ${timeStr}`;
    } else {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
  };

  // Delete a bookmark
  const handleDeleteBookmark = async (
    bookmarkId: string,
    ayahNumber: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation(); // Prevent jumping to ayah when deleting
    if (!user || !recitationId) return;

    // Optimistically update UI
    setBookmarkedAyahs(bookmarkedAyahs.filter((num) => num !== ayahNumber));
    setBookmarksDetailed(bookmarksDetailed.filter((b) => b.id !== bookmarkId));

    // Delete from Supabase
    const result = await toggleBookmark(
      user.id,
      recitationId,
      ayahNumber,
      true
    ); // true = remove

    if (!result.success) {
      // Revert on error
      setBookmarkedAyahs(
        [...bookmarkedAyahs, ayahNumber].sort((a, b) => a - b)
      );
      // Refresh detailed bookmarks
      const detailedBookmarks = await getRecitationBookmarksDetailed(
        user.id,
        recitationId
      );
      setBookmarksDetailed(detailedBookmarks);
      alert("Failed to delete bookmark");
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
    const segment = recitation.segments.find((seg) => {
      if (seg.ayahNumbers) {
        return seg.ayahNumbers.includes(ayahNumber);
      } else if (seg.ayahNumber) {
        return seg.ayahNumber === ayahNumber;
      }
      return false;
    });

    if (!segment) {
      console.warn("No segment found for ayah:", ayahNumber);
      return;
    }

    // Set audio to the start of this segment
    audioRef.current.currentTime = segment.start;
    const ayahNums =
      segment.ayahNumbers || (segment.ayahNumber ? [segment.ayahNumber] : []);
    setCurrentAyahNumbers(ayahNums);

    // Find which page this ayah is on and navigate there, then scroll
    const ayah = ayahs.find((a) => a.numberInSurah === ayahNumber);
    if (ayah) {
      const verse = mushafVerses.find((v) => {
        const ayahNumInVerse = parseInt(v.verse_key.split(":")[1]);
        return ayahNumInVerse === ayah.numberInSurah;
      });
      if (verse?.page_number && verse.page_number !== currentPage) {
        setCurrentPage(verse.page_number);
        setTimeout(() => {
          scrollToAyah(ayahNumber);
        }, 100);
      } else {
        scrollToAyah(ayahNumber);
      }
    }

    // Auto-play after jumping
    safePlay();
  };

  // Jump to last played position
  const handleJumpToLastPlayed = () => {
    if (!audioRef.current || savedPositionTimeRef.current === 0) return;

    audioRef.current.currentTime = savedPositionTimeRef.current;
    setCurrentAyahNumbers(savedAyahNumbers);

    // Find which page this ayah is on and navigate there, then scroll
    if (savedAyahNumbers.length > 0) {
      const firstSavedAyah = savedAyahNumbers[0];
      const ayah = ayahs.find((a) => a.numberInSurah === firstSavedAyah);
      if (ayah) {
        const verse = mushafVerses.find((v) => {
          const ayahNumInVerse = parseInt(v.verse_key.split(":")[1]);
          return ayahNumInVerse === ayah.numberInSurah;
        });
        if (verse?.page_number && verse.page_number !== currentPage) {
          setCurrentPage(verse.page_number);
          setTimeout(() => {
            scrollToAyah(firstSavedAyah);
          }, 100);
        } else {
          scrollToAyah(firstSavedAyah);
        }
      }
    }

    // Hide the saved indicator after jumping
    setShowSavedIndicator(false);

    // Auto-play after jumping
    safePlay();
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

  if (
    isLoadingRecitation ||
    !recitation ||
    ayahs.length === 0 ||
    mushafVerses.length === 0
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
        {/* Top Navbar */}
        <TopNavbar />

        {/* Recitation Header */}
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

            {/* Edit Button */}
            <Link href={`/editor/${recitation.id}`}>
              <Button
                variant="outline"
                className="cursor-pointer gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-2"
              >
                <FiEdit className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>Edit</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Bottom Navigation Bar - Same style as Mushaf */}
        <div className="border-t bg-background">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              {/* Spacer for alignment */}
              <div className="w-10"></div>

              {/* Navigation Controls - Always Centered */}
              <div className="flex items-center gap-1">
                {/* Left: Next button (RTL) */}
                <Button
                  onClick={handleNextPage}
                  disabled={
                    !mushafVerses.length ||
                    !mushafVerses.some((v) => v.page_number === currentPage + 1)
                  }
                  variant="outline"
                  size="sm"
                  className="cursor-pointer px-2 sm:px-3"
                >
                  <FiChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Next</span>
                </Button>

                {/* Center: Navigation Dialog */}
                <Dialog
                  open={showNavigationDialog}
                  onOpenChange={setShowNavigationDialog}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer px-3 sm:px-6"
                    >
                      <span className="text-sm whitespace-nowrap">
                        {surahInfo?.transliteration} • Pg {currentPage}
                      </span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>
                        Navigate {surahInfo?.transliteration}
                      </DialogTitle>
                      <DialogDescription>
                        Navigate within this recitation
                      </DialogDescription>
                    </DialogHeader>

                    <Tabs
                      value={navigationMode}
                      onValueChange={(v) =>
                        setNavigationMode(v as "ayah" | "page")
                      }
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="ayah">Ayah</TabsTrigger>
                        <TabsTrigger value="page">Page</TabsTrigger>
                      </TabsList>

                      {/* Ayah Tab */}
                      <TabsContent value="ayah" className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            Ayah Number
                          </label>
                          <Input
                            type="number"
                            placeholder={`1-${ayahs.length}`}
                            value={selectedAyah}
                            onChange={(e) =>
                              setSelectedAyah(parseInt(e.target.value) || 1)
                            }
                            min={1}
                            max={ayahs.length}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            This surah has {ayahs.length} ayahs
                          </p>
                        </div>
                      </TabsContent>

                      {/* Page Tab */}
                      <TabsContent value="page" className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            Page Number
                          </label>
                          <Input
                            type="number"
                            placeholder="Enter page number"
                            value={selectedPage}
                            onChange={(e) =>
                              setSelectedPage(parseInt(e.target.value) || 1)
                            }
                            min={1}
                            max={604}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Jump to any page within this surah
                          </p>
                        </div>
                      </TabsContent>
                    </Tabs>

                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setShowNavigationDialog(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleNavigate}>Navigate</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                {/* Right: Previous button (RTL) */}
                <Button
                  onClick={handlePrevPage}
                  disabled={
                    !mushafVerses.length ||
                    !mushafVerses.some((v) => v.page_number === currentPage - 1)
                  }
                  variant="outline"
                  size="sm"
                  className="cursor-pointer px-2 sm:px-3"
                >
                  <span className="hidden sm:inline mr-1">Previous</span>
                  <FiChevronRight className="h-4 w-4" />
                </Button>
              </div>

              {/* Far Right: Options Menu */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer h-auto p-2 aspect-square"
                  >
                    <FiMoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64"
                  sideOffset={8}
                >
                  {/* View Mode Toggle */}
                  <DropdownMenuLabel>View Mode</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setViewMode("list")}
                    className="cursor-pointer"
                  >
                    {viewMode === "list" && "✓ "}
                    List View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setViewMode("mushaf")}
                    className="cursor-pointer"
                  >
                    {viewMode === "mushaf" && "✓ "}
                    Mushaf View
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* Translation Toggle */}
                  {viewMode === "list" && (
                    <>
                      <DropdownMenuItem
                        onClick={() => setShowTranslation(!showTranslation)}
                        className="cursor-pointer"
                      >
                        <FiBook className="mr-2 h-4 w-4" />
                        {showTranslation ? "Hide" : "Show"} Translation
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {/* Last Played Position */}
                  {savedAyahNumbers.length > 0 && showSavedIndicator && (
                    <>
                      <DropdownMenuLabel className="text-red-600">
                        Last Played
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={handleJumpToLastPlayed}
                      >
                        <FiClock className="mr-2 h-4 w-4 text-red-500" />
                        <div className="flex flex-col">
                          <span>Ayah {savedAyahNumbers.join(", ")}</span>
                          <span className="text-xs text-muted-foreground">
                            Click to continue
                          </span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {/* Bookmarks */}
                  {bookmarksDetailed.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-purple-600">
                        Bookmarks ({bookmarksDetailed.length})
                      </DropdownMenuLabel>
                      <div className="max-h-48 overflow-y-auto">
                        {bookmarksDetailed.map((bookmark) => (
                          <DropdownMenuItem
                            key={bookmark.id}
                            className="cursor-pointer flex items-center justify-between group"
                            onClick={() =>
                              handleJumpToAyah(bookmark.ayah_number)
                            }
                          >
                            <div className="flex items-center flex-1 min-w-0">
                              <FiBookmark className="mr-2 h-4 w-4 text-purple-500 fill-current shrink-0" />
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="font-medium">
                                  Ayah {bookmark.ayah_number}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {formatBookmarkDate(bookmark.created_at)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) =>
                                handleDeleteBookmark(
                                  bookmark.id,
                                  bookmark.ayah_number,
                                  e
                                )
                              }
                              className="ml-2 p-1 rounded hover:bg-red-100 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              title="Delete bookmark"
                            >
                              <FiTrash2 className="h-3.5 w-3.5" />
                            </button>
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

      {/* Quran Text */}
      <div className="w-full px-2 sm:px-4 py-8">
        <div
          className={
            viewMode === "mushaf" ? "max-w-full mx-auto" : "max-w-4xl mx-auto"
          }
        >
          {/* Surah Header - Only show on first page of surah */}
          {(() => {
            // Check if current page is the first page of this surah
            const firstPageOfSurah = mushafVerses[0]?.page_number || 1;
            const isFirstPage = currentPage === firstPageOfSurah;

            if (!isFirstPage) return null;

            return (
              <div className="text-center mb-8 pb-8 border-b">
                <h2 className={`text-4xl font-bold mb-2 ${amiri.className}`}>
                  سُورَةُ {surahInfo?.name}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {surahInfo?.transliteration} • {surahInfo?.ayahs} Ayahs
                </p>
                {recitation.surahNumber !== 1 &&
                  recitation.surahNumber !== 9 && (
                    <p
                      className={`text-xl sm:text-2xl md:text-3xl mt-6 ${amiri.className}`}
                      dir="rtl"
                      lang="ar"
                    >
                      بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                    </p>
                  )}
              </div>
            );
          })()}

          {/* LIST VIEW: Page-by-page ayah rendering */}
          {viewMode === "list" && (
            <div>
              {(() => {
                // Filter ayahs to only show those on the current page
                // Match by verse_key (e.g., "2:1") - extract ayah number from it
                const ayahsOnCurrentPage = ayahs.filter((ayah) => {
                  const verse = mushafVerses.find((v) => {
                    // verse_key format: "surahNumber:ayahNumber"
                    const ayahNumInVerse = parseInt(v.verse_key.split(":")[1]);
                    return ayahNumInVerse === ayah.numberInSurah;
                  });
                  return verse?.page_number === currentPage;
                });

                if (ayahsOnCurrentPage.length === 0) {
                  return (
                    <p className="text-center text-muted-foreground py-8">
                      No verses on this page for this surah. (Page {currentPage}
                      )
                    </p>
                  );
                }

                return ayahsOnCurrentPage.map((ayah) => {
                  const isActive = currentAyahNumbers.includes(
                    ayah.numberInSurah
                  );
                  const isSavedPosition =
                    savedAyahNumbers.includes(ayah.numberInSurah) &&
                    showSavedIndicator;
                  const isBookmarked = bookmarkedAyahs.includes(
                    ayah.numberInSurah
                  );

                  // Get the original index from the full ayahs array for proper ref tracking
                  const originalIndex = ayahs.findIndex(
                    (a) => a.number === ayah.number
                  );

                  return (
                    <div
                      key={ayah.number}
                      ref={(el) => {
                        if (originalIndex !== -1) {
                          ayahRefs.current[originalIndex] = el;
                        }
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
                        <div className="absolute -left-2 bottom-6 bg-red-500 text-white text-xs px-2 py-1 rounded-r shadow-sm flex items-center gap-1">
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
                });
              })()}
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
                  // Only show verses for the current page
                  const versesOnCurrentPage = mushafVerses.filter(
                    (v) => v.page_number === currentPage
                  );

                  if (versesOnCurrentPage.length === 0) {
                    return (
                      <p className="text-center text-muted-foreground py-8">
                        No verses on this page for this surah.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      <div className="text-center text-sm text-muted-foreground mb-4 pb-2 border-b">
                        صفحة {toArabicNumerals(currentPage)}
                      </div>

                      {/* Group by line number within page */}
                      {(() => {
                        const lineGroups: Record<number, Verse[]> = {};
                        versesOnCurrentPage.forEach((v) => {
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
                  );
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
                      if (audioRef.current && recitation?.segments) {
                        const newTime = parseFloat(e.target.value);
                        audioRef.current.currentTime = newTime;

                        // Find which ayah this time corresponds to
                        const segment = recitation.segments.find(
                          (seg: {
                            start: number;
                            end: number;
                            ayahNumbers?: number[];
                            ayahNumber?: number;
                          }) => newTime >= seg.start && newTime <= seg.end
                        );

                        if (segment) {
                          const ayahNums =
                            segment.ayahNumbers ||
                            (segment.ayahNumber ? [segment.ayahNumber] : []);

                          if (ayahNums.length > 0) {
                            const firstAyahNum = ayahNums[0];
                            setCurrentAyahNumbers(ayahNums);

                            // Find which page this ayah is on and navigate there
                            const ayah = ayahs.find(
                              (a) => a.numberInSurah === firstAyahNum
                            );
                            if (ayah) {
                              const verse = mushafVerses.find((v) => {
                                const ayahNumInVerse = parseInt(
                                  v.verse_key.split(":")[1]
                                );
                                return ayahNumInVerse === ayah.numberInSurah;
                              });

                              if (
                                verse?.page_number &&
                                verse.page_number !== currentPage
                              ) {
                                setCurrentPage(verse.page_number);
                                setTimeout(() => {
                                  scrollToAyah(firstAyahNum);
                                }, 100);
                              } else if (verse?.page_number) {
                                scrollToAyah(firstAyahNum);
                              }
                            }
                          }
                        }
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

                  {/* Last played position marker (red line) */}
                  {savedPositionTimeRef.current > 0 && duration > 0 && (
                    <div
                      className="absolute top-0 w-1 h-2 bg-red-500 rounded-full pointer-events-auto cursor-pointer hover:w-1.5 transition-all"
                      style={{
                        left: `${
                          (savedPositionTimeRef.current / duration) * 100
                        }%`,
                      }}
                      title={`Last played: ${Math.floor(
                        savedPositionTimeRef.current / 60
                      )}:${String(
                        Math.floor(savedPositionTimeRef.current % 60)
                      ).padStart(2, "0")}`}
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.currentTime =
                            savedPositionTimeRef.current;
                          setCurrentAyahNumbers(savedAyahNumbers);
                          // Also jump to that page and scroll
                          if (savedAyahNumbers.length > 0) {
                            const firstSavedAyah = savedAyahNumbers[0];
                            const ayah = ayahs.find(
                              (a) => a.numberInSurah === firstSavedAyah
                            );
                            if (ayah) {
                              const verse = mushafVerses.find((v) => {
                                const ayahNumInVerse = parseInt(
                                  v.verse_key.split(":")[1]
                                );
                                return ayahNumInVerse === ayah.numberInSurah;
                              });
                              if (
                                verse?.page_number &&
                                verse.page_number !== currentPage
                              ) {
                                setCurrentPage(verse.page_number);
                                setTimeout(() => {
                                  scrollToAyah(firstSavedAyah);
                                }, 100);
                              } else {
                                scrollToAyah(firstSavedAyah);
                              }
                            }
                          }
                        }
                      }}
                    />
                  )}
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
