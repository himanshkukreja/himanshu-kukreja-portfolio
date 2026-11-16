-- DSA Playground: named files and read-only share links. ADDITIVE ONLY: one new table; nothing existing changes.
-- NOT APPLIED: the owner approves DB changes first. Until it is applied AND the site has DSA_PLAYGROUND_FILES=on, the
-- Playground lists drafts only (one per language, in user_profiles.game_flags `pref:dsa-pg:<lang>`, no schema change)
-- and Share is hidden; /api/dsa/playground/* answer 404.
--
--   dsa_playground_files   a learner's saved programs: name, language, code, stdin. A file with a share_slug is readable
--                          by anyone with its link (/dsa/playground/s/<slug>), read-only, through the service role.
--
-- RLS on: learners read and write only their own rows. Shared files are NOT readable through RLS (no public policy):
-- the share page reads them on the server by slug. The API caps each learner at 200 files; code and stdin at 64 KB.

create table if not exists public.dsa_playground_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  language text not null check (language in ('python', 'javascript', 'java', 'cpp')),
  code text not null default '' check (octet_length(code) <= 65536),
  stdin text not null default '' check (octet_length(stdin) <= 65536),
  -- set when the owner shares the file (URL-safe random, 16 characters); cleared to stop sharing
  share_slug text unique check (share_slug is null or share_slug ~ '^[A-Za-z0-9_-]{12,32}$'),
  shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dsa_playground_files_user_idx on public.dsa_playground_files (user_id, updated_at desc);

alter table public.dsa_playground_files enable row level security;
drop policy if exists dsa_playground_files_own_read on public.dsa_playground_files;
create policy dsa_playground_files_own_read on public.dsa_playground_files for select using (auth.uid() = user_id);
drop policy if exists dsa_playground_files_own_insert on public.dsa_playground_files;
create policy dsa_playground_files_own_insert on public.dsa_playground_files for insert with check (auth.uid() = user_id);
drop policy if exists dsa_playground_files_own_update on public.dsa_playground_files;
create policy dsa_playground_files_own_update on public.dsa_playground_files for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists dsa_playground_files_own_delete on public.dsa_playground_files;
create policy dsa_playground_files_own_delete on public.dsa_playground_files for delete using (auth.uid() = user_id);

create or replace function public.dsa_playground_files_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists dsa_playground_files_touch on public.dsa_playground_files;
create trigger dsa_playground_files_touch before update on public.dsa_playground_files for each row execute function public.dsa_playground_files_touch();
