"use client";

import { useState, useEffect, useRef, useLayoutEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SURAHS } from "@/lib/surah-data";
import { useAuth } from "@/contexts/auth-context";
import TopNavbar from "@/components/top-navbar";
import {
  getAllMushafPages,
  getMushafPage,
  getPageForSurah,
  getAllSurahs,
  type Verse,
  type Surah,
  type Word,
} from "@/lib/local-quran-data";
import {
  getPageBookmarks,
  toggleMushafBookmark,
  getMushafBookmarks,
  type MushafBookmark,
} from "@/lib/mushaf-bookmark-manager";
import { Amiri } from "next/font/google";
import {
  FiBook,
  FiBookmark,
  FiChevronLeft,
  FiChevronRight,
  FiMoreVertical,
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

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const amiri = Amiri({ subsets: ["arabic"], weight: ["400", "700"] });

function StandaloneMushafPageContent() {
  const searchParams = useSearchParams();
  const initialSurah = searchParams.get("surah");
  const { user } = useAuth();

  const [allSurahs, setAllSurahs] = useState<Surah[]>([]);
  const [allPages, setAllPages] = useState<Record<string, Verse[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentSurah, setCurrentSurah] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages] = useState(604);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "mushaf">("list");
  const [showTranslation, setShowTranslation] = useState(() => {
    // Load translation preference from localStorage
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showTranslation");
      return saved === "true";
    }
    return false;
  });
  const [bookmarkedAyahs, setBookmarkedAyahs] = useState<number[]>([]);
  const [bookmarksDetailed, setBookmarksDetailed] = useState<MushafBookmark[]>(
    []
  );
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);
  const [navigationMode, setNavigationMode] = useState<
    "surah" | "juz" | "page"
  >("page");
  const [selectedSurah, setSelectedSurah] = useState(1);
  const [selectedJuz, setSelectedJuz] = useState(1);
  const [selectedPage, setSelectedPage] = useState(1);
  const [selectedAyah, setSelectedAyah] = useState("");

  // Swipe detection
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Refs for auto-scaling lines on mobile
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Save translation preference to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("showTranslation", String(showTranslation));
    }
  }, [showTranslation]);

  // Load data progressively for instant navigation
  useEffect(() => {
    const loadData = async () => {
      console.log("📖 Loading Mushaf...");

      // Load surahs first (tiny file, needed for navigation)
      const surahs = await getAllSurahs();
      setAllSurahs(surahs);

      // Get starting page
      const savedPage = localStorage.getItem("mushaf-last-page");
      const startPage = savedPage ? parseInt(savedPage) : 1;

      // Load current page FIRST for instant display
      const currentPageData = await getMushafPage(startPage);
      setAllPages({ [startPage]: currentPageData });
      setIsLoading(false); // Show UI NOW!
      console.log(`✅ Ready! (Page ${startPage})`);

      // Load ALL pages in background (stays in memory, not localStorage)
      setTimeout(async () => {
        console.log("📥 Loading all pages in background...");
        const allPagesData = await getAllMushafPages();
        setAllPages(allPagesData);
        console.log("✅ All 604 pages loaded! Navigation is instant now.");
      }, 100);
    };
    loadData();
  }, []);

  // Initialize page based on query param
  useEffect(() => {
    const initPage = async () => {
      if (initialSurah) {
        const surahNum = parseInt(initialSurah);
        if (surahNum >= 1 && surahNum <= 114) {
          const firstPage = await getPageForSurah(surahNum);
          setCurrentSurah(surahNum);
          setCurrentPage(firstPage);
        }
      } else {
        // Load saved position or default to page 1
        const savedPage = localStorage.getItem("mushaf-last-page");
        if (savedPage) {
          const page = parseInt(savedPage);
          if (page >= 1 && page <= 604) {
            setCurrentPage(page);
          }
        }
      }
    };
    initPage();
  }, [initialSurah]);

  // Update verses when page changes (instant once loaded)
  useEffect(() => {
    if (Object.keys(allPages).length > 0) {
      const pageVerses = allPages[currentPage.toString()] || [];
      setVerses(pageVerses);
    }
  }, [currentPage, allPages]);

  // Save last position
  useEffect(() => {
    localStorage.setItem("mushaf-last-page", currentPage.toString());
  }, [currentPage]);

  // Load bookmarks for current page
  useEffect(() => {
    const loadBookmarks = async () => {
      if (!user) return;
      const pageBookmarks = await getPageBookmarks(user.id, currentPage);
      setBookmarkedAyahs(pageBookmarks);
    };
    loadBookmarks();
  }, [user, currentPage]);

  // Load all bookmarks
  useEffect(() => {
    const loadAllBookmarks = async () => {
      if (!user) return;
      const allBookmarks = await getMushafBookmarks(user.id);
      setBookmarksDetailed(allBookmarks);
    };
    loadAllBookmarks();
  }, [user]);

  // Detect surah for current page
  useEffect(() => {
    if (verses.length > 0 && verses[0].verse_key) {
      const [chapterNum] = verses[0].verse_key.split(":").map(Number);
      const surahInfo = SURAHS.find((s) => s.number === chapterNum);
      if (surahInfo) {
        setCurrentSurah(surahInfo.number);
      }
    }
  }, [verses]);

  // Auto-scale mushaf lines to fit mobile screen width
  // Use ONE scale for ALL lines based on the longest line
  useLayoutEffect(() => {
    if (viewMode !== "mushaf") return;

    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    // Step 1: Find the longest line (max content width)
    let maxContentWidth = 0;
    let containerWidth = 0;

    lineRefs.current.forEach((lineEl) => {
      if (!lineEl) return;

      const container = lineEl.parentElement;
      if (!container) return;

      // Get container width (same for all)
      if (containerWidth === 0) {
        containerWidth = container.clientWidth;
      }

      // Measure this line's content width
      const contentWidth = lineEl.scrollWidth;
      if (contentWidth > maxContentWidth) {
        maxContentWidth = contentWidth;
      }
    });

    // Step 2: Calculate ONE scale based on the longest line
    let globalScale = 1;
    if (maxContentWidth > containerWidth) {
      // Leave 48px padding (24px on each side) from screen edges
      globalScale = (containerWidth - 48) / maxContentWidth;
    }

    // Step 3: Apply the SAME scale to ALL lines
    lineRefs.current.forEach((lineEl) => {
      if (!lineEl) return;

      // Apply the global scale to all lines
      if (globalScale < 1) {
        lineEl.style.transform = `scale(${globalScale})`;
        lineEl.style.transformOrigin = "center";
      } else {
        // No scaling needed
        lineEl.style.transform = "";
      }
    });
  }, [viewMode, verses, currentPage]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    handleSwipe();
  };

  const handleSwipe = () => {
    const swipeThreshold = 50;
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff < 0) {
        // Swipe right (RTL: next page)
        handleNextPage();
      } else {
        // Swipe left (RTL: previous page)
        handlePrevPage();
      }
    }
  };

  // Navigation handlers
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const handleBookmarkJump = (bookmark: MushafBookmark) => {
    setCurrentPage(bookmark.page_number);
  };

  // Unified navigation handler
  const handleNavigate = async () => {
    if (navigationMode === "page") {
      // Navigate by page
      const pageNum = parseInt(selectedPage.toString());
      if (pageNum >= 1 && pageNum <= totalPages) {
        setCurrentPage(pageNum);
        setShowNavigationDialog(false);
      }
    } else if (navigationMode === "surah") {
      // Navigate by surah
      const surahNum = selectedSurah;
      if (selectedAyah) {
        // Navigate to specific ayah
        const ayahNum = parseInt(selectedAyah);
        const surahInfo = SURAHS.find((s) => s.number === surahNum);

        if (!surahInfo || ayahNum < 1 || ayahNum > surahInfo.ayahs) {
          alert(
            `Please enter a valid ayah number (1-${surahInfo?.ayahs || 286})`
          );
          return;
        }

        // Find the page containing this ayah
        const fullSurahInfo = allSurahs.find((s) => s.id === surahNum);
        if (!fullSurahInfo?.pages || fullSurahInfo.pages.length === 0) {
          alert("Could not find surah page information");
          return;
        }

        const firstPage = Math.min(...fullSurahInfo.pages);
        const lastPage = Math.max(...fullSurahInfo.pages);

        // Search through preloaded pages
        for (let page = firstPage; page <= lastPage; page++) {
          const pageVerses = allPages[page.toString()] || [];
          const hasTargetAyah = pageVerses.some((v) => {
            if (!v.verse_key) return false;
            const [vSurah, vAyah] = v.verse_key.split(":").map(Number);
            return vSurah === surahNum && vAyah === ayahNum;
          });

          if (hasTargetAyah) {
            setCurrentPage(page);
            setShowNavigationDialog(false);
            return;
          }
        }

        alert(`Could not find Ayah ${ayahNum} in ${surahInfo.transliteration}`);
      } else {
        // Navigate to start of surah
        const firstPage = await getPageForSurah(surahNum);
        setCurrentPage(firstPage);
        setShowNavigationDialog(false);
      }
    } else if (navigationMode === "juz") {
      // Navigate by juz (each juz is ~20 pages)
      const juzStartPage = (selectedJuz - 1) * 20 + 1;
      setCurrentPage(juzStartPage);
      setShowNavigationDialog(false);
    }
  };

  // Toggle bookmark
  const handleToggleBookmark = async (ayahNumber: number) => {
    if (!user) return;

    const isBookmarked = bookmarkedAyahs.includes(ayahNumber);

    // Optimistically update UI
    if (isBookmarked) {
      setBookmarkedAyahs(bookmarkedAyahs.filter((num) => num !== ayahNumber));
    } else {
      setBookmarkedAyahs(
        [...bookmarkedAyahs, ayahNumber].sort((a, b) => a - b)
      );
    }

    // Update in database
    const surahInfo = SURAHS.find((s) => s.number === currentSurah);
    if (surahInfo) {
      const result = await toggleMushafBookmark(
        user.id,
        currentSurah,
        ayahNumber,
        currentPage,
        isBookmarked
      );

      if (!result.success) {
        // Revert on error
        if (isBookmarked) {
          setBookmarkedAyahs(
            [...bookmarkedAyahs, ayahNumber].sort((a, b) => a - b)
          );
        } else {
          setBookmarkedAyahs(
            bookmarkedAyahs.filter((num) => num !== ayahNumber)
          );
        }
        console.error("Failed to toggle bookmark:", result.error);
      }
    }
  };

  // Convert to Arabic numerals
  const toArabicNumerals = (num: number): string => {
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

  // Clean HTML tags from translation
  const cleanTranslation = (text: string): string => {
    return text.replace(/<sup[^>]*>.*?<\/sup>/g, "");
  };

  const surahInfo = SURAHS.find((s) => s.number === currentSurah);
  // Show ALL verses on the page, not just from current Surah
  const ayahsOnPage = verses.filter((v) => v.verse_key);

  // Show loading state while initial data is being fetched
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-xl font-semibold">Loading Mushaf...</div>
          <div className="text-sm text-muted-foreground">
            Preparing your Quran reader
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        {/* Top Navbar */}
        <TopNavbar />

        {/* Bottom Navigation Bar (Mushaf Controls) - UNIFIED FOR MOBILE & DESKTOP */}
        <div className="container mx-auto px-4 py-3 border-t">
          <div className="flex items-center justify-between gap-2">
            {/* Spacer for alignment */}
            <div className="w-10"></div>

            {/* Navigation Controls - Always Centered */}
            <div className="flex items-center gap-1">
              {/* Left: Next button */}
              <Button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
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
                      {surahInfo?.transliteration || ""} • Pg {currentPage}
                    </span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Navigate Quran</DialogTitle>
                    <DialogDescription>
                      Choose how you want to navigate
                    </DialogDescription>
                  </DialogHeader>

                  <Tabs
                    value={navigationMode}
                    onValueChange={(v) =>
                      setNavigationMode(v as "surah" | "juz" | "page")
                    }
                  >
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="surah">Surah</TabsTrigger>
                      <TabsTrigger value="juz">Juz</TabsTrigger>
                      <TabsTrigger value="page">Page</TabsTrigger>
                    </TabsList>

                    {/* Surah Tab */}
                    <TabsContent value="surah" className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Select Surah
                        </label>
                        <Select
                          value={selectedSurah.toString()}
                          onValueChange={(v) => setSelectedSurah(parseInt(v))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            {SURAHS.map((surah) => (
                              <SelectItem
                                key={surah.number}
                                value={surah.number.toString()}
                              >
                                {surah.number}. {surah.transliteration}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Ayah (Optional)
                        </label>
                        <Input
                          type="number"
                          placeholder={`1-${
                            SURAHS.find((s) => s.number === selectedSurah)
                              ?.ayahs || 286
                          }`}
                          value={selectedAyah}
                          onChange={(e) => setSelectedAyah(e.target.value)}
                          min={1}
                          max={
                            SURAHS.find((s) => s.number === selectedSurah)
                              ?.ayahs || 286
                          }
                          className="w-full"
                        />
                      </div>
                    </TabsContent>

                    {/* Juz Tab */}
                    <TabsContent value="juz" className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">
                          Select Juz
                        </label>
                        <Select
                          value={selectedJuz.toString()}
                          onValueChange={(v) => setSelectedJuz(parseInt(v))}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 30 }, (_, i) => i + 1).map(
                              (juz) => (
                                <SelectItem key={juz} value={juz.toString()}>
                                  Juz {juz}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
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
                          placeholder="1-604"
                          value={selectedPage}
                          onChange={(e) =>
                            setSelectedPage(parseInt(e.target.value))
                          }
                          min={1}
                          max={604}
                          className="w-full"
                        />
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

              {/* Right: Previous button */}
              <Button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
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
              <DropdownMenuContent align="end" className="w-64" sideOffset={8}>
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

                {/* Bookmarks Section */}
                {user && bookmarksDetailed.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-purple-600">
                      Bookmarks ({bookmarksDetailed.length})
                    </DropdownMenuLabel>
                    <div className="max-h-48 overflow-y-auto">
                      {bookmarksDetailed.map((bookmark) => (
                        <DropdownMenuItem
                          key={bookmark.id}
                          className="cursor-pointer"
                          onClick={() => handleBookmarkJump(bookmark)}
                        >
                          <FiBookmark className="mr-2 h-4 w-4 text-purple-500 fill-current" />
                          <div className="flex flex-col">
                            <span>
                              Surah {bookmark.surah_number}, Ayah{" "}
                              {bookmark.ayah_number}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(bookmark.created_at).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                }
                              )}
                            </span>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  </>
                )}

                {user && bookmarksDetailed.length === 0 && (
                  <DropdownMenuLabel className="text-muted-foreground">
                    No bookmarks yet
                  </DropdownMenuLabel>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full px-2 sm:px-4 py-8"
      >
        <div
          className={
            viewMode === "mushaf" ? "max-w-full mx-auto" : "max-w-4xl mx-auto"
          }
        >
          {/* LIST VIEW */}
          {viewMode === "list" && (
            <div>
              {ayahsOnPage.map((verse, idx) => {
                if (!verse.verse_key) return null;
                const [surahNum, ayahNum] = verse.verse_key
                  .split(":")
                  .map(Number);
                const isBookmarked = bookmarkedAyahs.includes(ayahNum);

                // Only show header if this is the START of a new Surah (ayah 1)
                const isStartOfSurah = ayahNum === 1;

                // Also check if Surah changed from previous verse
                const prevVerse = idx > 0 ? ayahsOnPage[idx - 1] : null;
                const prevSurahNum = prevVerse?.verse_key
                  ? parseInt(prevVerse.verse_key.split(":")[0])
                  : null;

                const isSurahChange =
                  prevSurahNum !== null && prevSurahNum !== surahNum;

                // Show header only when Surah starts (ayah 1) AND it's a change from previous
                const showSurahHeader =
                  isStartOfSurah && (idx === 0 || isSurahChange);

                const newSurahInfo = showSurahHeader
                  ? SURAHS.find((s) => s.number === surahNum)
                  : null;

                // Check if this is the last ayah of a Surah
                const currentSurahInfo = SURAHS.find(
                  (s) => s.number === surahNum
                );
                const isLastAyahOfSurah =
                  currentSurahInfo && ayahNum === currentSurahInfo.ayahs;

                return (
                  <div key={verse.id}>
                    {/* Surah Header Divider */}
                    {showSurahHeader && newSurahInfo && (
                      <div className="my-8 py-6 border-y border-border">
                        <div className="text-center space-y-2">
                          <h3
                            className={`text-3xl font-bold ${amiri.className}`}
                          >
                            سُورَةُ {newSurahInfo.name}
                          </h3>
                          <p className="text-base text-muted-foreground">
                            {newSurahInfo.transliteration} •{" "}
                            {newSurahInfo.ayahs} Ayahs
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Ayah Content */}
                    <div
                      className={`
                      py-6 ${
                        !isLastAyahOfSurah ? "border-b border-border/40" : ""
                      }
                      ${
                        isBookmarked
                          ? "border-l-4 border-l-purple-500 bg-purple-50/30"
                          : ""
                      }
                    `}
                    >
                      <div className="flex items-start gap-3 px-2">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground opacity-60">
                            {surahNum}:{ayahNum}
                          </span>
                          {user && (
                            <button
                              onClick={() => handleToggleBookmark(ayahNum)}
                              className={`p-1.5 rounded hover:bg-purple-100 transition-colors ${
                                isBookmarked
                                  ? "text-purple-600"
                                  : "text-gray-400"
                              }`}
                              title={
                                isBookmarked
                                  ? "Remove bookmark"
                                  : "Add bookmark"
                              }
                            >
                              <FiBookmark
                                className={`h-4 w-4 ${
                                  isBookmarked ? "fill-current" : ""
                                }`}
                              />
                            </button>
                          )}
                        </div>
                        <div className="flex-1 space-y-3">
                          <p
                            className={`text-right text-2xl md:text-3xl leading-[2.3] ${amiri.className}`}
                            dir="rtl"
                            lang="ar"
                          >
                            {verse.text_uthmani} {getVerseMarker(ayahNum)}
                          </p>
                          {showTranslation &&
                            verse.translations &&
                            verse.translations.length > 0 && (
                              <p className="text-left text-sm md:text-base text-muted-foreground">
                                {cleanTranslation(verse.translations[0].text)}
                              </p>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* MUSHAF VIEW */}
          {viewMode === "mushaf" && verses.length > 0 && (
            <div>
              <div className="text-center text-sm text-muted-foreground mb-4 pb-2 border-b">
                صفحة {toArabicNumerals(currentPage)}
              </div>

              {/* Group by line number */}
              {(() => {
                const lineGroups: Record<number, Verse[]> = {};
                verses.forEach((v) => {
                  if (v.words) {
                    v.words.forEach((word) => {
                      if (!lineGroups[word.line_number]) {
                        lineGroups[word.line_number] = [];
                      }
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

                const sortedLineEntries = Object.entries(lineGroups).sort(
                  ([a], [b]) => parseInt(a) - parseInt(b)
                );

                return sortedLineEntries.map(
                  ([lineNum, lineVerses], lineIdx) => {
                    // Check if this line contains the START of a new Surah (ayah 1)
                    const firstVerseInLine = lineVerses[0];
                    const firstSurahNum = firstVerseInLine?.verse_key
                      ? parseInt(firstVerseInLine.verse_key.split(":")[0])
                      : null;
                    const firstAyahNum = firstVerseInLine?.verse_key
                      ? parseInt(firstVerseInLine.verse_key.split(":")[1])
                      : null;

                    // Only show header if this line contains ayah 1 of a Surah
                    let showSurahHeader = false;
                    let newSurahInfo = null;

                    if (firstSurahNum && firstAyahNum === 1) {
                      // This line starts with ayah 1, check if it's a new Surah
                      if (lineIdx === 0) {
                        // First line with ayah 1 - show header
                        showSurahHeader = true;
                        newSurahInfo = SURAHS.find(
                          (s) => s.number === firstSurahNum
                        );
                      } else {
                        // Check if Surah changed from previous line
                        const prevLineVerses =
                          sortedLineEntries[lineIdx - 1][1];
                        const lastVerseInPrevLine =
                          prevLineVerses[prevLineVerses.length - 1];
                        const prevSurahNum = lastVerseInPrevLine?.verse_key
                          ? parseInt(
                              lastVerseInPrevLine.verse_key.split(":")[0]
                            )
                          : null;

                        if (prevSurahNum && prevSurahNum !== firstSurahNum) {
                          showSurahHeader = true;
                          newSurahInfo = SURAHS.find(
                            (s) => s.number === firstSurahNum
                          );
                        }
                      }
                    }

                    return (
                      <div key={`line-${lineNum}`}>
                        {/* Surah Divider in Mushaf View */}
                        {showSurahHeader && newSurahInfo && (
                          <div className="my-6 py-4 border-y border-border/60">
                            <div className="text-center space-y-2">
                              <h3
                                className={`text-2xl sm:text-3xl font-bold ${amiri.className}`}
                              >
                                سُورَةُ {newSurahInfo.name}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {newSurahInfo.transliteration} •{" "}
                                {newSurahInfo.ayahs} Ayahs
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Line Content */}
                        <div
                          className={`text-center px-2 sm:px-4 py-1 ${amiri.className}`}
                          dir="rtl"
                          lang="ar"
                          style={{
                            width: "100%",
                            maxWidth: "100%",
                            margin: "0 auto",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            ref={(el) => {
                              lineRefs.current[lineIdx] = el;
                            }}
                            className="text-2xl md:text-3xl mushaf-line"
                            style={{
                              whiteSpace: "nowrap",
                              overflow: "visible",
                              lineHeight: "1.4",
                              padding: "0.25rem",
                            }}
                          >
                            {(() => {
                              const verseWordGroups: Record<
                                number,
                                Array<{
                                  word: Word;
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
                                const verseNumber = parseInt(
                                  verse.verse_key.split(":")[1]
                                );
                                const lineWords = verse.words.filter(
                                  (w) =>
                                    w.line_number === parseInt(lineNum) &&
                                    w.char_type_name === "word"
                                );
                                const allVerseWords = verse.words.filter(
                                  (w) => w.char_type_name === "word"
                                );
                                const lastVerseWordId =
                                  allVerseWords[allVerseWords.length - 1]?.id;

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

                              return Object.entries(verseWordGroups).map(
                                ([verseNum, words]) => {
                                  const verseNumber = parseInt(verseNum);
                                  const isBookmarked =
                                    bookmarkedAyahs.includes(verseNumber);

                                  return (
                                    <span
                                      key={`verse-${verseNum}`}
                                      className={`
                                  inline-block px-1 rounded cursor-pointer transition-all
                                  ${
                                    isBookmarked
                                      ? "bg-purple-100/50 border-2 border-purple-500"
                                      : "hover:bg-muted/30"
                                  }
                                `}
                                    >
                                      {words.map((item, idx) => (
                                        <span key={`${item.word.id}-${idx}`}>
                                          {item.word.text_uthmani}{" "}
                                          {item.isLastWordOfVerse && (
                                            <span className="inline text-xs sm:text-base">
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
                      </div>
                    );
                  }
                );
              })()}
            </div>
          )}

          {/* Empty State */}
          {verses.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading page...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StandaloneMushafPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <StandaloneMushafPageContent />
    </Suspense>
  );
}
