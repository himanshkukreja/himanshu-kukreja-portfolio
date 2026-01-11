-- Reset all scroll positions to 0 to force recalculation with new logic
-- The old scroll positions were calculated with a broken relative positioning formula
UPDATE learning_progress
SET scroll_position = 0
WHERE scroll_position IS NOT NULL;

COMMENT ON COLUMN learning_progress.scroll_position IS 'Absolute scroll position (window.scrollY) where the user last left off reading. Updated 2025-01-11 to use absolute positioning.';
