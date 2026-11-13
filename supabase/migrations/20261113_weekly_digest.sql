-- Opt-in weekly progress email (owner-approved 13 Nov 2026). Rides on learner_reminders (same unsubscribe token, same
-- server-only writes through /api/learn/reminders). OFF by default. NOT APPLIED: awaiting the owner's approval.
alter table public.learner_reminders add column if not exists weekly_on boolean not null default false;
alter table public.learner_reminders add column if not exists weekly_last text; -- the ISO date of the Monday of the last week sent

select cron.unschedule('learner-weekly-digest') where exists (select 1 from cron.job where jobname = 'learner-weekly-digest');
-- Sundays 03:30 UTC (09:00 IST), only when somebody has opted in
select cron.schedule(
  'learner-weekly-digest',
  '30 3 * * 0',
  $job$
  select net.http_post(
    url := 'https://www.himanshukukreja.in/api/cron/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select secret from public.email_cron_secret where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 58000
  )
  where exists (select 1 from public.learner_reminders where weekly_on);
  $job$
);
