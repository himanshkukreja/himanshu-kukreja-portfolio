-- Per-learner AI allowance: an admin can give one account its own daily credits (more or fewer than
-- the shared allowance the budget governor computes). 1 credit = $0.001. Server-only like the other
-- ai_* tables: RLS on, no policies.
create table if not exists public.ai_user_limits (
  user_id uuid primary key,
  daily_credits int not null check (daily_credits >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.ai_user_limits enable row level security;
