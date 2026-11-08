-- DSA Mastery platform foundations (plan §14.3). ADDITIVE ONLY: new tables and one function; nothing existing changes.
-- NOT APPLIED. The site works without it: progress saves through learning_progress (course_id 'dsa') and the game
-- keys, /api/dsa/submit answers { stored: false }, and /api/dsa/judge counts its daily cap per isolate.
--
--   dsa_submissions        every Submit (browser or server), verdicts only: the code is kept as a normalised hash
--   dsa_problem_progress   one row per learner and problem: status, languages, hints, editorial seen
--   judge_usage            server judge runs per learner per day (the 300-a-day cap), via dsa_judge_hit()
--
-- RLS on everywhere; learners may read their own rows; writes go through the service role (the API routes).

create table if not exists public.dsa_submissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  problem_id text not null check (problem_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  language text not null check (language in ('python', 'javascript', 'java', 'cpp')),
  verdict text not null check (verdict in ('AC', 'WA', 'TLE', 'RE', 'CE', 'MLE', 'OLE', 'ERR')),
  passed integer not null default 0,
  total integer not null default 0,
  judged_by text not null default 'browser' check (judged_by in ('browser', 'server')),
  -- browser ACs earn XP but no points until the judge re-runs them (plan §8.3)
  verified boolean not null default false,
  time_ms integer,
  complexity text,
  paste_ratio real,
  code_hash text,
  tests_version text,
  created_at timestamptz not null default now()
);
create index if not exists dsa_submissions_user_problem_idx on public.dsa_submissions (user_id, problem_id, created_at desc);
create index if not exists dsa_submissions_hash_idx on public.dsa_submissions (problem_id, code_hash) where code_hash is not null;
alter table public.dsa_submissions enable row level security;
drop policy if exists dsa_submissions_own_read on public.dsa_submissions;
create policy dsa_submissions_own_read on public.dsa_submissions for select using (auth.uid() = user_id);

create table if not exists public.dsa_problem_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  problem_id text not null,
  status text not null default 'attempted' check (status in ('attempted', 'solved')),
  languages text[] not null default '{}',
  hints_used smallint not null default 0,
  editorial_viewed boolean not null default false,
  interview_passed boolean not null default false,
  verified boolean not null default false,
  first_solved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, problem_id)
);
alter table public.dsa_problem_progress enable row level security;
drop policy if exists dsa_problem_progress_own_read on public.dsa_problem_progress;
create policy dsa_problem_progress_own_read on public.dsa_problem_progress for select using (auth.uid() = user_id);

create table if not exists public.judge_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  runs integer not null default 0,
  primary key (user_id, day)
);
alter table public.judge_usage enable row level security;

-- One server judge run: counts it and returns the day's total, or -1 when the cap is already reached (nothing counted).
create or replace function public.dsa_judge_hit(p_user uuid, p_cap integer default 300)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  insert into public.judge_usage (user_id, day, runs)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set runs = public.judge_usage.runs + 1
    where public.judge_usage.runs < p_cap
  returning runs into n;
  return coalesce(n, -1);
end;
$$;
revoke all on function public.dsa_judge_hit(uuid, integer) from public, anon, authenticated;
