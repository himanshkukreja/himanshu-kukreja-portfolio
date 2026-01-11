-- Make note_text optional so users can create highlights without notes
ALTER TABLE content_notes
ALTER COLUMN note_text DROP NOT NULL;

-- Set default to empty string for backwards compatibility
ALTER TABLE content_notes
ALTER COLUMN note_text SET DEFAULT '';
