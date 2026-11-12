-- Mistake review cards (owner-approved feature, 12 Nov 2026; lib/learner/mistake-cards-model.ts): what a learner got
-- wrong (missed explain-back key points, missed mock rubric lines, lab-review misses, wrong chat-quiz answers, repeated
-- DSA failures) becomes a short question-and-answer card in their review queue, built only from the course's content.
--
-- NOT APPLIED. Apply with the owner's yes. ADDITIVE ONLY: no new table, no new column. The source check is widened to
-- accept 'mistake'; every existing row satisfies it exactly as before. RLS on review_cards is unchanged (own rows only).
--
-- Until this is applied the app stores mistake cards under source 'interview' with a 'mistake:' source_ref (the review
-- pages show them as mistake cards). The UPDATE below moves those rows to their own source; it cannot collide with the
-- unique (user_id, source, source_ref) key, because no 'mistake' row can exist before the check allows it.

alter table public.review_cards drop constraint if exists review_cards_source_check;
alter table public.review_cards add constraint review_cards_source_check
  check (source = any (array['trial_miss'::text, 'trial_flag'::text, 'highlight'::text, 'interview'::text, 'notes'::text, 'mistake'::text]));

update public.review_cards set source = 'mistake' where source = 'interview' and source_ref like 'mistake:%';
