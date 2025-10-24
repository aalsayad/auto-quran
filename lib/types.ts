// ============================================
// CORE TYPES
// ============================================

export interface FinalSegment {
  start: number;
  end: number;
  ayahNumber?: number;
  ayahNumbers?: number[];
  text: string;
  confidence: number;
}

export interface AyahText {
  ayahNumber: number;
  text: string;
}

// Whisper API response types
export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

export interface WhisperTranscription {
  segments: WhisperSegment[];
  text: string;
}

// AI Mapping types
export interface AyahMapping {
  ayah: number;
  ayahNumber: number; // Same as ayah, for compatibility
  segments: number[];
  segmentIndices: number[]; // Same as segments, for compatibility
}

// ============================================
// SUPABASE DATABASE TYPES
// ============================================

export interface Profile {
  id: string; // UUID
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan: "free" | "pro" | "enterprise";
  billing_data: {
    tokens?: number;
    usage_count?: number;
    usage_quota?: number;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface UserReciter {
  id: string; // UUID
  user_id: string; // UUID
  name: string;
  metadata: {
    name_arabic?: string;
    bio?: string;
    avatar_url?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export interface Recitation {
  id: string; // UUID
  user_id: string; // UUID
  reciter_id: string | null; // UUID
  reciter_name: string;
  surah_number: number;
  surah_name: string;
  audio_url: string;
  audio_file_name: string;
  status: "pending" | "processing" | "completed" | "failed";
  transcription_data: {
    whisper?: {
      segments: { start: number; end: number; text: string }[];
      text: string;
    };
    segments?: FinalSegment[];
    ayah_texts?: AyahText[];
    [key: string]: unknown;
  };
  settings_data: {
    silence_threshold?: number;
    min_silence_duration?: number;
    end_padding?: number;
    start_padding?: number;
    [key: string]: unknown;
  };
  metadata: {
    file_size?: number;
    duration?: number;
    processing_error?: string;
    published?: boolean;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

// ============================================
// LEGACY TYPES (for migration)
// ============================================

export interface SavedProject {
  id: string;
  name: string;
  reciter?: string;
  fileName: string;
  audioFileName?: string; // Alternative name field
  audioUrl: string;
  surahNumber: number;
  surahName: string;
  dateCreated: string;
  lastModified: string;
  createdAt: string;
  segments: FinalSegment[];
  ayahTexts: AyahText[];
  silenceThreshold: number;
  minSilenceDuration: number;
  endPadding: number;
  startPadding: number;
  whisperTranscription?: {
    segments: { start: number; end: number; text: string }[];
    text: string;
  };
}

// ============================================
// HELPER FUNCTIONS TO CONVERT BETWEEN TYPES
// ============================================

/**
 * Convert a Recitation (from Supabase) to SavedProject (legacy format)
 */
export function recitationToSavedProject(recitation: Recitation): SavedProject {
  return {
    id: recitation.id,
    name: `${recitation.reciter_name} - ${recitation.surah_name}`,
    reciter: recitation.reciter_name,
    fileName: recitation.audio_file_name,
    audioFileName: recitation.audio_file_name,
    audioUrl: recitation.audio_url,
    surahNumber: recitation.surah_number,
    surahName: recitation.surah_name,
    dateCreated: recitation.created_at,
    lastModified: recitation.updated_at,
    createdAt: recitation.created_at,
    segments: recitation.transcription_data?.segments || [],
    ayahTexts: recitation.transcription_data?.ayah_texts || [],
    silenceThreshold: recitation.settings_data?.silence_threshold || 0.01,
    minSilenceDuration: recitation.settings_data?.min_silence_duration || 0.5,
    endPadding: recitation.settings_data?.end_padding || 0.3,
    startPadding: recitation.settings_data?.start_padding || 0.1,
    whisperTranscription: recitation.transcription_data?.whisper,
  };
}

/**
 * Convert SavedProject (legacy format) to Recitation insert data
 */
export function savedProjectToRecitation(
  project: Partial<SavedProject>,
  userId: string
): Omit<Recitation, "id" | "created_at" | "updated_at"> {
  return {
    user_id: userId,
    reciter_id: null, // Will be linked later if reciter exists
    reciter_name: project.reciter || project.name?.split(" - ")[0] || "Unknown",
    surah_number: project.surahNumber || 1,
    surah_name: project.surahName || "",
    audio_url: project.audioUrl || "",
    audio_file_name: project.fileName || "",
    status:
      project.segments && project.segments.length > 0 ? "completed" : "pending",
    transcription_data: {
      segments: project.segments || [],
      ayah_texts: project.ayahTexts || [],
    },
    settings_data: {
      silence_threshold: project.silenceThreshold || 0.01,
      min_silence_duration: project.minSilenceDuration || 0.5,
      end_padding: project.endPadding || 0.3,
      start_padding: project.startPadding || 0.1,
    },
    metadata: {},
  };
}
