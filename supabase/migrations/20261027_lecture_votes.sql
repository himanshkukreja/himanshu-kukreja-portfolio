-- Video lectures: one upvote per learner per lecture, and the per-lecture counts the site shows.
-- Server-only like the other learner tables: RLS on, no policies, no grants to anon/authenticated.
create table if not exists public.lecture_votes (
  lecture_id text not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (lecture_id, user_id)
);
create index if not exists lecture_votes_user_idx on public.lecture_votes (user_id);
alter table public.lecture_votes enable row level security;
revoke all on table public.lecture_votes from anon, authenticated;

-- views: distinct viewers (signed-in user, else the first-party visitor id) who pressed play, from the
-- player's lecture_play events; votes: rows in lecture_votes.
create or replace function public.lecture_stats()
returns table (lecture_id text, views bigint, votes bigint)
language sql
stable
as $$
  with v as (
    select metadata->>'quest' as lecture_id, count(distinct coalesce(user_id::text, visitor_id)) as views
    from public.analytics_events
    where metadata->>'name' = 'lecture_play' and metadata->>'quest' is not null
    group by 1
  ),
  u as (
    select lecture_id, count(*) as votes from public.lecture_votes group by 1
  )
  select coalesce(v.lecture_id, u.lecture_id), coalesce(v.views, 0), coalesce(u.votes, 0)
  from v full outer join u on u.lecture_id = v.lecture_id
$$;
revoke execute on function public.lecture_stats() from public, anon, authenticated;
