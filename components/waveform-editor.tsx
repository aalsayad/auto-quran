"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline.js";
import { Button } from "@/components/ui/button";
import {
  FiTrash2,
  FiAlertTriangle,
  FiLink,
  FiPlus,
  FiPlay,
  FiPause,
  FiZoomIn,
  FiZoomOut,
  FiInfo,
} from "react-icons/fi";

interface Segment {
  start: number;
  end: number;
  text: string;
  ayahNumber?: number;
  ayahNumbers?: number[];
  confidence: number;
}

interface WaveformEditorProps {
  audioFile: File;
  segments: Segment[];
  onSegmentsChange: (segments: Segment[]) => void;
  selectedSurahAyahCount?: number;
  onSegmentSelect?: (index: number | null) => void;
}

export default function WaveformEditor({
  audioFile,
  segments,
  onSegmentsChange,
  selectedSurahAyahCount,
  onSegmentSelect,
}: WaveformEditorProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const isLoadingRef = useRef(false);
  const regionTextMap = useRef<Map<string, string>>(new Map()); // Store region ID -> text mapping
  const regionAyahMap = useRef<Map<string, number | undefined>>(new Map()); // Store region ID -> ayah number mapping
  const regionAyahsMap = useRef<Map<string, number[] | undefined>>(new Map()); // Store region ID -> multiple ayah numbers mapping
  const regionConfidenceMap = useRef<Map<string, number>>(new Map()); // Store region ID -> confidence mapping
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    time: number;
    regionId?: string;
  } | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  // Format time as 00h:00m:00s
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${hours.toString().padStart(2, "0")}h:${minutes
      .toString()
      .padStart(2, "0")}m:${secs.toString().padStart(2, "0")}s`;
  };

  // Define updateSegmentsFromRegions before useEffects
  const updateSegmentsFromRegions = useCallback(() => {
    if (!regionsRef.current) return;

    const regions = regionsRef.current.getRegions();
    // Filter only actual segment regions (not padding regions)
    const segmentRegions = regions.filter((region) =>
      region.id.startsWith("segment-")
    );

    const newSegments = segmentRegions
      .map((region) => ({
        start: region.start,
        end: region.end,
        text: regionTextMap.current.get(region.id) || "", // Get text from map
        ayahNumber: regionAyahMap.current.get(region.id), // Get ayah number from map
        ayahNumbers: regionAyahsMap.current.get(region.id), // Get multiple ayah numbers from map
        confidence: regionConfidenceMap.current.get(region.id) || 0, // Get confidence from map
      }))
      .sort((a, b) => a.start - b.start); // Sort by start time to match visual order

    onSegmentsChange(newSegments);
  }, [onSegmentsChange]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !timelineRef.current) return;

    // Clear previous content to prevent duplicates
    if (waveformRef.current) {
      waveformRef.current.innerHTML = "";
    }
    if (timelineRef.current) {
      timelineRef.current.innerHTML = "";
    }

    // Create regions plugin
    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    // Create timeline plugin
    const timeline = TimelinePlugin.create({
      container: timelineRef.current,
    });

    // Initialize WaveSurfer
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "hsl(var(--muted-foreground))",
      progressColor: "hsl(var(--primary))",
      cursorColor: "#ef4444", // Bright red cursor
      cursorWidth: 3,
      barWidth: 2,
      barGap: 1,
      height: 128,
      normalize: true,
      plugins: [regions, timeline],
      interact: true,
    });

    wavesurferRef.current = wavesurfer;

    // Load audio
    const url = URL.createObjectURL(audioFile);
    audioUrlRef.current = url;
    isLoadingRef.current = true;
    wavesurfer.load(url);

    // Event listeners
    wavesurfer.on("ready", () => {
      isLoadingRef.current = false;
      setIsReady(true);
      setDuration(wavesurfer.getDuration());
    });

    wavesurfer.on("error", (error) => {
      console.error("WaveSurfer error:", error);
      isLoadingRef.current = false;
    });

    wavesurfer.on("play", () => setIsPlaying(true));
    wavesurfer.on("pause", () => setIsPlaying(false));

    wavesurfer.on("timeupdate", (time) => {
      setCurrentTime(time);
    });

    // Region events
    regions.on("region-clicked", (region, e) => {
      e.stopPropagation();
      setSelectedRegionId(region.id);

      // Get segment index from region ID
      const segmentIndex = parseInt(region.id.replace("segment-", ""));
      if (!isNaN(segmentIndex) && onSegmentSelect) {
        onSegmentSelect(segmentIndex);
      }

      region.play();
    });

    regions.on("region-updated", (region) => {
      // Only update if it's an actual segment (not padding)
      if (region.id.startsWith("segment-")) {
        // Update segments when region is dragged
        updateSegmentsFromRegions();
      }
    });

    // Handle right-click on waveform
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();

      const rect = waveformRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Calculate time from click position
      const clickX = e.clientX - rect.left;
      const duration = wavesurfer.getDuration();
      const time = (clickX / rect.width) * duration;

      // Check if clicking on a region
      const regions = regionsRef.current?.getRegions() || [];
      const clickedRegion = regions.find(
        (r) => time >= r.start && time <= r.end
      );

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        time,
        regionId: clickedRegion?.id,
      });
    };

    const waveformElement = waveformRef.current;
    waveformElement.addEventListener("contextmenu", handleContextMenu);

    // Close context menu on click
    const closeContextMenu = () => setContextMenu(null);
    document.addEventListener("click", closeContextMenu);

    // Cleanup
    return () => {
      // Only destroy if not currently loading
      if (!isLoadingRef.current && wavesurfer) {
        try {
          wavesurfer.destroy();
        } catch (error) {
          console.warn("Error destroying wavesurfer:", error);
        }
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      if (waveformElement) {
        waveformElement.removeEventListener("contextmenu", handleContextMenu);
      }
      document.removeEventListener("click", closeContextMenu);
    };
  }, [audioFile, updateSegmentsFromRegions, onSegmentSelect]);

  // Keyboard shortcuts (Space to play/pause)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Handle space bar for play/pause
      if (e.code === "Space") {
        const target = e.target as HTMLElement;

        // Prevent space from triggering button clicks
        if (target.tagName === "BUTTON") {
          e.preventDefault();
          e.stopPropagation();
          wavesurferRef.current?.playPause();
          return;
        }

        // Only handle space when not typing in an input or textarea
        if (
          target.tagName !== "INPUT" &&
          target.tagName !== "TEXTAREA" &&
          !target.isContentEditable
        ) {
          e.preventDefault();
          e.stopPropagation();
          wavesurferRef.current?.playPause();
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress, { capture: true });
    return () => {
      document.removeEventListener("keydown", handleKeyPress, {
        capture: true,
      });
    };
  }, []);

  // Update regions when segments change
  useEffect(() => {
    if (!regionsRef.current || !isReady) return;

    // Clear existing regions
    regionsRef.current.clearRegions();

    // Add segment regions and store text and ayah number in map
    segments.forEach((segment, index) => {
      const color = getColorForIndex(index);
      const regionId = `segment-${index}`;

      // Determine what to display
      const displayLabel = segment.ayahNumbers
        ? segment.ayahNumbers.join(",")
        : (segment.ayahNumber !== undefined
            ? segment.ayahNumber
            : index + 1
          ).toString();
      const isMerged = segment.ayahNumbers && segment.ayahNumbers.length > 1;

      // Store text and ayah numbers in maps
      regionTextMap.current.set(regionId, segment.text);
      regionAyahMap.current.set(regionId, segment.ayahNumber);
      regionAyahsMap.current.set(regionId, segment.ayahNumbers);
      regionConfidenceMap.current.set(regionId, segment.confidence);

      regionsRef.current?.addRegion({
        id: regionId,
        start: segment.start,
        end: segment.end,
        color: color,
        drag: true,
        resize: true,
        content: createLabelElement(displayLabel, isMerged), // Display ayah number(s) with styling
      });
    });
  }, [segments, isReady, updateSegmentsFromRegions]);

  const createLabelElement = (label: string, isMerged?: boolean) => {
    const div = document.createElement("div");
    div.style.cssText = `
      background: ${isMerged ? "#f59e0b" : "white"};
      border-radius: ${isMerged ? "8px" : "50%"};
      min-width: 24px;
      height: 24px;
      padding: ${isMerged ? "0 6px" : "0"};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 600;
      color: ${isMerged ? "white" : "#1f2937"};
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      position: absolute;
      top: 4px;
      left: 4px;
      pointer-events: none;
      user-select: none;
      z-index: 10;
      white-space: nowrap;
    `;
    div.textContent = label;
    return div;
  };

  const getColorForIndex = (index: number) => {
    const colors = [
      "rgba(59, 130, 246, 0.2)", // blue
      "rgba(16, 185, 129, 0.2)", // green
      "rgba(245, 158, 11, 0.2)", // amber
      "rgba(239, 68, 68, 0.2)", // red
      "rgba(139, 92, 246, 0.2)", // violet
      "rgba(236, 72, 153, 0.2)", // pink
    ];
    return colors[index % colors.length];
  };

  const handlePlayPause = () => {
    wavesurferRef.current?.playPause();
  };

  const handleZoomIn = () => {
    const currentZoom = wavesurferRef.current?.options.minPxPerSec || 50;
    wavesurferRef.current?.zoom(currentZoom * 1.5);
  };

  const handleZoomOut = () => {
    const currentZoom = wavesurferRef.current?.options.minPxPerSec || 50;
    wavesurferRef.current?.zoom(currentZoom / 1.5);
  };

  const handleAddSegment = () => {
    if (!regionsRef.current || !wavesurferRef.current) return;

    const duration = wavesurferRef.current.getDuration();
    const currentTime = wavesurferRef.current.getCurrentTime();

    // Add a new region at current playback position
    const newStart = currentTime;
    const newEnd = Math.min(currentTime + 2, duration); // 2 second default
    const regionId = `segment-${Date.now()}`; // Use timestamp for unique ID

    // Store empty text, no ayah number (will be auto-assigned based on position)
    regionTextMap.current.set(regionId, "");
    regionAyahMap.current.set(regionId, undefined);
    regionAyahsMap.current.set(regionId, undefined);
    regionConfidenceMap.current.set(regionId, 0);

    regionsRef.current.addRegion({
      id: regionId,
      start: newStart,
      end: newEnd,
      color: getColorForIndex(segments.length),
      drag: true,
      resize: true,
      content: createLabelElement("?", false), // Placeholder, will be auto-numbered
    });

    // Update segments from regions (will be sorted by time automatically)
    updateSegmentsFromRegions();
  };

  const handleDeleteSelected = () => {
    if (!selectedRegionId || !regionsRef.current) return;

    const regions = regionsRef.current.getRegions();
    const regionToDelete = regions.find((r) => r.id === selectedRegionId);

    if (regionToDelete) {
      regionToDelete.remove();
      // Remove from maps
      regionTextMap.current.delete(selectedRegionId);
      regionAyahMap.current.delete(selectedRegionId);
      regionAyahsMap.current.delete(selectedRegionId);
      setSelectedRegionId(null);
      if (onSegmentSelect) {
        onSegmentSelect(null);
      }
      updateSegmentsFromRegions();
    }
  };

  const handleAddSegmentAtTime = (time: number) => {
    if (!regionsRef.current || !wavesurferRef.current) return;

    const duration = wavesurferRef.current.getDuration();
    const newStart = time;
    const newEnd = Math.min(time + 2, duration); // 2 second default
    const regionId = `segment-${Date.now()}`; // Use timestamp for unique ID

    // Store empty text, no ayah number (will be auto-assigned based on position)
    regionTextMap.current.set(regionId, "");
    regionAyahMap.current.set(regionId, undefined);
    regionAyahsMap.current.set(regionId, undefined);
    regionConfidenceMap.current.set(regionId, 0);

    regionsRef.current.addRegion({
      id: regionId,
      start: newStart,
      end: newEnd,
      color: getColorForIndex(segments.length),
      drag: true,
      resize: true,
      content: createLabelElement("?", false), // Placeholder, will be auto-numbered
    });

    // Update segments from regions (will be sorted by time automatically)
    updateSegmentsFromRegions();
    setContextMenu(null);
  };

  const handleDeleteSegmentById = (regionId: string) => {
    if (!regionsRef.current) return;

    const regions = regionsRef.current.getRegions();
    const regionToDelete = regions.find((r) => r.id === regionId);

    if (regionToDelete) {
      regionToDelete.remove();
      // Remove from maps
      regionTextMap.current.delete(regionId);
      regionAyahMap.current.delete(regionId);
      regionAyahsMap.current.delete(regionId);
      updateSegmentsFromRegions();
    }
    setContextMenu(null);
  };

  const handleMergeWithNext = () => {
    if (!selectedRegionId || !regionsRef.current) return;

    const regions = regionsRef.current.getRegions();
    const selectedIndex = regions.findIndex((r) => r.id === selectedRegionId);

    if (selectedIndex >= 0 && selectedIndex < regions.length - 1) {
      const current = regions[selectedIndex];
      const next = regions[selectedIndex + 1];

      // Update current region to span both
      current.setOptions({
        end: next.end,
      });

      // Remove next region
      next.remove();

      // Update segments
      const newSegments = [...segments];
      newSegments[selectedIndex].end = newSegments[selectedIndex + 1].end;
      newSegments[selectedIndex].text =
        newSegments[selectedIndex].text +
        " " +
        newSegments[selectedIndex + 1].text;
      newSegments.splice(selectedIndex + 1, 1);

      onSegmentsChange(newSegments);
      updateSegmentsFromRegions();
    }
  };

  const segmentCountMismatch =
    selectedSurahAyahCount && segments.length !== selectedSurahAyahCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            onClick={handlePlayPause}
            disabled={!isReady}
            className="cursor-pointer gap-2"
            size="sm"
          >
            {isPlaying ? (
              <>
                <FiPause /> Pause
              </>
            ) : (
              <>
                <FiPlay /> Play
              </>
            )}
          </Button>
          <Button
            onClick={handleZoomIn}
            disabled={!isReady}
            variant="outline"
            size="sm"
            className="cursor-pointer"
          >
            <FiZoomIn />
          </Button>
          <Button
            onClick={handleZoomOut}
            disabled={!isReady}
            variant="outline"
            size="sm"
            className="cursor-pointer"
          >
            <FiZoomOut />
          </Button>
          <Button
            onClick={handleAddSegment}
            disabled={!isReady}
            variant="outline"
            size="sm"
            className="cursor-pointer gap-2"
          >
            <FiPlus /> Add Segment
          </Button>

          {/* Time Display */}
          {isReady && (
            <div className="flex items-center gap-2 ml-4 text-sm">
              <div className="font-mono">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                ({currentTime.toFixed(2)}s / {duration.toFixed(2)}s)
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleMergeWithNext}
            disabled={!selectedRegionId}
            variant="outline"
            size="sm"
            className="cursor-pointer gap-2"
          >
            <FiLink /> Merge with Next
          </Button>
          <Button
            onClick={handleDeleteSelected}
            disabled={!selectedRegionId}
            variant="outline"
            size="sm"
            className="cursor-pointer text-destructive"
          >
            <FiTrash2 /> Delete Selected
          </Button>
        </div>
      </div>

      {segmentCountMismatch && (
        <div className="p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <p className="text-xs text-yellow-800 dark:text-yellow-200 flex items-center gap-1">
            <FiAlertTriangle size={12} /> {segments.length} segments detected,
            expected {selectedSurahAyahCount} ayahs
          </p>
        </div>
      )}

      <div className="relative border rounded-lg p-4 bg-background">
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-lg">
            <p className="text-sm text-muted-foreground">Loading waveform...</p>
          </div>
        )}
        <div ref={waveformRef} className="cursor-pointer" />
        <div ref={timelineRef} className="mt-2" />
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p className="flex items-start gap-1">
          <FiInfo size={12} className="mt-0.5 shrink-0" />{" "}
          <strong>Click</strong> on a segment to select and play it
        </p>
        <p className="flex items-start gap-1">
          <FiInfo size={12} className="mt-0.5 shrink-0" />{" "}
          <strong>Space bar</strong> to play/pause audio
        </p>
        <p className="flex items-start gap-1">
          <FiInfo size={12} className="mt-0.5 shrink-0" />{" "}
          <strong>Drag edges</strong> to adjust start/end times
        </p>
        <p className="flex items-start gap-1">
          <FiInfo size={12} className="mt-0.5 shrink-0" />{" "}
          <strong>Drag center</strong> to move the entire segment
        </p>
        <p className="flex items-start gap-1">
          <FiInfo size={12} className="mt-0.5 shrink-0" />{" "}
          <strong>Right-click</strong> to add or delete segments
        </p>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-background border rounded-md shadow-lg py-1 min-w-48"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
        >
          {contextMenu.regionId ? (
            <>
              <button
                onClick={() => handleDeleteSegmentById(contextMenu.regionId!)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-destructive/10 text-destructive cursor-pointer flex items-center gap-2"
              >
                <FiTrash2 size={14} /> Delete Segment
              </button>
            </>
          ) : (
            <button
              onClick={() => handleAddSegmentAtTime(contextMenu.time)}
              className="w-full px-4 py-2 text-left text-sm hover:bg-accent cursor-pointer flex items-center gap-2"
            >
              <FiPlus size={14} /> Add Segment Here
              <span className="text-xs text-muted-foreground ml-auto">
                {contextMenu.time.toFixed(2)}s
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
