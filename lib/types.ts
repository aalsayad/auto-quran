/**
 * Shared types for Quran audio splitting application
 */

export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface AyahMapping {
  ayahNumber: number;
  segmentIndices: number[];
}

export interface FinalSegment {
  start: number;
  end: number;
  text: string;
  ayahNumber?: number;
  ayahNumbers?: number[];
  confidence: number;
}

export interface WhisperTranscription {
  segments: WhisperSegment[];
  text: string;
}

export interface SavedProject {
  id: string;
  name: string;
  reciter?: string;
  fileName?: string;
  audioUrl?: string;
  audioFileName?: string;
  surahNumber: number;
  surahName?: string;
  dateCreated?: string;
  createdAt: string;
  lastModified: string;
  segments: FinalSegment[];
  ayahTexts?: string[];
  silenceThreshold?: number;
  minSilenceDuration?: number;
  endPadding?: number;
  startPadding?: number;
  whisperTranscription?: WhisperTranscription;
}
