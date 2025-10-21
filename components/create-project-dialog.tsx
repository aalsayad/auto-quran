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
import { FiUpload, FiCheckCircle, FiAlertCircle, FiFile } from "react-icons/fi";

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

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [detectedSurah, setDetectedSurah] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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

      // Auto-generate project name
      const surahInfo = SURAHS.find((s) => s.number === detected);
      const defaultName = `${
        surahInfo?.transliteration || `Surah ${detected}`
      } - ${new Date().toLocaleDateString()}`;
      setProjectName(defaultName);
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

    if (!projectName.trim()) {
      alert("Please enter a project name");
      return;
    }

    if (!selectedSurah) {
      alert("Please select a surah");
      return;
    }

    setIsCreating(true);

    try {
      // Create new project ID
      const projectId = `project-${Date.now()}`;

      // Initialize project with uploaded audio
      const surahInfo = SURAHS.find((s) => s.number === selectedSurah);

      const newProject = {
        id: projectId,
        name: projectName.trim(),
        fileName: audioFile.name,
        audioUrl: audioUrl,
        surahNumber: selectedSurah,
        surahName: surahInfo?.transliteration || `Surah ${selectedSurah}`,
        dateCreated: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        segments: [],
        ayahTexts: [],
        silenceThreshold: 0.04,
        minSilenceDuration: 0.2,
        endPadding: 0.3,
        startPadding: 0,
      };

      // Save project
      saveProject(newProject);

      console.log("✅ [Create] Project created:", projectId, newProject);

      // Close dialog and navigate to editor
      onOpenChange(false);

      // Reset state
      setAudioFile(null);
      setAudioUrl(null);
      setProjectName("");
      setSelectedSurah(null);
      setDetectedSurah(null);

      // Navigate to editor
      setTimeout(() => {
        router.push(`/editor/${projectId}`);
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
      // Reset all state when closing
      setAudioFile(null);
      setAudioUrl(null);
      setProjectName("");
      setSelectedSurah(null);
      setDetectedSurah(null);
      setIsUploading(false);
      setIsCreating(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[500px]">
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
                  <SelectTrigger id="surah">
                    <SelectValue placeholder="Select a surah" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {SURAHS.map((surah) => (
                      <SelectItem
                        key={surah.number}
                        value={surah.number.toString()}
                      >
                        {surah.number}. {surah.transliteration} ({surah.name}) -{" "}
                        {surah.ayahs} Ayahs
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 3: Project Name (shown after surah selected) */}
              {selectedSurah && (
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name</Label>
                  <Input
                    id="project-name"
                    placeholder="e.g., Al-Fatihah - Sheikh Mishary"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && projectName.trim()) {
                        handleCreate();
                      }
                    }}
                  />
                </div>
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
              !projectName.trim() ||
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
    </Dialog>
  );
}
