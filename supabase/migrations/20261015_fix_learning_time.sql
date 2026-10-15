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
