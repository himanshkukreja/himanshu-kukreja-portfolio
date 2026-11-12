-- A learner may delete their own graded results (You -> Tutor memory, "Memory page v2"), approved by the owner on
-- 12 Nov 2026 (AI audit O14). ADDITIVE ONLY: one grant and one policy on learner_events; nothing else changes.
--
-- 20261112_learner_events.sql gave a learner read access to their own rows and kept every write with the service
-- role. The memory page lets them forget one result or all of them: the API route deletes with the learner's own
-- session, so this policy is what limits it to their rows (auth.uid() = user_id). Insert and update stay
-- service-role only; anon still has no access at all.

grant delete on public.learner_events to authenticated;

drop policy if exists learner_events_own_delete on public.learner_events;
create policy learner_events_own_delete on public.learner_events for delete to authenticated using (auth.uid() = user_id);

revoke all on public.learner_events from anon;
