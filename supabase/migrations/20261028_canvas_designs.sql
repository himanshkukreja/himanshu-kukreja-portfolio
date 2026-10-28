-- Design canvas: a learner's architecture drawing for one prompt (an interview problem, a capstone or
-- their own idea), its notes and the last AI review. One row per learner per prompt key:
--   problem:<slug> · capstone:<week key> · free:<random id>
-- Server-only like the other learner tables: RLS on, no policies, no grants to anon/authenticated.
create table if not exists public.canvas_designs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt_key text not null check (length(prompt_key) between 3 and 200),
  -- free designs only: the learner's own title and one-line brief
  title text check (title is null or length(title) <= 120),
  brief text check (brief is null or length(brief) <= 1000),
  -- the Excalidraw scene as saved by the board (elements + the icon files it uses)
  scene text not null default '' check (length(scene) <= 2000000),
  notes text not null default '' check (length(notes) <= 8000),
  review text,
  reviewed_at timestamptz,
  reviews integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canvas_designs_one_per_prompt unique (user_id, prompt_key)
);
create index if not exists canvas_designs_user_idx on public.canvas_designs (user_id, updated_at desc);
alter table public.canvas_designs enable row level security;
revoke all on table public.canvas_designs from anon, authenticated;
