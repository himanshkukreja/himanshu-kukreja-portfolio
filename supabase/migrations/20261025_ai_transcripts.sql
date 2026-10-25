-- AI conversation text, kept 30 days for abuse checks (the owner's privacy decision), then deleted by a
-- daily cron. Linked to the metered call. Server-only: RLS on, no policies.
create table if not exists public.ai_transcripts (
  call_id bigint primary key references public.ai_calls (id) on delete cascade,
  user_id uuid,
  feature text not null,
  input text not null,
  output text,
  created_at timestamptz not null default now()
);
create index if not exists ai_transcripts_created_idx on public.ai_transcripts (created_at);
create index if not exists ai_transcripts_user_idx on public.ai_transcripts (user_id, created_at desc);
alter table public.ai_transcripts enable row level security;

-- daily 03:15 UTC: delete conversation text older than 30 days (the metered call row stays)
select cron.unschedule('ai-transcripts-cleanup') where exists (select 1 from cron.job where jobname = 'ai-transcripts-cleanup');
select cron.schedule('ai-transcripts-cleanup', '15 3 * * *', $$delete from public.ai_transcripts where created_at < now() - interval '30 days'$$);
