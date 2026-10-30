-- Lesson annotations ("Annotate" in a lesson's reading tools): the ink a learner writes straight onto a lesson with a
-- stylus or a mouse (underlines, circles, arrows, margin notes, highlighter), anchored to the lesson's text so it
-- stays on the same words when the page reflows. One row per learner per lesson.
-- Written 1 Nov 2026 for the owner to review and apply; never applied by the app. Safe to run twice.
-- Before it is applied the app keeps marks on the learner's device and says so (src/lib/learn/ink/annotateStore.ts).
--
-- lesson_annotations:
--   lesson_key   "<week>/<slug>" of the lesson (the same key notebook pages use for the lesson they were written
--                beside; side quests, capstones and problems use their reader's week and slug the same way).
--   marks        { "v": 1, "marks": [ { id, tool, color, size, b: {s, h, o, t, p}, m, r?, q?, a?, k, g?, pts, at } ] }
--                b is the block the mark is anchored to (the heading / stage id it sits under, a hash of the block's
--                text, which occurrence, its tag, its first words), m the anchoring mode (t = a character range,
--                b = fractions of the block's box, g = a rigid shape at an anchor point), pts the flat
--                [x, y, pressure] points in that mode's units. See src/lib/learn/ink/annotate.ts. Saved whole by the
--                browser (debounced), last write wins. A mark whose block is gone after a lesson edit stays in the
--                row ("detached") until the learner deletes it.
--
-- Size: the browser caps marks at 1,500,000 characters, measured like the jsonb text below (compact JSON plus the
-- space jsonb's text form prints after each comma and colon: annotBytes), and tells the learner the lesson is full.
-- The check measures the same thing on the server, the length of the stored JSON as text, with headroom: 2,000,000.
-- Not pg_column_size(): inside a CHECK it sees the value before TOAST compression, ~2.7× the JSON text for ink
-- (measured for notebook_pages on Postgres 17: 1.07 MB of strokes = 2.89 MB), so a bound there would reject rows the
-- browser accepted at roughly a third of the intended size. On disk a row is stored compressed (~0.6× the JSON text).
-- (Same reasoning as 20261031_notebook_pages.sql.)
--
-- Privacy: only the learner reads or writes their row (RLS below: user_id = auth.uid()); anon has no access. The
-- server never reads it. Deleted with the account (on delete cascade).

create table if not exists public.lesson_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lesson_key text not null check (length(lesson_key) between 1 and 200),
  marks jsonb not null default '{"v": 1, "marks": []}'::jsonb check (jsonb_typeof(marks) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_annotations_user_lesson_key unique (user_id, lesson_key),
  constraint lesson_annotations_size check (octet_length(marks::text) <= 2000000)
);
-- the unique constraint's index serves "this learner's marks on this lesson"; this one serves "recently annotated"
create index if not exists lesson_annotations_user_updated_idx on public.lesson_annotations (user_id, updated_at desc);
alter table public.lesson_annotations enable row level security;

-- ------------------------------------------------------------------ grants (browser: signed-in learners only)

revoke all on table public.lesson_annotations from anon;
grant select, insert, update, delete on table public.lesson_annotations to authenticated;

-- ------------------------------------------------------------------ row-level security

drop policy if exists "lesson annotations: read own" on public.lesson_annotations;
create policy "lesson annotations: read own" on public.lesson_annotations
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "lesson annotations: insert own" on public.lesson_annotations;
create policy "lesson annotations: insert own" on public.lesson_annotations
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "lesson annotations: update own" on public.lesson_annotations;
create policy "lesson annotations: update own" on public.lesson_annotations
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "lesson annotations: delete own" on public.lesson_annotations;
create policy "lesson annotations: delete own" on public.lesson_annotations
  for delete to authenticated using (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ timestamps

create or replace function public.lesson_annotations_before_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;
drop trigger if exists lesson_annotations_before_update on public.lesson_annotations;
create trigger lesson_annotations_before_update before update on public.lesson_annotations
  for each row execute function public.lesson_annotations_before_update();
