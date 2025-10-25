-- Create mushaf_bookmarks table (separate from recitation bookmarks)
CREATE TABLE IF NOT EXISTS mushaf_bookmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  surah_number INTEGER NOT NULL,
  ayah_number INTEGER NOT NULL,
  page_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, surah_number, ayah_number)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_mushaf_bookmarks_user ON mushaf_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_mushaf_bookmarks_page ON mushaf_bookmarks(user_id, page_number);

-- RLS policies
ALTER TABLE mushaf_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own mushaf bookmarks"
  ON mushaf_bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own mushaf bookmarks"
  ON mushaf_bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own mushaf bookmarks"
  ON mushaf_bookmarks FOR DELETE
  USING (auth.uid() = user_id);
