import { supabase } from "./supabase";

export interface MushafBookmark {
  id: string;
  user_id: string;
  surah_number: number;
  ayah_number: number;
  page_number: number;
  created_at: string;
}

/**
 * Get all mushaf bookmarks for a user
 */
export async function getMushafBookmarks(
  userId: string
): Promise<MushafBookmark[]> {
  try {
    const { data, error } = await supabase
      .from("mushaf_bookmarks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching mushaf bookmarks:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Failed to fetch mushaf bookmarks:", error);
    return [];
  }
}

/**
 * Get bookmarks for a specific page
 */
export async function getPageBookmarks(
  userId: string,
  pageNumber: number
): Promise<number[]> {
  try {
    const { data, error } = await supabase
      .from("mushaf_bookmarks")
      .select("ayah_number")
      .eq("user_id", userId)
      .eq("page_number", pageNumber)
      .order("ayah_number", { ascending: true });

    if (error) {
      console.error("Error fetching page bookmarks:", error);
      return [];
    }

    return data?.map((b) => b.ayah_number) || [];
  } catch (error) {
    console.error("Failed to fetch page bookmarks:", error);
    return [];
  }
}

/**
 * Add a bookmark
 */
export async function addMushafBookmark(
  userId: string,
  surahNumber: number,
  ayahNumber: number,
  pageNumber: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("mushaf_bookmarks").insert({
      user_id: userId,
      surah_number: surahNumber,
      ayah_number: ayahNumber,
      page_number: pageNumber,
    });

    if (error) {
      // Check if it's a duplicate bookmark error
      if (error.code === "23505") {
        return { success: false, error: "Bookmark already exists" };
      }
      console.error("Error adding mushaf bookmark:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ Mushaf bookmark added for ayah:", ayahNumber);
    return { success: true };
  } catch (error) {
    console.error("Failed to add mushaf bookmark:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Remove a bookmark
 */
export async function removeMushafBookmark(
  userId: string,
  surahNumber: number,
  ayahNumber: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("mushaf_bookmarks")
      .delete()
      .eq("user_id", userId)
      .eq("surah_number", surahNumber)
      .eq("ayah_number", ayahNumber);

    if (error) {
      console.error("Error removing mushaf bookmark:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ Mushaf bookmark removed for ayah:", ayahNumber);
    return { success: true };
  } catch (error) {
    console.error("Failed to remove mushaf bookmark:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Toggle a bookmark (add if doesn't exist, remove if exists)
 */
export async function toggleMushafBookmark(
  userId: string,
  surahNumber: number,
  ayahNumber: number,
  pageNumber: number,
  isBookmarked: boolean
): Promise<{ success: boolean; error?: string }> {
  if (isBookmarked) {
    return await removeMushafBookmark(userId, surahNumber, ayahNumber);
  } else {
    return await addMushafBookmark(userId, surahNumber, ayahNumber, pageNumber);
  }
}
