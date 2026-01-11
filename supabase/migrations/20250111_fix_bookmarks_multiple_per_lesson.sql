-- =====================================================
-- Fix Bookmarks: Allow Multiple Bookmarks Per Lesson
-- =====================================================
-- Problem: The old unique constraint only allowed ONE bookmark per lesson
-- Solution: Change constraint to allow multiple bookmarks per lesson,
--           but prevent exact duplicates (same text at same offset)

-- Step 1: Drop the old unique constraint
ALTER TABLE bookmarks
DROP CONSTRAINT IF EXISTS bookmarks_user_id_course_id_week_lesson_slug_key;

-- Step 2: Add the bookmark_text and bookmark_offset columns (if not already added)
ALTER TABLE bookmarks
ADD COLUMN IF NOT EXISTS bookmark_text TEXT,
ADD COLUMN IF NOT EXISTS bookmark_offset INTEGER;

-- Step 3: Add new unique constraint to prevent duplicate bookmarks of same text at same offset
-- This allows multiple different bookmarks in the same lesson, but prevents exact duplicates
ALTER TABLE bookmarks
ADD CONSTRAINT bookmarks_unique_text_offset
UNIQUE (user_id, course_id, week, lesson_slug, bookmark_offset);

-- Step 4: Add index for performance when fetching bookmarks for a lesson
CREATE INDEX IF NOT EXISTS idx_bookmarks_offset ON bookmarks(user_id, course_id, week, lesson_slug, bookmark_offset);

-- Step 5: Add comments explaining the fields
COMMENT ON COLUMN bookmarks.bookmark_text IS 'The specific text that was bookmarked (for text-level bookmarks like Kindle)';
COMMENT ON COLUMN bookmarks.bookmark_offset IS 'Character offset of the bookmarked text in the lesson content (to handle multiple instances of same text)';
COMMENT ON CONSTRAINT bookmarks_unique_text_offset ON bookmarks IS 'Allows multiple bookmarks per lesson, but prevents duplicate bookmarks of the same text at the same offset';
