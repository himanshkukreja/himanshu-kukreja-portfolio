-- Campaign scheduling + case-file (story) tracking + the Supabase cron that sends with the admin's
-- browser closed. Additive; builds on 20261016_email_campaigns.sql (apply that one first).
-- Safe to re-run: every statement is idempotent (the cron job is unscheduled-if-exists, then scheduled).

create extension if not exists pgcrypto;

-- ── 1 · "scheduled" status + when ───────────────────────────────────────────────────────────────
alter table public.email_campaigns drop constraint if exists email_campaigns_status_check;
alter table public.email_campaigns
  add constraint email_campaigns_status_check
  check (status in ('draft', 'scheduled', 'sending', 'paused', 'sent', 'cancelled'));

alter table public.email_campaigns add column if not exists scheduled_at timestamptz;
create index if not exists email_campaigns_due_idx on public.email_campaigns (scheduled_at) where status = 'scheduled';

-- ── 2 · which story a campaign announced (who got which case file = this + email_messages) ──────
alter table public.email_campaigns add column if not exists story_slug text;
create index if not exists email_campaigns_story_idx on public.email_campaigns (story_slug) where story_slug is not null;
-- campaigns created before this migration kept the story in doc.story.slug
update public.email_campaigns set story_slug = doc #>> '{story,slug}' where story_slug is null and doc #>> '{story,slug}' is not null;

-- Convenience view: one row per (story, address) that was actually sent, newest first.
create or replace view public.email_story_sends
with (security_invoker = true) as
  select c.story_slug, m.email, m.sent_at, c.id as campaign_id
  from public.email_messages m
  join public.email_campaigns c on c.id = m.campaign_id
  where c.story_slug is not null and m.status = 'sent';
revoke all on public.email_story_sends from anon, authenticated;
grant select on public.email_story_sends to service_role;

-- ── 3 · shared secret for the cron → /api/cron/email-campaigns call ─────────────────────────────
-- Generated here, never leaves the database except as the pg_net bearer header; the route reads it
-- with the service role. Rotate with: update public.email_cron_secret set secret = encode(gen_random_bytes(32), 'hex');
create table if not exists public.email_cron_secret (
  id smallint primary key default 1 check (id = 1),
  secret text not null default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
insert into public.email_cron_secret (id) values (1) on conflict (id) do nothing;
alter table public.email_cron_secret enable row level security;
revoke all on public.email_cron_secret from anon, authenticated;
grant all on public.email_cron_secret to service_role;

-- ── 4 · every minute: call the sender, but only when there is work ──────────────────────────────
-- pg_net is async: the HTTP request runs after this statement commits; the route itself caps work at
-- ~45 s and holds a per-campaign lease, so overlapping minutes never double-send.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'email-campaigns-tick';

select cron.schedule(
  'email-campaigns-tick',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://www.himanshukukreja.in/api/cron/email-campaigns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select secret from public.email_cron_secret where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (
    select 1 from public.email_campaigns
    where status = 'sending'
       or (status = 'scheduled' and scheduled_at <= now() + interval '30 seconds')
  );
  $job$
);

notify pgrst, 'reload schema';
