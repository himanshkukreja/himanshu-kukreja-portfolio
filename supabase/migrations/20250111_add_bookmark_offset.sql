-- Add offset and bookmark_text fields to bookmarks table for text-level bookmarks
ALTER TABLE bookmarks
ADD COLUMN IF NOT EXISTS bookmark_text TEXT,
ADD COLUMN IF NOT EXISTS bookmark_offset INTEGER;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_bookmarks_offset ON bookmarks(user_id, course_id, week, lesson_slug, bookmark_offset);

-- Comment explaining the fields
COMMENT ON COLUMN bookmarks.bookmark_text IS 'The specific text that was bookmarked (for text-level bookmarks)';
COMMENT ON COLUMN bookmarks.bookmark_offset IS 'Character offset of the bookmarked text in the lesson content';
