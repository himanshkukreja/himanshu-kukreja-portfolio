-- The course chat's history (/learn/chat and the Ask panel): past conversations, synced across a learner's devices.
-- Written 29 Oct 2026 for the owner to review and apply; never applied by the app.
-- The app works before this is applied: a missing table means "history on this device only" (localStorage), and the
-- browser uploads its local history once the table exists.
--
-- chat_threads: one row per conversation of a signed-in learner.
--   id          the conversation's random id from the browser (also the `chat` id on its metering rows);
--               unique per learner, so the key is (user_id, id): one learner can never write over another's row.
--   title       the first question, trimmed (or the learner's own rename), <= 120 characters.
--   messages    the conversation as the browser keeps it: the last 60 messages (role, text, time, and which
--               sources, practice questions and paths each answer brought).
--   state       what those messages point at: the sources (titles and site links), practice-question cards and
--               their results, learning paths, a mock interview's progress and the learner's ratings.
--   messages + state are capped at ~200 KB per row by the API (oldest messages dropped first) and checked here.
--   deleted     a deleted conversation keeps a tombstone (no title, no messages) until the cleanup below, so a
--               second device that still has it learns it was deleted instead of uploading it again.
-- At most 100 live conversations per learner: the API drops the oldest beyond that.
--
-- Privacy: the learner's own questions and the tutor's answers. Seen only by that learner (via
-- /api/learn/ai/chat/threads with their session) and the server. They can delete one conversation or all of them
-- (the text is erased at once; the tombstone holds no text). Kept 90 days after the conversation was last updated,
-- the same 90 days as the chat's transcripts, then deleted by the daily cleanup below. Deleted with the account
-- (on delete cascade).
--
-- Server-only like chat_memory and ai_transcripts: RLS on, no policies, so the browser's anon key can't read or write
-- it; the API uses the service role for the verified user id only.

create table if not exists public.chat_threads (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9]{6,40}$'),
  title text not null default '' check (length(title) <= 120),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, id),
  constraint chat_threads_size check (pg_column_size(messages) + pg_column_size(state) <= 262144)
);
-- the history list (newest first) and the cap
create index if not exists chat_threads_user_updated_idx on public.chat_threads (user_id, updated_at desc);
-- the daily cleanup
create index if not exists chat_threads_updated_idx on public.chat_threads (updated_at);
alter table public.chat_threads enable row level security;

-- the daily transcript cleanup (20261029_chat_memory.sql) also deletes chat history 90 days after its last update;
-- every earlier statement is kept exactly as it was
select cron.unschedule('ai-transcripts-cleanup') where exists (select 1 from cron.job where jobname = 'ai-transcripts-cleanup');
select cron.schedule('ai-transcripts-cleanup', '15 3 * * *', $$
  delete from public.ai_transcripts where feature <> 'course-chat' and created_at < now() - interval '30 days';
  delete from public.ai_transcripts where feature = 'course-chat' and created_at < now() - interval '90 days';
  update public.chat_feedback set note = null where note is not null and created_at < now() - interval '90 days';
  update public.ai_calls set meta = meta - 'searches' where feature = 'course-chat' and meta ? 'searches' and created_at < now() - interval '90 days';
  delete from public.chat_threads where updated_at < now() - interval '90 days';
$$);
