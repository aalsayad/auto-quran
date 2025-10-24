-- ============================================
-- SET 50 TOKEN SIGNUP BONUS
-- Run this in Supabase SQL Editor to update signup bonus
-- ============================================

-- Update the handle_new_user function to grant 50 tokens
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create user profile
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Grant signup bonus (50 tokens = $0.50)
  PERFORM add_tokens(
    new.id,
    50, -- 👈 CHANGE THIS NUMBER TO ADJUST SIGNUP BONUS
    'signup_bonus',
    'Welcome bonus - 50 free tokens ($0.50)',
    jsonb_build_object(
      'source', 'signup',
      'email', new.email,
      'triggered_at', NOW()
    )
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFY IT WORKS
-- ============================================
-- After running this, test by:
-- 1. Sign up a new user
-- 2. Check their balance:
--    SELECT * FROM user_tokens WHERE user_id = '<user_id>';
-- 3. Should show balance_tokens = 50
-- ============================================

