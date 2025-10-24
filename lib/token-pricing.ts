/**
 * Token Pricing and Cost Calculation
 *
 * This module calculates API costs for transcriptions.
 * Pricing is at cost with no markup (for the sake of Allah).
 *
 * 1 token = $0.01 USD
 */

// ============================================
// PRICING CONSTANTS (All in tokens, 1 token = $0.01)
// Updated: 2025 Pricing
// ============================================
export const PRICING = {
  // OpenAI Whisper API: $0.006 per minute
  WHISPER_PER_MINUTE: 0.6, // 0.6 tokens = $0.006

  // OpenAI GPT-4o API (using latest pricing)
  // Input: $2.50 per 1M tokens, Output: $10 per 1M tokens
  GPT4O_INPUT_PER_1K: 0.25, // $0.0025 per 1K = 0.25 tokens
  GPT4O_OUTPUT_PER_1K: 1.0, // $0.01 per 1K = 1 token

  // AWS Lambda: $0.0000166667 per GB-second
  // With 512MB memory: $0.0000083333 per second
  LAMBDA_PER_SECOND_512MB: 0.00008333, // 0.00008333 tokens per second

  // AWS S3 Storage (negligible for single file operations)
  S3_STORAGE_PER_MB: 0.000023, // $0.000023 per MB per month
  S3_PUT_REQUEST: 0.000005, // $0.005 per 1000 PUT requests

  // Signup bonus for new users
  SIGNUP_BONUS: 50, // 50 tokens = $0.50
} as const;

// ============================================
// TYPE DEFINITIONS
// ============================================
export interface CostEstimate {
  whisperTokens: number;
  gpt5Tokens: number;
  lambdaTokens: number;
  s3Tokens: number;
  totalTokens: number;
  totalUsd: number;
  breakdown: string;
}

export interface ActualUsage {
  audioDurationSeconds: number;
  audioSizeBytes: number;
  gpt5InputTokens: number;
  gpt5OutputTokens: number;
  lambdaExecutionMs: number;
}

export interface CostBreakdown {
  whisperTokens: number;
  gpt5Tokens: number;
  lambdaTokens: number;
  s3Tokens: number;
  totalTokens: number;
}

// ============================================
// ESTIMATION FUNCTIONS
// ============================================

/**
 * Estimates the cost of a transcription before it starts
 * Used to warn users and check balance
 */
export function estimateTranscriptionCost(params: {
  audioDurationMinutes: number;
  audioSizeMB: number;
  estimatedAyahs: number;
}): CostEstimate {
  // Whisper cost: straightforward duration-based
  const whisperTokens = Math.ceil(
    params.audioDurationMinutes * PRICING.WHISPER_PER_MINUTE
  );

  // GPT-4o cost estimation (for AI ayah mapping)
  // Based on ACTUAL usage data: ~120 tokens input per ayah, ~85 tokens output per ayah
  // Note: Output tokens cost 4x more than input, so accurate estimation is critical
  const estimatedInputTokens = params.estimatedAyahs * 120;
  const estimatedOutputTokens = params.estimatedAyahs * 85;

  const gpt5Tokens = Math.ceil(
    (estimatedInputTokens / 1000) * PRICING.GPT4O_INPUT_PER_1K +
      (estimatedOutputTokens / 1000) * PRICING.GPT4O_OUTPUT_PER_1K
  );

  // Lambda cost estimation
  // Assume 1.5x audio duration for processing time (chunking, transcription, etc.)
  const estimatedLambdaSeconds = params.audioDurationMinutes * 60 * 1.5;
  const lambdaCost = estimatedLambdaSeconds * PRICING.LAMBDA_PER_SECOND_512MB;

  // S3 cost: negligible for single operations
  const s3Cost = params.audioSizeMB * 0.00001;

  // Bundle Lambda + S3 costs together before rounding
  // This prevents tiny costs from being rounded to 1 token each
  const infrastructureCost = lambdaCost + s3Cost;
  const infrastructureTokens = Math.ceil(infrastructureCost); // Round the total, not individually

  const totalTokens = whisperTokens + gpt5Tokens + infrastructureTokens;
  const totalUsd = totalTokens * 0.01;

  return {
    whisperTokens,
    gpt5Tokens,
    lambdaTokens: infrastructureTokens, // Combined Lambda + S3
    s3Tokens: 0, // Bundled with Lambda
    totalTokens,
    totalUsd,
    breakdown: `Whisper: ${whisperTokens}t, GPT-5: ${gpt5Tokens}t, Infrastructure: ${infrastructureTokens}t`,
  };
}

/**
 * Calculates the actual cost after transcription completes
 * Uses real API usage data
 */
export function calculateActualCost(usage: ActualUsage): CostBreakdown {
  // Whisper cost: actual audio duration
  const whisperTokens = Math.ceil(
    (usage.audioDurationSeconds / 60) * PRICING.WHISPER_PER_MINUTE
  );

  // GPT-4o cost: actual token usage from API response
  const gpt5Tokens = Math.ceil(
    (usage.gpt5InputTokens / 1000) * PRICING.GPT4O_INPUT_PER_1K +
      (usage.gpt5OutputTokens / 1000) * PRICING.GPT4O_OUTPUT_PER_1K
  );

  // Lambda cost: actual execution time
  const lambdaCost =
    (usage.lambdaExecutionMs / 1000) * PRICING.LAMBDA_PER_SECOND_512MB;

  // S3 cost: negligible
  const audioSizeMB = usage.audioSizeBytes / (1024 * 1024);
  const s3Cost = audioSizeMB * 0.00001;

  // Bundle Lambda + S3 costs together before rounding
  // This prevents tiny costs from being rounded to 1 token each
  const infrastructureCost = lambdaCost + s3Cost;
  const infrastructureTokens = Math.ceil(infrastructureCost); // Round the total, not individually

  const totalTokens = whisperTokens + gpt5Tokens + infrastructureTokens;

  return {
    whisperTokens,
    gpt5Tokens,
    lambdaTokens: infrastructureTokens, // Combined Lambda + S3
    s3Tokens: 0, // Bundled with Lambda
    totalTokens,
  };
}

/**
 * Converts tokens to USD
 */
export function tokensToUsd(tokens: number): number {
  return tokens * 0.01;
}

/**
 * Converts USD to tokens
 */
export function usdToTokens(usd: number): number {
  return Math.round(usd * 100);
}

/**
 * Formats tokens for display
 */
export function formatTokens(tokens: number): string {
  return `${tokens} tokens ($${tokensToUsd(tokens).toFixed(2)})`;
}

/**
 * Gets the number of ayahs in a surah for cost estimation
 */
export function getAyahCount(surahNumber: number): number {
  // Standard ayah counts for all 114 surahs
  const ayahCounts: Record<number, number> = {
    1: 7,
    2: 286,
    3: 200,
    4: 176,
    5: 120,
    6: 165,
    7: 206,
    8: 75,
    9: 129,
    10: 109,
    11: 123,
    12: 111,
    13: 43,
    14: 52,
    15: 99,
    16: 128,
    17: 111,
    18: 110,
    19: 98,
    20: 135,
    21: 112,
    22: 78,
    23: 118,
    24: 64,
    25: 77,
    26: 227,
    27: 93,
    28: 88,
    29: 69,
    30: 60,
    31: 34,
    32: 30,
    33: 73,
    34: 54,
    35: 45,
    36: 83,
    37: 182,
    38: 88,
    39: 75,
    40: 85,
    41: 54,
    42: 53,
    43: 89,
    44: 59,
    45: 37,
    46: 35,
    47: 38,
    48: 29,
    49: 18,
    50: 45,
    51: 60,
    52: 49,
    53: 62,
    54: 55,
    55: 78,
    56: 96,
    57: 29,
    58: 22,
    59: 24,
    60: 13,
    61: 14,
    62: 11,
    63: 11,
    64: 18,
    65: 12,
    66: 12,
    67: 30,
    68: 52,
    69: 52,
    70: 44,
    71: 28,
    72: 28,
    73: 20,
    74: 56,
    75: 40,
    76: 31,
    77: 50,
    78: 40,
    79: 46,
    80: 42,
    81: 29,
    82: 19,
    83: 36,
    84: 25,
    85: 22,
    86: 17,
    87: 19,
    88: 26,
    89: 30,
    90: 20,
    91: 15,
    92: 21,
    93: 11,
    94: 8,
    95: 8,
    96: 19,
    97: 5,
    98: 8,
    99: 8,
    100: 11,
    101: 11,
    102: 8,
    103: 3,
    104: 9,
    105: 5,
    106: 4,
    107: 7,
    108: 3,
    109: 6,
    110: 3,
    111: 5,
    112: 4,
    113: 5,
    114: 6,
  };

  return ayahCounts[surahNumber] || 0;
}

/**
 * Quick estimate for a given surah number and audio file
 */
export function quickEstimate(
  surahNumber: number,
  audioFile: File
): CostEstimate {
  // Get audio duration from file metadata (may not be available)
  // For now, estimate based on file size: ~1MB per minute of audio (rough)
  const fileSizeMB = audioFile.size / (1024 * 1024);
  const estimatedMinutes = fileSizeMB / 1.2; // Adjust based on typical compression

  const ayahCount = getAyahCount(surahNumber);

  return estimateTranscriptionCost({
    audioDurationMinutes: estimatedMinutes,
    audioSizeMB: fileSizeMB,
    estimatedAyahs: ayahCount,
  });
}
