-- =====================================================
-- Add Custom Title/Name Field to Bookmarks
-- =====================================================
-- This migration adds a custom_title field to bookmarks
-- so users can give their bookmarks custom names
-- =====================================================

-- Add custom_title column to bookmarks table
ALTER TABLE bookmarks
ADD COLUMN IF NOT EXISTS custom_title TEXT;

-- Add comment to explain the field
COMMENT ON COLUMN bookmarks.custom_title IS 'Optional custom name/title for the bookmark (if user wants to override the lesson title)';
