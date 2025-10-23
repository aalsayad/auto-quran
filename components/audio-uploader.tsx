"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
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
import { SURAHS } from "@/lib/surah-data";
import { detectSurahFromFilename } from "@/lib/detect-surah";
import { splitAudioIntoAyahs, loadFFmpeg } from "@/lib/audio-splitter";
import { detectSilenceSegments } from "@/lib/silence-detector";
import { fetchSurahText } from "@/lib/quran-api";
import WaveformEditor from "@/components/waveform-editor";
import {
  saveProject,
  getProject,
  renameProject,
  type SavedProject,
} from "@/lib/library-storage";
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
} from "react-icons/fi";

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
  const projectId = params.projectId as string;
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null); // S3 URL for uploaded audio
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingAudio, setIsFetchingAudio] = useState(false); // Loading state when fetching from S3
  const [selectedSurah, setSelectedSurah] = useState<number | null>(null);
  const [detectedSurah, setDetectedSurah] = useState<number | null>(null);
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
  const [isDetectingSilence, setIsDetectingSilence] = useState(false);
  const [silenceThreshold, setSilenceThreshold] = useState(0.04);
  const [minSilenceDuration, setMinSilenceDuration] = useState(0.2);
  const [isFetchingText, setIsFetchingText] = useState(false);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<
    number | null
  >(null);
  const [ayahTexts, setAyahTexts] = useState<string[]>([]); // Store all ayah texts
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save/Load state
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [whisperTranscription, setWhisperTranscription] = useState<{
    segments: { start: number; end: number; text: string }[];
    text: string;
  } | null>(null);

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

      // Only clear segments if NOT loading a saved project
      // If we have a loaded project with segments, keep them
      if (!currentProjectId || segments.length === 0) {
        setSegments([]);
        setOriginalSegments([]);
        setAyahTexts([]);
        setSelectedSegmentIndex(null);

        const detected = detectSurahFromFilename(file.name);
        setDetectedSurah(detected);

        if (detected) {
          setSelectedSurah(detected);
        }
      } else {
        // Loaded project - audio file attached, ready to download
        console.log("📂 [Upload] Audio file attached to loaded project");
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
          text: ayahTexts[newSegmentNumber - 1] || "",
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
              text: ayahTexts[currentAyahNumber - 1] || "",
            };
            currentAyahNumber++;
          }
        }

        return renumbered;
      });
    }
  }, [segments, ayahTexts]);

  // Load project from URL params
  useEffect(() => {
    if (projectId) {
      console.log("Loading project:", projectId);
      const project = getProject(projectId);
      if (project) {
        console.log("Project found:", project);
        // Load project data
        setCurrentProjectId(project.id);
        setProjectName(project.name);
        setSelectedSurah(project.surahNumber);
        setSegments(project.segments);
        setOriginalSegments(project.segments);
        setAyahTexts(project.ayahTexts || []);
        if (project.silenceThreshold)
          setSilenceThreshold(project.silenceThreshold);
        if (project.minSilenceDuration)
          setMinSilenceDuration(project.minSilenceDuration);
        if (project.endPadding !== undefined) setEndPadding(project.endPadding);
        if (project.startPadding !== undefined)
          setStartPadding(project.startPadding);
        if (project.whisperTranscription) {
          setWhisperTranscription(project.whisperTranscription);
          console.log(
            `♻️ Loaded cached Whisper from localStorage (${project.whisperTranscription.segments.length} segments) - re-mapping is cheap!`
          );
        }

        // Load audio file from S3 if URL exists
        if (project.audioUrl) {
          setAudioUrl(project.audioUrl);
          console.log("📂 [Project] Audio URL found:", project.audioUrl);
          console.log("🔄 [Project] Loading audio file from S3...");

          // Fetch the audio file from S3 and set it as audioFile
          loadAudioFromS3(
            project.audioUrl,
            project.fileName || project.audioFileName || "audio.mp3"
          );
        }
      } else {
        console.log("Project not found for ID:", projectId);
        alert("Project not found. It may have been deleted.");
      }
    }
  }, [projectId]);

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Fetch audio file from S3 URL and convert to File object
  const loadAudioFromS3 = async (url: string, fileName: string) => {
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

    // If updating existing project, save directly without dialog
    if (currentProjectId) {
      await handleSaveConfirm();
      return;
    }

    // For new projects, show dialog to enter name
    if (!projectName) {
      const surahInfo = SURAHS.find((s) => s.number === selectedSurah);
      const defaultName = `${
        surahInfo?.transliteration || `Surah ${selectedSurah}`
      } - ${new Date().toLocaleDateString()}`;
      setProjectName(defaultName);
    }

    setShowSaveDialog(true);
  };

  const handleSaveConfirm = async () => {
    if (!projectName.trim() || !selectedSurah) return;

    setIsSaving(true);

    try {
      const surahInfo = SURAHS.find((s) => s.number === selectedSurah);
      const isUpdating = !!currentProjectId;
      const project: SavedProject = {
        id: currentProjectId || `project-${Date.now()}`,
        name: projectName.trim(),
        fileName: audioFile?.name || "Unknown file",
        audioUrl: audioUrl || undefined, // Save S3 URL
        surahNumber: selectedSurah,
        surahName: surahInfo?.transliteration || `Surah ${selectedSurah}`,
        dateCreated: currentProjectId
          ? getProject(currentProjectId)?.dateCreated ||
            new Date().toISOString()
          : new Date().toISOString(),
        createdAt: currentProjectId
          ? getProject(currentProjectId)?.createdAt || new Date().toISOString()
          : new Date().toISOString(),
        lastModified: new Date().toISOString(),
        segments,
        ayahTexts,
        silenceThreshold,
        minSilenceDuration,
        endPadding,
        startPadding,
        whisperTranscription: whisperTranscription || undefined, // Cache Whisper transcription
      };

      saveProject(project);
      setCurrentProjectId(project.id);
      setShowSaveDialog(false);

      // Log what was saved
      if (whisperTranscription) {
        console.log(
          `💾 Saved project with Whisper cache (${whisperTranscription.segments.length} segments)`
        );
      }

      alert(
        isUpdating
          ? "Project updated successfully!"
          : "Project saved successfully!"
      );
    } catch (error) {
      console.error("Failed to save project:", error);
      alert("Failed to save project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenRename = () => {
    if (currentProjectId) {
      setNewProjectName(projectName);
      setShowRenameDialog(true);
    }
  };

  const handleRename = () => {
    if (!currentProjectId || !newProjectName.trim()) return;

    try {
      renameProject(currentProjectId, newProjectName.trim());
      setProjectName(newProjectName.trim());
      setShowRenameDialog(false);
      setNewProjectName("");
      alert("Project renamed successfully!");
    } catch (error) {
      console.error("Failed to rename project:", error);
      alert("Failed to rename project. Please try again.");
    }
  };

  // Helper function to chunk large audio files using FFmpeg
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

  const handleTranscribe = async (forceRefresh = false) => {
    if (!selectedSurah) return;

    // Determine which transcription to use
    const cachedTranscription = forceRefresh ? null : whisperTranscription;

    // Check if we need an audio file (only if no cached transcription)
    if (!cachedTranscription && !audioFile) {
      alert("Please upload an audio file first.");
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

    let chunkUrls: string[] = []; // Track chunk URLs for cleanup

    try {
      let finalTranscription = cachedTranscription;
      const allMappedSegments: Segment[] = []; // Collect mapped segments from all chunks

      // If we don't have cached transcription, need to transcribe with Whisper
      if (!finalTranscription && audioFile) {
        console.log(
          forceRefresh
            ? `🔄 FORCING FRESH Whisper transcription for ${audioFile.name}`
            : `🎤 Starting Whisper transcription for ${audioFile.name}`
        );

        // Step 1: Chunk the audio file
        setTranscriptionProgress({
          current: 0,
          total: 1,
          percentage: 0,
          message: "Preparing audio chunks...",
        });

        const { chunks, chunkUrls: tempChunkUrls } = await chunkAudioFile(
          audioFile
        );
        chunkUrls = tempChunkUrls; // Save for cleanup in finally block
        console.log(`📦 Created ${chunks.length} chunk(s)`);

        if (chunks.length === 0) {
          throw new Error("Failed to create audio chunks");
        }

        // Get total audio duration to calculate chunk duration
        const audio = document.createElement("audio");
        audio.src = URL.createObjectURL(audioFile);
        await new Promise((resolve) => {
          audio.onloadedmetadata = resolve;
        });
        const totalDuration = audio.duration;
        URL.revokeObjectURL(audio.src);

        const chunkDuration = totalDuration / chunks.length;
        console.log(
          `⏱️ Calculated chunk duration: ${(chunkDuration / 60).toFixed(
            1
          )} minutes per chunk`
        );

        // Step 2A: Transcribe ALL audio chunks first (collect all Whisper segments)
        const allSegments: { start: number; end: number; text: string }[] = [];

        console.log(
          `🎤 Starting Whisper transcription for ${chunks.length} audio chunks...`
        );

        for (let i = 0; i < chunks.length; i++) {
          const chunkNum = i + 1;

          // ✅ Calculate ACTUAL time offset from chunk position (prevents drift!)
          const actualTimeOffset = i * chunkDuration; // Dynamic based on file size

          setTranscriptionProgress({
            current: chunkNum,
            total: chunks.length,
            percentage: Math.round((chunkNum / chunks.length) * 60), // 0-60% for transcription
            message: `Transcribing audio chunk ${chunkNum}/${chunks.length}...`,
          });

          console.log(
            `🎤 [Transcribe ${chunkNum}/${
              chunks.length
            }] Processing chunk at ${actualTimeOffset.toFixed(2)}s...`
          );

          // Use S3 URL if available (for chunked files), otherwise fall back to direct upload
          const response = await fetch("/api/transcribe-chunk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audioUrl: chunkUrls[i], // Use S3 URL from chunk upload
              chunkIndex: i,
              totalChunks: chunks.length,
              timeOffset: actualTimeOffset,
            }),
          });

          const data = await response.json();

          if (data.error) {
            throw new Error(
              `Chunk ${chunkNum} transcription failed: ${data.error}`
            );
          }

          if (data.segments && data.segments.length > 0) {
            allSegments.push(...data.segments);

            console.log(
              `✅ [Transcribe ${chunkNum}] Got ${
                data.segments.length
              } segments (total: ${
                allSegments.length
              }, offset: ${actualTimeOffset.toFixed(2)}s)`
            );
          }
        }

        // Merge and cache all transcriptions
        finalTranscription = {
          segments: allSegments,
          text: allSegments.map((s) => s.text).join(" "),
        };

        console.log(
          `🎉 Whisper complete! Total: ${finalTranscription.segments.length} segments`
        );
        setWhisperTranscription(finalTranscription);

        // Save Whisper transcription to localStorage
        if (currentProjectId) {
          const existingProject = getProject(currentProjectId);
          if (existingProject) {
            saveProject({
              ...existingProject,
              whisperTranscription: finalTranscription,
              lastModified: new Date().toISOString(),
            });
            console.log(
              `💾 Saved Whisper cache to localStorage (${allSegments.length} segments)`
            );
          }
        }
      } else if (finalTranscription) {
        console.log(
          `📦 Using cached Whisper transcription (${finalTranscription.segments.length} segments)`
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

        if (mappingData.segments) {
          allMappedSegments.push(...mappingData.segments);
          console.log(
            `✅ AI mapping complete! Got ${mappingData.segments.length} segments`
          );

          // Save after mapping
          setOriginalSegments(allMappedSegments);
          if (currentProjectId) {
            const existingProject = getProject(currentProjectId);
            if (existingProject) {
              saveProject({
                ...existingProject,
                segments: allMappedSegments,
                whisperTranscription: finalTranscription,
                lastModified: new Date().toISOString(),
              });
              console.log(
                `💾 Saved ${allMappedSegments.length} mapped segments to localStorage`
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

        // IMMEDIATELY save to localStorage (don't wait for user to click Save!)
        if (currentProjectId) {
          const existingProject = getProject(currentProjectId);
          if (existingProject) {
            const updatedProject = {
              ...existingProject,
              segments: allMappedSegments,
              whisperTranscription: finalTranscription || undefined,
              lastModified: new Date().toISOString(),
            };
            saveProject(updatedProject);
            console.log(
              `✅ Auto-saved to localStorage: ${allMappedSegments.length} segments + Whisper cache`
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
      // GUARANTEED CLEANUP - Always runs, even on error!
      if (chunkUrls.length > 0) {
        console.log(
          `🗑️  Cleaning up ${chunkUrls.length} temporary chunks from S3...`
        );

        const deletePromises = chunkUrls.map(async (chunkUrl) => {
          try {
            const response = await fetch("/api/delete-audio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audioUrl: chunkUrl }),
            });

            if (response.ok) {
              console.log(`✅ Deleted: ${chunkUrl.split("/").pop()}`);
            } else {
              console.warn(
                `⚠️  Failed to delete: ${chunkUrl.split("/").pop()}`
              );
            }
          } catch (error) {
            console.error(`❌ Error deleting chunk: ${chunkUrl}`, error);
          }
        });

        // Delete all chunks in parallel
        await Promise.all(deletePromises);
        console.log("✅ Cleanup complete!");
      }

      setIsTranscribing(false);
      setTranscriptionProgress({
        current: 0,
        total: 0,
        percentage: 0,
        message: "",
      });
    }
  };

  const handleFreshWhisperTranscription = async () => {
    if (!selectedSurah) return;

    console.log(
      "🗑️ Clearing cached Whisper transcription and forcing fresh transcription..."
    );

    // Clear cached Whisper transcription from state
    setWhisperTranscription(null);

    // Clear from localStorage immediately
    if (currentProjectId) {
      const existingProject = getProject(currentProjectId);
      if (existingProject) {
        saveProject({
          ...existingProject,
          whisperTranscription: undefined,
          lastModified: new Date().toISOString(),
        });
        console.log("✅ Cleared cached Whisper transcription from storage");
      }
    }

    // Run fresh transcription with forceRefresh=true to skip cache
    await handleTranscribe(true);
  };

  const handleSilenceDetection = async () => {
    if (!audioFile) return;

    setIsDetectingSilence(true);
    setSegments([]);
    setOriginalSegments([]);

    try {
      const detectedSegments = await detectSilenceSegments(audioFile, {
        minSilenceDuration,
        silenceThreshold,
      });

      setOriginalSegments(detectedSegments);

      // IMMEDIATELY save to localStorage (don't wait for user to click Save!)
      if (currentProjectId) {
        const existingProject = getProject(currentProjectId);
        if (existingProject) {
          const updatedProject = {
            ...existingProject,
            segments: detectedSegments,
            lastModified: new Date().toISOString(),
          };
          saveProject(updatedProject);
          console.log(
            `✅ Auto-saved ${detectedSegments.length} silence-detected segments to localStorage`
          );
        }
      }
    } catch (error) {
      console.error("Silence detection failed:", error);
    } finally {
      setIsDetectingSilence(false);
    }
  };

  const handleFetchAyahText = async () => {
    if (!selectedSurah) return;

    setIsFetchingText(true);

    try {
      const ayahs = await fetchSurahText(selectedSurah);
      const ayahTextsArray = ayahs.map((ayah) => ayah.text);
      setAyahTexts(ayahTextsArray);

      // Auto-assign ayah numbers if not already assigned
      if (segments.length > 0 && !segments[0]?.ayahNumber) {
        const updatedSegments = segments.map((segment, index) => ({
          ...segment,
          ayahNumber: index + 1, // Start from 1 by default
          text: ayahTextsArray[index] || "",
        }));
        setSegments(updatedSegments);
      } else if (segments.length > 0) {
        // Just update text based on assigned numbers
        const updatedSegments = segments.map((segment) => ({
          ...segment,
          text:
            segment.ayahNumber !== undefined
              ? ayahTextsArray[segment.ayahNumber - 1] || ""
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
        updatedSegments[i].text = ayahTexts[currentAyahNumber - 1] || "";
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
    updatedSegments[segmentIndex].text = ayahTexts[newAyahNumber - 1] || "";

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
        .map((n) => ayahTexts[n - 1] || "")
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
      updatedSegments[segmentIndex].text = ayahTexts[segmentIndex] || "";
    } else if (newAyahNumbers.length === 1) {
      // If only one ayah left, convert to single ayah
      updatedSegments[segmentIndex].ayahNumber = newAyahNumbers[0];
      updatedSegments[segmentIndex].ayahNumbers = undefined;
      updatedSegments[segmentIndex].text =
        ayahTexts[newAyahNumbers[0] - 1] || "";
    } else {
      updatedSegments[segmentIndex].ayahNumbers = newAyahNumbers;
      updatedSegments[segmentIndex].text = newAyahNumbers
        .map((n) => ayahTexts[n - 1] || "")
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
      text: ayahTexts[index] || "",
    }));
    setSegments(updatedSegments);
  };

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
          text: ayahTexts[currentAyahNumber - 1] || "",
        };
        currentAyahNumber++;
      }
    }

    setSegments(renumbered);
  };

  const handleDownload = async () => {
    if (!audioFile || !selectedSurah || segments.length === 0) return;

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
        audioFile,
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="w-full max-w-4xl mx-auto">
        <Card className="transition-all duration-200 hover:border-primary/30">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl">
                  {projectName || "New Project"}
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
              {currentProjectId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenRename}
                  className="cursor-pointer gap-1"
                  title="Rename project"
                >
                  <FiEdit2 size={14} /> Rename
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Audio Preview - Right below project name */}
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

            {audioFile && selectedSurah && selectedSurahInfo && (
              <>
                {/* Detection options */}
                {segments.length === 0 && (
                  <>
                    <div className="space-y-3">
                      <Button
                        onClick={() => handleTranscribe(false)}
                        disabled={isTranscribing || !selectedSurah}
                        variant="outline"
                        className="cursor-pointer transition-all duration-200 hover:bg-accent w-full"
                        size="lg"
                      >
                        {isTranscribing
                          ? "AI Mapping..."
                          : whisperTranscription
                          ? "Re-map with AI (Cheap)"
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

                      {whisperTranscription && !isTranscribing && (
                        <p className="text-xs text-green-600 flex items-center gap-1">
                          <FiCheckCircle size={12} />
                          Whisper cached in localStorage - only GPT-4o mapping
                          cost
                        </p>
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

                {/* Re-run detection options when segments exist */}
                {segments.length > 0 && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        Re-run Detection
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={handleFreshWhisperTranscription}
                          disabled={isTranscribing || !selectedSurah}
                          variant="outline"
                          size="sm"
                          className="cursor-pointer transition-all duration-200 hover:bg-accent"
                        >
                          {isTranscribing
                            ? "Transcribing..."
                            : "Re-transcribe with Whisper"}
                        </Button>
                        <Button
                          onClick={() => handleTranscribe(false)}
                          disabled={isTranscribing || !selectedSurah}
                          variant="outline"
                          size="sm"
                          className="cursor-pointer transition-all duration-200 hover:bg-accent"
                        >
                          {isTranscribing
                            ? "AI Mapping..."
                            : whisperTranscription
                            ? "Re-map with AI (Cheap)"
                            : "Re-detect with Whisper + AI"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        ⚠️ This will replace current segments with new detection
                        results
                      </p>
                    </div>
                  </>
                )}

                {/* Show info if loaded project */}
                {currentProjectId && segments.length > 0 && (
                  <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                    <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                      <FiCheckCircle /> Project loaded with {segments.length}{" "}
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

      {segments.length > 0 && audioFile && (
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
                <div className="flex gap-2">
                  {segments.length > 0 && ayahTexts.length === 0 && (
                    <Button
                      onClick={handleFetchAyahText}
                      disabled={isFetchingText || !selectedSurah}
                      size="sm"
                      className="cursor-pointer"
                    >
                      {isFetchingText ? "Loading..." : "Load Ayah Text"}
                    </Button>
                  )}
                  {segments.length > 0 && ayahTexts.length > 0 && (
                    <Button
                      onClick={handleFixNumbering}
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                    >
                      🔧 Fix Numbering
                    </Button>
                  )}
                </div>
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

              <div className="space-y-2">
                <Label htmlFor="end-padding" className="text-sm font-medium">
                  Padding (Start & End): {endPadding.toFixed(2)}s
                </Label>
                <input
                  id="end-padding"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={endPadding}
                  onChange={(e) => setEndPadding(parseFloat(e.target.value))}
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
                                  {ayahTexts[ayahNum - 1] || "No text"}
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
                                  ] || "No text available"}
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
                          {ayahTexts.map((text, index) => (
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
                                  {text.substring(0, 40)}...
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
                          {ayahTexts.map((text, index) => (
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
                                  {text.substring(0, 40)}...
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

              {hasText && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    Ayah Assignments
                  </Label>
                  <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
                    {segments.map((segment, index) => (
                      <div
                        key={index}
                        className="p-2 bg-muted/30 rounded text-xs flex justify-between items-center gap-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-muted-foreground min-w-6">
                            Seg {index + 1}:
                          </span>
                          {segment.ayahNumbers ? (
                            <span className="px-2 py-0.5 bg-amber-500 text-white rounded text-[10px] font-semibold flex items-center gap-1">
                              <FiLink size={10} /> Ayahs{" "}
                              {segment.ayahNumbers.join(", ")}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-[10px] font-semibold">
                              Ayah{" "}
                              {segment.ayahNumber !== undefined
                                ? segment.ayahNumber
                                : index + 1}
                            </span>
                          )}
                        </div>
                        <p
                          className="flex-1 text-right px-2 truncate"
                          dir="rtl"
                        >
                          {segment.text || "(no text)"}
                        </p>
                        <span className="text-muted-foreground whitespace-nowrap text-[10px]">
                          {segment.start.toFixed(1)}-{segment.end.toFixed(1)}s
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveProject}
                  disabled={isSaving || segments.length === 0}
                  variant="outline"
                  className="flex-1 cursor-pointer"
                  size="lg"
                >
                  <FiSave />{" "}
                  {currentProjectId ? "Update Project" : "Save Project"}
                </Button>
                <Button
                  onClick={handleDownload}
                  disabled={isDownloading || isLoadingFFmpeg || !audioFile}
                  className="flex-1 cursor-pointer"
                  size="lg"
                >
                  {isLoadingFFmpeg ? (
                    "Loading Audio Processor..."
                  ) : isDownloading ? (
                    "Creating ZIP..."
                  ) : (
                    <>
                      <FiDownload /> Download ZIP
                    </>
                  )}
                </Button>
              </div>

              {!audioFile && segments.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center flex items-center justify-center gap-1">
                  <FiAlertCircle size={12} /> Upload audio file to enable
                  download
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Save Project Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {currentProjectId ? "Update Project" : "Save Project"}
            </DialogTitle>
            <DialogDescription>
              Save your segmentation work to continue editing later
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
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
              disabled={!projectName.trim() || isSaving}
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

      {/* Rename Project Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FiEdit2 /> Rename Project
            </DialogTitle>
            <DialogDescription>
              Enter a new name for your project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="newProjectName">Project Name</Label>
              <Input
                id="newProjectName"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRename();
                  }
                }}
                placeholder="Enter project name"
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
              disabled={!newProjectName.trim()}
              className="cursor-pointer gap-2"
            >
              <FiEdit2 /> Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
