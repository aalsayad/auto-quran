/**
 * Download Controls Component
 * Handles padding settings and download functionality
 */

import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { FiDownload } from "react-icons/fi";

interface DownloadControlsProps {
  startPadding: number;
  endPadding: number;
  onStartPaddingChange: (value: number) => void;
  onEndPaddingChange: (value: number) => void;
  onDownload: () => void;
  isDownloading: boolean;
  hasSegments: boolean;
  segmentCount: number;
}

export function DownloadControls({
  startPadding,
  endPadding,
  onStartPaddingChange,
  onEndPaddingChange,
  onDownload,
  isDownloading,
  hasSegments,
  segmentCount,
}: DownloadControlsProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base font-semibold">Padding Settings</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Add silence before/after each ayah (applied at download)
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="startPadding" className="text-xs">
              Start (seconds)
            </Label>
            <Input
              id="startPadding"
              type="number"
              step="0.1"
              value={startPadding}
              onChange={(e) => onStartPaddingChange(parseFloat(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="endPadding" className="text-xs">
              End (seconds)
            </Label>
            <Input
              id="endPadding"
              type="number"
              step="0.1"
              value={endPadding}
              onChange={(e) => onEndPaddingChange(parseFloat(e.target.value))}
            />
          </div>
        </div>
      </div>

      <Button
        onClick={onDownload}
        disabled={isDownloading || !hasSegments}
        variant="default"
        className="w-full"
        size="lg"
      >
        <FiDownload className="mr-2" />
        {isDownloading
          ? "Downloading..."
          : `Download ${segmentCount} Ayah${
              segmentCount !== 1 ? "s" : ""
            } as ZIP`}
      </Button>
    </div>
  );
}
