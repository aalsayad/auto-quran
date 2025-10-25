"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  getRecitation,
  getRecitationBookmarks,
  toggleBookmark,
} from "@/lib/supabase-storage";
import { loadAyahs, loadMushafVerses } from "@/lib/local-quran-data";
import { SURAHS } from "@/lib/surah-data";
import { useAudio } from "@/lib/hooks/use-audio";
import AudioPlayer from "@/components/audio-player";
import QuranText from "@/components/quran-text";
import MushafView from "@/components/mushaf-view";
import { Button } from "@/components/ui/button";
import { BookOpen, List, Volume2, VolumeX } from "lucide-react";

interface SavedRecitation {
  id: string;
  name: string;
  surahNumber: number;
  audioUrl: string;
  segments: Array<{
    start: number;
    end: number;
    ayahNumber?: number;
    ayahNumbers?: number[];
  }>;
}

interface Ayah {
  numberInSurah: number;
  text: string;
  translation?: string;
}

interface Verse {
  verse_key: string;
  text: string;
  page_number: number;
  juz_number: number;
  translation?: string;
}

export default function QuranReaderPage() {
  const params = useParams();
  const recitationId = params.recitationId as string;
  const { user, loading: authLoading } = useAuth();

  // State
  const [recitation, setRecitation] = useState<SavedRecitation | null>(null);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [mushafVerses, setMushafVerses] = useState<Verse[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "mushaf">("list");
  const [showTranslation, setShowTranslation] = useState(false);
  const [currentAyahNumbers, setCurrentAyahNumbers] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [bookmarkedAyahs, setBookmarkedAyahs] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // Audio hook
  const {
    audioRef,
    isPlaying,
    currentTime,
    duration,
    volume,
    playbackRate,
    error: audioError,
    play,
    pause,
    seek,
    setVolume,
    setPlaybackRate,
    handleTimeUpdate,
    handleLoadedMetadata,
    handleEnded,
    handleError,
  } = useAudio({
    audioFile,
    onTimeUpdate: (time) => {
      // Find current ayah based on segments
      if (recitation?.segments) {
        const currentSegment = recitation.segments.find(
          (seg) => time >= seg.start && time < seg.end
        );

        if (currentSegment) {
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
          }
        }
      }
    },
    onLoadedMetadata: (dur) => {
      console.log("Audio loaded, duration:", dur);
    },
    onEnded: () => {
      console.log("Audio ended");
    },
  });

  // Load recitation data
  useEffect(() => {
    const loadData = async () => {
      if (authLoading || !user || !recitationId) return;

      try {
        setIsLoading(true);

        // Load recitation
        const recitationData = await getRecitation(recitationId);
        if (!recitationData) {
          console.error("Recitation not found");
          return;
        }
        setRecitation(recitationData);

        // Load ayahs and mushaf verses
        const [ayahsData, mushafData] = await Promise.all([
          loadAyahs(recitationData.surahNumber),
          loadMushafVerses(recitationData.surahNumber),
        ]);

        setAyahs(ayahsData);
        setMushafVerses(mushafData);
        setCurrentPage(mushafData[0]?.page_number || 1);

        // Load bookmarks
        const bookmarks = await getRecitationBookmarks(recitationId);
        setBookmarkedAyahs(bookmarks);

        // Load audio
        if (recitationData.audioUrl) {
          try {
            const response = await fetch(recitationData.audioUrl);
            if (response.ok) {
              const blob = await response.blob();
              const file = new File([blob], "audio.mp3", {
                type: "audio/mpeg",
              });
              setAudioFile(file);
            }
          } catch (error) {
            console.error("Failed to load audio:", error);
          }
        }
      } catch (error) {
        console.error("Failed to load recitation:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [recitationId, user, authLoading]);

  // Event handlers
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const handleAyahClick = useCallback(
    (ayahNumber: number) => {
      if (!recitation?.segments || !audioRef.current) return;

      const segment = recitation.segments.find(
        (seg) =>
          seg.ayahNumbers?.includes(ayahNumber) || seg.ayahNumber === ayahNumber
      );

      if (segment) {
        seek(segment.start);
        if (!isPlaying) {
          play();
        }
      }
    },
    [recitation?.segments, isPlaying, seek, play]
  );

  const handleToggleBookmark = useCallback(
    async (ayahNumber: number) => {
      if (!recitationId) return;

      try {
        await toggleBookmark(recitationId, ayahNumber);
        setBookmarkedAyahs((prev) =>
          prev.includes(ayahNumber)
            ? prev.filter((num) => num !== ayahNumber)
            : [...prev, ayahNumber]
        );
      } catch (error) {
        console.error("Failed to toggle bookmark:", error);
      }
    },
    [recitationId]
  );

  const handleNextAyah = useCallback(() => {
    if (!recitation?.segments || currentAyahNumbers.length === 0) return;

    const currentIndex = recitation.segments.findIndex(
      (seg) =>
        seg.ayahNumbers?.some((num) => currentAyahNumbers.includes(num)) ||
        (seg.ayahNumber !== undefined &&
          currentAyahNumbers.includes(seg.ayahNumber))
    );

    if (currentIndex < recitation.segments.length - 1) {
      const nextSegment = recitation.segments[currentIndex + 1];
      seek(nextSegment.start);
      if (!isPlaying) {
        play();
      }
    }
  }, [recitation?.segments, currentAyahNumbers, isPlaying, seek, play]);

  const handlePrevAyah = useCallback(() => {
    if (!recitation?.segments || currentAyahNumbers.length === 0) return;

    const currentIndex = recitation.segments.findIndex(
      (seg) =>
        seg.ayahNumbers?.some((num) => currentAyahNumbers.includes(num)) ||
        (seg.ayahNumber !== undefined &&
          currentAyahNumbers.includes(seg.ayahNumber))
    );

    if (currentIndex > 0) {
      const prevSegment = recitation.segments[currentIndex - 1];
      seek(prevSegment.start);
      if (!isPlaying) {
        play();
      }
    }
  }, [recitation?.segments, currentAyahNumbers, isPlaying, seek, play]);

  if (
    isLoading ||
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{recitation.name}</h1>
              <p className="text-sm text-muted-foreground">
                {surahInfo?.name} ({surahInfo?.englishName})
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4 mr-1" />
                List
              </Button>
              <Button
                variant={viewMode === "mushaf" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("mushaf")}
              >
                <BookOpen className="h-4 w-4 mr-1" />
                Mushaf
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Audio Player */}
        <div className="mb-6">
          <AudioPlayer
            audioFile={audioFile}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            playbackRate={playbackRate}
            onPlayPause={handlePlayPause}
            onTimeChange={seek}
            onVolumeChange={setVolume}
            onSpeedChange={setPlaybackRate}
            onNext={handleNextAyah}
            onPrev={handlePrevAyah}
            onRepeat={() => {}}
            audioLoadError={audioError}
            isFetchingAudio={false}
          />
        </div>

        {/* Translation Toggle */}
        <div className="mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTranslation(!showTranslation)}
          >
            {showTranslation ? (
              <>
                <VolumeX className="h-4 w-4 mr-1" />
                Hide Translation
              </>
            ) : (
              <>
                <Volume2 className="h-4 w-4 mr-1" />
                Show Translation
              </>
            )}
          </Button>
        </div>

        {/* Content */}
        {viewMode === "list" ? (
          <QuranText
            ayahs={ayahs}
            currentAyahNumbers={currentAyahNumbers}
            showTranslation={showTranslation}
            onAyahClick={handleAyahClick}
            onToggleBookmark={handleToggleBookmark}
            bookmarkedAyahs={bookmarkedAyahs}
          />
        ) : (
          <MushafView
            mushafVerses={mushafVerses}
            currentPage={currentPage}
            showTranslation={showTranslation}
            onPageChange={setCurrentPage}
            onAyahClick={handleAyahClick}
          />
        )}
      </div>

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
        playsInline
        webkit-playsinline="true"
        preload="metadata"
      />
    </div>
  );
}
