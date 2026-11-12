-- AI quality layer (owner-approved 12 Nov 2026): feedback on every AI answer, not only the course chat's.
-- NOT APPLIED: written for the owner's review; applied by the coordinator, never by the app. Additive only.
-- The app works before this is applied: /api/learn/ai/feedback writes the old columns and puts the reason code in the
-- note column as "reason:<id>" (never learner text); the admin's AI quality view reads either.
--
-- chat_feedback becomes the feedback table for every rateable AI answer (lib/ai/feedback-model.ts FEEDBACK_FEATURES:
-- course-chat, dsa-chat, dsa-tutor, lesson-qa, snip-explain, lab-hint, lab-review, explain-back, mock-scorecard,
-- lld-mock-scorecard). New columns, all derived from the answer's own metering row (ai_calls) at rating time:
--   reason       the chip picked on a thumbs down: wrong | not_grounded | too_long | gave_away | didnt_know_me (or null)
--   feature      the answer's feature (ai_calls.feature), so the dashboard counts without a join
--   model        the model that wrote the answer (ai_calls.model)
--   prompt_hash  the prompt version it was written with (ai_calls.meta.pv, lib/ai/promptVersion.ts)
-- No learner text: the new feedback UI has no free-text box, and the API never writes `note` any more except the
-- interim reason code above. Existing notes keep their 90-day cleanup (20261029_chat_threads.sql).
-- Still server-only: RLS on, no policies (the API uses the service role for the verified user id only).

alter table public.chat_feedback add column if not exists reason text;
alter table public.chat_feedback add column if not exists feature text;
alter table public.chat_feedback add column if not exists model text;
alter table public.chat_feedback add column if not exists prompt_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chat_feedback_reason_check') then
    alter table public.chat_feedback add constraint chat_feedback_reason_check
      check (reason is null or reason in ('wrong', 'not_grounded', 'too_long', 'gave_away', 'didnt_know_me'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chat_feedback_prompt_hash_check') then
    alter table public.chat_feedback add constraint chat_feedback_prompt_hash_check check (prompt_hash is null or length(prompt_hash) <= 40);
  end if;
end $$;

-- fill the new columns for rows written before this migration (from the metering row; the interim reason code)
update public.chat_feedback f
   set feature = coalesce(f.feature, c.feature),
       model = coalesce(f.model, c.model),
       prompt_hash = coalesce(f.prompt_hash, c.meta ->> 'pv')
  from public.ai_calls c
 where c.id = f.call_id and (f.feature is null or f.model is null);
update public.chat_feedback
   set reason = substring(note from '^reason:([a-z_]+)$'), note = null
 where reason is null and note ~ '^reason:(wrong|not_grounded|too_long|gave_away|didnt_know_me)$';
update public.chat_feedback set reason = 'wrong' where reason is null and wrong;

-- the dashboard reads a window per feature
create index if not exists chat_feedback_feature_idx on public.chat_feedback (feature, created_at desc);

alter table public.chat_feedback enable row level security;
