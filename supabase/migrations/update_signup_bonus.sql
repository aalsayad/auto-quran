-- ============================================
-- UPDATE EXISTING SIGNUP TRIGGER
-- Add token bonus to existing handle_new_user() function
-- ============================================

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
  );

  -- Grant signup bonus (50 tokens = $0.50)
  PERFORM add_tokens(
    new.id,
    50,
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

-- Trigger already exists (on_auth_user_created), no need to recreate
