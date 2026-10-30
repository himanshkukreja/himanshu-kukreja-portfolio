-- =====================================================
-- Handwritten notes on a passage ("ink notes")
-- =====================================================
-- A learner selects a passage in a lesson, picks "Handwritten note" and writes on a pad with a stylus, a finger or
-- a mouse. The note is an ordinary content_notes row (same anchoring as a typed note: highlight_text +
-- highlight_offset, same note_type and colour) with its strokes in a new `ink` column.
--
--   ink = { "w": <pad width>, "h": <pad height>, "strokes": Stroke[] }   (pad units; see src/lib/learn/ink/types.ts)
--   Stroke = { id, tool: "pen" | "highlighter", color: <palette key>, size, pts: [x*10, y*10, pressure, ...] }
--
-- note_text: unchanged. The column is nullable with default '' (20250109_make_note_text_optional.sql), and the
-- content_notes_len check (20261015_learn_backend_fixes.sql) still bounds it. A handwritten note stores '' until the
-- learner taps "Turn into text"; then it holds the typed Markdown, and the ink is kept. A row with ink is a
-- handwritten note whatever its note_text is: the reader and the notebook tell it apart by `ink is not null`
-- (a row with note_text '' and no ink stays a plain highlight).
--
-- Row-level security is unchanged: content_notes already lets a learner select / insert / update / delete only
-- their own rows (20250109_auth_and_learning.sql), and that covers the new column.
--
-- Idempotent: safe to run more than once.

alter table public.content_notes
  add column if not exists ink jsonb;

comment on column public.content_notes.ink is
  'Handwritten note strokes: {w, h, strokes: Stroke[]} in pad units (src/lib/learn/ink/passage.ts). Null for highlights and typed notes.';

-- Bounded like the other learner-written columns. NOT VALID: no existing row has ink, so nothing needs re-checking;
-- every insert and update is checked from now on. The browser keeps a note under ~290 KB and says "the pad is full".
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_notes_ink_size') then
    alter table public.content_notes add constraint content_notes_ink_size
      check (
        ink is null
        or (
          jsonb_typeof(ink) = 'object'
          and jsonb_typeof(ink -> 'strokes') = 'array'
          and octet_length(ink::text) <= 300000
        )
      ) not valid;
  end if;
end $$;

-- The reader loads a lesson's handwritten notes with `ink is not null`; the existing
-- idx_content_notes_lesson (course_id, week, lesson_slug) already narrows that to a handful of rows per learner,
-- so no new index is needed.
