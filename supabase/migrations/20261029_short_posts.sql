-- Posting tracker for the shorts on other platforms (/admin/distribution): one row per short per platform once
-- the owner schedules or posts it on YouTube Shorts or Instagram Reels. No row = not posted yet.
--   status        scheduled (scheduled_at set) | posted (posted_at set, url optional)
--   url           the post's public link (https only)
-- Server-only like the other admin tables: RLS on, no policies, no grants to anon/authenticated.
create table if not exists public.short_posts (
  short_id text not null check (short_id ~ '^shorts--[A-Za-z0-9-]{1,160}$'),
  platform text not null check (platform in ('youtube', 'instagram')),
  status text not null check (status in ('scheduled', 'posted')),
  scheduled_at timestamptz,
  posted_at timestamptz,
  url text check (url is null or (url ~ '^https://' and length(url) <= 500)),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (short_id, platform),
  constraint short_posts_scheduled check (status <> 'scheduled' or scheduled_at is not null),
  constraint short_posts_posted check (status <> 'posted' or posted_at is not null)
);
create index if not exists short_posts_platform_idx on public.short_posts (platform, status);
alter table public.short_posts enable row level security;
revoke all on table public.short_posts from anon, authenticated;
