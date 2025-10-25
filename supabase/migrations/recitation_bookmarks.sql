-- ============================================
-- RECITATION BOOKMARKS TABLE
-- ============================================
-- Stores user bookmarks for specific ayahs within recitations

CREATE TABLE IF NOT EXISTS public.recitation_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recitation_id UUID NOT NULL REFERENCES public.recitations(id) ON DELETE CASCADE,
  ayah_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Ensure no duplicate bookmarks for the same ayah in the same recitation
  UNIQUE(user_id, recitation_id, ayah_number)
);

-- Index for faster queries
CREATE INDEX idx_recitation_bookmarks_user_id ON public.recitation_bookmarks(user_id);
CREATE INDEX idx_recitation_bookmarks_recitation_id ON public.recitation_bookmarks(recitation_id);

-- RLS Policies
ALTER TABLE public.recitation_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookmarks"
  ON public.recitation_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks"
  ON public.recitation_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON public.recitation_bookmarks FOR DELETE
  USING (auth.uid() = user_id);
