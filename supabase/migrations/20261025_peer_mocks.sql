-- Peer mock interviews: a learner posts a slot (time, mock, preferred role); another learner pairs up.
-- Written only by the server (service role) through /api/learn/peers; nothing is readable by anon or
-- authenticated clients directly (the API returns only what each viewer may see: no emails until paired).

create table if not exists public.peer_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null,
  duration_min int not null default 60 check (duration_min between 30 and 120),
  mock_slug text not null,
  role text not null default 'either' check (role in ('candidate', 'interviewer', 'either')),
  note text not null default '' check (char_length(note) <= 280),
  status text not null default 'open' check (status in ('open', 'paired', 'cancelled')),
  partner_id uuid references auth.users(id) on delete set null,
  room text,
  paired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists peer_slots_open_idx on public.peer_slots (starts_at) where status = 'open';
create index if not exists peer_slots_user_idx on public.peer_slots (user_id);
create index if not exists peer_slots_partner_idx on public.peer_slots (partner_id);

alter table public.peer_slots enable row level security;
revoke all on public.peer_slots from anon, authenticated;
