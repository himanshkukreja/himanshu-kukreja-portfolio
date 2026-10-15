-- =====================================================================================
-- himanshukukreja.in — all pending migrations, in order (2026-10-15)
-- Paste the whole file into Supabase → SQL Editor → Run. Safe to re-run (idempotent).
--   1. 20261014_level_up.sql            game state sync, stage progress, trials, review cards
--   2. 20261015_fix_learning_time.sql   learning-time trigger fix (superseded in part by 3)
--   3. 20261015_learn_backend_fixes.sql RLS lockdown of private tables, column grants, vote
--                                       counts, IST streak days, completion never regresses
--   4. 20261015_arena.sql               (optional) quiz answers, daily results, weekly board
--   5. 20261015_analytics_indexes.sql   (optional) analytics indexes, built non-concurrently
-- After it runs, the data repairs (completions, learning time, streaks, totals) are run
-- separately from the app side.
-- =====================================================================================


-- ===================================================================
-- >>> 20261014_level_up.sql
-- ===================================================================

-- =====================================================
-- "Level Up" redesign: game state, stage progress, trials, review queue, real streaks.
-- Additive only: no existing column or table is dropped or rewritten.
-- =====================================================

-- 1. Game state synced for signed-in visitors (guests keep it in localStorage)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS game_done JSONB NOT NULL DEFAULT '{}'::jsonb; -- questId -> epoch ms
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS game_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS handle TEXT; -- Hall of Fame (L5 Staff)

-- 2. Stage-based lesson progress (resume by Part, never by pixel; completion never regresses)
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS completed_stages TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS last_stage TEXT;
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS max_progress INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learning_progress ADD COLUMN IF NOT EXISTS content_version TEXT;

-- Guard: once completed, a lesson stays completed and its progress never goes down.
CREATE OR REPLACE FUNCTION learning_progress_no_regress()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'completed' THEN
    NEW.status := 'completed';
    NEW.completed_at := COALESCE(OLD.completed_at, NEW.completed_at);
  END IF;
  NEW.max_progress := GREATEST(COALESCE(OLD.max_progress, 0), COALESCE(NEW.progress_percentage, 0), COALESCE(NEW.max_progress, 0));
  NEW.progress_percentage := GREATEST(COALESCE(OLD.progress_percentage, 0), COALESCE(NEW.progress_percentage, 0));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_learning_progress_no_regress ON learning_progress;
CREATE TRIGGER trg_learning_progress_no_regress
  BEFORE UPDATE ON learning_progress
  FOR EACH ROW EXECUTE FUNCTION learning_progress_no_regress();

-- 3. Trials: one attempt per run of a 25-question part
CREATE TABLE IF NOT EXISTS trial_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  part INTEGER NOT NULL,
  seed TEXT NOT NULL,                  -- option shuffle seed for this attempt
  answers JSONB NOT NULL DEFAULT '{}', -- question number -> original option letter
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_trial_attempts_user ON trial_attempts(user_id, course_id, week, part, started_at DESC);
ALTER TABLE trial_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trial attempts: own rows" ON trial_attempts;
CREATE POLICY "trial attempts: own rows" ON trial_attempts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. Review queue (Leitner boxes 1-5) fed by missed trial questions, flags, highlights, interview cards
CREATE TABLE IF NOT EXISTS review_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('trial_miss', 'trial_flag', 'highlight', 'interview')),
  source_ref TEXT NOT NULL,            -- e.g. 'week-02:q57' or a content_notes id
  course_id TEXT NOT NULL,
  week TEXT,
  lesson_slug TEXT,
  stage TEXT,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  box INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  due_at DATE NOT NULL DEFAULT CURRENT_DATE,
  last_grade TEXT CHECK (last_grade IN ('again', 'hard', 'good', 'easy')),
  reviews INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_review_cards_due ON review_cards(user_id, due_at);
ALTER TABLE review_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "review cards: own rows" ON review_cards;
CREATE POLICY "review cards: own rows" ON review_cards FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Real streaks: any stage, lesson, trial or review session marks the day active
CREATE OR REPLACE FUNCTION record_learning_activity(p_user UUID)
RETURNS VOID AS $$
DECLARE
  streak INTEGER := 0;
  d DATE := CURRENT_DATE;
BEGIN
  IF p_user IS NULL OR p_user <> auth.uid() THEN
    RETURN;
  END IF;
  INSERT INTO learning_streaks (user_id, activity_date) VALUES (p_user, CURRENT_DATE)
    ON CONFLICT (user_id, activity_date) DO NOTHING;
  -- count consecutive active days ending today
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM learning_streaks WHERE user_id = p_user AND activity_date = d);
    streak := streak + 1;
    d := d - 1;
  END LOOP;
  UPDATE user_profiles
    SET current_streak = streak,
        longest_streak = GREATEST(COALESCE(longest_streak, 0), streak)
    WHERE id = p_user;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION record_learning_activity(UUID) TO authenticated;


-- ===================================================================
-- >>> 20261015_fix_learning_time.sql
-- ===================================================================

-- Fix learning-time accounting (2026-10-15).
--
-- Problems in 20250109_auth_and_learning.sql:
--   1. learning_progress.time_spent was wall-clock time since the page opened (client bug, fixed in the
--      app: only engaged time now), so rows held hours or days from tabs left open.
--   2. update_learning_streak() added a lesson's WHOLE cumulative time_spent to learning_streaks and
--      user_profiles.total_time_spent once, on the completion day — and nothing for unfinished lessons.
--   3. It re-counted a completion every time a row's status flipped back to completed
--      (user_profiles.total_lessons_completed reached 164 for 7 real completions).
--
-- New behaviour:
--   * BEFORE trigger caps time_spent at 3 h per lesson row and never lets it go backwards.
--   * AFTER trigger credits only the time DELTA of each write (max 1 h per write) to today's
--     learning_streaks row and to user_profiles.total_time_spent, and counts a completion only once
--     (first time completed_at is set).

create or replace function public.clamp_learning_time()
returns trigger
language plpgsql
as $$
begin
  new.time_spent := least(greatest(coalesce(new.time_spent, 0), 0), 10800);
  if tg_op = 'UPDATE' and coalesce(old.time_spent, 0) > new.time_spent and coalesce(old.time_spent, 0) <= 10800 then
    new.time_spent := old.time_spent;
  end if;
  return new;
end;
$$;

drop trigger if exists clamp_learning_time on public.learning_progress;
create trigger clamp_learning_time
  before insert or update of time_spent on public.learning_progress
  for each row execute function public.clamp_learning_time();

create or replace function public.update_learning_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta integer := 0;
  newly_completed boolean := false;
begin
  if tg_op = 'INSERT' then
    delta := coalesce(new.time_spent, 0);
    newly_completed := new.status = 'completed';
  else
    delta := coalesce(new.time_spent, 0) - coalesce(old.time_spent, 0);
    newly_completed := new.status = 'completed' and old.completed_at is null and coalesce(old.status, '') <> 'completed';
  end if;
  delta := least(greatest(delta, 0), 3600);

  if delta = 0 and not newly_completed then
    return new;
  end if;

  insert into learning_streaks (user_id, activity_date, lessons_completed, time_spent)
  values (new.user_id, current_date, case when newly_completed then 1 else 0 end, delta)
  on conflict (user_id, activity_date)
  do update set
    lessons_completed = learning_streaks.lessons_completed + case when newly_completed then 1 else 0 end,
    time_spent = learning_streaks.time_spent + delta;

  update user_profiles
  set
    total_lessons_completed = total_lessons_completed + case when newly_completed then 1 else 0 end,
    total_time_spent = total_time_spent + delta,
    last_seen_at = now()
  where id = new.user_id;

  return new;
end;
$$;
-- (the existing on_lesson_completed trigger already calls update_learning_streak(); no re-create needed)


-- ===================================================================
-- >>> 20261015_learn_backend_fixes.sql
-- ===================================================================

-- =====================================================
-- Learn backend fixes (2026-10-15) — NOT APPLIED. Idempotent: safe to run more than once.
--
-- Order: 20261014_level_up.sql (if you are applying it) → 20261015_fix_learning_time.sql → this
-- file. If level_up is applied AFTER this file, run this file again: §4 grants UPDATE only on the
-- user_profiles columns that exist when it runs (xp / game_done / game_flags / handle), and §7
-- re-defines record_learning_activity() with the Asia/Kolkata day.
--
-- Every finding below was confirmed against the live DB on 2026-10-15 (read-only probes).
-- Server code uses the service role, which bypasses RLS and keeps its own grants, so nothing in
-- /api/* is affected by the lock-downs.
-- =====================================================


-- -----------------------------------------------------
-- 1. Private tables that the PUBLIC anon key (shipped in every page's JS) could read — and,
--    with Supabase's default grants, write:
--      newsletter_subscribers (8 rows: email, IP, city), newsletter_campaigns (subscriber email
--      lists), newsletter_logs (22), contact_queries (3: name, email, message, IP, admin notes),
--      analytics_events (8,316 rows incl. ip_address / user_id), story_* counters.
--    RLS on, no policies → only the service role can touch them.
-- -----------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'newsletter_subscribers', 'newsletter_campaigns', 'newsletter_logs', 'contact_queries',
    'story_views', 'story_unique_visitors', 'story_recent_views',
    'analytics_events', 'user_sessions', 'user_login_history'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- "Service role can …" policies were WITH CHECK (true) for every role, i.e. anyone could insert
-- rows straight into analytics (bypassing /api/beat's validation and bot filter). The service role
-- doesn't need a policy at all.
do $$
begin
  if to_regclass('public.analytics_events') is not null then
    drop policy if exists "Service role can insert analytics" on public.analytics_events;
  end if;
  if to_regclass('public.user_sessions') is not null then
    drop policy if exists "Service role can insert sessions" on public.user_sessions;
    drop policy if exists "Service role can update sessions" on public.user_sessions;
  end if;
end $$;


-- -----------------------------------------------------
-- 2. Views run with their owner's rights (they bypass RLS), and anon could read all of them:
--    every learner's name, last_seen, page views, lesson counts (admin_user_activity,
--    user_learning_stats, course_progress_summary) and the whole traffic report.
--    Only the admin API (service role) reads them.
-- -----------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array[
    'user_learning_stats', 'course_progress_summary', 'admin_user_activity',
    'admin_popular_pages', 'admin_daily_active_users', 'admin_traffic_sources'
  ] loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke all on public.%I from anon, authenticated', v);
    end if;
  end loop;
end $$;


-- -----------------------------------------------------
-- 3. RPCs callable by anyone with the anon key:
--    - track_story_view(): unthrottled view inflation (the API route has the cooldown);
--    - get_lesson_comments(): SECURITY DEFINER, returns auth.users.email when full_name is empty;
--    - upsert_user_session(): unused writer.
-- -----------------------------------------------------
do $$
begin
  if to_regprocedure('public.track_story_view(text,text)') is not null then
    revoke execute on function public.track_story_view(text, text) from public, anon, authenticated;
    grant execute on function public.track_story_view(text, text) to service_role;
  end if;
  if to_regprocedure('public.get_lesson_comments(text,text,text)') is not null then
    revoke execute on function public.get_lesson_comments(text, text, text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.upsert_user_session(uuid,text,text,text,integer,text,text,text,text,text,text,text,text)') is not null then
    revoke execute on function public.upsert_user_session(uuid, text, text, text, integer, text, text, text, text, text, text, text, text) from public, anon, authenticated;
  end if;
end $$;


-- -----------------------------------------------------
-- 4. user_profiles
--    a) Logged-out visitors only need author names/avatars (comments); every column of every
--       profile was public (learning_goal, last_seen_at, counters, and game_done — every lesson
--       completion timestamp — once level_up is applied).
--       NOTE: signed-in users can still read all columns of all profiles (row policy is `true`);
--       closing that needs the own-profile reads (useGameSync, /api/profile) moved server-side.
--    b) Signed-in users could UPDATE any column of their own row from the browser console:
--       total_lessons_completed, total_time_spent, current/longest_streak, welcome_email_sent.
--       Only the columns the app writes from the browser stay updatable. (xp / game_done are
--       still client-written by the game sync — see the report; not fixable with grants alone.)
-- -----------------------------------------------------
revoke select on public.user_profiles from anon;
grant select (id, full_name, avatar_url) on public.user_profiles to anon;

revoke update on public.user_profiles from anon, authenticated;
do $$
declare
  c text;
  cols text := '';
begin
  foreach c in array array[
    'full_name', 'avatar_url', 'bio', 'learning_goal', 'experience_level', 'profile_visibility',
    'last_seen_at', 'updated_at', 'xp', 'game_done', 'game_flags', 'handle'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'user_profiles' and column_name = c
    ) then
      cols := cols || case when cols = '' then '' else ', ' end || quote_ident(c);
    end if;
  end loop;
  if cols <> '' then
    execute format('grant update (%s) on public.user_profiles to authenticated', cols);
  end if;
end $$;


-- -----------------------------------------------------
-- 5. learning_streaks are written only by SECURITY DEFINER functions (update_learning_streak,
--    record_learning_activity). The browser never writes them, but RLS let any user insert or
--    edit their own streak days (fake streaks / time).
-- -----------------------------------------------------
drop policy if exists "Users can insert their own streaks" on public.learning_streaks;
drop policy if exists "Users can update their own streaks" on public.learning_streaks;


-- -----------------------------------------------------
-- 6. learning_progress never regresses (base columns; level_up adds the same guard for its
--    stage columns). Live data: 25 rows had completed_at set but status put back to
--    in_progress / not_started by a later write (old scroll tracker, stale tabs, a failed read in
--    the trial mirror), 10 completed rows below 100 %, 17 rows with started_at after completed_at
--    (started_at was overwritten on every save). Each flip back to completed was also counted
--    again by the old trigger (164 completions recorded for 7 real ones).
-- -----------------------------------------------------
create or replace function public.learning_progress_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'completed' then
      new.status := 'completed';
    end if;
    -- the first completion time is the completion time
    if old.completed_at is not null then
      new.completed_at := old.completed_at;
    end if;
    -- the earliest start wins
    if old.started_at is not null and (new.started_at is null or old.started_at < new.started_at) then
      new.started_at := old.started_at;
    end if;
    new.progress_percentage := greatest(coalesce(old.progress_percentage, 0), coalesce(new.progress_percentage, 0));
  end if;
  if new.status = 'completed' then
    new.progress_percentage := 100;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  new.progress_percentage := least(greatest(coalesce(new.progress_percentage, 0), 0), 100);
  if new.started_at is not null and new.completed_at is not null and new.started_at > new.completed_at then
    new.started_at := new.completed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists learning_progress_guard on public.learning_progress;
create trigger learning_progress_guard
  before insert or update on public.learning_progress
  for each row execute function public.learning_progress_guard();


-- -----------------------------------------------------
-- 7. Streak days in the learners' day, not UTC. CURRENT_DATE is UTC on Supabase: 11 of the 42
--    completions on record happened between 00:00 and 05:30 IST and were filed under the previous
--    day (heatmap off by one, streaks broken at midnight UTC). Same logic as
--    20261015_fix_learning_time.sql otherwise (time delta capped at 1 h per write; a completion
--    counts once, the first time completed_at is set).
-- -----------------------------------------------------
create or replace function public.learn_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.update_learning_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta integer := 0;
  newly_completed boolean := false;
begin
  if tg_op = 'INSERT' then
    delta := coalesce(new.time_spent, 0);
    newly_completed := new.status = 'completed';
  else
    delta := coalesce(new.time_spent, 0) - coalesce(old.time_spent, 0);
    newly_completed := new.status = 'completed' and old.completed_at is null and coalesce(old.status, '') <> 'completed';
  end if;
  delta := least(greatest(delta, 0), 3600);

  if delta = 0 and not newly_completed then
    return new;
  end if;

  insert into learning_streaks (user_id, activity_date, lessons_completed, time_spent)
  values (new.user_id, learn_today(), case when newly_completed then 1 else 0 end, delta)
  on conflict (user_id, activity_date)
  do update set
    lessons_completed = learning_streaks.lessons_completed + case when newly_completed then 1 else 0 end,
    time_spent = learning_streaks.time_spent + delta;

  update user_profiles
  set
    total_lessons_completed = total_lessons_completed + case when newly_completed then 1 else 0 end,
    total_time_spent = total_time_spent + delta,
    last_seen_at = now()
  where id = new.user_id;

  return new;
end;
$$;

-- Called by the lesson reader / trial screen on every stage, lesson or trial (the function did
-- not exist live, so the RPC silently failed and current_streak / longest_streak stayed 0 for
-- everyone). Same body as level_up's, with the IST day.
create or replace function public.record_learning_activity(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  streak integer := 0;
  d date := learn_today();
begin
  if p_user is null or p_user <> auth.uid() then
    return;
  end if;
  insert into learning_streaks (user_id, activity_date) values (p_user, d)
    on conflict (user_id, activity_date) do nothing;
  loop
    exit when not exists (select 1 from learning_streaks where user_id = p_user and activity_date = d);
    streak := streak + 1;
    d := d - 1;
  end loop;
  update user_profiles
    set current_streak = streak,
        longest_streak = greatest(coalesce(longest_streak, 0), streak)
    where id = p_user;
end;
$$;
revoke execute on function public.record_learning_activity(uuid) from public, anon;
grant execute on function public.record_learning_activity(uuid) to authenticated;


-- -----------------------------------------------------
-- 8. Comment votes and authorship
--    a) update_comment_votes() ran as the VOTER, and RLS only lets a user update their own
--       comment — so a vote on anyone else's comment never changed its counters (silently).
--       Story comments had no trigger at all: the voter's browser wrote the counts itself (same
--       RLS problem, and authors could set any number). Now SECURITY DEFINER and a recount (not
--       ±1), so counters can't drift.
--    b) Column privileges: browsers may only write the comment text; upvotes / downvotes /
--       is_pinned / is_solution were writable by the author (insert or update).
--    c) story_comments.user_name / user_avatar came from the browser (anyone could post as
--       "Himanshu Kukreja"); now copied from the author's profile.
--    d) comment_mentions accepted inserts from anyone (WITH CHECK true).
-- -----------------------------------------------------
create or replace function public.recount_lesson_comment_votes(cid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update lesson_comments c set
    upvotes = (select count(*) from comment_votes v where v.comment_id = cid and v.vote_type = 'upvote'),
    downvotes = (select count(*) from comment_votes v where v.comment_id = cid and v.vote_type = 'downvote')
  where c.id = cid;
$$;

create or replace function public.update_comment_votes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform recount_lesson_comment_votes(old.comment_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.comment_id is distinct from old.comment_id or new.vote_type is distinct from old.vote_type) then
    perform recount_lesson_comment_votes(new.comment_id);
  end if;
  return null;
end;
$$;
drop trigger if exists update_comment_votes_trigger on public.comment_votes;
create trigger update_comment_votes_trigger
  after insert or update or delete on public.comment_votes
  for each row execute function public.update_comment_votes();

create or replace function public.recount_story_comment_votes(cid uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update story_comments c set
    upvotes = (select count(*) from story_comment_votes v where v.comment_id = cid and v.vote_type = 'upvote'),
    downvotes = (select count(*) from story_comment_votes v where v.comment_id = cid and v.vote_type = 'downvote')
  where c.id = cid;
$$;

create or replace function public.update_story_comment_votes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform recount_story_comment_votes(old.comment_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.comment_id is distinct from old.comment_id or new.vote_type is distinct from old.vote_type) then
    perform recount_story_comment_votes(new.comment_id);
  end if;
  return null;
end;
$$;
drop trigger if exists update_story_comment_votes_trigger on public.story_comment_votes;
create trigger update_story_comment_votes_trigger
  after insert or update or delete on public.story_comment_votes
  for each row execute function public.update_story_comment_votes();

-- recount helpers are internal
revoke execute on function public.recount_lesson_comment_votes(uuid) from public, anon, authenticated;
revoke execute on function public.recount_story_comment_votes(uuid) from public, anon, authenticated;

-- backfill (0 drift on 2026-10-15, but the counters are only right from here on if they start right)
update public.lesson_comments c set
  upvotes = (select count(*) from public.comment_votes v where v.comment_id = c.id and v.vote_type = 'upvote'),
  downvotes = (select count(*) from public.comment_votes v where v.comment_id = c.id and v.vote_type = 'downvote')
where c.upvotes is distinct from (select count(*) from public.comment_votes v where v.comment_id = c.id and v.vote_type = 'upvote')
   or c.downvotes is distinct from (select count(*) from public.comment_votes v where v.comment_id = c.id and v.vote_type = 'downvote');
update public.story_comments c set
  upvotes = (select count(*) from public.story_comment_votes v where v.comment_id = c.id and v.vote_type = 'upvote'),
  downvotes = (select count(*) from public.story_comment_votes v where v.comment_id = c.id and v.vote_type = 'downvote')
where c.upvotes is distinct from (select count(*) from public.story_comment_votes v where v.comment_id = c.id and v.vote_type = 'upvote')
   or c.downvotes is distinct from (select count(*) from public.story_comment_votes v where v.comment_id = c.id and v.vote_type = 'downvote');

-- b) column privileges (src/components/LessonComments.tsx / StoryComments.tsx write exactly these)
revoke insert, update on public.lesson_comments from anon, authenticated;
grant insert (user_id, course_id, week, lesson_slug, parent_id, content, raw_content) on public.lesson_comments to authenticated;
grant update (content, raw_content, is_edited, edit_history, updated_at) on public.lesson_comments to authenticated;

revoke insert, update on public.story_comments from anon, authenticated;
grant insert (user_id, user_name, user_avatar, story_slug, parent_id, content, raw_content) on public.story_comments to authenticated;
grant update (content, raw_content, is_edited, updated_at) on public.story_comments to authenticated;

-- c) author name / avatar from the profile, not the browser
create or replace function public.story_comment_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  select full_name, avatar_url into p from user_profiles where id = new.user_id;
  if found then
    new.user_name := coalesce(nullif(btrim(p.full_name), ''), 'User');
    new.user_avatar := p.avatar_url;
  else
    new.user_name := left(coalesce(nullif(btrim(new.user_name), ''), 'User'), 80);
    new.user_avatar := null;
  end if;
  return new;
end;
$$;
drop trigger if exists story_comment_author on public.story_comments;
create trigger story_comment_author
  before insert on public.story_comments
  for each row execute function public.story_comment_author();

-- d) mentions only on your own comments
drop policy if exists "Authenticated users can create mentions" on public.comment_mentions;
drop policy if exists "Authors can create mentions on their comments" on public.comment_mentions;
create policy "Authors can create mentions on their comments" on public.comment_mentions
  for insert to authenticated
  with check (exists (select 1 from public.lesson_comments c where c.id = comment_id and c.user_id = auth.uid()));


-- -----------------------------------------------------
-- 9. Bounded user input (NOT VALID: existing rows are not re-checked; today's maxima are far below).
--    Comment HTML, notes and bookmarks were unbounded text written straight from the browser.
-- -----------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lesson_comments_len') then
    alter table public.lesson_comments add constraint lesson_comments_len
      check (char_length(content) <= 20000 and char_length(coalesce(raw_content, '')) <= 10000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'story_comments_len') then
    alter table public.story_comments add constraint story_comments_len
      check (char_length(content) <= 20000 and char_length(coalesce(raw_content, '')) <= 10000 and char_length(user_name) <= 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_notes_len') then
    alter table public.content_notes add constraint content_notes_len
      check (char_length(coalesce(note_text, '')) <= 20000 and char_length(coalesce(highlight_text, '')) <= 5000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookmarks_len') then
    alter table public.bookmarks add constraint bookmarks_len
      check (char_length(coalesce(bookmark_text, '')) <= 5000 and char_length(coalesce(note, '')) <= 5000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_queries_len') then
    alter table public.contact_queries add constraint contact_queries_len
      check (char_length(name) <= 200 and char_length(email) <= 320 and char_length(message) <= 10000) not valid;
  end if;
end $$;

-- mcq_assessments rows are created lazily by the first learner's browser; keep them sane.
drop policy if exists "Authenticated users can create assessments" on public.mcq_assessments;
create policy "Authenticated users can create assessments" on public.mcq_assessments
  for insert to authenticated
  with check (
    auth.uid() is not null
    and total_questions between 1 and 1000
    and course_id ~ '^[A-Za-z0-9._-]{1,120}$'
    and week ~ '^[A-Za-z0-9._-]{1,120}$'
    and lesson_slug ~ '^[A-Za-z0-9._-]{1,160}$'
  );


-- ===================================================================
-- >>> 20261015_arena.sql
-- ===================================================================

-- =====================================================
-- OPTIONAL — Learn Arena: quick-check answers, daily results, materialized leaderboard.
-- NOT applied. The Arena works without it (it scores from learning_progress, analytics_events and
-- learning_streaks; see src/lib/learn/arena/leaderboard.ts). Applying it would let the server:
--   * keep one authoritative row per answer / daily run (no reliance on the analytics pipeline,
--     which drops events under GPC/DNT, ad-blockers and hk.notrack),
--   * enforce "one scored daily run per user per day" with a unique key and server-side timing,
--   * read the board from a small table instead of re-scoring every event each minute.
-- Additive only.
-- =====================================================

-- 1. Quick-check answers (first attempt per question is the one that scores)
CREATE TABLE IF NOT EXISTS quiz_answers (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,          -- quiz:<course>/<week>/<lesson>:<block>:<q>
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL,
  pick SMALLINT NOT NULL,
  correct BOOLEAN NOT NULL,           -- computed server-side from the question bank
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, question_id)  -- first answer wins (INSERT … ON CONFLICT DO NOTHING)
);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_time ON quiz_answers(answered_at);
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz answers: read own" ON quiz_answers;
CREATE POLICY "quiz answers: read own" ON quiz_answers FOR SELECT USING (auth.uid() = user_id);
-- writes go through an API route with the service role (the route re-checks `correct`)

-- 2. Daily challenge runs: one scored run per user per IST day
CREATE TABLE IF NOT EXISTS daily_results (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,                  -- Asia/Kolkata day
  picks SMALLINT[] NOT NULL,
  correct SMALLINT NOT NULL,          -- re-checked server-side
  total SMALLINT NOT NULL,
  ms INTEGER NOT NULL,                -- ideally server-timed: started_at → finished_at
  score INTEGER NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_results_day ON daily_results(day);
ALTER TABLE daily_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily results: read own" ON daily_results;
CREATE POLICY "daily results: read own" ON daily_results FOR SELECT USING (auth.uid() = user_id);

-- 3. Materialized weekly points + league tier (written by a cron / the leaderboard route)
CREATE TABLE IF NOT EXISTS arena_weekly (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,           -- Monday, Asia/Kolkata
  points INTEGER NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  tier SMALLINT NOT NULL DEFAULT 0,   -- 0 = L1 Intern … 5 = L6 Principal (tier during this week)
  promoted BOOLEAN,                   -- set when the week closes
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_arena_weekly_board ON arena_weekly(week_start, tier, points DESC);
ALTER TABLE arena_weekly ENABLE ROW LEVEL SECURITY;
-- public board is served by the API (names shortened there); no direct client access needed

-- 4. Faster scoring from analytics_events while the event path is still used
CREATE INDEX IF NOT EXISTS idx_analytics_events_learn_user
  ON analytics_events ((metadata->>'name'), user_id, created_at)
  WHERE event_type = 'event' AND user_id IS NOT NULL;


-- ===================================================================
-- >>> 20261015_analytics_indexes.sql (CONCURRENTLY removed for the SQL editor)
-- ===================================================================

-- OPTIONAL (not applied): indexes for the v2 traffic report on analytics_events.
-- The report pages through a time window (created_at), filters by event_type, and looks up
-- visitors / sessions for "new vs returning" and "exclude my visits". Safe to run any time;
-- CONCURRENTLY avoids locking writes (run each statement on its own, outside a transaction).

create index if not exists analytics_events_created_at_idx
  on public.analytics_events (created_at);

create index if not exists analytics_events_event_type_created_at_idx
  on public.analytics_events (event_type, created_at);

create index if not exists analytics_events_session_id_idx
  on public.analytics_events (session_id);

create index if not exists analytics_events_visitor_id_idx
  on public.analytics_events (visitor_id);

-- "exclude my visits" looks up every visitor id a signed-in admin has used.
create index if not exists analytics_events_user_id_idx
  on public.analytics_events (user_id) where user_id is not null;

-- (visitor_id, created_at) serves the "seen before this window?" lookups once the table is large.
create index if not exists analytics_events_visitor_created_idx
  on public.analytics_events (visitor_id, created_at);


-- ===================================================================
-- Check: every row below should say true
-- ===================================================================
select
  exists (select 1 from information_schema.columns where table_name = 'user_profiles' and column_name = 'xp')            as level_up_applied,
  exists (select 1 from pg_proc where proname = 'clamp_learning_time')                                                 as time_fix_applied,
  exists (select 1 from pg_proc where proname = 'learn_today')                                                          as backend_fixes_applied,
  (select relrowsecurity from pg_class where relname = 'newsletter_subscribers')                                        as subscribers_rls_on,
  (select relrowsecurity from pg_class where relname = 'contact_queries')                                               as contact_rls_on,
  (select relrowsecurity from pg_class where relname = 'analytics_events')                                              as analytics_rls_on,
  exists (select 1 from information_schema.tables where table_name = 'quiz_answers')                                    as arena_applied;
