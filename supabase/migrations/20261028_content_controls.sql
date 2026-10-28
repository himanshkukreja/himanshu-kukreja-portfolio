-- Publishing controls for shorts and side quests (/admin/publishing). The content files stay the source of
-- the content; this only says whether a released item is shown. No row = live, so nothing changes until an
-- admin acts. Keys: short:<short id> · quest:<quest slug>.
--   status  live | hidden | scheduled (scheduled = hidden until publish_at, then live)
--   pin     shorts only: lower first; pinned shorts lead the feed in this order
-- Server-only like the other admin tables: RLS on, no policies, no grants to anon/authenticated.
create table if not exists public.content_controls (
  key text primary key check (key ~ '^(short|quest):[A-Za-z0-9-]{3,200}$'),
  kind text not null check (kind in ('short', 'quest')),
  status text not null default 'live' check (status in ('live', 'hidden', 'scheduled')),
  publish_at timestamptz,
  pin integer check (pin is null or pin between 1 and 50),
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint content_controls_schedule check (status <> 'scheduled' or publish_at is not null)
);
create index if not exists content_controls_kind_idx on public.content_controls (kind);
alter table public.content_controls enable row level security;
revoke all on table public.content_controls from anon, authenticated;
