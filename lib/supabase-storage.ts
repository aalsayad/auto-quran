import { supabase } from "./supabase";
import type { Recitation, UserReciter, Profile } from "./types";

// ============================================
// PROFILE OPERATIONS
// ============================================

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
  return data;
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// RECITER OPERATIONS
// ============================================

export async function getReciters(userId: string): Promise<UserReciter[]> {
  const { data, error } = await supabase
    .from("user_reciters")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createReciter(
  userId: string,
  name: string,
  metadata?: Record<string, unknown>
): Promise<UserReciter> {
  const { data, error } = await supabase
    .from("user_reciters")
    .insert({
      user_id: userId,
      name,
      metadata: metadata || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getOrCreateReciter(
  userId: string,
  reciterName: string
): Promise<UserReciter> {
  // Try to find existing reciter
  const { data: existing } = await supabase
    .from("user_reciters")
    .select("*")
    .eq("user_id", userId)
    .eq("name", reciterName)
    .single();

  if (existing) return existing;

  // Create new reciter
  return createReciter(userId, reciterName);
}

// ============================================
// RECITATION OPERATIONS
// ============================================

export async function getRecitations(userId: string): Promise<Recitation[]> {
  const { data, error } = await supabase
    .from("recitations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getRecitation(
  recitationId: string
): Promise<Recitation | null> {
  const { data, error } = await supabase
    .from("recitations")
    .select("*")
    .eq("id", recitationId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function createRecitation(
  userId: string,
  recitation: Omit<Recitation, "id" | "user_id" | "created_at" | "updated_at">
): Promise<Recitation> {
  // Get or create reciter
  const reciter = await getOrCreateReciter(userId, recitation.reciter_name);

  // Remove reciter_id from recitation object to avoid duplicate key error
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reciter_id, ...recitationWithoutReciterId } = recitation;

  const { data, error } = await supabase
    .from("recitations")
    .insert({
      user_id: userId,
      reciter_id: reciter.id,
      ...recitationWithoutReciterId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateRecitation(
  recitationId: string,
  updates: Partial<Recitation>
): Promise<Recitation> {
  const { data, error } = await supabase
    .from("recitations")
    .update(updates)
    .eq("id", recitationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteRecitation(recitationId: string): Promise<void> {
  const { error } = await supabase
    .from("recitations")
    .delete()
    .eq("id", recitationId);

  if (error) throw error;
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

export function subscribeToRecitations(
  userId: string,
  callback: (recitation: Recitation) => void
) {
  const subscription = supabase
    .channel("recitations-changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "recitations",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload.new as Recitation);
      }
    )
    .subscribe();

  return subscription;
}

export function unsubscribe(
  subscription: ReturnType<typeof subscribeToRecitations>
) {
  supabase.removeChannel(subscription);
}
