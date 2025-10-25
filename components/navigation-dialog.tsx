"use client";

import { memo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface NavigationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "ayah" | "page";
  onModeChange: (mode: "ayah" | "page") => void;
  selectedAyah: number;
  selectedPage: number;
  onAyahChange: (ayah: number) => void;
  onPageChange: (page: number) => void;
  totalAyahs: number;
  pageRange: { min: number; max: number };
  onNavigate: () => void;
}

const NavigationDialogComponent = ({
  open,
  onOpenChange,
  mode,
  onModeChange,
  selectedAyah,
  selectedPage,
  onAyahChange,
  onPageChange,
  totalAyahs,
  pageRange,
  onNavigate,
}: NavigationDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Jump to...</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Mode Selection */}
          <div className="flex gap-2">
            <Button
              variant={mode === "ayah" ? "default" : "outline"}
              onClick={() => onModeChange("ayah")}
              className="flex-1"
            >
              Ayah
            </Button>
            <Button
              variant={mode === "page" ? "default" : "outline"}
              onClick={() => onModeChange("page")}
              className="flex-1"
            >
              Page
            </Button>
          </div>

          {/* Input based on mode */}
          {mode === "ayah" ? (
            <div className="space-y-2">
              <Label htmlFor="ayah-input">Ayah Number</Label>
              <Input
                id="ayah-input"
                type="number"
                min="1"
                max={totalAyahs}
                value={selectedAyah}
                onChange={(e) => onAyahChange(parseInt(e.target.value) || 1)}
                placeholder={`1-${totalAyahs}`}
              />
              <p className="text-xs text-muted-foreground">
                Enter ayah number (1-{totalAyahs})
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="page-input">Page Number</Label>
              <Input
                id="page-input"
                type="number"
                min={pageRange.min}
                max={pageRange.max}
                value={selectedPage}
                onChange={(e) =>
                  onPageChange(parseInt(e.target.value) || pageRange.min)
                }
                placeholder={`${pageRange.min}-${pageRange.max}`}
              />
              <p className="text-xs text-muted-foreground">
                Enter page number ({pageRange.min}-{pageRange.max})
              </p>
            </div>
          )}

          {/* Navigate Button */}
          <Button onClick={onNavigate} className="w-full">
            Go to{" "}
            {mode === "ayah" ? `Ayah ${selectedAyah}` : `Page ${selectedPage}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const NavigationDialog = memo(NavigationDialogComponent);
