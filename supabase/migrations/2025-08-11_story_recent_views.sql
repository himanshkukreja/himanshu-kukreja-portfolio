-- Cooldown tracking for story views to prevent rapid refresh increments
create table if not exists public.story_recent_views (
  story_id text not null,
  visitor_id text not null,
  last_viewed_at timestamptz not null default now(),
  primary key (story_id, visitor_id)
);

-- Helpful indexes
create index if not exists idx_story_recent_views_last_viewed_at on public.story_recent_views (last_viewed_at desc);
