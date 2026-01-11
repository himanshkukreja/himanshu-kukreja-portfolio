-- Add scroll_position to learning_progress table to track where user left off
ALTER TABLE learning_progress
ADD COLUMN IF NOT EXISTS scroll_position INTEGER DEFAULT 0;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_learning_progress_scroll ON learning_progress(user_id, course_id, scroll_position);

-- Comment explaining the field
COMMENT ON COLUMN learning_progress.scroll_position IS 'Scroll position (Y offset in pixels) where the user last left off reading';
