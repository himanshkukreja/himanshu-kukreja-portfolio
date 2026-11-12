-- The learner model's outcome log (AI audit 12 Nov 2026, O2 and §7 Layer 1), approved by the owner on 12 Nov 2026.
-- ADDITIVE ONLY: one new table and one view; nothing existing changes.
--
-- learner_events: one row per AI-graded result, written by the server after it grades (src/lib/learner/events.ts
-- recordOutcome), so the next feature can say "last time you missed idempotency keys":
--
--   course   'sdm' | 'dsa'
--   kind     explain_back · mock_phase · mock_overall · lld_mock · lab_run · lab_hint · lab_pass · lab_review ·
--            war_room · paper · chat_quiz
--   ref      what was graded: a concept id, a mock slug (+ phase id), a lab id, a war room slug, a paper question,
--            a question-bank item id
--   outcome  the verdict or level (solid, partial, sde, hire, strong, 7/10 …), ids and words of a fixed vocabulary only
--   detail   ids and levels only, at most 1 KB: missed signal or checklist ids, missed key point numbers, hint level,
--            rubric scores. NEVER the learner's text, answers, code or chat (the app scrubs it to ids, numbers and
--            short slugs before it writes; the CHECK below caps the size).
--
-- Not written while the learner's memory is paused (You -> Tutor memory), with Global Privacy Control or the site's
-- analytics opt-out. Deleted with the account (on delete cascade) and by a course reset.
--
-- DSA Mastery submits are NOT copied here: learner_outcomes is a view over learner_events and dsa_submissions
-- (kind 'dsa_submit', verdicts only), so there is one source for each fact.
--
-- RLS on: a learner may read their own rows (with their session); writes go through the service role (the API routes,
-- the verified user id), as for dsa_submissions; anon has no access at all.

create table if not exists public.learner_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  course text not null check (course in ('sdm', 'dsa')),
  kind text not null check (kind in ('explain_back', 'mock_phase', 'mock_overall', 'lld_mock', 'lab_run', 'lab_hint', 'lab_pass', 'lab_review', 'war_room', 'paper', 'chat_quiz')),
  ref text not null check (ref ~ '^[A-Za-z0-9][A-Za-z0-9:._/-]{0,159}$'),
  outcome text check (outcome is null or outcome ~ '^[A-Za-z0-9][A-Za-z0-9 ._/+-]{0,31}$'),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 1024),
  at timestamptz not null default now()
);

create index if not exists learner_events_user_at_idx on public.learner_events (user_id, at desc);
create index if not exists learner_events_user_kind_ref_idx on public.learner_events (user_id, kind, ref, at desc);

alter table public.learner_events enable row level security;
drop policy if exists learner_events_own_read on public.learner_events;
create policy learner_events_own_read on public.learner_events for select to authenticated using (auth.uid() = user_id);
revoke all on public.learner_events from anon;
revoke insert, update, delete, truncate on public.learner_events from authenticated;

-- One read for every graded outcome of a learner: the log, plus DSA Mastery submits from their own table.
-- security_invoker: a learner's session sees only their own rows of both (each table's RLS applies).
create or replace view public.learner_outcomes with (security_invoker = true) as
  select user_id, course, kind, ref, outcome, detail, at from public.learner_events
  union all
  select user_id, 'dsa'::text, 'dsa_submit'::text, problem_id, verdict, jsonb_build_object('lang', language, 'passed', passed, 'total', total), created_at from public.dsa_submissions;

revoke all on public.learner_outcomes from anon;
revoke insert, update, delete, truncate on public.learner_outcomes from authenticated;
