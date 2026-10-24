-- Scheduled publishing for case files.
-- A draft with publish_at in the past is published by /api/cron/publish-case-files. pg_cron checks at
-- five past every hour and only calls the site when something is due (quiet hours cost nothing).
-- Reuses the email scheduler's secret (public.email_cron_secret, 20261016_email_scheduling.sql).

alter table public.case_files add column if not exists publish_at timestamptz;
create index if not exists case_files_publish_at_idx on public.case_files (publish_at) where status = 'draft' and publish_at is not null;

select cron.unschedule('case-files-publish') where exists (select 1 from cron.job where jobname = 'case-files-publish');
select cron.schedule(
  'case-files-publish',
  '5 * * * *',
  $job$
  select net.http_post(
    url := 'https://www.himanshukukreja.in/api/cron/publish-case-files',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select secret from public.email_cron_secret where id = 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  where exists (
    select 1 from public.case_files where status = 'draft' and publish_at is not null and publish_at <= now()
  );
  $job$
);
