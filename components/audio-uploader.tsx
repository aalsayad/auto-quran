"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SURAHS } from "@/lib/surah-data";
import { detectSurahFromFilename } from "@/lib/detect-surah";
import { splitAudioIntoAyahs, loadFFmpeg } from "@/lib/audio-splitter";
import { detectSilenceSegments } from "@/lib/silence-detector";
import { fetchSurahText } from "@/lib/quran-api";
import WaveformEditor from "@/components/waveform-editor";
import type { SavedRecitation } from "@/lib/types";
import { useAuth } from "@/contexts/auth-context";
import { getRecitation, updateRecitation } from "@/lib/supabase-storage";
import {
  recitationToSavedRecitation,
  savedRecitationToRecitation,
  type AyahText,
} from "@/lib/types";
import {
  FiSave,
  FiDownload,
  FiFile,
  FiAlertCircle,
  FiCheckCircle,
  FiBook,
  FiHash,
  FiInfo,
  FiLink,
  FiEdit2,
  FiExternalLink,
} from "react-icons/fi";
import { CostEstimationDialog } from "@/components/cost-estimation-dialog";
import {
  estimateTranscriptionCost,
  calculateActualCost,
  type CostEstimate,
} from "@/lib/token-pricing";
import {
  getUserTokenBalance,
  reserveTokens,
  recordTranscriptionUsage,
} from "@/lib/token-manager";

interface Segment {
  start: number;
  end: number;
  text: string;
  ayahNumber?: number; // Manual ayah assignment (can be 0 for bismillah)
  ayahNumbers?: number[]; // For merged segments containing multiple ayahs
  confidence: number; // Confidence score for the segment mapping
}

// Constants for audio chunking (removed - now calculated dynamically based on file size)

export default function AudioUploader() {
  const params = useParams();
  const recitationId = params.recitationId as string;
  const { user, session } = useAuth();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null); // S3 URL for uploaded audio
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingAudio, setIsFetchingAudio] = useState(false); // Loading state when fetching from S3
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
    message: "",
  });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [originalSegments, setOriginalSegments] = useState<Segment[]>([]); // Store original segments without padding
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingFFmpeg, setIsLoadingFFmpeg] = useState(false);
  const [endPadding, setEndPadding] = useState(0.3);
  const [startPadding, setStartPadding] = useState(0);
  const [silenceThreshold, setSilenceThreshold] = useState(0.04);
  const [minSilenceDuration, setMinSilenceDuration] = useState(0.2);
  const [, setIsFetchingText] = useState(false);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<
    number | null
  >(null);
  const [ayahTexts, setAyahTexts] = useState<AyahText[]>([]); // Store all ayah texts
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save/Load state
  const [currentRecitationId, setCurrentRecitationId] = useState<string | null>(
    null
  );
  const [recitationName, setRecitationName] = useState<string>("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newRecitationName, setNewRecitationName] = useState("");
  const [whisperTranscription, setWhisperTranscription] = useState<{
    segments: { start: number; end: number; text: string }[];
    text: string;
  } | null>(null);

  // Token management state
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [costEstimate, setCostEstimate] = useState<CostEstimate | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number>(0);

  // Save function for Supabase only
  const saveRecitationUniversal = async (recitationData: SavedRecitation) => {
    if (!user) {
      throw new Error("User must be authenticated to save recitations");
    }

    // Save to Supabase
    const recitationDbData = savedRecitationToRecitation(
      recitationData,
      user.id
    );
    await updateRecitation(recitationData.id, {
      ...recitationDbData,
      transcription_data: {
        segments: recitationData.segments,
        ayah_texts: recitationData.ayahTexts,
        whisper: recitationData.whisperTranscription,
      },
      settings_data: {
        silence_threshold: recitationData.silenceThreshold,
        min_silence_duration: recitationData.minSilenceDuration,
        end_padding: recitationData.endPadding,
        start_padding: recitationData.startPadding,
      },
    });
    console.log("✅ Saved to Supabase:", recitationData.id);
  };

  // UNUSED - Legacy function (keeping for reference)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "audio/mpeg") {
      setAudioFile(file);

      if (!audioUrl) {
        // New file, no existing upload
        console.log("🆕 [Upload] New file, uploading to S3...");
        const uploadedUrl = await uploadAudioToS3(file);
        if (uploadedUrl) {
          setAudioUrl(uploadedUrl);
          console.log("✅ [Upload] Audio uploaded to S3:", uploadedUrl);
        }
      } else {
        // Changing existing file: Upload new file first, then delete old one
        console.log("🔄 [Upload] Replacing existing file...");
        const oldAudioUrl = audioUrl;

        console.log("📤 [Upload] Step 1: Uploading new file to S3...");
        const newUploadedUrl = await uploadAudioToS3(file);

        if (newUploadedUrl) {
          console.log("✅ [Upload] Step 2: New file uploaded successfully");
          setAudioUrl(newUploadedUrl);

          // Now delete the old file
          console.log("🗑️  [Upload] Step 3: Deleting old file from S3...");
          try {
            const response = await fetch("/api/delete-audio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audioUrl: oldAudioUrl }),
            });

            if (response.ok) {
              console.log("✅ [Upload] Old file deleted successfully");
            } else {
              console.warn(
                "⚠️  [Upload] Failed to delete old file, but new file is uploaded"
              );
            }
          } catch (error) {
            console.error("❌ [Upload] Error deleting old file:", error);
          }

          console.log("🎉 [Upload] File replacement complete!");
        } else {
          console.error(
            "❌ [Upload] Failed to upload new file, keeping old one"
          );
        }
      }

      // Only clear segments if NOT loading a saved recitation
      // If we have a loaded recitation with segments, keep them
      if (!currentRecitationId || segments.length === 0) {
        setSegments([]);
        setOriginalSegments([]);
        setAyahTexts([]);
        setSelectedSegmentIndex(null);

        const detected = detectSurahFromFilename(file.name);

        if (detected) {
          setSelectedSurah(detected);
        }
      } else {
        // Loaded recitation - audio file attached, ready to download
        console.log("📂 [Upload] Audio file attached to loaded recitation");
      }
    }
  };

  const prevSegmentsLengthRef = useRef(0);

  // When segments are detected, just set them as-is (no padding applied visually)
  useEffect(() => {
    if (originalSegments.length === 0) return;
    setSegments(originalSegments);
  }, [originalSegments]);

  // Auto-renumber segments when they change from waveform editor (drag/add/delete)
  // Segments are already sorted by start time from waveform editor
  useEffect(() => {
    if (ayahTexts.length === 0 || segments.length === 0) return;

    // Only trigger when segments are added/removed
    if (prevSegmentsLengthRef.current === segments.length) return;
    prevSegmentsLengthRef.current = segments.length;

    // Check if any segment is missing ayahNumber (new segment added)
    const hasMissingNumbers = segments.some(
      (seg) => seg.ayahNumber === undefined && !seg.ayahNumbers
    );

    if (hasMissingNumbers) {
      // Find the index of the first missing segment
      const firstMissingIndex = segments.findIndex(
        (seg) => seg.ayahNumber === undefined && !seg.ayahNumbers
      );

      // Renumber immediately without setTimeout
      setSegments((currentSegments) => {
        const renumbered = [...currentSegments];

        // Calculate what the new segment's number should be based on previous segment
        let newSegmentNumber = 1; // Default to 1 if it's the first segment

        if (firstMissingIndex > 0) {
          const prevSegment = renumbered[firstMissingIndex - 1];
          if (prevSegment.ayahNumbers && prevSegment.ayahNumbers.length > 0) {
            newSegmentNumber = Math.max(...prevSegment.ayahNumbers) + 1;
          } else if (prevSegment.ayahNumber !== undefined) {
            newSegmentNumber = prevSegment.ayahNumber + 1;
          }
        }

        // Assign number to the new segment
        renumbered[firstMissingIndex] = {
          ...renumbered[firstMissingIndex],
          ayahNumber: newSegmentNumber,
          text: ayahTexts[newSegmentNumber - 1]?.text || "",
        };

        // Renumber all subsequent segments
        let currentAyahNumber = newSegmentNumber + 1;
        for (let i = firstMissingIndex + 1; i < renumbered.length; i++) {
          const segment = renumbered[i];

          // If segment has merged ayahs, preserve them and advance counter
          if (segment.ayahNumbers && segment.ayahNumbers.length > 0) {
            currentAyahNumber = Math.max(...segment.ayahNumbers) + 1;
          }
          // Otherwise, auto-assign the next sequential ayah number
          else {
            renumbered[i] = {
              ...renumbered[i],
              ayahNumber: currentAyahNumber,
              text: ayahTexts[currentAyahNumber - 1]?.text || "",
            };
            currentAyahNumber++;
          }
        }

        return renumbered;
      });
    }
  }, [segments, ayahTexts]);

  // Fetch audio file from S3 URL and convert to File object (lazy loading)
  const loadAudioFromS3 = useCallback(
    async (url: string, fileName: string) => {
      // If we already have the audio file loaded, don't fetch again
      if (audioFile && audioFile.name === fileName) {
        console.log("✅ [Load] Audio already loaded, skipping fetch");
        return audioFile;
      }

      try {
        setIsFetchingAudio(true);
        console.log("📥 [Load] Fetching audio from S3:", url);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error("Failed to fetch audio from S3");
        }

        const blob = await response.blob();
        const file = new File([blob], fileName, { type: "audio/mpeg" });

        console.log(
          "✅ [Load] Audio loaded from S3:",
          file.name,
          (file.size / 1024 / 1024).toFixed(2),
          "MB"
        );
        setAudioFile(file);
        return file;
      } catch (error) {
        console.error("❌ [Load] Failed to load audio from S3:", error);
        alert(
          "Failed to load audio from cloud storage. Please upload the file again."
        );
        return null;
      } finally {
        setIsFetchingAudio(false);
      }
    },
    [audioFile]
  );

  // Load recitation from URL params
  useEffect(() => {
    const loadRecitation = async () => {
      if (!recitationId) return;
      if (!user) {
        console.log("⏳ Waiting for user authentication...");
        return;
      }

      console.log("Loading recitation:", recitationId);

      // Load from Supabase
      const recitation = await getRecitation(recitationId);
      if (!recitation) {
        console.log("Recitation not found for ID:", recitationId);
        alert("Recitation not found. It may have been deleted.");
        return;
      }

      const loadedRecitation = recitationToSavedRecitation(recitation);
      console.log("Recitation loaded from Supabase:", loadedRecitation);

      if (loadedRecitation) {
        // Load recitation data
        setCurrentRecitationId(loadedRecitation.id);
        setRecitationName(loadedRecitation.name);
        setSelectedSurah(loadedRecitation.surahNumber);
        setSegments(loadedRecitation.segments || []);
        setOriginalSegments(loadedRecitation.segments || []);
        setAyahTexts(loadedRecitation.ayahTexts || []);
        if (loadedRecitation.silenceThreshold)
          setSilenceThreshold(loadedRecitation.silenceThreshold);
        if (loadedRecitation.minSilenceDuration)
          setMinSilenceDuration(loadedRecitation.minSilenceDuration);
        if (loadedRecitation.endPadding !== undefined)
          setEndPadding(loadedRecitation.endPadding);
        if (loadedRecitation.startPadding !== undefined)
          setStartPadding(loadedRecitation.startPadding);
        if (loadedRecitation.whisperTranscription) {
          setWhisperTranscription(loadedRecitation.whisperTranscription);
          console.log(
            `♻️ Loaded cached Whisper from localStorage (${loadedRecitation.whisperTranscription.segments.length} segments) - re-mapping is cheap!`
          );
        }

        // Load audio file from S3 if URL exists
        if (loadedRecitation.audioUrl) {
          setAudioUrl(loadedRecitation.audioUrl);
          console.log(
            "📂 [Project] Audio URL found:",
            loadedRecitation.audioUrl
          );

          // Auto-load audio ONLY if there are segments (waveform needs it)
          // This way we don't fetch on every navigation, only when necessary
          if (
            loadedRecitation.segments &&
            loadedRecitation.segments.length > 0
          ) {
            console.log(
              "🎵 [Project] Has segments, auto-loading audio for waveform..."
            );
            loadAudioFromS3(
              loadedRecitation.audioUrl,
              loadedRecitation.fileName ||
                loadedRecitation.audioFileName ||
                "audio.mp3"
            );
          }
        }
      }
    };

    loadRecitation();
  }, [recitationId, user, loadAudioFromS3]);

  // Auto-load ayah text when segments are detected and surah is selected
  useEffect(() => {
    const autoLoadAyahText = async () => {
      // Only auto-load if:
      // 1. Segments exist
      // 2. Surah is selected
      // 3. Ayah texts are not already loaded
      if (segments.length > 0 && selectedSurah && ayahTexts.length === 0) {
        console.log("🔄 Auto-loading ayah text for surah:", selectedSurah);
        setIsFetchingText(true);

        try {
          const ayahs = await fetchSurahText(selectedSurah);
          const ayahTextsArray = ayahs.map((ayah, index) => ({
            ayahNumber: index + 1,
            text: ayah.text,
          }));
          setAyahTexts(ayahTextsArray);

          // Auto-assign ayah numbers if not already assigned
          if (segments.length > 0 && !segments[0]?.ayahNumber) {
            const updatedSegments = segments.map((segment, index) => ({
              ...segment,
              ayahNumber: index + 1, // Start from 1 by default
              text: ayahTextsArray[index]?.text || "",
            }));
            setSegments(updatedSegments);
          } else if (segments.length > 0) {
            // Just update text based on assigned numbers
            const updatedSegments = segments.map((segment) => ({
              ...segment,
              text:
                segment.ayahNumber !== undefined
                  ? ayahTextsArray[segment.ayahNumber - 1]?.text || ""
                  : "",
            }));
            setSegments(updatedSegments);
          }

          console.log("✅ Ayah text auto-loaded successfully");
        } catch (error) {
          console.error("❌ Failed to auto-load ayah text:", error);
        } finally {
          setIsFetchingText(false);
        }
      }
    };

    autoLoadAyahText();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments.length, selectedSurah, ayahTexts.length]);

  // Load user's token balance
  useEffect(() => {
    const loadTokenBalance = async () => {
      if (!user) {
        setTokenBalance(0);
        return;
      }

      try {
        const balance = await getUserTokenBalance(user.id);
        setTokenBalance(balance.balanceTokens);
        console.log("💰 Token balance loaded:", balance.balanceTokens);
      } catch (error) {
        console.error("❌ Failed to load token balance:", error);
        setTokenBalance(0);
      }
    };

    loadTokenBalance();
  }, [user]);

  // UNUSED - Legacy function (keeping for reference)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Helper to ensure audio file is loaded (lazy loading)
  const ensureAudioFileLoaded = async (): Promise<File | null> => {
    if (audioFile) return audioFile;
    if (!audioUrl) return null;

    const fileName = recitationName || "audio.mp3";
    return await loadAudioFromS3(audioUrl, fileName);
  };

  const uploadAudioToS3 = async (file: File): Promise<string | null> => {
    try {
      setIsUploading(true);
      console.log("🚀 [S3 Upload] Starting upload process...");
      console.log("📁 [S3 Upload] File name:", file.name);
      console.log(
        "📊 [S3 Upload] File size:",
        (file.size / 1024 / 1024).toFixed(2),
        "MB"
      );
      console.log("🎵 [S3 Upload] File type:", file.type);

      // Step 1: Get presigned URL from our API
      console.log("🔐 [S3 Upload] Requesting presigned URL...");
      const presignedResponse = await fetch("/api/upload-audio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
        }),
      });

      console.log(
        "📥 [S3 Upload] Response received:",
        presignedResponse.status,
        presignedResponse.statusText
      );

      if (!presignedResponse.ok) {
        const error = await presignedResponse.json();
        console.error("❌ [S3 Upload] Failed to get upload URL:", error);
        throw new Error(error.error || "Failed to get upload URL");
      }

      const { uploadUrl, fileUrl } = await presignedResponse.json();
      console.log("✅ [S3 Upload] Got presigned URL");

      // Step 2: Upload directly to S3 using presigned URL
      console.log("☁️  [S3 Upload] Uploading directly to S3...");
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
        },
        body: file,
      });

      console.log(
        "📥 [S3 Upload] S3 upload response:",
        uploadResponse.status,
        uploadResponse.statusText
      );

      if (!uploadResponse.ok) {
        console.error("❌ [S3 Upload] S3 upload failed");
        throw new Error("S3 upload failed");
      }

      console.log("✅ [S3 Upload] Upload successful!");
      console.log("🔗 [S3 Upload] S3 URL:", fileUrl);
      return fileUrl;
    } catch (error) {
      console.error("💥 [S3 Upload] Error occurred:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";
      alert(`Failed to upload audio: ${errorMessage}`);
      return null;
    } finally {
      setIsUploading(false);
      console.log("🏁 [S3 Upload] Upload process completed");
    }
  };

  const handleSaveProject = async () => {
    if (!selectedSurah) {
      alert("Please select a surah before saving");
      return;
    }

    if (segments.length === 0) {
      alert("Please detect segments before saving");
      return;
    }

    // If updating existing recitation, save directly without dialog
    if (currentRecitationId) {
      await handleSaveConfirm();
      return;
    }

    // For new recitations, show dialog to enter name
    if (!recitationName) {
      const surahInfo = SURAHS.find((s) => s.number === selectedSurah);
      const defaultName = `${
        surahInfo?.transliteration || `Surah ${selectedSurah}`
      } - ${new Date().toLocaleDateString()}`;
      setRecitationName(defaultName);
    }

    setShowSaveDialog(true);
  };

  const handleSaveConfirm = async () => {
    if (!recitationName.trim() || !selectedSurah) return;

    setIsSaving(true);

    try {
      const surahInfo = SURAHS.find((s) => s.number === selectedSurah);
      if (!user) {
        alert("Please sign in to save recitations");
        return;
      }

      // Get existing recitation data for dates
      let existingCreatedAt = new Date().toISOString();
      if (currentRecitationId) {
        const existing = await getRecitation(currentRecitationId);
        if (existing) {
          existingCreatedAt = existing.created_at;
        }
      }

      const recitation: SavedRecitation = {
        id: currentRecitationId || `recitation-${Date.now()}`,
        name: recitationName.trim(),
        fileName: audioFile?.name || "Unknown file",
        audioUrl: audioUrl || "", // Save S3 URL
        surahNumber: selectedSurah,
        surahName: surahInfo?.transliteration || `Surah ${selectedSurah}`,
        dateCreated: existingCreatedAt,
        createdAt: existingCreatedAt,
        lastModified: new Date().toISOString(),
        segments,
        ayahTexts,
        silenceThreshold,
        minSilenceDuration,
        endPadding,
        startPadding,
        whisperTranscription: whisperTranscription || undefined, // Cache Whisper transcription
      };

      const isUpdating = !!currentRecitationId;

      await saveRecitationUniversal(recitation);
      setCurrentRecitationId(recitation.id);
      setShowSaveDialog(false);

      // Log what was saved
      if (whisperTranscription) {
        console.log(
          `💾 Saved recitation with Whisper cache (${whisperTranscription.segments.length} segments)`
        );
      }

      alert(
        isUpdating
          ? "Recitation updated successfully!"
          : "Recitation saved successfully!"
      );
    } catch (error) {
      console.error("Failed to save recitation:", error);
      alert("Failed to save recitation. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenRename = () => {
    if (currentRecitationId) {
      setNewRecitationName(recitationName);
      setShowRenameDialog(true);
    }
  };

  const handleRename = async () => {
    if (!currentRecitationId || !newRecitationName.trim() || !user) return;

    try {
      // Update reciter_name in Supabase
      const newReciterName = newRecitationName.trim().split(" - ")[0];
      await updateRecitation(currentRecitationId, {
        reciter_name: newReciterName,
      });
      setRecitationName(newRecitationName.trim());
      setShowRenameDialog(false);
      setNewRecitationName("");
      alert("Recitation renamed successfully!");
    } catch (error) {
      console.error("Failed to rename recitation:", error);
      alert("Failed to rename recitation. Please try again.");
    }
  };

  // Helper function to chunk large audio files using FFmpeg
  // UNUSED - Legacy function (keeping for reference)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const chunkAudioFile = async (
    file: File
  ): Promise<{ chunks: File[]; chunkUrls: string[] }> => {
    const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB

    console.log(`🔪 [Chunking] Starting to chunk audio file: ${file.name}`);
    console.log(
      `📦 [Chunking] File size: ${(file.size / 1024 / 1024).toFixed(2)} MB`
    );

    // If file is small enough, return as-is
    if (file.size < MAX_CHUNK_SIZE) {
      console.log(`✅ [Chunking] File is small enough, no chunking needed`);
      return { chunks: [file], chunkUrls: [] }; // Empty array means no temp chunks to clean
    }

    try {
      console.log(`🎬 [Chunking] Loading FFmpeg...`);
      const ffmpeg = await loadFFmpeg();

      // Get audio duration first
      const audio = document.createElement("audio");
      audio.src = URL.createObjectURL(file);
      await new Promise((resolve) => {
        audio.onloadedmetadata = resolve;
      });
      const duration = audio.duration;
      URL.revokeObjectURL(audio.src);

      console.log(`🎵 [Chunking] Audio duration: ${duration.toFixed(2)}s`);

      // Calculate number of chunks needed based on FILE SIZE (not duration)
      const numChunks = Math.ceil(file.size / MAX_CHUNK_SIZE);
      const chunkDuration = duration / numChunks; // Divide duration evenly

      console.log(
        `🔪 [Chunking] Will create ${numChunks} chunks based on file size (${(
          MAX_CHUNK_SIZE /
          1024 /
          1024
        ).toFixed(0)}MB max per chunk)`
      );
      console.log(
        `⏱️ [Chunking] Each chunk will be ~${(chunkDuration / 60).toFixed(
          1
        )} minutes`
      );

      // Write input file to FFmpeg filesystem
      const arrayBuffer = await file.arrayBuffer();
      await ffmpeg.writeFile("input.mp3", new Uint8Array(arrayBuffer));

      const chunks: File[] = [];
      const chunkUrls: string[] = [];

      for (let i = 0; i < numChunks; i++) {
        const startTime = i * chunkDuration;
        const endTime = Math.min((i + 1) * chunkDuration, duration);

        console.log(
          `🔪 [Chunking] Creating chunk ${
            i + 1
          }/${numChunks}: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`
        );

        const outputName = `chunk_${i}.mp3`;

        // Use FFmpeg to cut the file (copy codec, no re-encoding!)
        await ffmpeg.exec([
          "-i",
          "input.mp3",
          "-ss",
          startTime.toString(),
          "-to",
          endTime.toString(),
          "-c",
          "copy", // Just copy, no re-encoding!
          outputName,
        ]);

        // Read the chunk file
        const chunkData = await ffmpeg.readFile(outputName);
        // Convert to standard Uint8Array to avoid type issues
        const uint8Data =
          chunkData instanceof Uint8Array
            ? new Uint8Array(chunkData)
            : new TextEncoder().encode(chunkData as string);
        const chunkBlob = new Blob([uint8Data], { type: "audio/mpeg" });
        const chunkFile = new File([chunkBlob], `chunk_${i}.mp3`, {
          type: "audio/mpeg",
        });

        chunks.push(chunkFile);
        console.log(
          `✅ [Chunking] Chunk ${i + 1} created: ${(
            chunkFile.size /
            1024 /
            1024
          ).toFixed(2)} MB`
        );

        // Upload chunk to S3 with whisper-chunk- prefix
        console.log(
          `☁️  [Chunking] Uploading chunk ${i + 1}/${numChunks} to S3...`
        );

        const presignedResponse = await fetch("/api/upload-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: `whisper-chunk-${Date.now()}-${i}.mp3`,
            contentType: chunkFile.type,
          }),
        });

        if (!presignedResponse.ok) {
          throw new Error(`Failed to get presigned URL for chunk ${i + 1}`);
        }

        const { uploadUrl, fileUrl } = await presignedResponse.json();

        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": chunkFile.type },
          body: chunkFile,
        });

        if (!uploadResponse.ok) {
          throw new Error(`Failed to upload chunk ${i + 1} to S3`);
        }

        chunkUrls.push(fileUrl);
        console.log(`✅ [Chunking] Chunk ${i + 1}/${numChunks} uploaded to S3`);

        // Clean up FFmpeg file
        await ffmpeg.deleteFile(outputName);
      }

      // Clean up input file
      await ffmpeg.deleteFile("input.mp3");

      console.log(
        `🎉 [Chunking] All ${numChunks} chunks created and uploaded!`
      );
      return { chunks, chunkUrls };
    } catch (error) {
      console.error("❌ [Chunking] Error chunking audio:", error);
      // If chunking fails, return empty arrays (will show error to user)
      alert(
        "Failed to chunk large audio file. Please try compressing it first or use a shorter audio clip."
      );
      return { chunks: [], chunkUrls: [] };
    }
  };

  const handleTranscribe = async () => {
    if (!selectedSurah || !user) return;

    // Check if we need an audio file
    if (!audioFile) {
      alert("Please upload an audio file first.");
      return;
    }

    // 💰 STEP 1: Show cost estimation dialog
    try {
      // Calculate rough audio duration estimate
      const audioSizeMB = audioFile.size / (1024 * 1024);
      const estimatedAudioMinutes = audioSizeMB / 0.5; // Rough estimate: 1MB ≈ 2 minutes of MP3
      const estimatedAyahs =
        SURAHS.find((s) => s.number === selectedSurah)?.ayahs || 0;

      const estimate = estimateTranscriptionCost({
        audioDurationMinutes: estimatedAudioMinutes,
        audioSizeMB,
        estimatedAyahs,
      });

      setCostEstimate(estimate);
      setShowCostDialog(true);

      // Wait for user confirmation
      const confirmed = await new Promise<boolean>((resolve) => {
        // Create a one-time event listener for user response
        const handler = (e: CustomEvent) => {
          resolve(e.detail.confirmed);
        };
        window.addEventListener(
          "cost-dialog-response",
          handler as EventListener,
          { once: true }
        );

        // Set a timeout to auto-reject after 5 minutes
        setTimeout(() => {
          resolve(false);
        }, 300000);
      });

      setShowCostDialog(false);

      if (!confirmed) {
        console.log("❌ User cancelled transcription");
        return;
      }

      // Check token balance
      if (tokenBalance < estimate.totalTokens) {
        alert(
          `Insufficient tokens!\n\nYou need ${estimate.totalTokens} tokens but only have ${tokenBalance}.\n\nPlease purchase more tokens to continue.`
        );
        return;
      }

      // Reserve tokens by deducting them upfront
      console.log(
        `💰 Reserving ${estimate.totalTokens} tokens for transcription...`
      );
      await reserveTokens(
        user.id,
        estimate.totalTokens,
        `Reserved for ${SURAHS.find((s) => s.number === selectedSurah)?.name}`,
        { surahNumber: selectedSurah, recitationId: currentRecitationId }
      );
      setTokenBalance((prev) => prev - estimate.totalTokens);
      console.log(
        `✅ Tokens reserved. New balance: ${
          tokenBalance - estimate.totalTokens
        }`
      );
    } catch (error) {
      console.error("❌ Failed to process cost estimation:", error);
      alert("Failed to process cost estimation. Please try again.");
      return;
    }

    setIsTranscribing(true);
    setSegments([]);
    setOriginalSegments([]);
    setTranscriptionProgress({
      current: 0,
      total: 0,
      percentage: 0,
      message: "",
    });

    try {
      let finalTranscription = whisperTranscription;
      const allMappedSegments: Segment[] = [];

      // If we don't have cached transcription, need to transcribe with Whisper
      if (!finalTranscription && audioFile && audioUrl) {
        console.log(`🎤 Starting Whisper transcription for ${audioFile.name}`);

        setTranscriptionProgress({
          current: 0,
          total: 1,
          percentage: 50,
          message: "Transcribing with Whisper (AWS Lambda)...",
        });

        // Check authentication before calling Lambda
        if (!session?.access_token) {
          throw new Error(
            "You must be logged in to transcribe audio. Please log in and try again."
          );
        }

        console.log(`🚀 Calling Lambda for transcription...`);
        console.log(`🔗 Audio URL: ${audioUrl}`);

        // 🚀 Using Lambda Function URL (15-minute timeout, no API Gateway 30s limit!)
        const response = await fetch(
          "https://ecwm5k4fe5epg4ng52at2gyhva0aqkjz.lambda-url.eu-north-1.on.aws/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              audioUrl: audioUrl,
              surahNumber: selectedSurah,
            }),
          }
        );

        const data = await response.json();

        // Check for success flag (Lambda always returns 200, error details in body)
        if (!data.success) {
          console.error("❌ Lambda error details:", data);
          throw new Error(
            data.error || data.details?.message || "Transcription failed"
          );
        }

        if (!data.transcription) {
          throw new Error("No transcription data returned from Lambda");
        }

        finalTranscription = data.transcription;

        // 💰 Store Lambda usage data for cost calculation later
        const lambdaUsage = data.usage || {};
        console.log("📊 Lambda usage data:", lambdaUsage);

        console.log(
          `🎉 Whisper complete! Total: ${
            finalTranscription?.segments?.length || 0
          } segments`
        );
        setWhisperTranscription(finalTranscription);

        // Store usage data in a variable we can access later
        (
          window as unknown as { __whisperUsageData: typeof lambdaUsage }
        ).__whisperUsageData = lambdaUsage;

        // Save Whisper transcription
        if (currentRecitationId && finalTranscription && user) {
          const recitationData = await getRecitation(currentRecitationId);
          const existingRecitation = recitationData
            ? recitationToSavedRecitation(recitationData)
            : null;

          if (existingRecitation) {
            await saveRecitationUniversal({
              ...existingRecitation,
              whisperTranscription: finalTranscription,
              lastModified: new Date().toISOString(),
            });
            console.log(
              `💾 Saved Whisper cache (${
                finalTranscription.segments?.length || 0
              } segments)`
            );
          }
        }
      } else if (finalTranscription) {
        console.log(
          `📦 Using cached Whisper transcription (${
            finalTranscription.segments?.length || 0
          } segments)`
        );
      }

      // Step 2: AI Mapping (runs whether using cached or fresh Whisper data)
      if (finalTranscription) {
        const totalAyahs =
          SURAHS.find((s) => s.number === selectedSurah)?.ayahs || 0;

        console.log(
          `🧠 Starting AI mapping: ${finalTranscription.segments.length} Whisper segments → ${totalAyahs} ayahs (ONE API call with simplified Quran data)`
        );

        setTranscriptionProgress({
          current: 0,
          total: 1,
          percentage: 80, // 80% progress
          message: `AI mapping to ${totalAyahs} ayahs...`,
        });

        const mappingResponse = await fetch("/api/transcribe-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cachedTranscription: finalTranscription,
            surahNumber: selectedSurah,
          }),
        });

        const mappingData = await mappingResponse.json();

        if (mappingData.error) {
          throw new Error(`AI mapping failed: ${mappingData.error}`);
        }

        // 💰 Capture GPT usage data
        const gptUsage = mappingData.usage || {
          gpt5InputTokens: 0,
          gpt5OutputTokens: 0,
        };
        console.log("📊 GPT usage data:", gptUsage);

        if (mappingData.segments) {
          allMappedSegments.push(...mappingData.segments);
          console.log(
            `✅ AI mapping complete! Got ${mappingData.segments.length} segments`
          );

          // 💰 STEP 2: Calculate actual cost and record usage
          if (currentRecitationId) {
            try {
              const whisperUsage =
                (
                  window as unknown as {
                    __whisperUsageData?: {
                      audioDurationSeconds?: number;
                      audioSizeBytes?: number;
                      lambdaExecutionMs?: number;
                      whisperSegmentCount?: number;
                    };
                  }
                ).__whisperUsageData || {};

              // Build actual usage object
              const actualUsage = {
                audioDurationSeconds: whisperUsage.audioDurationSeconds || 0,
                audioSizeBytes: whisperUsage.audioSizeBytes || 0,
                whisperSegmentsCount: finalTranscription?.segments?.length || 0,
                gpt5InputTokens: gptUsage.gpt5InputTokens || 0,
                gpt5OutputTokens: gptUsage.gpt5OutputTokens || 0,
                lambdaExecutionMs: whisperUsage.lambdaExecutionMs || 0,
              };

              console.log(
                "💰 Calculating actual cost from usage:",
                actualUsage
              );
              const actualCost = calculateActualCost(actualUsage);
              console.log("💰 Actual cost breakdown:", actualCost);

              // Record usage in database
              await recordTranscriptionUsage(
                user.id,
                currentRecitationId,
                actualCost,
                actualUsage
              );

              console.log("✅ Usage recorded in database");

              // If actual cost is different from estimate, handle refund/additional charge
              if (
                costEstimate &&
                costEstimate.totalTokens !== actualCost.totalTokens
              ) {
                const difference =
                  costEstimate.totalTokens - actualCost.totalTokens;
                if (difference > 0) {
                  console.log(
                    `💰 Refunding ${difference} tokens (estimate was higher than actual)`
                  );
                  // TODO: Implement refund logic
                } else if (difference < 0) {
                  console.log(
                    `⚠️ Actual cost exceeded estimate by ${Math.abs(
                      difference
                    )} tokens`
                  );
                  // This shouldn't happen often, but if it does, we've already reserved enough
                }
              }

              // Update token balance display
              const newBalance = await getUserTokenBalance(user.id);
              setTokenBalance(newBalance.balanceTokens);

              // Clean up temporary storage
              delete (window as unknown as { __whisperUsageData?: unknown })
                .__whisperUsageData;
            } catch (error) {
              console.error("❌ Failed to record usage:", error);
              // Don't throw - the transcription succeeded, just usage recording failed
            }
          }

          // Save after mapping
          setOriginalSegments(allMappedSegments);
          if (currentRecitationId && user) {
            const recitationData = await getRecitation(currentRecitationId);
            const existingRecitation = recitationData
              ? recitationToSavedRecitation(recitationData)
              : null;

            if (existingRecitation) {
              await saveRecitationUniversal({
                ...existingRecitation,
                segments: allMappedSegments,
                whisperTranscription: finalTranscription,
                lastModified: new Date().toISOString(),
              });
              console.log(
                `💾 Saved ${allMappedSegments.length} mapped segments`
              );
            }
          }
        }

        console.log(
          `🎉 AI mapping complete! Total mapped segments: ${allMappedSegments.length}`
        );
      }

      // Use the mapped segments
      if (allMappedSegments.length > 0) {
        console.log(`✅ Final detection: ${allMappedSegments.length} segments`);

        setOriginalSegments(allMappedSegments);

        // IMMEDIATELY save to Supabase (don't wait for user to click Save!)
        if (currentRecitationId && user) {
          const recitationData = await getRecitation(currentRecitationId);
          if (recitationData) {
            const existingRecitation =
              recitationToSavedRecitation(recitationData);
            const updatedRecitation = {
              ...existingRecitation,
              segments: allMappedSegments,
              whisperTranscription: finalTranscription || undefined,
              lastModified: new Date().toISOString(),
            };
            await saveRecitationUniversal(updatedRecitation);
            console.log(
              `✅ Auto-saved to Supabase: ${allMappedSegments.length} segments + Whisper cache`
            );
          }
        }

        // Show success message with stats
        const expectedAyahs =
          SURAHS.find((s) => s.number === selectedSurah)?.ayahs || 0;
        const detectedSegments = allMappedSegments.length;

        const cachedMessage = whisperTranscription
          ? "\n\n✅ Used cached Whisper from localStorage (only GPT-4o cost)"
          : "\n\n💾 Whisper cached to localStorage (re-mapping only costs GPT-4o)";

        if (Math.abs(detectedSegments - expectedAyahs) <= 5) {
          alert(
            `🎯 GPT-4o Detection successful!\n\nDetected: ${detectedSegments} segments\nExpected: ${expectedAyahs} ayahs${cachedMessage}`
          );
        } else {
          alert(
            `⚠️ GPT-4o Detection completed with potential issues:\n\nDetected: ${detectedSegments} segments\nExpected: ${expectedAyahs} ayahs\n\nYou may need to manually adjust some segments.${cachedMessage}`
          );
        }
      }
    } catch (error) {
      console.error("AI detection failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      alert(
        `AI detection failed: ${errorMessage}\n\nPlease try again or use silence detection.`
      );
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress({
        current: 0,
        total: 0,
        percentage: 0,
        message: "",
      });
    }
  };

  // UNUSED - Legacy function (keeping for reference)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSilenceDetection = async () => {
    // Ensure audio file is loaded
    const file = await ensureAudioFileLoaded();
    if (!file) {
      alert("Please load the audio file first.");
      return;
    }

    setSegments([]);
    setOriginalSegments([]);

    try {
      const detectedSegments = await detectSilenceSegments(file, {
        minSilenceDuration,
        silenceThreshold,
      });

      setOriginalSegments(detectedSegments);

      // IMMEDIATELY save to Supabase (don't wait for user to click Save!)
      if (currentRecitationId && user) {
        const recitationData = await getRecitation(currentRecitationId);
        if (recitationData) {
          const existingRecitation =
            recitationToSavedRecitation(recitationData);
          const updatedRecitation = {
            ...existingRecitation,
            segments: detectedSegments,
            lastModified: new Date().toISOString(),
          };
          await saveRecitationUniversal(updatedRecitation);
          console.log(
            `✅ Auto-saved ${detectedSegments.length} silence-detected segments to Supabase`
          );
        }
      }
    } catch (error) {
      console.error("Silence detection failed:", error);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleFetchAyahText = async () => {
    if (!selectedSurah) return;

    setIsFetchingText(true);

    try {
      const ayahs = await fetchSurahText(selectedSurah);
      const ayahTextsArray = ayahs.map((ayah, index) => ({
        ayahNumber: index + 1,
        text: ayah.text,
      }));
      setAyahTexts(ayahTextsArray);

      // Auto-assign ayah numbers if not already assigned
      if (segments.length > 0 && !segments[0]?.ayahNumber) {
        const updatedSegments = segments.map((segment, index) => ({
          ...segment,
          ayahNumber: index + 1, // Start from 1 by default
          text: ayahTextsArray[index]?.text || "",
        }));
        setSegments(updatedSegments);
      } else if (segments.length > 0) {
        // Just update text based on assigned numbers
        const updatedSegments = segments.map((segment) => ({
          ...segment,
          text:
            segment.ayahNumber !== undefined
              ? ayahTextsArray[segment.ayahNumber - 1]?.text || ""
              : "",
        }));
        setSegments(updatedSegments);
      }
    } catch (error) {
      console.error("Failed to fetch ayah text:", error);
      alert("Failed to fetch Quran text. Please try again.");
    } finally {
      setIsFetchingText(false);
    }
  };

  // Auto-renumber subsequent segments based on previous segment's ayah numbers
  const autoRenumberSubsequentSegments = (
    updatedSegments: Segment[],
    startIndex: number
  ) => {
    // Find the starting ayah number from previous segments
    let currentAyahNumber = 1;

    for (let i = 0; i <= startIndex; i++) {
      const segment = updatedSegments[i];
      if (segment.ayahNumbers && segment.ayahNumbers.length > 0) {
        currentAyahNumber = Math.max(...segment.ayahNumbers) + 1;
      } else if (segment.ayahNumber !== undefined) {
        currentAyahNumber = segment.ayahNumber + 1;
      } else {
        currentAyahNumber++;
      }
    }

    // Renumber all subsequent segments
    for (let i = startIndex + 1; i < updatedSegments.length; i++) {
      const segment = updatedSegments[i];

      // Only update if it's not a merged segment (preserve merged segments)
      if (!segment.ayahNumbers) {
        updatedSegments[i].ayahNumber = currentAyahNumber;
        updatedSegments[i].text = ayahTexts[currentAyahNumber - 1]?.text || "";
        currentAyahNumber++;
      } else {
        // For merged segments, advance the counter past all merged ayahs
        currentAyahNumber = Math.max(...segment.ayahNumbers) + 1;
      }
    }

    return updatedSegments;
  };

  const handleAyahNumberChange = (
    segmentIndex: number,
    newAyahNumber: number
  ) => {
    const updatedSegments = [...segments];
    updatedSegments[segmentIndex].ayahNumber = newAyahNumber;
    updatedSegments[segmentIndex].ayahNumbers = undefined; // Clear multiple ayahs if setting single
    updatedSegments[segmentIndex].text =
      ayahTexts[newAyahNumber - 1]?.text || "";

    // Auto-renumber all subsequent segments
    const finalSegments = autoRenumberSubsequentSegments(
      updatedSegments,
      segmentIndex
    );
    setSegments(finalSegments);
  };

  const handleAddAyahToSegment = (segmentIndex: number, ayahNumber: number) => {
    const updatedSegments = [...segments];
    const currentAyahNumbers = updatedSegments[segmentIndex].ayahNumbers || [
      updatedSegments[segmentIndex].ayahNumber || segmentIndex + 1,
    ];

    if (!currentAyahNumbers.includes(ayahNumber)) {
      const newAyahNumbers = [...currentAyahNumbers, ayahNumber].sort(
        (a, b) => a - b
      );
      updatedSegments[segmentIndex].ayahNumbers = newAyahNumbers;
      updatedSegments[segmentIndex].ayahNumber = undefined; // Clear single ayah
      updatedSegments[segmentIndex].text = newAyahNumbers
        .map((n) => ayahTexts[n - 1]?.text || "")
        .join(" ");

      // Auto-renumber all subsequent segments
      const finalSegments = autoRenumberSubsequentSegments(
        updatedSegments,
        segmentIndex
      );
      setSegments(finalSegments);
    }
  };

  const handleRemoveAyahFromSegment = (
    segmentIndex: number,
    ayahNumber: number
  ) => {
    const updatedSegments = [...segments];
    const currentAyahNumbers = updatedSegments[segmentIndex].ayahNumbers || [];

    const newAyahNumbers = currentAyahNumbers.filter((n) => n !== ayahNumber);

    if (newAyahNumbers.length === 0) {
      // If removing last ayah, reset to single ayah
      updatedSegments[segmentIndex].ayahNumber = segmentIndex + 1;
      updatedSegments[segmentIndex].ayahNumbers = undefined;
      updatedSegments[segmentIndex].text = ayahTexts[segmentIndex]?.text || "";
    } else if (newAyahNumbers.length === 1) {
      // If only one ayah left, convert to single ayah
      updatedSegments[segmentIndex].ayahNumber = newAyahNumbers[0];
      updatedSegments[segmentIndex].ayahNumbers = undefined;
      updatedSegments[segmentIndex].text =
        ayahTexts[newAyahNumbers[0] - 1]?.text || "";
    } else {
      updatedSegments[segmentIndex].ayahNumbers = newAyahNumbers;
      updatedSegments[segmentIndex].text = newAyahNumbers
        .map((n) => ayahTexts[n - 1]?.text || "")
        .join(" ");
    }

    // Auto-renumber all subsequent segments
    const finalSegments = autoRenumberSubsequentSegments(
      updatedSegments,
      segmentIndex
    );
    setSegments(finalSegments);
  };

  const handleAutoAssignAyahNumbers = () => {
    const updatedSegments = segments.map((segment, index) => ({
      ...segment,
      ayahNumber: index + 1,
      ayahNumbers: undefined,
      text: ayahTexts[index]?.text || "",
    }));
    setSegments(updatedSegments);
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleFixNumbering = () => {
    const renumbered = [...segments];
    let currentAyahNumber = 1;

    for (let i = 0; i < renumbered.length; i++) {
      const segment = renumbered[i];

      // If segment has merged ayahs, preserve them and advance counter
      if (segment.ayahNumbers && segment.ayahNumbers.length > 0) {
        currentAyahNumber = Math.max(...segment.ayahNumbers) + 1;
      }
      // If segment has a manually set single ayah, preserve it and advance counter
      else if (segment.ayahNumber !== undefined) {
        currentAyahNumber = segment.ayahNumber + 1;
      }
      // Otherwise, auto-assign the next ayah number
      else {
        renumbered[i] = {
          ...renumbered[i],
          ayahNumber: currentAyahNumber,
          text: ayahTexts[currentAyahNumber - 1]?.text || "",
        };
        currentAyahNumber++;
      }
    }

    setSegments(renumbered);
  };

  const handleDownload = async () => {
    if (!selectedSurah || segments.length === 0) return;

    // Ensure audio file is loaded
    const file = await ensureAudioFileLoaded();
    if (!file) {
      alert("Please load the audio file first.");
      return;
    }

    try {
      setIsLoadingFFmpeg(true);
      await loadFFmpeg();
      setIsLoadingFFmpeg(false);

      setIsDownloading(true);

      // Apply padding at download time
      const paddedSegments = segments.map((segment, index) => ({
        ...segment,
        start:
          index > 0
            ? Math.max(segment.start - endPadding, segments[index - 1].end)
            : Math.max(segment.start - endPadding, 0),
        end:
          index < segments.length - 1
            ? Math.min(segment.end + endPadding, segments[index + 1].start)
            : segment.end + endPadding,
      }));

      const zipBlob = await splitAudioIntoAyahs(
        file,
        paddedSegments,
        selectedSurah
      );

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `surah_${selectedSurah
        .toString()
        .padStart(3, "0")}_ayahs.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
    } finally {
      setIsDownloading(false);
      setIsLoadingFFmpeg(false);
    }
  };

  const selectedSurahInfo = selectedSurah
    ? SURAHS.find((s) => s.number === selectedSurah)
    : null;

  const hasText = ayahTexts.length > 0;

  // Show loading state while waiting for auth or recitation data
  if (recitationId && !user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
          <p className="text-muted-foreground">Loading recitation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="w-full max-w-4xl mx-auto">
        <Card className="transition-all duration-200 hover:border-primary/30">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl">
                  {recitationName || "New Recitation"}
                </CardTitle>
                <CardDescription>
                  {selectedSurah && (
                    <span>
                      {
                        SURAHS.find((s) => s.number === selectedSurah)
                          ?.transliteration
                      }{" "}
                      ({SURAHS.find((s) => s.number === selectedSurah)?.name}) •{" "}
                      {SURAHS.find((s) => s.number === selectedSurah)?.ayahs}{" "}
                      ayahs
                    </span>
                  )}
                </CardDescription>
              </div>
              {currentRecitationId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenRename}
                  className="cursor-pointer gap-1"
                  title="Rename recitation"
                >
                  <FiEdit2 size={14} /> Rename
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Audio Preview - Right below recitation name */}
            {audioFile && audioUrl && (
              <div className="space-y-2">
                <audio
                  controls
                  src={audioUrl}
                  className="w-full h-10"
                  preload="metadata"
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* File Info - Read Only */}
            {audioFile && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">MP3 File</Label>
                <div className="text-sm text-muted-foreground p-3 bg-muted rounded-md">
                  <span className="font-medium">{audioFile.name}</span>
                </div>
                {audioUrl && (
                  <div className="text-sm text-green-600 dark:text-green-400 p-3 bg-green-50 dark:bg-green-950 rounded-md flex items-center gap-2">
                    <FiCheckCircle /> Uploaded to cloud storage
                  </div>
                )}
              </div>
            )}

            {isFetchingAudio && (
              <div className="w-full p-3 border rounded-md bg-muted/50 flex items-center gap-2 text-sm">
                <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                Fetching file from cloud storage...
              </div>
            )}

            {isUploading && (
              <div className="text-sm text-blue-600 dark:text-blue-400 p-3 bg-blue-50 dark:bg-blue-950 rounded-md flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                Uploading to cloud storage...
              </div>
            )}

            {/* Show "Load Audio" prompt when audio URL exists but file not loaded */}
            {audioUrl && !audioFile && !isFetchingAudio && (
              <div className="space-y-3 p-4 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 rounded-md">
                <div className="flex items-start gap-3">
                  <FiAlertCircle
                    className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
                    size={20}
                  />
                  <div className="flex-1 space-y-2">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      Audio file in cloud storage
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Load the audio file to start Whisper AI detection or view
                      the waveform.
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() =>
                    loadAudioFromS3(audioUrl, recitationName || "audio.mp3")
                  }
                  variant="outline"
                  size="sm"
                  className="cursor-pointer w-full border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900"
                >
                  Load Audio File
                </Button>
              </div>
            )}

            {audioFile && selectedSurah && selectedSurahInfo && (
              <>
                {/* Detection options */}
                {segments.length === 0 && (
                  <>
                    <div className="space-y-3">
                      <Button
                        onClick={() => handleTranscribe()}
                        disabled={isTranscribing || !selectedSurah}
                        variant="outline"
                        className="cursor-pointer transition-all duration-200 hover:bg-accent w-full"
                        size="lg"
                      >
                        {isTranscribing
                          ? "AI Detection..."
                          : "Whisper + AI Detection"}
                      </Button>

                      {/* Progress indicator */}
                      {isTranscribing && transcriptionProgress.message && (
                        <div className="space-y-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-blue-700 dark:text-blue-300">
                              {transcriptionProgress.message}
                            </span>
                            {transcriptionProgress.total > 0 && (
                              <span className="text-blue-600 dark:text-blue-400">
                                {transcriptionProgress.current}/
                                {transcriptionProgress.total}
                              </span>
                            )}
                          </div>
                          {transcriptionProgress.percentage > 0 && (
                            <div className="w-full bg-blue-200 dark:bg-blue-900 rounded-full h-2">
                              <div
                                className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                                style={{
                                  width: `${transcriptionProgress.percentage}%`,
                                }}
                              ></div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Silence Detection Settings - Hidden for now */}
                    {false && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Silence Detection Settings
                        </Label>
                        <div className="space-y-2">
                          <div>
                            <Label
                              htmlFor="min-silence"
                              className="text-xs text-muted-foreground"
                            >
                              Min Silence Duration:{" "}
                              {minSilenceDuration.toFixed(2)}s
                            </Label>
                            <input
                              id="min-silence"
                              type="range"
                              min="0.1"
                              max="1"
                              step="0.05"
                              value={minSilenceDuration}
                              onChange={(e) =>
                                setMinSilenceDuration(
                                  parseFloat(e.target.value)
                                )
                              }
                              className="w-full cursor-pointer"
                            />
                          </div>
                          <div>
                            <Label
                              htmlFor="silence-threshold"
                              className="text-xs text-muted-foreground"
                            >
                              Sensitivity: {silenceThreshold.toFixed(3)}
                            </Label>
                            <input
                              id="silence-threshold"
                              type="range"
                              min="0.001"
                              max="0.05"
                              step="0.001"
                              value={silenceThreshold}
                              onChange={(e) =>
                                setSilenceThreshold(parseFloat(e.target.value))
                              }
                              className="w-full cursor-pointer"
                            />
                          </div>
                          <div className="flex justify-between items-center">
                            <p className="text-xs text-muted-foreground">
                              Not detecting enough? Increase sensitivity →
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSilenceThreshold(0.04);
                                setMinSilenceDuration(0.2);
                              }}
                              className="text-xs h-6 cursor-pointer"
                            >
                              Reset
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Show info if loaded recitation */}
                {currentRecitationId && segments.length > 0 && (
                  <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                    <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                      <FiCheckCircle /> Recitation loaded with {segments.length}{" "}
                      segments
                    </p>
                    {audioFile && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                        <FiCheckCircle size={12} /> Audio attached - Ready to
                        download
                      </p>
                    )}
                    {!audioFile && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                        <FiAlertCircle size={12} /> Upload audio file to enable
                        downloads
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {segments.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Waveform Editor</CardTitle>
                  <CardDescription>
                    {segments.length} segments detected • Drag to adjust
                    boundaries
                  </CardDescription>
                </div>
                <TooltipProvider delayDuration={300}>
                  <div className="flex gap-2">
                    {currentRecitationId && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            asChild
                            variant="default"
                            size="sm"
                            className="cursor-pointer gap-2"
                          >
                            <Link href={`/reader/${currentRecitationId}`}>
                              <FiExternalLink className="h-4 w-4" />
                              Open in Reader
                            </Link>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Open in Reader</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleSaveProject}
                          disabled={isSaving || segments.length === 0}
                          variant="outline"
                          size="sm"
                          className="cursor-pointer"
                        >
                          <FiSave className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {currentRecitationId
                            ? "Update Recitation"
                            : "Save Recitation"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={handleDownload}
                          disabled={
                            isDownloading || isLoadingFFmpeg || !audioFile
                          }
                          variant="outline"
                          size="sm"
                          className="cursor-pointer"
                        >
                          <FiDownload className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Download Individual Ayah MP3s</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasText && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-1">
                    <FiBook size={12} className="mt-0.5 shrink-0" /> Text loaded
                    (1-to-1 mapping) • Click on waveform regions to play
                  </p>
                </div>
              )}

              {!audioFile && audioUrl && (
                <div className="p-6 bg-muted rounded-lg flex flex-col items-center justify-center gap-4">
                  <FiAlertCircle size={32} className="text-muted-foreground" />
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium">Audio file not loaded</p>
                    <p className="text-xs text-muted-foreground">
                      Load the audio file to view and edit the waveform
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      loadAudioFromS3(audioUrl, recitationName || "audio.mp3")
                    }
                    disabled={isFetchingAudio}
                    size="sm"
                    className="cursor-pointer"
                  >
                    {isFetchingAudio ? "Loading..." : "Load Audio File"}
                  </Button>
                </div>
              )}

              {audioFile && (
                <>
                  <div className="space-y-2">
                    <Label
                      htmlFor="end-padding"
                      className="text-sm font-medium"
                    >
                      Padding (Start & End): {endPadding.toFixed(2)}s
                    </Label>
                    <input
                      id="end-padding"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={endPadding}
                      onChange={(e) =>
                        setEndPadding(parseFloat(e.target.value))
                      }
                      className="w-full cursor-pointer"
                    />
                    <p className="text-xs text-muted-foreground">
                      Extra time added to downloads (not shown on waveform)
                    </p>
                  </div>

                  <WaveformEditor
                    audioFile={audioFile}
                    segments={segments}
                    onSegmentsChange={setSegments}
                    selectedSurahAyahCount={selectedSurahInfo?.ayahs}
                    onSegmentSelect={setSelectedSegmentIndex}
                  />
                </>
              )}

              {selectedSegmentIndex !== null && ayahTexts.length > 0 && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Edit Segment {selectedSegmentIndex + 1}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedSegmentIndex(null)}
                        className="cursor-pointer h-7 px-2"
                      >
                        ✕
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Current assignment:{" "}
                      {segments[selectedSegmentIndex]?.ayahNumbers
                        ? `Ayahs ${segments[
                            selectedSegmentIndex
                          ].ayahNumbers!.join(", ")}`
                        : `Ayah ${
                            segments[selectedSegmentIndex]?.ayahNumber ||
                            selectedSegmentIndex + 1
                          }`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedSegmentIndex < segments.length - 1 && (
                      <div className="p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded text-xs">
                        <p className="text-blue-700 dark:text-blue-300 flex items-start gap-1">
                          <FiInfo size={12} className="mt-0.5 shrink-0" />{" "}
                          <strong>Auto-renumbering:</strong> Changes here will
                          automatically update all following segments
                        </p>
                      </div>
                    )}
                    {/* Current Ayah(s) Display */}
                    <div className="p-4 bg-background rounded-lg border-2 border-primary/20">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">
                          Assigned Ayah(s):
                        </p>
                        {segments[selectedSegmentIndex]?.ayahNumbers &&
                          segments[selectedSegmentIndex].ayahNumbers!.length >
                            1 && (
                            <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 px-2 py-1 rounded flex items-center gap-1">
                              <FiLink size={10} /> Merged
                            </span>
                          )}
                      </div>
                      <div className="space-y-2">
                        {segments[selectedSegmentIndex]?.ayahNumbers ? (
                          segments[selectedSegmentIndex].ayahNumbers!.map(
                            (ayahNum) => (
                              <div
                                key={ayahNum}
                                className="flex items-start gap-2 p-2 bg-muted/50 rounded"
                              >
                                <span className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs font-semibold min-w-10 text-center">
                                  {ayahNum}
                                </span>
                                <p className="flex-1 text-sm" dir="rtl">
                                  {ayahTexts[ayahNum - 1]?.text || "No text"}
                                </p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleRemoveAyahFromSegment(
                                      selectedSegmentIndex,
                                      ayahNum
                                    )
                                  }
                                  className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10 cursor-pointer"
                                >
                                  ✕
                                </Button>
                              </div>
                            )
                          )
                        ) : (
                          <div className="flex items-start gap-2 p-2 bg-muted/50 rounded">
                            <span className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs font-semibold min-w-10 text-center">
                              {segments[selectedSegmentIndex]?.ayahNumber ||
                                selectedSegmentIndex + 1}
                            </span>
                            <p className="flex-1 text-sm" dir="rtl">
                              {segments[selectedSegmentIndex]?.ayahNumber === 0
                                ? "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
                                : ayahTexts[
                                    (segments[selectedSegmentIndex]
                                      ?.ayahNumber ||
                                      selectedSegmentIndex + 1) - 1
                                  ]?.text || "No text available"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Change to Single Ayah */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="ayah-select"
                        className="text-sm font-medium"
                      >
                        Change to Different Ayah
                      </Label>
                      <Select
                        value={
                          segments[selectedSegmentIndex]?.ayahNumbers
                            ? ""
                            : segments[
                                selectedSegmentIndex
                              ]?.ayahNumber?.toString() ||
                              (selectedSegmentIndex + 1).toString()
                        }
                        onValueChange={(value) =>
                          handleAyahNumberChange(
                            selectedSegmentIndex,
                            parseInt(value)
                          )
                        }
                      >
                        <SelectTrigger
                          id="ayah-select"
                          className="cursor-pointer"
                        >
                          <SelectValue placeholder="Select single ayah" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          <SelectItem value="0" className="cursor-pointer">
                            0 - Bismillah
                          </SelectItem>
                          {ayahTexts.map((ayahText, index) => (
                            <SelectItem
                              key={index + 1}
                              value={(index + 1).toString()}
                              className="cursor-pointer"
                            >
                              <div className="flex gap-2 items-center">
                                <span className="font-medium">{index + 1}</span>
                                <span
                                  className="text-xs text-muted-foreground truncate max-w-xs"
                                  dir="rtl"
                                >
                                  {ayahText.text.substring(0, 40)}...
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Add Another Ayah (for merged segments) */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="add-ayah-select"
                        className="text-sm font-medium"
                      >
                        Add Another Ayah (Merged Segment)
                      </Label>
                      <Select
                        onValueChange={(value) =>
                          handleAddAyahToSegment(
                            selectedSegmentIndex,
                            parseInt(value)
                          )
                        }
                      >
                        <SelectTrigger
                          id="add-ayah-select"
                          className="cursor-pointer"
                        >
                          <SelectValue placeholder="+ Add ayah to this segment" />
                        </SelectTrigger>
                        <SelectContent className="max-h-64">
                          {ayahTexts.map((ayahText, index) => (
                            <SelectItem
                              key={index + 1}
                              value={(index + 1).toString()}
                              className="cursor-pointer"
                            >
                              <div className="flex gap-2 items-center">
                                <span className="font-medium">{index + 1}</span>
                                <span
                                  className="text-xs text-muted-foreground truncate max-w-xs"
                                  dir="rtl"
                                >
                                  {ayahText.text.substring(0, 40)}...
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground flex items-start gap-1">
                        <FiInfo size={12} className="mt-0.5 shrink-0" /> Use
                        this if this segment contains 2+ ayahs combined
                      </p>
                    </div>

                    <div className="pt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAutoAssignAyahNumbers}
                        className="flex-1 cursor-pointer"
                      >
                        Reset All (1:1)
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Save Recitation Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {currentRecitationId ? "Update Recitation" : "Save Recitation"}
            </DialogTitle>
            <DialogDescription>
              Save your segmentation work to continue editing later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="recitation-name">Recitation Name</Label>
              <Input
                id="recitation-name"
                value={recitationName}
                onChange={(e) => setRecitationName(e.target.value)}
                placeholder="e.g., Al-Fatiha - Take 1"
                className="cursor-text"
              />
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="flex items-center gap-2">
                <FiFile size={14} /> File: {audioFile?.name || "No file"}
              </p>
              <p className="flex items-center gap-2">
                <FiBook size={14} /> Surah:{" "}
                {selectedSurah
                  ? `${selectedSurah} - ${
                      SURAHS.find((s) => s.number === selectedSurah)
                        ?.transliteration
                    }`
                  : "None"}
              </p>
              <p className="flex items-center gap-2">
                <FiHash size={14} /> Segments: {segments.length}
              </p>
              <p className="flex items-center gap-2">
                <FiCheckCircle size={14} /> Ayah Text:{" "}
                {ayahTexts.length > 0
                  ? `${ayahTexts.length} ayahs`
                  : "Not loaded"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveDialog(false)}
              disabled={isSaving}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveConfirm}
              disabled={!recitationName.trim() || isSaving}
              className="cursor-pointer"
            >
              {isSaving ? (
                "Saving..."
              ) : (
                <>
                  <FiSave /> Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Recitation Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FiEdit2 /> Rename Recitation
            </DialogTitle>
            <DialogDescription>
              Enter a new name for your recitation.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="newRecitationName">Recitation Name</Label>
              <Input
                id="newRecitationName"
                value={newRecitationName}
                onChange={(e) => setNewRecitationName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename();
                  }
                }}
                placeholder="Enter recitation name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={!newRecitationName.trim()}
              className="cursor-pointer gap-2"
            >
              <FiEdit2 /> Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 💰 Cost Estimation Dialog */}
      {costEstimate && (
        <CostEstimationDialog
          open={showCostDialog}
          onOpenChange={setShowCostDialog}
          estimate={costEstimate}
          currentBalance={tokenBalance}
          onConfirm={() => {
            setShowCostDialog(false);
            window.dispatchEvent(
              new CustomEvent("cost-dialog-response", {
                detail: { confirmed: true },
              })
            );
          }}
          onCancel={() => {
            setShowCostDialog(false);
            window.dispatchEvent(
              new CustomEvent("cost-dialog-response", {
                detail: { confirmed: false },
              })
            );
          }}
          surahName={SURAHS.find((s) => s.number === selectedSurah)?.name}
        />
      )}
    </div>
  );
}
