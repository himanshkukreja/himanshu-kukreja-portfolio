-- Shareable smart-search answers (/learn/answer/<id>). NOT APPLIED: the owner applies it after review.
--
-- What it holds: one row per answer a signed-in learner chose to share from /learn/search
-- (POST /api/learn/share, see src/lib/share/answers.ts):
--   id        10 random letters and digits (the public link)
--   question  the learner's question as they typed it, trimmed, at most 300 characters, with emails,
--             phone numbers and links replaced by "[removed]"
--   answer    the AI's answer as plain-text runs and citation numbers (no markup)
--   cites     the cited course material: title, kind, a short place line and a site-relative /learn or
--             /stories link (validated; nothing else from the search result is kept)
--   user_id   who shared it: used for the 20-a-day limit and so their shares go when their account does.
--             Never shown on the page, in the OG image or in the admin list.
--   hidden    set by an admin (/admin/gaps -> Shared answers): the page 404s at once.
--
-- Who can see it: anyone with the link sees the question, answer and sources (that is the point of
-- sharing); the page is noindex by default (ANSWER_PAGES_INDEXABLE in src/lib/share/answer-model.ts).
-- The table itself is server-only: RLS on with no policies, so the browser's anon key can't read or write
-- it; the service role reads it for the cached page and writes it for the share endpoint.
--
-- Retention: kept until hidden or the sharer's account is deleted (on delete cascade), so links keep working.
--
-- Until this is applied, GET /api/learn/share/answer and POST /api/learn/share return { enabled: false }
-- and /learn/search hides the Share button.

create table if not exists public.shared_answers (
  id text primary key check (id ~ '^[A-Za-z0-9]{10}$'),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 3 and 300),
  answer jsonb not null,
  cites jsonb not null,
  hidden boolean not null default false
);
create index if not exists shared_answers_user_idx on public.shared_answers (user_id, created_at desc);
create index if not exists shared_answers_created_idx on public.shared_answers (created_at desc);

alter table public.shared_answers enable row level security;
