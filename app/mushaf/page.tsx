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
  FiEye,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

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
  const [showTranslation, setShowTranslation] = useState(false);
  const [bookmarkedAyahs, setBookmarkedAyahs] = useState<number[]>([]);
  const [bookmarksDetailed, setBookmarksDetailed] = useState<MushafBookmark[]>(
    []
  );
  const [pageInput, setPageInput] = useState("");
  const [showPageDialog, setShowPageDialog] = useState(false);
  const [ayahInput, setAyahInput] = useState("");
  const [showAyahDialog, setShowAyahDialog] = useState(false);
  const [surahSearch, setSurahSearch] = useState("");

  // Swipe detection
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // Refs for auto-scaling lines on mobile
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

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
  useLayoutEffect(() => {
    if (viewMode !== "mushaf") return;

    const isMobile = window.innerWidth < 768;
    if (!isMobile) return;

    lineRefs.current.forEach((lineEl) => {
      if (!lineEl) return;

      const container = lineEl.parentElement;
      if (!container) return;

      // Reset any previous scaling
      lineEl.style.transform = "";

      // Get dimensions
      const containerWidth = container.clientWidth;
      const contentWidth = lineEl.scrollWidth;

      // If content is wider than container, scale it down
      // Leave 48px padding (24px on each side) from screen edges
      if (contentWidth > containerWidth) {
        const scale = (containerWidth - 48) / contentWidth;
        lineEl.style.transform = `scale(${scale})`;
        lineEl.style.transformOrigin = "center";
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
  const handleSurahChange = async (surahNumber: number) => {
    const firstPage = await getPageForSurah(surahNumber);
    setCurrentPage(firstPage);
    setCurrentSurah(surahNumber);
    setSurahSearch(""); // Clear search after selection
  };

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

  const handlePageJump = () => {
    const pageNum = parseInt(pageInput);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setPageInput("");
    }
  };

  const handleBookmarkJump = (bookmark: MushafBookmark) => {
    setCurrentPage(bookmark.page_number);
  };

  const handleAyahJump = () => {
    const ayahNum = parseInt(ayahInput);
    const surahInfo = SURAHS.find((s) => s.number === currentSurah);

    if (!ayahInput || isNaN(ayahNum)) {
      alert("Please enter a valid ayah number");
      return;
    }

    if (!surahInfo || ayahNum < 1 || ayahNum > surahInfo.ayahs) {
      alert(
        `Please enter an ayah number between 1 and ${surahInfo?.ayahs || 286}`
      );
      return;
    }

    // Get the full surah data with pages info from allSurahs
    const fullSurahInfo = allSurahs.find((s) => s.id === currentSurah);
    if (!fullSurahInfo?.pages || fullSurahInfo.pages.length === 0) {
      alert("Could not find surah page information");
      return;
    }

    const firstPage = Math.min(...fullSurahInfo.pages);
    const lastPage = Math.max(...fullSurahInfo.pages);

    console.log(
      `🔍 Searching for Surah ${currentSurah}, Ayah ${ayahNum} (pages ${firstPage}-${lastPage})...`
    );

    // Search through preloaded pages (instant!)
    for (let page = firstPage; page <= lastPage; page++) {
      const pageVerses = allPages[page.toString()] || [];

      const hasTargetAyah = pageVerses.some((v) => {
        if (!v.verse_key) return false;
        const [surahNum, verseNum] = v.verse_key.split(":").map(Number);
        return surahNum === currentSurah && verseNum === ayahNum;
      });

      if (hasTargetAyah) {
        console.log(`✅ Found on page ${page}!`);
        setCurrentPage(page);
        setAyahInput("");
        setShowAyahDialog(false);
        return;
      }
    }

    // If we get here, ayah wasn't found
    console.error(`❌ Could not find Surah ${currentSurah}, Ayah ${ayahNum}`);
    console.error(`   Searched pages ${firstPage} to ${lastPage}`);
    alert(
      `Could not find Ayah ${ayahNum} in Surah ${surahInfo.transliteration}. This might be a data issue.`
    );
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

  // Get ayah range for current page
  const getAyahRange = () => {
    if (verses.length === 0) return null;

    const ayahNumbers: number[] = [];
    verses.forEach((v) => {
      if (v.verse_key) {
        const [surahNum, ayahNum] = v.verse_key.split(":").map(Number);
        if (surahNum === currentSurah) {
          ayahNumbers.push(ayahNum);
        }
      }
    });

    if (ayahNumbers.length === 0) return null;

    const min = Math.min(...ayahNumbers);
    const max = Math.max(...ayahNumbers);

    return min === max ? `${min}` : `${min}-${max}`;
  };

  const ayahRange = getAyahRange();

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

        {/* Bottom Navigation Bar (Mushaf Controls) */}
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
            {/* Left: Surah Selector & Ayah Range */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                Surah
              </span>
              <Select
                value={currentSurah.toString()}
                onValueChange={(v) => handleSurahChange(parseInt(v))}
              >
                <SelectTrigger className="w-48 cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {/* Search Input */}
                  <div className="sticky top-0 z-10 bg-background p-2 border-b">
                    <Input
                      placeholder="Search surah..."
                      value={surahSearch}
                      onChange={(e) => setSurahSearch(e.target.value)}
                      className="h-8 text-sm"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Filtered Surah List */}
                  <div className="max-h-60 overflow-y-auto">
                    {SURAHS.filter(
                      (surah) =>
                        surah.transliteration
                          .toLowerCase()
                          .includes(surahSearch.toLowerCase()) ||
                        surah.name.includes(surahSearch) ||
                        surah.number.toString().includes(surahSearch)
                    ).map((surah) => (
                      <SelectItem
                        key={surah.number}
                        value={surah.number.toString()}
                        className="cursor-pointer"
                      >
                        {surah.number}. {surah.transliteration}
                      </SelectItem>
                    ))}

                    {/* No results message */}
                    {SURAHS.filter(
                      (surah) =>
                        surah.transliteration
                          .toLowerCase()
                          .includes(surahSearch.toLowerCase()) ||
                        surah.name.includes(surahSearch) ||
                        surah.number.toString().includes(surahSearch)
                    ).length === 0 && (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        No surahs found
                      </div>
                    )}
                  </div>
                </SelectContent>
              </Select>

              {/* Ayah Range with Dialog */}
              {ayahRange && (
                <>
                  <span className="text-sm text-muted-foreground hidden sm:inline">
                    Ayah
                  </span>
                  <Dialog
                    open={showAyahDialog}
                    onOpenChange={setShowAyahDialog}
                  >
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer px-3"
                      >
                        <b>{ayahRange}</b>
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Go to Ayah</DialogTitle>
                        <DialogDescription>
                          Enter an ayah number from Surah{" "}
                          {surahInfo?.transliteration} (1-{surahInfo?.ayahs})
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <Input
                          type="number"
                          placeholder={`Enter a number between 1 and ${
                            surahInfo?.ayahs || 286
                          }`}
                          min={1}
                          max={surahInfo?.ayahs || 286}
                          value={ayahInput}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Only allow numbers
                            if (value === "" || /^\d+$/.test(value)) {
                              setAyahInput(value);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAyahJump();
                            }
                          }}
                          autoFocus
                          className="w-full"
                        />
                      </div>
                      <DialogFooter>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowAyahDialog(false);
                            setAyahInput("");
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAyahJump}
                          disabled={
                            !ayahInput ||
                            parseInt(ayahInput) < 1 ||
                            parseInt(ayahInput) > (surahInfo?.ayahs || 286)
                          }
                        >
                          Go to Ayah
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>

            {/* Center: Page Navigation */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                variant="outline"
                size="sm"
                className="cursor-pointer"
              >
                <FiChevronLeft className="mr-1 h-4 w-4" /> Next
              </Button>

              {/* Page selector button with dialog */}
              <Dialog open={showPageDialog} onOpenChange={setShowPageDialog}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="cursor-pointer px-4"
                  >
                    Page <b className="ml-1">{currentPage}</b> of {totalPages}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Go to Page</DialogTitle>
                    <DialogDescription>
                      Enter a page number between 1 and {totalPages}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Input
                      type="number"
                      placeholder="Page number"
                      min={1}
                      max={totalPages}
                      value={pageInput}
                      onChange={(e) => setPageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handlePageJump();
                          setShowPageDialog(false);
                        }
                      }}
                      autoFocus
                      className="w-full"
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setShowPageDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        handlePageJump();
                        setShowPageDialog(false);
                      }}
                    >
                      Go to Page
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Button
                onClick={handlePrevPage}
                disabled={currentPage === 1}
                variant="outline"
                size="sm"
                className="cursor-pointer"
              >
                Previous <FiChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>

            {/* Right: View Toggle and Options */}
            <div className="flex items-center gap-2">
              {/* Compact View Toggle */}
              <div className="flex items-center gap-2 border border-border rounded-md px-2 py-1">
                <div className="flex items-center gap-1 text-sm text-muted-foreground opacity-60">
                  <FiEye className="size-3" />
                  <span className="text-sm">View</span>
                </div>
                <div className="flex items-center ml-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode("list")}
                    className={`cursor-pointer px-3 py-1 h-auto text-sm transition-colors ${
                      viewMode === "list"
                        ? "bg-primary/10 text-primary font-medium hover:bg-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    List
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode("mushaf")}
                    className={`cursor-pointer px-3 py-1 h-auto text-sm transition-colors ${
                      viewMode === "mushaf"
                        ? "bg-primary/10 text-primary font-medium hover:bg-primary/20"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    Mushaf
                  </Button>
                </div>
              </div>

              {/* Options Dropdown */}
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
                  {/* Translation Toggle (only in list view) */}
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
                  {user && bookmarksDetailed.length === 0 && (
                    <>
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
