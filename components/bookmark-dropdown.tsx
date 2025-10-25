"use client";

import { memo } from "react";
import { FiBookmark } from "react-icons/fi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Bookmark {
  id: string;
  ayah_number: number;
  created_at: string;
}

interface BookmarkDropdownProps {
  bookmarks: Bookmark[];
  onBookmarkClick: (ayahNumber: number) => void;
  onBookmarkDelete: (bookmarkId: string, ayahNumber: number) => void;
}

const BookmarkDropdownComponent = ({
  bookmarks,
  onBookmarkClick,
  onBookmarkDelete,
}: BookmarkDropdownProps) => {
  if (bookmarks.length === 0) {
    return (
      <button
        className="p-1.5 sm:p-2 text-muted-foreground cursor-not-allowed"
        title="No bookmarks"
        disabled
      >
        <FiBookmark className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1.5 sm:p-2 hover:bg-accent rounded transition-colors relative"
          title="View bookmarks"
        >
          <FiBookmark className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] sm:text-[9px] rounded-full w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center font-bold">
            {bookmarks.length}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 sm:w-56">
        <div className="px-2 py-1.5 text-xs sm:text-sm font-semibold text-muted-foreground">
          Bookmarks ({bookmarks.length})
        </div>
        {bookmarks.map((bookmark) => (
          <DropdownMenuItem
            key={bookmark.id}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => onBookmarkClick(bookmark.ayah_number)}
          >
            <span className="text-xs sm:text-sm">
              Ayah {bookmark.ayah_number}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBookmarkDelete(bookmark.id, bookmark.ayah_number);
              }}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Remove
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const BookmarkDropdown = memo(BookmarkDropdownComponent);
