-- The Low-level design (LLD track) certificate in the existing `certificates` table, approved by the owner on
-- 12 Nov 2026. Modelled on 20261109_dsa_launch_1b.sql. ADDITIVE ONLY: no new table, no column change, no row touched,
-- RLS and grants unchanged; the same four CHECK constraints are widened so they also accept LLD rows. Every existing
-- row (course, world and DSA certificates) satisfies the new checks exactly as before.
--
--   kind        'course' | 'world' | 'dsa' | 'lld'
--   code        SDM-XXXX-XXXX | Wnn-XXXX | DSA-XXXX-XXXX | LLD-XXXX-XXXX (same alphabet)
--   world_key   NULL (course, lld) | week-nn-… (world) | the DSA track (dsa)
--
-- One LLD certificate per learner: the existing UNIQUE NULLS NOT DISTINCT (user_id, kind, world_key) covers it.
-- Earned by completing all 28 design-pattern lessons (dp-NN) and all 30 case studies (lld-NN) of the course map's
-- LLD track (learning_progress), checked on the server at claim time (src/lib/certificates/core.ts lldEligibility).
-- Until it is applied, a claim answers "LLD certificates are switching on soon"; nothing else changes.

BEGIN;

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_kind;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_kind CHECK (kind IN ('course', 'world', 'dsa', 'lld'));

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_code_format;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_code_format CHECK (
  code ~ '^SDM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'
  OR code ~ '^W[0-9]{2}-[2-9A-HJ-NP-Z]{4}$'
  OR code ~ '^DSA-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'
  OR code ~ '^LLD-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'
);

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_world_key;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_world_key CHECK (
  (kind = 'course' AND world_key IS NULL)
  OR (kind = 'world' AND world_key ~ '^week-[0-9]{2}(-[a-z0-9]+)*$')
  OR (kind = 'dsa' AND world_key ~ '^[a-z]+(-[a-z]+)*$')
  OR (kind = 'lld' AND world_key IS NULL)
);

ALTER TABLE public.certificates DROP CONSTRAINT IF EXISTS certificates_code_matches_kind;
ALTER TABLE public.certificates ADD CONSTRAINT certificates_code_matches_kind CHECK (
  (kind = 'course' AND code LIKE 'SDM-%')
  OR (kind = 'world' AND code = 'W' || substring(world_key FROM 6 FOR 2) || substring(code FROM 4))
  OR (kind = 'dsa' AND code LIKE 'DSA-%')
  OR (kind = 'lld' AND code LIKE 'LLD-%')
);

COMMIT;
