-- Smart-search query log for the content-gap radar (/admin/gaps). NOT APPLIED: the owner applies it after review.
--
-- What it holds: one row per (day, learner, normalised query) for each signed-in smart-search ask
-- (POST /api/learn/ai/search, see src/lib/search/smart/querylog.ts):
--   q         the query normalised (lowercase, punctuation dropped, emails / links / long digit runs removed
--             first), at most 160 characters
--   scope     how well the course covered it: covered | partial | none (no candidates at all). Off-topic
--             asks (not system design) are never logged.
--   top_ids   up to 5 search-index ids the answer cited (course material ids like "L:w04/thundering-herd")
--   day       the UTC day only, no timestamp
--   user_hash an HMAC-SHA256 of the learner's id with a server secret (24 hex chars), only for counting
--             unique learners. No user id, email, IP, user agent or exact time is stored.
-- A learner asking the same thing again the same day adds nothing (unique index below).
--
-- Who can see it: server-only, like ai_calls and ai_transcripts. RLS on with no policies, so the browser's
-- anon key can't read or write it; the service role writes it and /api/admin/gaps (admins only) reads it.
--
-- Retention: rows older than 90 days are deleted by a daily pg_cron job.
--
-- Until this is applied the search route's insert is a no-op (a missing table is remembered and skipped),
-- and /admin/gaps falls back to the smart-search transcripts (ai_transcripts, 30 days).

create table if not exists public.search_queries (
  id bigserial primary key,
  day date not null default ((now() at time zone 'utc')::date),
  source text not null default 'smart-search' check (source in ('smart-search')),
  q text not null check (char_length(q) between 1 and 160),
  scope text not null check (scope in ('covered', 'partial', 'none')),
  top_ids text[] not null default '{}' check (cardinality(top_ids) <= 5),
  user_hash text not null check (char_length(user_hash) between 8 and 64)
);
create unique index if not exists search_queries_once_a_day on public.search_queries (day, user_hash, source, q);
create index if not exists search_queries_day_idx on public.search_queries (day desc);

alter table public.search_queries enable row level security;

-- daily 03:25 UTC: forget queries older than 90 days
select cron.unschedule('search-queries-cleanup') where exists (select 1 from cron.job where jobname = 'search-queries-cleanup');
select cron.schedule('search-queries-cleanup', '25 3 * * *', $$delete from public.search_queries where day < (now() at time zone 'utc')::date - 90$$);
