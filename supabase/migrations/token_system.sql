-- Token System Database Schema
-- This implements a pay-as-you-go token system for API usage tracking
-- 1 token = $0.01 USD (no markup, for the sake of Allah)

-- ============================================
-- TABLE: user_tokens
-- Stores the current token balance for each user
-- ============================================
CREATE TABLE IF NOT EXISTS user_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_tokens INTEGER NOT NULL DEFAULT 0 CHECK (balance_tokens >= 0),
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_tokens_balance ON user_tokens(user_id, balance_tokens);

-- ============================================
-- TABLE: token_transactions
-- Logs all token movements (purchases, usage, refunds)
-- ============================================
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_tokens INTEGER NOT NULL, -- positive = earned, negative = spent
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'signup_bonus',
    'purchase',
    'transcription',
    'transcription_reserved',
    'refund',
    'adjustment',
    'admin_grant'
  )),
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_token_transactions_user ON token_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_transactions_type ON token_transactions(transaction_type);

-- ============================================
-- TABLE: transcription_usage
-- Detailed tracking of each transcription's API costs
-- ============================================
CREATE TABLE IF NOT EXISTS transcription_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recitation_id UUID REFERENCES recitations(id) ON DELETE SET NULL,

  -- Cost breakdown (in tokens, where 1 token = $0.01 USD)
  whisper_cost_tokens INTEGER NOT NULL DEFAULT 0,
  gpt5_cost_tokens INTEGER NOT NULL DEFAULT 0,
  lambda_cost_tokens INTEGER NOT NULL DEFAULT 0,
  s3_cost_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_tokens INTEGER NOT NULL DEFAULT 0,

  -- Usage details for audit
  audio_duration_seconds INTEGER,
  audio_size_bytes BIGINT,
  whisper_segments_count INTEGER,
  gpt5_input_tokens INTEGER,
  gpt5_output_tokens INTEGER,
  lambda_execution_ms INTEGER,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'completed',
    'failed',
    'refunded'
  )),
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_transcription_usage_user ON transcription_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcription_usage_status ON transcription_usage(status);
CREATE INDEX IF NOT EXISTS idx_transcription_usage_recitation ON transcription_usage(recitation_id);

-- ============================================
-- TABLE: token_purchases
-- Tracks subscription purchases and payments
-- ============================================
CREATE TABLE IF NOT EXISTS token_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usd DECIMAL(10, 2) NOT NULL CHECK (amount_usd > 0),
  tokens_purchased INTEGER NOT NULL CHECK (tokens_purchased > 0),
  payment_provider TEXT NOT NULL, -- 'stripe', 'paypal', etc.
  payment_id TEXT, -- External payment ID
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'completed',
    'failed',
    'refunded'
  )),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for payment lookups
CREATE INDEX IF NOT EXISTS idx_token_purchases_user ON token_purchases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_purchases_payment ON token_purchases(payment_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- Users can only access their own data
-- ============================================
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcription_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_purchases ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own token balance
CREATE POLICY "Users can view own tokens"
  ON user_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can view their own transactions
CREATE POLICY "Users can view own transactions"
  ON token_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can view their own usage history
CREATE POLICY "Users can view own usage"
  ON transcription_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can view their own purchases
CREATE POLICY "Users can view own purchases"
  ON token_purchases
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE user_tokens IS 'Stores current token balance for each user. 1 token = $0.01 USD';
COMMENT ON TABLE token_transactions IS 'Complete audit log of all token movements';
COMMENT ON TABLE transcription_usage IS 'Detailed API usage tracking per transcription';
COMMENT ON TABLE token_purchases IS 'Payment records for token purchases';

COMMENT ON COLUMN user_tokens.balance_tokens IS 'Current available tokens (cannot go negative)';
COMMENT ON COLUMN token_transactions.amount_tokens IS 'Positive = credit, Negative = debit';
COMMENT ON COLUMN transcription_usage.total_cost_tokens IS 'Sum of all API costs for this transcription';
