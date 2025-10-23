/**
 * Utilities for segment operations (ayah numbering, merging, etc.)
 */

import type { FinalSegment } from "./types";

/**
 * Auto-renumbers segments sequentially based on their time order
 */
export function autoRenumberSegments(segments: FinalSegment[]): FinalSegment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);

  return sorted.map((seg, index) => ({
    ...seg,
    ayahNumber: index + 1,
    ayahNumbers: undefined, // Clear merged ayahs
  }));
}

/**
 * Auto-assigns ayah numbers based on visual order (for editor)
 */
export function autoAssignAyahNumbers(
  segments: FinalSegment[]
): FinalSegment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);

  return sorted.map((seg, index) => ({
    ...seg,
    ayahNumber: index + 1,
    ayahNumbers: undefined,
  }));
}

/**
 * Fixes numbering after insertion/deletion of segments
 * Renumbers subsequent segments starting from the changed index
 */
export function fixNumberingAfterChange(
  segments: FinalSegment[],
  changedIndex: number
): FinalSegment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);

  return sorted.map((seg, index) => {
    if (index < changedIndex) {
      // Keep existing numbers before the change
      return seg;
    }

    // Renumber from changed index onwards
    return {
      ...seg,
      ayahNumber: index + 1,
      ayahNumbers: undefined,
    };
  });
}

/**
 * Adds an ayah number to a segment (for merged ayahs)
 */
export function addAyahToSegment(
  segments: FinalSegment[],
  segmentIndex: number,
  ayahNumber: number
): FinalSegment[] {
  const updated = [...segments];
  const segment = updated[segmentIndex];

  if (segment.ayahNumber !== undefined) {
    // Convert single ayah to array
    updated[segmentIndex] = {
      ...segment,
      ayahNumber: undefined,
      ayahNumbers: [segment.ayahNumber, ayahNumber].sort((a, b) => a - b),
    };
  } else if (segment.ayahNumbers) {
    // Add to existing array
    updated[segmentIndex] = {
      ...segment,
      ayahNumbers: [...segment.ayahNumbers, ayahNumber].sort((a, b) => a - b),
    };
  }

  return updated;
}

/**
 * Removes an ayah number from a segment
 */
export function removeAyahFromSegment(
  segments: FinalSegment[],
  segmentIndex: number,
  ayahNumber: number
): FinalSegment[] {
  const updated = [...segments];
  const segment = updated[segmentIndex];

  if (!segment.ayahNumbers) return segments;

  const filtered = segment.ayahNumbers.filter((num) => num !== ayahNumber);

  if (filtered.length === 1) {
    // Convert back to single ayah
    updated[segmentIndex] = {
      ...segment,
      ayahNumber: filtered[0],
      ayahNumbers: undefined,
    };
  } else if (filtered.length > 1) {
    // Keep as array
    updated[segmentIndex] = {
      ...segment,
      ayahNumbers: filtered,
    };
  }

  return updated;
}

/**
 * Updates ayah number for a segment
 */
export function updateAyahNumber(
  segments: FinalSegment[],
  segmentIndex: number,
  newAyahNumber: number
): FinalSegment[] {
  const updated = [...segments];

  updated[segmentIndex] = {
    ...updated[segmentIndex],
    ayahNumber: newAyahNumber,
    ayahNumbers: undefined, // Clear merged ayahs when setting single number
  };

  return updated;
}

/**
 * Applies padding to segments (for download)
 * Does NOT modify original segments, returns new array
 */
export function applyPaddingToSegments(
  segments: FinalSegment[],
  startPadding: number,
  endPadding: number,
  audioDuration: number
): FinalSegment[] {
  return segments.map((seg, index) => {
    const prevEnd = index > 0 ? segments[index - 1].end : 0;
    const nextStart =
      index < segments.length - 1 ? segments[index + 1].start : audioDuration;

    // Apply padding but don't exceed boundaries
    const paddedStart = Math.max(prevEnd, seg.start - startPadding);
    const paddedEnd = Math.min(nextStart, seg.end + endPadding);

    return {
      ...seg,
      start: paddedStart,
      end: paddedEnd,
    };
  });
}

/**
 * Gets display text for a segment (shows ayah number(s))
 */
export function getSegmentDisplayText(segment: FinalSegment): string {
  if (segment.ayahNumbers && segment.ayahNumbers.length > 1) {
    return `Ayahs ${segment.ayahNumbers.join(", ")}`;
  }

  if (segment.ayahNumber !== undefined) {
    return `Ayah ${segment.ayahNumber}`;
  }

  return segment.text || "Unlabeled";
}
