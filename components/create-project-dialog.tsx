"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SURAHS } from "@/lib/surah-data";
import { saveProject } from "@/lib/library-storage";
import { detectSurahFromFilename } from "@/lib/detect-surah";
import {
  FiUpload,
  FiCheckCircle,
  FiAlertCircle,
  FiFile,
  FiAlertTriangle,
  FiCloud,
  FiUser,
  FiBook,
} from "react-icons/fi";
import type { FinalSegment } from "@/lib/types";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateProjectDialog({
  open,
  onOpenChange,
}: CreateProjectDialogProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [reciterName, setReciterName] = useState("");
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [detectedSurah, setDetectedSurah] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [segments, setSegments] = useState<FinalSegment[]>([]);
  const [surahSearch, setSurahSearch] = useState("");
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleJsonSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/json") {
      alert("Please select a valid JSON file");
      return;
    }

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate that it has segments
      if (!data.segments || !Array.isArray(data.segments)) {
        alert("Invalid JSON format. Must contain a 'segments' array.");
        return;
      }

      // Ensure each segment has required fields
      const validSegments: FinalSegment[] = data.segments.map(
        (seg: {
          start: number;
          end: number;
          text?: string;
          ayahNumber?: number;
          ayahNumbers?: number[];
          confidence?: number;
        }) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text || "",
          ayahNumber: seg.ayahNumber,
          ayahNumbers: seg.ayahNumbers,
          confidence: seg.confidence ?? 1,
        })
      );

      setJsonFile(file);
      setSegments(validSegments);
      console.log(
        "✅ [Create] Loaded segments from JSON:",
        validSegments.length
      );
    } catch (error) {
      console.error("❌ [Create] Failed to parse JSON:", error);
      alert("Failed to parse JSON file. Please check the format.");
      setJsonFile(null);
      setSegments([]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "audio/mpeg") {
      alert("Please select a valid MP3 file");
      return;
    }

    setAudioFile(file);

    // Auto-detect surah from filename
    const detected = detectSurahFromFilename(file.name);
    if (detected) {
      setDetectedSurah(detected);
      setSelectedSurah(detected);
      console.log("📖 [Create] Auto-detected surah:", detected);
    } else {
      setDetectedSurah(null);
      console.log("⚠️  [Create] Could not auto-detect surah from filename");
    }

    // Upload to S3
    try {
      setIsUploading(true);
      console.log("🚀 [Create] Uploading to S3...", file.name);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-audio", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setAudioUrl(data.url);
      console.log("✅ [Create] Upload successful:", data.url);
    } catch (error) {
      console.error("❌ [Create] Upload failed:", error);
      alert("Failed to upload audio. Please try again.");
      setAudioFile(null);
      setAudioUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreate = () => {
    if (!audioFile || !audioUrl) {
      alert("Please upload an MP3 file first");
      return;
    }

    if (!selectedSurah) {
      alert("Please select a surah");
      return;
    }

    if (!reciterName.trim()) {
      alert("Please enter a reciter name");
      return;
    }

    setIsCreating(true);

    try {
      // Create new project ID
      const projectId = `project-${Date.now()}`;

      // Initialize project with uploaded audio
      const surahInfo = SURAHS.find((s) => s.number === selectedSurah);

      // Auto-generate project name: "Reciter - Surah Name"
      const projectName = `${reciterName.trim()} - ${
        surahInfo?.transliteration || `Surah ${selectedSurah}`
      }`;

      const newProject = {
        id: projectId,
        name: projectName,
        reciter: reciterName.trim(),
        fileName: audioFile.name,
        audioUrl: audioUrl,
        surahNumber: selectedSurah,
        surahName: surahInfo?.transliteration || `Surah ${selectedSurah}`,
        createdAt: new Date().toISOString(),
        dateCreated: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        segments: segments, // Use imported segments if available
        ayahTexts: [],
        silenceThreshold: 0.04,
        minSilenceDuration: 0.2,
        endPadding: 0.3,
        startPadding: 0,
      };

      // Save project
      saveProject(newProject);

      console.log("✅ [Create] Project created:", projectId, newProject);

      // Close dialog
      onOpenChange(false);

      // Reset state
      setAudioFile(null);
      setAudioUrl(null);
      setReciterName("");
      setSelectedSurah(null);
      setDetectedSurah(null);
      setJsonFile(null);
      setSegments([]);

      // Navigate to reader if segments exist, otherwise editor
      setTimeout(() => {
        if (segments.length > 0) {
          router.push(`/reader/${projectId}`);
        } else {
          router.push(`/editor/${projectId}`);
        }
      }, 100);
    } catch (error) {
      console.error("❌ [Create] Failed to create project:", error);
      alert("Failed to create project. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      // Check if there's uploaded content that would be lost
      if (
        audioFile ||
        audioUrl ||
        reciterName.trim() ||
        selectedSurah ||
        jsonFile
      ) {
        setShowCloseConfirm(true);
        return; // Don't close yet, show confirmation
      }

      // Reset all state when closing
      resetDialogState();
    }
    onOpenChange(open);
  };

  const resetDialogState = () => {
    setAudioFile(null);
    setAudioUrl(null);
    setReciterName("");
    setSelectedSurah(null);
    setDetectedSurah(null);
    setIsUploading(false);
    setIsCreating(false);
    setJsonFile(null);
    setSegments([]);
    setSurahSearch("");
    setShowCloseConfirm(false);
  };

  const handleConfirmClose = async () => {
    setIsDeleting(true);

    // Delete uploaded file from S3 if it exists
    if (audioUrl) {
      try {
        console.log("🗑️ [Dialog] Deleting uploaded file from S3:", audioUrl);
        const response = await fetch("/api/delete-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioUrl }),
        });

        if (response.ok) {
          console.log("✅ [Dialog] File deleted successfully from S3");
        } else {
          console.warn(
            "⚠️ [Dialog] Failed to delete file from S3, but continuing..."
          );
        }
      } catch (error) {
        console.error("❌ [Dialog] Error deleting file from S3:", error);
        // Continue with dialog close even if deletion fails
      }
    }

    setShowCloseConfirm(false);
    resetDialogState();
    onOpenChange(false);
    setIsDeleting(false);
  };

  const handleCancelClose = () => {
    setShowCloseConfirm(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FiUpload /> Create New Project
          </DialogTitle>
          <DialogDescription>
            Upload an MP3 file to create a new Quran splitting project
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step 1: Upload MP3 */}
          <div className="space-y-2">
            <Label htmlFor="audio-upload">MP3 Audio File</Label>
            <input
              ref={fileInputRef}
              id="audio-upload"
              type="file"
              accept="audio/mpeg"
              onChange={handleFileSelect}
              className="hidden"
            />

            {!audioFile ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full cursor-pointer gap-2"
                disabled={isUploading}
              >
                <FiUpload /> Choose MP3 File
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                  <FiFile className="text-primary" />
                  <span className="text-sm font-medium flex-1">
                    {audioFile.name}
                  </span>
                  {audioUrl ? (
                    <FiCheckCircle className="text-green-600" size={18} />
                  ) : (
                    <FiAlertCircle className="text-yellow-600" size={18} />
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full cursor-pointer"
                  disabled={isUploading}
                >
                  Change File
                </Button>
              </div>
            )}

            {isUploading && (
              <div className="text-sm text-blue-600 dark:text-blue-400 p-3 bg-blue-50 dark:bg-blue-950 rounded-md flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                Uploading to cloud storage...
              </div>
            )}
          </div>

          {/* Step 2: Select Surah (shown after upload) */}
          {audioFile && audioUrl && (
            <>
              <div className="space-y-2">
                <Label htmlFor="surah">Surah</Label>
                {detectedSurah ? (
                  <div className="text-sm text-green-600 dark:text-green-400 mb-2 flex items-center gap-2">
                    <FiCheckCircle /> Auto-detected from filename
                  </div>
                ) : (
                  <div className="text-sm text-yellow-600 dark:text-yellow-400 mb-2 flex items-center gap-2">
                    <FiAlertCircle /> Could not detect surah, please select
                    manually
                  </div>
                )}
                <Select
                  value={selectedSurah?.toString()}
                  onValueChange={(value) => setSelectedSurah(parseInt(value))}
                >
                  <SelectTrigger id="surah" className="w-full">
                    <SelectValue placeholder="Select a surah" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[400px] ">
                    <div className="sticky top-0 bg-background p-2 border-b z-10">
                      <Input
                        placeholder="Search surah..."
                        value={surahSearch}
                        onChange={(e) => setSurahSearch(e.target.value)}
                        className="h-8"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="overflow-y-auto max-h-[260px] ">
                      {SURAHS.filter((surah) => {
                        if (!surahSearch) return true;
                        const search = surahSearch.toLowerCase();
                        return (
                          surah.number.toString().includes(search) ||
                          surah.transliteration
                            .toLowerCase()
                            .includes(search) ||
                          surah.name.toLowerCase().includes(search)
                        );
                      }).map((surah) => (
                        <SelectItem
                          key={surah.number}
                          value={surah.number.toString()}
                        >
                          {surah.number}. {surah.transliteration} ({surah.name})
                          - {surah.ayahs} Ayahs
                        </SelectItem>
                      ))}
                      {SURAHS.filter((surah) => {
                        if (!surahSearch) return true;
                        const search = surahSearch.toLowerCase();
                        return (
                          surah.number.toString().includes(search) ||
                          surah.transliteration
                            .toLowerCase()
                            .includes(search) ||
                          surah.name.toLowerCase().includes(search)
                        );
                      }).length === 0 && (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No surahs found
                        </div>
                      )}
                    </div>
                  </SelectContent>
                </Select>
              </div>

              {/* Step 3: Reciter Name (shown after surah selected) */}
              {selectedSurah && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="reciter-name">Reciter Name</Label>
                    <Input
                      id="reciter-name"
                      placeholder="e.g., Sheikh Mishary Rashid Alafasy"
                      value={reciterName}
                      onChange={(e) => setReciterName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && reciterName.trim()) {
                          handleCreate();
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Project will be named:{" "}
                      {reciterName.trim()
                        ? `${reciterName.trim()} - ${
                            SURAHS.find((s) => s.number === selectedSurah)
                              ?.transliteration
                          }`
                        : "Reciter - Surah Name"}
                    </p>
                  </div>

                  {/* Divider */}
                  <div className="relative mt-12 mb-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Optional
                      </span>
                    </div>
                  </div>

                  {/* Step 4: Optional JSON Import */}
                  <div className="space-y-2 mb-4">
                    <Label htmlFor="json-upload">Segments JSON</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Import pre-existing segments to skip AI detection
                    </p>
                    <input
                      ref={jsonInputRef}
                      id="json-upload"
                      type="file"
                      accept="application/json,.json"
                      onChange={handleJsonSelect}
                      className="hidden"
                    />

                    {!jsonFile ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => jsonInputRef.current?.click()}
                        className="w-full cursor-pointer gap-2"
                      >
                        <FiUpload /> Import Segments JSON
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-md">
                          <FiCheckCircle className="text-green-600" size={18} />
                          <span className="text-sm font-medium flex-1 text-green-600 dark:text-green-400">
                            {jsonFile.name} ({segments.length} segments)
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setJsonFile(null);
                            setSegments([]);
                          }}
                          className="w-full cursor-pointer"
                        >
                          Remove JSON
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleDialogClose(false)}
            disabled={isUploading || isCreating}
            className="cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              !audioFile ||
              !audioUrl ||
              !selectedSurah ||
              !reciterName.trim() ||
              isUploading ||
              isCreating
            }
            className="cursor-pointer gap-2"
          >
            {isCreating ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Creating...
              </>
            ) : (
              <>
                <FiCheckCircle /> Create Project
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Confirmation Modal for Closing with Uploaded Content */}
      <Dialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <FiAlertTriangle /> Unsaved Changes
            </DialogTitle>
            <DialogDescription>
              You have uploaded content and project details that will be lost if
              you close this dialog.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <strong>What will be lost:</strong>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                {audioFile && (
                  <li className="flex items-center gap-2">
                    <FiFile className="h-3 w-3" />
                    Uploaded audio file: {audioFile.name}
                  </li>
                )}
                {audioUrl && (
                  <li className="flex items-center gap-2">
                    <FiCloud className="h-3 w-3" />
                    Cloud storage upload (will be permanently deleted)
                  </li>
                )}
                {reciterName.trim() && (
                  <li className="flex items-center gap-2">
                    <FiUser className="h-3 w-3" />
                    Reciter name: {reciterName}
                  </li>
                )}
                {selectedSurah && (
                  <li className="flex items-center gap-2">
                    <FiBook className="h-3 w-3" />
                    Selected surah:{" "}
                    {
                      SURAHS.find((s) => s.number === selectedSurah)
                        ?.transliteration
                    }
                  </li>
                )}
                {jsonFile && (
                  <li className="flex items-center gap-2">
                    <FiUpload className="h-3 w-3" />
                    Imported segments: {jsonFile.name}
                  </li>
                )}
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleCancelClose}
              className="cursor-pointer"
            >
              Continue Creating
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmClose}
              disabled={isDeleting}
              className="cursor-pointer gap-2"
            >
              {isDeleting ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Deleting...
                </>
              ) : (
                "Delete & Close"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
