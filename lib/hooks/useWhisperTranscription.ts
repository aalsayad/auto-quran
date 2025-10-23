/**
 * Custom hook for Whisper transcription with audio chunking support
 */

import { useState } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import type { WhisperTranscription, WhisperSegment } from "@/lib/types";

const MAX_CHUNK_SIZE = 24 * 1024 * 1024; // 24MB per chunk

export function useWhisperTranscription() {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    percentage: 0,
    message: "",
  });

  /**
   * Chunks a large audio file into smaller MP3 files
   */
  const chunkAudioFile = async (file: File): Promise<File[]> => {
    const ffmpeg = new FFmpeg();

    // Load FFmpeg
    await ffmpeg.load({
      coreURL: await toBlobURL(
        "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js",
        "text/javascript"
      ),
      wasmURL: await toBlobURL(
        "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.wasm",
        "application/wasm"
      ),
    });

    // Write input file
    const inputData = new Uint8Array(await file.arrayBuffer());
    await ffmpeg.writeFile("input.mp3", inputData);

    // Get audio duration
    const durationCommand = ["-i", "input.mp3", "-f", "null", "-"];
    await ffmpeg.exec(durationCommand);

    // Calculate number of chunks based on file size
    const numChunks = Math.ceil(file.size / MAX_CHUNK_SIZE);

    // Calculate total duration based on file size and estimated bitrate
    // Since we can't easily get duration from FFmpeg without logs, use file size estimation
    // Typical MP3 bitrate is ~128kbps, giving us roughly 1MB per minute
    const estimatedMinutes = file.size / (1024 * 1024); // Rough estimate
    const totalDuration = estimatedMinutes * 60; // Convert to seconds

    const chunkDuration = totalDuration / numChunks;
    const chunks: File[] = [];

    console.log(
      `🔪 Chunking ${
        file.name
      } into ${numChunks} chunks (${chunkDuration.toFixed(1)}s each)`
    );

    // Split into chunks
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const outputName = `chunk_${i}.mp3`;

      await ffmpeg.exec([
        "-i",
        "input.mp3",
        "-ss",
        startTime.toString(),
        "-t",
        chunkDuration.toString(),
        "-c",
        "copy", // Copy codec (no re-encoding)
        outputName,
      ]);

      const chunkData = await ffmpeg.readFile(outputName);
      // Convert to a regular ArrayBuffer for Blob compatibility
      const buffer =
        chunkData instanceof Uint8Array
          ? (chunkData.buffer.slice(0) as ArrayBuffer)
          : (chunkData as unknown as ArrayBuffer);
      const chunkBlob = new Blob([buffer], {
        type: "audio/mpeg",
      });
      const chunkFile = new File([chunkBlob], `${file.name}_chunk_${i}.mp3`, {
        type: "audio/mpeg",
      });

      chunks.push(chunkFile);
      console.log(
        `✅ Chunk ${i + 1}/${numChunks}: ${(
          chunkFile.size /
          1024 /
          1024
        ).toFixed(2)}MB`
      );
    }

    return chunks;
  };

  /**
   * Transcribes audio file(s) with Whisper
   * Automatically chunks large files
   */
  const transcribe = async (
    file: File,
    surahNumber: number
  ): Promise<WhisperTranscription | null> => {
    setIsTranscribing(true);
    setProgress({
      current: 0,
      total: 1,
      percentage: 0,
      message: "Starting...",
    });

    try {
      const fileSizeMB = file.size / (1024 * 1024);

      // If file is small enough, transcribe directly
      if (fileSizeMB <= 24) {
        console.log(
          `🎤 Transcribing ${file.name} (${fileSizeMB.toFixed(2)}MB)`
        );

        const formData = new FormData();
        formData.append("file", file);
        formData.append("surahNumber", surahNumber.toString());

        const response = await fetch("/api/transcribe-ai", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Transcription failed");
        }

        return result.transcription;
      }

      // File is large - chunk it first
      console.log(
        `📦 File is large (${fileSizeMB.toFixed(2)}MB), chunking first...`
      );

      setProgress({
        current: 0,
        total: 1,
        percentage: 0,
        message: "Chunking audio file...",
      });

      const chunks = await chunkAudioFile(file);
      const allSegments: WhisperSegment[] = [];
      let fullText = "";

      setProgress({
        current: 0,
        total: chunks.length,
        percentage: 0,
        message: `Transcribing ${chunks.length} chunks...`,
      });

      // Calculate precise chunk duration
      const audioDuration = chunks.reduce((sum, chunk) => {
        return sum + (chunk.size / file.size) * 100; // Rough estimate
      }, 0);
      const chunkDuration = audioDuration / chunks.length;

      // Transcribe each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const timeOffset = i * chunkDuration;

        console.log(
          `🎤 Transcribing chunk ${i + 1}/${
            chunks.length
          } (offset: ${timeOffset.toFixed(2)}s)`
        );

        const formData = new FormData();
        formData.append("file", chunk);
        formData.append("chunkIndex", i.toString());
        formData.append("totalChunks", chunks.length.toString());
        formData.append("timeOffset", timeOffset.toString());

        const response = await fetch("/api/transcribe-chunk", {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Chunk transcription failed");
        }

        allSegments.push(...result.segments);
        fullText += (fullText ? " " : "") + result.text;

        setProgress({
          current: i + 1,
          total: chunks.length,
          percentage: Math.round(((i + 1) / chunks.length) * 100),
          message: `Transcribed chunk ${i + 1}/${chunks.length}`,
        });
      }

      console.log(
        `✅ All chunks transcribed: ${allSegments.length} total segments`
      );

      return {
        segments: allSegments,
        text: fullText,
      };
    } catch (error) {
      console.error("❌ Transcription error:", error);
      alert(error instanceof Error ? error.message : "Transcription failed");
      return null;
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
    transcribe,
    isTranscribing,
    progress,
  };
}
