/**
 * Custom hook for S3 audio operations (upload, fetch, delete)
 */

import { useState } from "react";

export function useS3Audio() {
  const [isUploading, setIsUploading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  /**
   * Uploads an audio file to S3
   */
  const uploadToS3 = async (file: File): Promise<string | null> => {
    setIsUploading(true);
    console.log("☁️  Uploading to S3:", file.name);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-audio", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log("✅ S3 upload complete:", result.url);
        return result.url;
      } else {
        console.error("❌ S3 upload failed:", result.error);
        alert(`Upload failed: ${result.error}`);
        return null;
      }
    } catch (error) {
      console.error("❌ S3 upload error:", error);
      alert("Failed to upload audio file");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Fetches an audio file from S3 and converts to File object
   */
  const fetchFromS3 = async (
    url: string,
    fileName: string
  ): Promise<File | null> => {
    setIsFetching(true);
    console.log("☁️  Fetching from S3:", url);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch audio from S3");
      }

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type });

      console.log("✅ S3 fetch complete");
      return file;
    } catch (error) {
      console.error("❌ S3 fetch error:", error);
      alert("Failed to load audio file from cloud storage");
      return null;
    } finally {
      setIsFetching(false);
    }
  };

  /**
   * Deletes an audio file from S3
   */
  const deleteFromS3 = async (url: string): Promise<boolean> => {
    console.log("🗑️  Deleting from S3:", url);

    try {
      const response = await fetch("/api/delete-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: url }),
      });

      const result = await response.json();

      if (result.success) {
        console.log("✅ S3 delete complete");
        return true;
      } else {
        console.warn("⚠️  S3 delete failed:", result.message);
        return false;
      }
    } catch (error) {
      console.error("❌ S3 delete error:", error);
      return false;
    }
  };

  return {
    uploadToS3,
    fetchFromS3,
    deleteFromS3,
    isUploading,
    isFetching,
  };
}
