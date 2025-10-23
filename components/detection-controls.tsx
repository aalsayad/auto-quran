/**
 * Detection Controls Component
 * Handles Whisper AI, silence detection, and ayah text fetching buttons
 */

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { FiBook } from "react-icons/fi";

interface DetectionControlsProps {
  // Whisper AI
  hasWhisperCache: boolean;
  onWhisperDetection: () => void;
  onFreshWhisperDetection: () => void;
  isTranscribing: boolean;

  // Silence Detection
  onSilenceDetection: () => void;
  isDetectingSilence: boolean;
  silenceThreshold: number;
  onSilenceThresholdChange: (value: number) => void;
  minSilenceDuration: number;
  onMinSilenceDurationChange: (value: number) => void;

  // Ayah Text
  onFetchAyahText: () => void;
  isFetchingText: boolean;
  hasAyahText: boolean;
  surahNumber: number | null;
}

export function DetectionControls({
  hasWhisperCache,
  onWhisperDetection,
  onFreshWhisperDetection,
  isTranscribing,
  onSilenceDetection,
  isDetectingSilence,
  silenceThreshold,
  onSilenceThresholdChange,
  minSilenceDuration,
  onMinSilenceDurationChange,
  onFetchAyahText,
  isFetchingText,
  hasAyahText,
  surahNumber,
}: DetectionControlsProps) {
  return (
    <div className="space-y-4">
      {/* Whisper AI Detection */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">
          AI Detection (Whisper + GPT-5)
        </Label>
        <div className="flex gap-2">
          <Button
            onClick={onWhisperDetection}
            disabled={isTranscribing || !surahNumber}
            variant="default"
            className="flex-1"
          >
            {hasWhisperCache
              ? "♻️ Re-map with AI (Cheap)"
              : "🎤 Whisper + AI Detection"}
          </Button>
          {hasWhisperCache && (
            <Button
              onClick={onFreshWhisperDetection}
              disabled={isTranscribing}
              variant="outline"
            >
              🔄 Re-transcribe with Whisper
            </Button>
          )}
        </div>
        {hasWhisperCache && (
          <p className="text-xs text-muted-foreground">
            Whisper cached... only GPT-5 mapping cost
          </p>
        )}
      </div>

      {/* Silence Detection */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">
          Silence Detection (Fallback)
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="silenceThreshold" className="text-xs">
              Threshold
            </Label>
            <Input
              id="silenceThreshold"
              type="number"
              step="0.01"
              value={silenceThreshold}
              onChange={(e) =>
                onSilenceThresholdChange(parseFloat(e.target.value))
              }
              disabled={isDetectingSilence}
            />
          </div>
          <div>
            <Label htmlFor="minSilenceDuration" className="text-xs">
              Min Duration (s)
            </Label>
            <Input
              id="minSilenceDuration"
              type="number"
              step="0.1"
              value={minSilenceDuration}
              onChange={(e) =>
                onMinSilenceDurationChange(parseFloat(e.target.value))
              }
              disabled={isDetectingSilence}
            />
          </div>
        </div>
        <Button
          onClick={onSilenceDetection}
          disabled={isDetectingSilence}
          variant="outline"
          className="w-full"
        >
          {isDetectingSilence ? "Detecting..." : "Detect Silence"}
        </Button>
      </div>

      {/* Fetch Ayah Text */}
      <div className="space-y-2">
        <Button
          onClick={onFetchAyahText}
          disabled={isFetchingText || !surahNumber}
          variant="secondary"
          className="w-full"
        >
          <FiBook className="mr-2" />
          {hasAyahText ? "Refresh" : "Fetch"} Quran Text
        </Button>
      </div>
    </div>
  );
}
