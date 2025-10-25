import { supabase } from "./supabase";

export interface Bookmark {
  id: string;
  user_id: string;
  recitation_id: string;
  ayah_number: number;
  created_at: string;
}

/**
 * Get all bookmarks for a specific recitation (ayah numbers only)
 */
export async function getRecitationBookmarks(
  userId: string,
  recitationId: string
): Promise<number[]> {
  try {
    const { data, error } = await supabase
      .from("recitation_bookmarks")
      .select("ayah_number")
      .eq("user_id", userId)
      .eq("recitation_id", recitationId)
      .order("ayah_number", { ascending: true });

    if (error) {
      console.error("Error fetching bookmarks:", error);
      return [];
    }

    return data?.map((b) => b.ayah_number) || [];
  } catch (error) {
    console.error("Failed to fetch bookmarks:", error);
    return [];
  }
}

/**
 * Get all bookmarks for a specific recitation with full details
 */
export async function getRecitationBookmarksDetailed(
  userId: string,
  recitationId: string
): Promise<Bookmark[]> {
  try {
    const { data, error } = await supabase
      .from("recitation_bookmarks")
      .select("*")
      .eq("user_id", userId)
      .eq("recitation_id", recitationId)
      .order("ayah_number", { ascending: true });

    if (error) {
      console.error("Error fetching detailed bookmarks:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("Failed to fetch detailed bookmarks:", error);
    return [];
  }
}

/**
 * Add a bookmark for a specific ayah
 */
export async function addBookmark(
  userId: string,
  recitationId: string,
  ayahNumber: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("recitation_bookmarks").insert({
      user_id: userId,
      recitation_id: recitationId,
      ayah_number: ayahNumber,
    });

    if (error) {
      // Check if it's a duplicate bookmark error
      if (error.code === "23505") {
        return { success: false, error: "Bookmark already exists" };
      }
      console.error("Error adding bookmark:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ Bookmark added for ayah:", ayahNumber);
    return { success: true };
  } catch (error) {
    console.error("Failed to add bookmark:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Remove a bookmark for a specific ayah
 */
export async function removeBookmark(
  userId: string,
  recitationId: string,
  ayahNumber: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("recitation_bookmarks")
      .delete()
      .eq("user_id", userId)
      .eq("recitation_id", recitationId)
      .eq("ayah_number", ayahNumber);

    if (error) {
      console.error("Error removing bookmark:", error);
      return { success: false, error: error.message };
    }

    console.log("✅ Bookmark removed for ayah:", ayahNumber);
    return { success: true };
  } catch (error) {
    console.error("Failed to remove bookmark:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Toggle a bookmark (add if doesn't exist, remove if exists)
 */
export async function toggleBookmark(
  userId: string,
  recitationId: string,
  ayahNumber: number,
  isBookmarked: boolean
): Promise<{ success: boolean; error?: string }> {
  if (isBookmarked) {
    return await removeBookmark(userId, recitationId, ayahNumber);
  } else {
    return await addBookmark(userId, recitationId, ayahNumber);
  }
}
