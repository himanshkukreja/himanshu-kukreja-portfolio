-- Admins added from /admin/admins. The owner(s) stay in code and env (OWNER_EMAIL in src/lib/admin/auth.ts plus
-- ADMIN_EMAIL, comma-separated) and are never stored here; a row here makes that email an admin: every /admin page
-- and API, admin AI preview and unlimited AI, but NOT managing admins (owner only, checked on the server).
-- The site falls back to the env owners alone while this table doesn't exist.
-- Server-only like the other admin tables: RLS on, no policies, no grants to anon/authenticated.
create table if not exists public.admin_users (
  email text primary key check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  added_by text not null,
  added_at timestamptz not null default now(),
  note text check (note is null or length(note) <= 200)
);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

-- Who added or removed whom, and when: one row per change, never edited (the /admin/admins history).
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null check (action in ('admin.add', 'admin.remove')),
  target text not null,
  note text
);
create index if not exists admin_audit_at_idx on public.admin_audit (at desc);
alter table public.admin_audit enable row level security;
revoke all on table public.admin_audit from anon, authenticated;
