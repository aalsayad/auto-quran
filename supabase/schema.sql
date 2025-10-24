-- ============================================
-- QURAN SPLITTER - SUPABASE SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  billing_data JSONB DEFAULT '{"tokens": 100, "usage_count": 0, "usage_quota": 10}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Trigger to create profile on signup
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

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. USER RECITERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_reciters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb, -- { name_arabic, bio, avatar_url, etc }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- RLS Policies for user_reciters
ALTER TABLE public.user_reciters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reciters"
  ON public.user_reciters FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reciters"
  ON public.user_reciters FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reciters"
  ON public.user_reciters FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own reciters"
  ON public.user_reciters FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. RECITATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.recitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reciter_id UUID REFERENCES public.user_reciters(id) ON DELETE SET NULL,
  reciter_name TEXT NOT NULL,
  surah_number INTEGER NOT NULL CHECK (surah_number >= 1 AND surah_number <= 114),
  surah_name TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  audio_file_name TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcription_data JSONB DEFAULT '{}'::jsonb, -- { whisper: {...}, segments: [...], ayah_texts: [...] }
  settings_data JSONB DEFAULT '{}'::jsonb, -- { silence_threshold, min_silence_duration, etc }
  metadata JSONB DEFAULT '{}'::jsonb, -- { file_size, duration, processing_error, published, etc }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_recitations_user_id ON public.recitations(user_id);
CREATE INDEX idx_recitations_reciter_id ON public.recitations(reciter_id);
CREATE INDEX idx_recitations_surah_number ON public.recitations(surah_number);
CREATE INDEX idx_recitations_status ON public.recitations(status);

-- RLS Policies for recitations
ALTER TABLE public.recitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recitations"
  ON public.recitations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recitations"
  ON public.recitations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recitations"
  ON public.recitations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recitations"
  ON public.recitations FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_user_reciters_updated_at
  BEFORE UPDATE ON public.user_reciters
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_recitations_updated_at
  BEFORE UPDATE ON public.recitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

