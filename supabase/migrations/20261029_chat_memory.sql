-- The course chat (/learn/search and the Ask panel): long-term memory, answer feedback, and its retention rules.
-- Approved by the owner on 29 Oct 2026 to apply after review; applied by the coordinator, never by the app.
-- The app works before this is applied: a missing table means "memory off" and "feedback off".
--
-- 1. chat_memory: one compact row per learner (src/lib/ai/chat/memory-model.ts): learning goals, level, topics
--    studied and found hard, answer preferences, recent practice results, and a one-line summary of each of their
--    last 8 conversations. Written by a small metered AI call (feature "chat-memory", Claude Haiku 5.5) from the
--    learner's own conversations; every value is scrubbed of emails, phone numbers and links and length-capped.
--    No raw messages here. Seen by the learner (You -> Tutor memory, via /api/learn/ai/chat/memory with their
--    session) and the server. They can switch it off (paused: the notes are wiped and nothing is written) or clear
--    it (the row is deleted). Deleted with the account (on delete cascade).
--
-- 2. chat_feedback: thumbs up/down and "this was wrong" on one tutor answer, with an optional note (<= 500
--    characters) the learner writes. Linked to the metered call (ai_calls). Admin-only reading (/admin/chat).
--    The note is learner text: it is cleared after 90 days (below); the rating stays for the stats.
--
-- 3. Retention: chat conversation text (ai_transcripts rows of feature 'course-chat') is kept 90 days instead of
--    the 30 every other AI feature keeps; the tutor's search phrases kept on the metering row for the admin's
--    content-gap radar (ai_calls.meta.searches) are dropped after 90 days too. Counts, costs, models, tools and
--    ratings stay (no text).
--
-- Both tables are server-only like ai_transcripts: RLS on, no policies, so the browser's anon key can't read or
-- write them; the API uses the service role for the verified user id only.

create table if not exists public.chat_memory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  memory jsonb not null default '{}'::jsonb,
  paused boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.chat_memory enable row level security;

create table if not exists public.chat_feedback (
  id bigserial primary key,
  call_id bigint not null references public.ai_calls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chat text,
  rating smallint not null default 0 check (rating in (-1, 0, 1)),
  wrong boolean not null default false,
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (call_id, user_id)
);
create index if not exists chat_feedback_created_idx on public.chat_feedback (created_at desc);
alter table public.chat_feedback enable row level security;

-- a conversation's messages, for the admin's conversation view (/admin/chat)
create index if not exists ai_calls_chat_idx on public.ai_calls ((meta ->> 'chat')) where feature = 'course-chat';

-- the daily transcript cleanup (was: everything after 30 days) now keeps the chat's 90 days
select cron.unschedule('ai-transcripts-cleanup') where exists (select 1 from cron.job where jobname = 'ai-transcripts-cleanup');
select cron.schedule('ai-transcripts-cleanup', '15 3 * * *', $$
  delete from public.ai_transcripts where feature <> 'course-chat' and created_at < now() - interval '30 days';
  delete from public.ai_transcripts where feature = 'course-chat' and created_at < now() - interval '90 days';
  update public.chat_feedback set note = null where note is not null and created_at < now() - interval '90 days';
  update public.ai_calls set meta = meta - 'searches' where feature = 'course-chat' and meta ? 'searches' and created_at < now() - interval '90 days';
$$);
