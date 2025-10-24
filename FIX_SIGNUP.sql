-- ============================================
-- FIX SIGNUP ERROR
-- Run this in Supabase SQL Editor
-- ============================================

-- STEP 1: Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- STEP 2: Recreate the function with better error handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create profile first
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Grant 50 token signup bonus
  -- This will also create the user_tokens record
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

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't fail the signup
    RAISE WARNING 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- STEP 3: Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- STEP 4: Verify add_tokens function exists
-- If this fails, you need to run token_functions.sql first!
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'add_tokens'
  ) THEN
    RAISE EXCEPTION 'add_tokens() function not found! Run token_functions.sql first!';
  END IF;
END $$;

-- ============================================
-- VERIFICATION
-- ============================================
-- Check trigger exists:
-- SELECT * FROM information_schema.triggers 
-- WHERE trigger_name = 'on_auth_user_created';
--
-- Check function exists:
-- SELECT * FROM pg_proc WHERE proname = 'handle_new_user';
-- ============================================

