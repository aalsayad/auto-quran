-- Token System Database Functions
-- Atomic operations for managing token balances

-- ============================================
-- FUNCTION: add_tokens
-- Adds tokens to a user's balance (purchases, bonuses, refunds)
-- Returns the transaction ID for tracking
-- ============================================
CREATE OR REPLACE FUNCTION add_tokens(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
BEGIN
  -- Validate amount is positive
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive, got: %', p_amount;
  END IF;

  -- Insert or update user_tokens (upsert)
  INSERT INTO user_tokens (user_id, balance_tokens, total_earned, updated_at)
  VALUES (p_user_id, p_amount, p_amount, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET
    balance_tokens = user_tokens.balance_tokens + p_amount,
    total_earned = user_tokens.total_earned + p_amount,
    updated_at = NOW();

  -- Log transaction
  INSERT INTO token_transactions (user_id, amount_tokens, transaction_type, description, metadata)
  VALUES (p_user_id, p_amount, p_type, p_description, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION add_tokens TO authenticated;

COMMENT ON FUNCTION add_tokens IS 'Atomically adds tokens to user balance and logs transaction';

-- ============================================
-- FUNCTION: deduct_tokens
-- Deducts tokens from a user's balance (usage, reservations)
-- Fails if insufficient balance
-- Returns the transaction ID for tracking
-- ============================================
CREATE OR REPLACE FUNCTION deduct_tokens(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_current_balance INTEGER;
BEGIN
  -- Validate amount is positive
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive, got: %', p_amount;
  END IF;

  -- Get current balance with row lock (prevents race conditions)
  SELECT balance_tokens INTO v_current_balance
  FROM user_tokens
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Check if user has token record
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % has no token balance record', p_user_id;
  END IF;

  -- Check sufficient balance
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient tokens. Balance: %, Required: %',
      v_current_balance, p_amount;
  END IF;

  -- Deduct tokens
  UPDATE user_tokens
  SET
    balance_tokens = balance_tokens - p_amount,
    total_spent = total_spent + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Log transaction (negative amount)
  INSERT INTO token_transactions (user_id, amount_tokens, transaction_type, description, metadata)
  VALUES (p_user_id, -p_amount, p_type, p_description, COALESCE(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION deduct_tokens TO authenticated;

COMMENT ON FUNCTION deduct_tokens IS 'Atomically deducts tokens from user balance with balance check';

-- ============================================
-- FUNCTION: get_user_balance
-- Simple helper to get current balance
-- ============================================
CREATE OR REPLACE FUNCTION get_user_balance(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT balance_tokens INTO v_balance
  FROM user_tokens
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_balance, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_balance TO authenticated;

COMMENT ON FUNCTION get_user_balance IS 'Returns current token balance for a user';

-- ============================================
-- FUNCTION: record_transcription_usage
-- Records detailed usage for a transcription
-- ============================================
CREATE OR REPLACE FUNCTION record_transcription_usage(
  p_user_id UUID,
  p_recitation_id UUID,
  p_whisper_tokens INTEGER,
  p_gpt5_tokens INTEGER,
  p_lambda_tokens INTEGER,
  p_s3_tokens INTEGER,
  p_audio_duration INTEGER,
  p_audio_size BIGINT,
  p_whisper_segments INTEGER,
  p_gpt5_input_tokens INTEGER,
  p_gpt5_output_tokens INTEGER,
  p_lambda_execution_ms INTEGER
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage_id UUID;
  v_total_tokens INTEGER;
BEGIN
  v_total_tokens := p_whisper_tokens + p_gpt5_tokens + p_lambda_tokens + p_s3_tokens;

  INSERT INTO transcription_usage (
    user_id,
    recitation_id,
    whisper_cost_tokens,
    gpt5_cost_tokens,
    lambda_cost_tokens,
    s3_cost_tokens,
    total_cost_tokens,
    audio_duration_seconds,
    audio_size_bytes,
    whisper_segments_count,
    gpt5_input_tokens,
    gpt5_output_tokens,
    lambda_execution_ms,
    status,
    completed_at
  ) VALUES (
    p_user_id,
    p_recitation_id,
    p_whisper_tokens,
    p_gpt5_tokens,
    p_lambda_tokens,
    p_s3_tokens,
    v_total_tokens,
    p_audio_duration,
    p_audio_size,
    p_whisper_segments,
    p_gpt5_input_tokens,
    p_gpt5_output_tokens,
    p_lambda_execution_ms,
    'completed',
    NOW()
  ) RETURNING id INTO v_usage_id;

  RETURN v_usage_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_transcription_usage TO authenticated;

COMMENT ON FUNCTION record_transcription_usage IS 'Records detailed API usage for a completed transcription';

-- ============================================
-- FUNCTION: grant_signup_bonus
-- Trigger function to grant tokens to new users
-- ============================================
CREATE OR REPLACE FUNCTION grant_signup_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Grant 50 tokens ($0.50) to new user
  PERFORM add_tokens(
    NEW.id,
    50,
    'signup_bonus',
    'Welcome bonus - 50 free tokens ($0.50)',
    jsonb_build_object('source', 'signup', 'email', NEW.email)
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Failed to grant signup bonus to user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION grant_signup_bonus IS 'Automatically grants 50 tokens to new users on signup';
