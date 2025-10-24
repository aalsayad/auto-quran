-- ============================================
-- FIX SIGNUP ERROR - COMPLETE SOLUTION
-- Run this ENTIRE file in Supabase SQL Editor
-- ============================================

-- STEP 1: Drop and recreate the trigger function with proper error handling
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create profile (with conflict handling)
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Try to grant signup bonus
  BEGIN
    PERFORM add_tokens(
      NEW.id,
      50,
      'signup_bonus',
      'Welcome bonus - 50 free tokens ($0.50)',
      jsonb_build_object(
        'source', 'signup',
        'email', NEW.email,
        'triggered_at', NOW()
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- If add_tokens fails, just log warning but don't block signup
      RAISE WARNING 'Could not grant signup bonus to user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- STEP 2: Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- DONE! Now try signing up again
-- ============================================

