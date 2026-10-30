-- Notebook pages (/learn/notebook "Pages" tab, /learn/notebook/page/<id> and the Notebook panel beside a lesson):
-- handwritten, stylus-first notebook pages. A learner keeps up to 50 notebooks of up to 200 pages; each page holds
-- their ink (strokes), the things they placed on it (text clips, region snips, typed text boxes) and, once they ask
-- for it, the AI's typed version of the page.
-- Written 31 Oct 2026 for the owner to review and apply; never applied by the app. Safe to run twice.
-- Before it is applied the app shows "Notebook pages aren't switched on yet" in place of pages (src/lib/learn/ink/client.ts).
--
-- notebooks: one row per notebook.
--   title        the learner's name for it (<= 120 characters). "Clips" is the inbox clips and snips land in when no
--                page is open; the lesson panel names a notebook after the course week ("Week 02 · Failure-First Design").
-- notebook_pages: one row per page.
--   paper        the page's background: blank, ruled, grid, dot, cornell (cue column, notes, summary band) or
--                interview (boxes for requirements, estimates, API, data model, high-level design, deep dives,
--                trade-offs).
--   position     order inside the notebook (spaced by 1000 so a reorder usually rewrites one row).
--   lesson_key   "<week>/<slug>" of the lesson the page was written beside, so the panel reopens it there.
--   strokes      the ink: [{id, tool, color, size, pts: [x, y, pressure, …]}] with x/y in page units ×10 (ints) on a
--                1000 × 1414 sheet. Saved whole by the browser (debounced), last write wins.
--   items        clips, snips (a path in the notebook-snips bucket, never the image) and text boxes.
--   converted_md the AI's Markdown of the page (<= 20,000 characters) and when it was made.
--
-- Size: the browser caps strokes + items at 1,500,000 characters of JSON (LIMITS.pageBytes) and tells the learner
-- the page is full. The check below measures the same thing on the server: the length of the stored JSON as text
-- (jsonb's text form adds a space after each comma and colon, at most ~1.34× the compact JSON, so 2,000,000 always
-- leaves room for a page the browser accepted). Not pg_column_size(): inside a CHECK it sees the value before TOAST
-- compression, ~2.7× the JSON text for ink (measured on Postgres 17: 1.07 MB of strokes = 2.89 MB), so a 1.6 MB
-- bound there would reject pages at ~590 KB. On disk a page is stored compressed (~0.6× the JSON text).
--
-- Limits (50 notebooks per learner, 200 pages per notebook) are BEFORE INSERT triggers rather than an RPC: the
-- browser inserts rows directly under RLS, a trigger can't be skipped by calling the table instead of the function,
-- and the advisory lock makes two inserts at once from two devices wait for each other instead of both passing.
-- The error message starts with "notebook_limit:" / "page_limit:" so the app can say which limit was hit.
--
-- Privacy: only the learner reads or writes their rows (RLS below: user_id = auth.uid(); a page can only be put in
-- a notebook of theirs). The server reads a page only when the learner asks the AI to convert it. Deleted with the
-- account (on delete cascade). Snip images live in the private bucket below, under the learner's own folder.

-- ------------------------------------------------------------------ notebooks

create table if not exists public.notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '' check (length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notebooks_user_idx on public.notebooks (user_id);
alter table public.notebooks enable row level security;

-- ------------------------------------------------------------------ notebook_pages

create table if not exists public.notebook_pages (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '' check (length(title) <= 120),
  paper text not null default 'ruled' check (paper in ('blank', 'ruled', 'grid', 'dot', 'cornell', 'interview')),
  position integer not null default 0,
  lesson_key text check (lesson_key is null or length(lesson_key) <= 200),
  strokes jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  converted_md text check (converted_md is null or length(converted_md) <= 20000),
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notebook_pages_size check (octet_length(strokes::text) + octet_length(items::text) <= 2000000)
);
-- a notebook's pages in order
create index if not exists notebook_pages_notebook_position_idx on public.notebook_pages (notebook_id, position);
-- recent pages, and "the last page written beside this lesson"
create index if not exists notebook_pages_user_updated_idx on public.notebook_pages (user_id, updated_at desc);
alter table public.notebook_pages enable row level security;

-- ------------------------------------------------------------------ grants (browser: signed-in learners only)

revoke all on table public.notebooks from anon;
revoke all on table public.notebook_pages from anon;
grant select, insert, update, delete on table public.notebooks to authenticated;
grant select, insert, update, delete on table public.notebook_pages to authenticated;

-- ------------------------------------------------------------------ row-level security

drop policy if exists "notebooks: read own" on public.notebooks;
create policy "notebooks: read own" on public.notebooks
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notebooks: insert own" on public.notebooks;
create policy "notebooks: insert own" on public.notebooks
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "notebooks: update own" on public.notebooks;
create policy "notebooks: update own" on public.notebooks
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "notebooks: delete own" on public.notebooks;
create policy "notebooks: delete own" on public.notebooks
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "notebook pages: read own" on public.notebook_pages;
create policy "notebook pages: read own" on public.notebook_pages
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "notebook pages: insert own" on public.notebook_pages;
create policy "notebook pages: insert own" on public.notebook_pages
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );
drop policy if exists "notebook pages: update own" on public.notebook_pages;
create policy "notebook pages: update own" on public.notebook_pages
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.notebooks n where n.id = notebook_id and n.user_id = (select auth.uid()))
  );
drop policy if exists "notebook pages: delete own" on public.notebook_pages;
create policy "notebook pages: delete own" on public.notebook_pages
  for delete to authenticated using (user_id = (select auth.uid()));

-- ------------------------------------------------------------------ triggers: limits and timestamps

create or replace function public.notebooks_before_insert() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('notebooks:' || new.user_id::text));
  if (select count(*) from public.notebooks where user_id = new.user_id) >= 50 then
    raise exception 'notebook_limit: you can keep up to 50 notebooks' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
drop trigger if exists notebooks_before_insert on public.notebooks;
create trigger notebooks_before_insert before insert on public.notebooks
  for each row execute function public.notebooks_before_insert();

create or replace function public.notebook_pages_before_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.notebook_id is distinct from old.notebook_id then
    perform pg_advisory_xact_lock(hashtext('notebook_pages:' || new.notebook_id::text));
    if (select count(*) from public.notebook_pages where notebook_id = new.notebook_id) >= 200 then
      raise exception 'page_limit: a notebook holds up to 200 pages' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
drop trigger if exists notebook_pages_before_write on public.notebook_pages;
create trigger notebook_pages_before_write before insert or update on public.notebook_pages
  for each row execute function public.notebook_pages_before_write();

create or replace function public.notebooks_before_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;
drop trigger if exists notebooks_before_update on public.notebooks;
create trigger notebooks_before_update before update on public.notebooks
  for each row execute function public.notebooks_before_update();

-- a notebook's "last edited" follows its pages (at most one write a minute while someone draws)
create or replace function public.notebook_pages_touch_notebook() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.notebooks set updated_at = now()
    where id = coalesce(new.notebook_id, old.notebook_id) and updated_at < now() - interval '1 minute';
  return null;
end;
$$;
drop trigger if exists notebook_pages_touch_notebook on public.notebook_pages;
create trigger notebook_pages_touch_notebook after insert or update or delete on public.notebook_pages
  for each row execute function public.notebook_pages_touch_notebook();

-- ------------------------------------------------------------------ snips: private storage bucket

-- Region snips are images (webp, png fallback) of at most 2 MB, stored at <user_id>/<page_id>/<item_id>.webp.
-- Private: shown through short-lived signed URLs. A learner reads, adds and deletes only inside their own folder,
-- and keeps at most 500 snips (counted by the insert policy; the browser also checks first and says so).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('notebook-snips', 'notebook-snips', false, 2097152, array['image/webp', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- how many snips the signed-in learner has (the browser asks before uploading; the insert policy enforces it)
create or replace function public.notebook_snip_count() returns integer
language sql stable security invoker set search_path = '' as $$
  select count(*)::integer from storage.objects
  where bucket_id = 'notebook-snips' and name like (select auth.uid())::text || '/%';
$$;
revoke all on function public.notebook_snip_count() from public, anon;
grant execute on function public.notebook_snip_count() to authenticated;

drop policy if exists "notebook snips: read own" on storage.objects;
create policy "notebook snips: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'notebook-snips' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "notebook snips: insert own" on storage.objects;
create policy "notebook snips: insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'notebook-snips'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.notebook_snip_count() < 500
  );
drop policy if exists "notebook snips: delete own" on storage.objects;
create policy "notebook snips: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'notebook-snips' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ------------------------------------------------------------------ review cards made from notebook pages

-- "Make review cards" on a page adds question/answer cards to the learner's review queue with source 'notes'
-- (shown as "My notebook" in the review session), alongside trial misses, flags, highlights and interview cards.
alter table public.review_cards drop constraint if exists review_cards_source_check;
alter table public.review_cards add constraint review_cards_source_check
  check (source = any (array['trial_miss'::text, 'trial_flag'::text, 'highlight'::text, 'interview'::text, 'notes'::text]));
