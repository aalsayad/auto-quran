/**
 * Token Manager
 *
 * Client-side functions for managing user tokens and checking balances.
 * All operations are performed through Supabase RPC calls to ensure security.
 */

import { supabase } from "@/lib/supabase";
import type { CostBreakdown } from "@/lib/token-pricing";

// ============================================
// TYPE DEFINITIONS
// ============================================
export interface TokenBalance {
  balanceTokens: number;
  totalEarned: number;
  totalSpent: number;
  balanceUsd: number;
}

export interface TokenTransaction {
  id: string;
  userId: string;
  amountTokens: number;
  transactionType: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TranscriptionUsage {
  id: string;
  userId: string;
  recitationId: string | null;
  whisperCostTokens: number;
  gpt5CostTokens: number;
  lambdaCostTokens: number;
  s3CostTokens: number;
  totalCostTokens: number;
  audioDurationSeconds: number;
  audioSizeBytes: number;
  whisperSegmentsCount: number;
  gpt5InputTokens: number;
  gpt5OutputTokens: number;
  lambdaExecutionMs: number;
  status: string;
  createdAt: string;
  completedAt: string | null;
}

// ============================================
// BALANCE OPERATIONS
// ============================================

/**
 * Get user's current token balance
 */
export async function getUserTokenBalance(
  userId: string
): Promise<TokenBalance> {
  const { data, error } = await supabase
    .from("user_tokens")
    .select("balance_tokens, total_earned, total_spent")
    .eq("user_id", userId)
    .single();

  if (error) {
    // If user has no record yet, return zero balance
    if (error.code === "PGRST116") {
      return {
        balanceTokens: 0,
        totalEarned: 0,
        totalSpent: 0,
        balanceUsd: 0,
      };
    }
    throw error;
  }

  return {
    balanceTokens: data.balance_tokens,
    totalEarned: data.total_earned,
    totalSpent: data.total_spent,
    balanceUsd: data.balance_tokens * 0.01,
  };
}

/**
 * Check if user has sufficient balance for a transaction
 */
export async function checkSufficientBalance(
  userId: string,
  requiredTokens: number
): Promise<{
  sufficient: boolean;
  balance: number;
  shortage: number;
}> {
  const balance = await getUserTokenBalance(userId);

  return {
    sufficient: balance.balanceTokens >= requiredTokens,
    balance: balance.balanceTokens,
    shortage: Math.max(0, requiredTokens - balance.balanceTokens),
  };
}

// ============================================
// TOKEN TRANSACTIONS
// ============================================

/**
 * Reserve tokens for a transcription (optimistic deduction)
 * This immediately deducts tokens to prevent race conditions
 */
export async function reserveTokens(
  userId: string,
  tokens: number,
  description: string,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  transactionId?: string;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc("deduct_tokens", {
      p_user_id: userId,
      p_amount: tokens,
      p_type: "transcription_reserved",
      p_description: description,
      p_metadata: metadata || {},
    });

    if (error) throw error;

    return { success: true, transactionId: data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to reserve tokens",
    };
  }
}

/**
 * Refund tokens (if estimate was higher than actual cost)
 */
export async function refundTokens(
  userId: string,
  tokens: number,
  description: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase.rpc("add_tokens", {
      p_user_id: userId,
      p_amount: tokens,
      p_type: "refund",
      p_description: description,
      p_metadata: metadata || {},
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to refund tokens",
    };
  }
}

/**
 * Deduct actual cost after transcription completes
 */
export async function deductActualCost(
  userId: string,
  tokens: number,
  description: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase.rpc("deduct_tokens", {
      p_user_id: userId,
      p_amount: tokens,
      p_type: "transcription",
      p_description: description,
      p_metadata: metadata || {},
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to deduct tokens",
    };
  }
}

// ============================================
// USAGE TRACKING
// ============================================

/**
 * Record detailed transcription usage
 */
export async function recordTranscriptionUsage(
  userId: string,
  recitationId: string | null,
  costBreakdown: CostBreakdown,
  usage: {
    audioDurationSeconds: number;
    audioSizeBytes: number;
    whisperSegmentsCount: number;
    gpt5InputTokens: number;
    gpt5OutputTokens: number;
    lambdaExecutionMs: number;
  }
): Promise<{ success: boolean; usageId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("record_transcription_usage", {
      p_user_id: userId,
      p_recitation_id: recitationId,
      p_whisper_tokens: costBreakdown.whisperTokens,
      p_gpt5_tokens: costBreakdown.gpt5Tokens,
      p_lambda_tokens: costBreakdown.lambdaTokens,
      p_s3_tokens: costBreakdown.s3Tokens,
      p_audio_duration: usage.audioDurationSeconds,
      p_audio_size: usage.audioSizeBytes,
      p_whisper_segments: usage.whisperSegmentsCount,
      p_gpt5_input_tokens: usage.gpt5InputTokens,
      p_gpt5_output_tokens: usage.gpt5OutputTokens,
      p_lambda_execution_ms: usage.lambdaExecutionMs,
    });

    if (error) throw error;

    return { success: true, usageId: data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record usage",
    };
  }
}

/**
 * Get user's transaction history
 */
export async function getTransactionHistory(
  userId: string,
  limit: number = 50
): Promise<TokenTransaction[]> {
  const { data, error } = await supabase
    .from("token_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    amountTokens: row.amount_tokens,
    transactionType: row.transaction_type,
    description: row.description,
    metadata: row.metadata,
    createdAt: row.created_at,
  }));
}

/**
 * Get user's usage history
 */
export async function getUsageHistory(
  userId: string,
  limit: number = 50
): Promise<TranscriptionUsage[]> {
  const { data, error } = await supabase
    .from("transcription_usage")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    recitationId: row.recitation_id,
    whisperCostTokens: row.whisper_cost_tokens,
    gpt5CostTokens: row.gpt5_cost_tokens,
    lambdaCostTokens: row.lambda_cost_tokens,
    s3CostTokens: row.s3_cost_tokens,
    totalCostTokens: row.total_cost_tokens,
    audioDurationSeconds: row.audio_duration_seconds,
    audioSizeBytes: row.audio_size_bytes,
    whisperSegmentsCount: row.whisper_segments_count,
    gpt5InputTokens: row.gpt5_input_tokens,
    gpt5OutputTokens: row.gpt5_output_tokens,
    lambdaExecutionMs: row.lambda_execution_ms,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }));
}

// ============================================
// ADMIN FUNCTIONS (Future)
// ============================================

/**
 * Grant tokens to a user (admin only)
 */
export async function grantTokens(
  userId: string,
  tokens: number,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase.rpc("add_tokens", {
      p_user_id: userId,
      p_amount: tokens,
      p_type: "admin_grant",
      p_description: reason,
      p_metadata: { granted_by: "admin" },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to grant tokens",
    };
  }
}
