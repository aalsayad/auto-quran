"use client";

import {
  FiPlay,
  FiPause,
  FiSkipBack,
  FiSkipForward,
  FiVolume2,
  FiVolumeX,
  FiInfo,
} from "react-icons/fi";

interface QuranAudioPlayerProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  audioLoadError: string | null;
  isFetchingAudio: boolean;
  audioFile: File | null;
  speedOptions: number[];
  onPlayPause: () => void;
  onPrevAyah: () => void;
  onNextAyah: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onSpeedChange: (speed: number) => void;
}

export function QuranAudioPlayer({
  isPlaying,
  currentTime,
  duration,
  volume,
  playbackRate,
  audioLoadError,
  isFetchingAudio,
  audioFile,
  speedOptions,
  onPlayPause,
  onPrevAyah,
  onNextAyah,
  onSeek,
  onVolumeChange,
  onSpeedChange,
}: QuranAudioPlayerProps) {
  const formatTime = (time: number) => {
    if (!isFinite(time) || isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (audioLoadError) {
    return (
      <div className="flex items-center justify-center py-1 sm:py-2">
        <p className="text-xs sm:text-sm text-red-600">
          <FiInfo className="inline mr-1" /> {audioLoadError}
        </p>
      </div>
    );
  }

  if (isFetchingAudio) {
    return (
      <div className="flex items-center justify-center py-1 sm:py-2">
        <p className="text-xs sm:text-sm text-muted-foreground">
          <FiInfo className="inline mr-1" /> Loading audio...
        </p>
      </div>
    );
  }

  if (!audioFile) {
    return (
      <div className="flex items-center justify-center py-1 sm:py-2">
        <p className="text-xs sm:text-sm text-muted-foreground">
          <FiInfo className="inline mr-1" /> No audio available
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 sm:space-y-2">
      {/* Progress Bar */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex-1 relative">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full h-1.5 sm:h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>
        <span className="text-[10px] sm:text-xs text-muted-foreground min-w-[60px] sm:min-w-[70px] text-right font-mono tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Playback Controls */}
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            onClick={onPrevAyah}
            className="p-1.5 sm:p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Previous Ayah"
          >
            <FiSkipBack className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          <button
            onClick={onPlayPause}
            className="p-2 sm:p-3 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full transition-colors"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <FiPause className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <FiPlay className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" />
            )}
          </button>
          <button
            onClick={onNextAyah}
            className="p-1.5 sm:p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Next Ayah"
          >
            <FiSkipForward className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>

        {/* Volume and Speed Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Volume */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={() => onVolumeChange(volume === 0 ? 1 : 0)}
              className="p-1 sm:p-1.5 hover:bg-accent rounded transition-colors"
              aria-label={volume === 0 ? "Unmute" : "Mute"}
            >
              {volume === 0 ? (
                <FiVolumeX className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              ) : (
                <FiVolume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-12 sm:w-16 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              aria-label="Volume"
            />
          </div>

          {/* Speed */}
          <select
            value={playbackRate}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs bg-secondary hover:bg-secondary/80 rounded border-0 cursor-pointer transition-colors"
            aria-label="Playback Speed"
          >
            {speedOptions.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
