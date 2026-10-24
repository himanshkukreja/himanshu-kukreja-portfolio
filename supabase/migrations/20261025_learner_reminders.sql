-- Opt-in learning reminders: "your streak ends tonight" by push and/or email, at most once a day.
-- Rows are written only by the server (service role) through /api/learn/reminders; learners read
-- their own row. pg_cron at 14:00 UTC (19:30 IST) calls /api/cron/reminders only when somebody has
-- opted in (one call a day at most); the route works out whose streak is at risk.

create table if not exists public.learner_reminders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_on boolean not null default false,
  push_on boolean not null default false,
  push_subs jsonb not null default '[]'::jsonb,
  tz text not null default 'Asia/Kolkata',
  last_sent_on date,
  unsub_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists learner_reminders_unsub_idx on public.learner_reminders (unsub_token);

alter table public.learner_reminders enable row level security;
drop policy if exists "own reminders: read" on public.learner_reminders;
create policy "own reminders: read" on public.learner_reminders for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.learner_reminders from anon, authenticated;

select cron.unschedule('learner-reminders') where exists (select 1 from cron.job where jobname = 'learner-reminders');
select cron.schedule(
  'learner-reminders',
  '0 14 * * *',
  $job$
  select net.http_post(
    url := 'https://www.himanshukukreja.in/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select secret from public.email_cron_secret where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (select 1 from public.learner_reminders where email_on or push_on);
  $job$
);
