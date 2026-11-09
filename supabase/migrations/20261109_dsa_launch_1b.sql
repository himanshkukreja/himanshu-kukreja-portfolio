-- DSA Mastery launch wave 1b: the DSA certificate in the existing `certificates` table (plan §8.6, "new kinds").
-- NOT APPLIED. Apply with the owner's yes. ADDITIVE ONLY: no new table, no column change, no row touched; four CHECK
-- constraints are widened so they also accept DSA rows. Every existing row (SD Mastery course and world certificates)
-- satisfies the new checks exactly as before, so nothing existing changes meaning.
--
--   kind        'course' | 'world' | 'dsa'
--   code        SDM-XXXX-XXXX | Wnn-XXXX | DSA-XXXX-XXXX (same alphabet)
--   world_key   NULL (course) | week-nn-… (world) | the DSA track: 'foundations' (later 'interview-ready', 'cp')
--
-- Until it is applied the app keeps working: /dsa/certificate shows the requirements, and a claim (none can be earned
-- yet: the Academy's building reviews and Launch week final aren't released) answers "DSA certificates are switching
-- on soon". SD Mastery's certificate code only ever reads kind 'course' and 'world'.
--
-- Nothing else in wave 1b needs the database: the daily problem and streak use game_done keys (dsa:daily:<day>), the
-- re-solve queue reads dsa_submissions + dsa_problem_progress, deck cards marked "again" go to review_cards (source
-- 'interview', course_id 'dsa', allowed today), and the profile's DSA toggle lives in share_profiles.visibility (JSONB).

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_kind;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_kind CHECK (kind IN ('course', 'world', 'dsa'));

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_code_format;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_code_format CHECK (
  code ~ '^SDM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'
  OR code ~ '^W[0-9]{2}-[2-9A-HJ-NP-Z]{4}$'
  OR code ~ '^DSA-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'
);

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_world_key;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_world_key CHECK (
  (kind = 'course' AND world_key IS NULL)
  OR (kind = 'world' AND world_key ~ '^week-[0-9]{2}(-[a-z0-9]+)*$')
  OR (kind = 'dsa' AND world_key ~ '^[a-z]+(-[a-z]+)*$')
);

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_code_matches_kind;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_code_matches_kind CHECK (
  (kind = 'course' AND code LIKE 'SDM-%')
  OR (kind = 'world' AND code = 'W' || substring(world_key FROM 6 FOR 2) || substring(code FROM 4))
  OR (kind = 'dsa' AND code LIKE 'DSA-%')
);
