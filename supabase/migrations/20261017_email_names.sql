-- Recipient display names set by the admin in /admin/newsletter (Recipients panel).
-- Email-only: one name per address, used for the newsletter merge tags ({{first_name}}, {{name}})
-- and the admin listings. They take precedence over user_profiles.full_name and the sign-in
-- metadata name, and they NEVER modify user_profiles: a learner's own name on their profile /
-- public share page stays theirs.
--
-- Access: RLS on with NO policies and all privileges revoked from anon/authenticated, so only the
-- service role (the admin API) can read or write it.
-- Additive and safe to re-run.

create table if not exists public.email_names (
  email text primary key check (email = lower(email)),
  name text not null check (length(trim(name)) between 1 and 80),
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.email_names is 'Admin-set display names for newsletter recipients (merge tags). Overrides profile/metadata names for email only; never touches user_profiles.';

alter table public.email_names enable row level security;
revoke all on public.email_names from anon, authenticated;
grant all on public.email_names to service_role;
